import { opaque } from "./auth";
import { json, problem, readJson } from "./http";
import type { Env, Principal } from "./types";

const GRACE_MS=3*24*60*60*1000;

export async function scheduleProjectDeletion(request:Request,env:Env,p:Principal,id:string,clock=new Date()):Promise<Response>{
  let body:Record<string,unknown>;try{body=await readJson(request)}catch(error){return problem(400,"invalid_request",(error as Error).message)}
  const project=await env.DB.prepare(`SELECT x.name,x.lifecycle_state,x.deletion_due_at,pm.role FROM projects x LEFT JOIN project_members pm ON pm.project_id=x.id AND pm.participant_id=? WHERE x.id=?`).bind(p.participantId,id).first<{name:string;lifecycle_state:string;deletion_due_at:string|null;role:string|null}>();
  if(!project||!project.role)return problem(404,"not_found","Project not found");
  if(project.role!=="owner")return problem(403,"forbidden","Only the project owner may schedule deletion");
  if(project.lifecycle_state==="shell")return problem(410,"project_deleted","This project has been permanently deleted");
  if(project.deletion_due_at)return problem(409,"deletion_already_scheduled","Project deletion is already scheduled");
  if(body.title!==project.name)return problem(400,"confirmation_mismatch","Type the current project title exactly");
  const now=clock.toISOString(),due=new Date(clock.getTime()+GRACE_MS).toISOString(),transition=opaque("trn");
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE projects SET lifecycle_state='archived',archived_at=COALESCE(archived_at,?),archived_by_participant_id=COALESCE(archived_by_participant_id,?),deletion_scheduled_at=?,deletion_due_at=?,deletion_scheduled_by_participant_id=?,lifecycle_transition_id=? WHERE id=? AND lifecycle_state IN ('active','archived') AND deletion_due_at IS NULL AND EXISTS(SELECT 1 FROM project_members WHERE project_id=? AND participant_id=? AND role='owner') AND name=?`).bind(now,p.participantId,now,due,p.participantId,transition,id,id,p.participantId,project.name),
    env.DB.prepare(`UPDATE project_invitations SET status='revoked',consumed_at=? WHERE project_id=? AND status='outstanding' AND EXISTS(SELECT 1 FROM projects WHERE id=? AND lifecycle_transition_id=?)`).bind(now,id,id,transition),
    env.DB.prepare(`INSERT INTO project_events(id,project_id,event_type,actor_participant_id,details_json,created_at) SELECT ?,?,'project_deletion_scheduled',?,?,? FROM projects WHERE id=? AND lifecycle_transition_id=?`).bind(opaque("pev"),id,p.participantId,JSON.stringify({deletionDueAt:due}),now,id,transition)
  ]);
  if(!results[0].meta.changes)return problem(409,"project_lifecycle_conflict","Project lifecycle changed before deletion was scheduled");
  return json({project:{id,status:"archived",deletionScheduledAt:now,deletionDueAt:due}},201);
}

export async function cancelProjectDeletion(env:Env,p:Principal,id:string,clock=new Date()):Promise<Response>{
  const now=clock.toISOString(),transition=opaque("trn");
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE projects SET deletion_scheduled_at=NULL,deletion_due_at=NULL,deletion_scheduled_by_participant_id=NULL,lifecycle_transition_id=? WHERE id=? AND lifecycle_state='archived' AND deletion_due_at>? AND EXISTS(SELECT 1 FROM project_members WHERE project_id=? AND participant_id=? AND role='owner')`).bind(transition,id,now,id,p.participantId),
    env.DB.prepare(`INSERT INTO project_events(id,project_id,event_type,actor_participant_id,details_json,created_at) SELECT ?,?,'project_deletion_cancelled',?,'{}',? FROM projects WHERE id=? AND lifecycle_transition_id=?`).bind(opaque("pev"),id,p.participantId,now,id,transition)
  ]);
  if(!results[0].meta.changes){const row=await env.DB.prepare(`SELECT lifecycle_state,deletion_due_at,(SELECT role FROM project_members WHERE project_id=projects.id AND participant_id=?) role FROM projects WHERE id=?`).bind(p.participantId,id).first<{lifecycle_state:string;deletion_due_at:string|null;role:string|null}>();if(!row||!row.role)return problem(404,"not_found","Project not found");if(row.role!=="owner")return problem(403,"forbidden","Only the project owner may cancel deletion");return problem(409,"deletion_irreversible","The deletion deadline has passed or deletion is not pending")}
  return json({project:{id,status:"archived",deletionDueAt:null}});
}

export async function finalizeDueProjects(env:Env,clock=new Date()):Promise<number>{
  const now=clock.toISOString();
  const due=await env.DB.prepare(`SELECT id,deletion_scheduled_by_participant_id actor FROM projects WHERE lifecycle_state='archived' AND deletion_due_at<=? ORDER BY deletion_due_at,id`).bind(now).all<{id:string;actor:string}>();
  for(const project of due.results){
    const transition=`project-finalized:${project.id}`;
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE projects SET lifecycle_state='shell',deletion_finalized_at=?,lifecycle_transition_id=? WHERE id=? AND lifecycle_state='archived' AND deletion_due_at<=?`).bind(now,transition,project.id,now),
      env.DB.prepare(`UPDATE project_documents SET state='retracted',state_changed_at=?,state_changed_by_participant_id=NULL,tombstone_title=COALESCE(tombstone_title,(SELECT title FROM documents WHERE id=project_documents.document_id)) WHERE project_id=? AND state!='retracted' AND EXISTS(SELECT 1 FROM projects WHERE id=? AND lifecycle_transition_id=?)`).bind(now,project.id,project.id,transition),
      env.DB.prepare(`INSERT OR IGNORE INTO project_document_revision_shell(project_id,document_id,revision_id,version_number,content_type,actor_type,actor_id,created_at) SELECT ?,v.document_id,v.id,v.version_number,v.content_type,v.actor_type,v.actor_id,v.created_at FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE d.owner_type='project' AND d.owner_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND lifecycle_transition_id=?)`).bind(project.id,project.id,project.id,transition),
      env.DB.prepare(`DELETE FROM document_versions WHERE document_id IN (SELECT id FROM documents WHERE owner_type='project' AND owner_id=?) AND EXISTS(SELECT 1 FROM projects WHERE id=? AND lifecycle_transition_id=?)`).bind(project.id,project.id,transition),
      env.DB.prepare(`DELETE FROM document_events WHERE document_id IN (SELECT id FROM documents WHERE owner_type='project' AND owner_id=?) AND EXISTS(SELECT 1 FROM projects WHERE id=? AND lifecycle_transition_id=?)`).bind(project.id,project.id,transition),
      env.DB.prepare(`UPDATE documents SET current_version_id=NULL,deleted_at=? WHERE owner_type='project' AND owner_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND lifecycle_transition_id=?)`).bind(now,project.id,project.id,transition),
      env.DB.prepare(`DELETE FROM project_invitations WHERE project_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND lifecycle_transition_id=?)`).bind(project.id,project.id,transition),
      env.DB.prepare(`INSERT OR IGNORE INTO project_membership_shell(project_id,participant_id,participant_provenance_identifier,historical_role,joined_at,finalized_at) SELECT pm.project_id,pm.participant_id,p.provenance_identifier,pm.role,pm.joined_at,? FROM project_members pm JOIN participants p ON p.id=pm.participant_id WHERE pm.project_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND lifecycle_transition_id=?)`).bind(now,project.id,project.id,transition),
      env.DB.prepare(`DELETE FROM project_members WHERE project_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND lifecycle_transition_id=?)`).bind(project.id,project.id,transition),
      env.DB.prepare(`INSERT OR IGNORE INTO project_events(id,project_id,event_type,actor_participant_id,details_json,created_at) SELECT ?,?,'project_deletion_finalized',?,'{}',? FROM projects WHERE id=? AND lifecycle_transition_id=?`).bind(`project-deletion-finalized:${project.id}`,project.id,project.actor,now,project.id,transition)
    ]);
    if(!results[0].meta.changes)continue;
  }
  return due.results.length;
}
