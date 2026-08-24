import { opaque } from "./auth";
import { json, problem, readJson } from "./http";
import type { Env, Principal } from "./types";

const wordsA=["amber","brisk","calm","copper","green","kind","lunar","prime","quiet","silver"];
const wordsB=["finch","lark","otter","pine","raven","reed","sparrow","willow","wren","yak"];

export function provenanceIdentifier():string {
  const bytes=crypto.getRandomValues(new Uint8Array(4));
  const number=new DataView(bytes.buffer).getUint32(0);
  return `${wordsA[number%wordsA.length]}-${wordsB[Math.floor(number/wordsA.length)%wordsB.length]}-${number.toString(36)}`;
}

export async function accountLifecycle(env:Env,p:Principal):Promise<Response>{
  const owned=await env.DB.prepare(`SELECT x.id,x.name,x.lifecycle_state FROM projects x JOIN project_members pm ON pm.project_id=x.id WHERE pm.participant_id=? AND pm.role='owner' AND x.lifecycle_state='active' ORDER BY x.name,x.id`).bind(p.participantId).all();
  const row=await env.DB.prepare(`SELECT account_state,deletion_due_at,provenance_identifier FROM participants WHERE id=?`).bind(p.participantId).first();
  return json({account:row,unresolvedOwnedProjects:owned.results});
}

export async function scheduleDeletion(request:Request,env:Env,p:Principal):Promise<Response>{
  let body;try{body=await readJson(request)}catch(error){return problem(400,"invalid_request",(error as Error).message)}
  if(body.displayName!==p.displayName)return problem(400,"confirmation_mismatch","Type your current display name exactly");
  const unresolved=await env.DB.prepare(`SELECT x.id,x.name,x.lifecycle_state FROM projects x JOIN project_members pm ON pm.project_id=x.id WHERE pm.participant_id=? AND pm.role='owner' AND x.lifecycle_state='active' ORDER BY x.name,x.id`).bind(p.participantId).all();
  if(unresolved.results.length)return json({error:{code:"owned_projects_unresolved",message:"Transfer or archive every owned project before scheduling deletion"},unresolvedOwnedProjects:unresolved.results},409);
  const now=new Date(),seconds=Number(env.ACCOUNT_DELETION_GRACE_SECONDS??259200);
  const due=new Date(now.getTime()+(Number.isFinite(seconds)&&seconds>0?seconds:259200)*1000).toISOString(),transition=opaque("act");
  const result=await env.DB.batch([
    env.DB.prepare(`UPDATE participants SET account_state='deletion_pending',deletion_due_at=? WHERE id=? AND account_state='active'`).bind(due,p.participantId),
    env.DB.prepare(`INSERT INTO account_events(id,participant_id,event_type,details_json,created_at) SELECT ?,?,'account_deletion_scheduled',?,? WHERE changes()=1`).bind(transition,p.participantId,JSON.stringify({deletionDueAt:due}),now.toISOString())
  ]);
  if(!result[0].meta.changes)return problem(409,"invalid_account_state","Account deletion is already scheduled");
  return json({account:{state:"deletion_pending",deletionDueAt:due}},201);
}

export async function cancelDeletion(env:Env,p:Principal):Promise<Response>{
  const now=new Date().toISOString();
  const result=await env.DB.batch([
    env.DB.prepare(`UPDATE participants SET account_state='active',deletion_due_at=NULL WHERE id=? AND account_state='deletion_pending' AND deletion_due_at>?`).bind(p.participantId,now),
    env.DB.prepare(`INSERT INTO account_events(id,participant_id,event_type,details_json,created_at) SELECT ?,?,'account_deletion_cancelled','{}',? WHERE changes()=1`).bind(opaque("act"),p.participantId,now)
  ]);
  if(!result[0].meta.changes)return problem(409,"deletion_irreversible","The deletion deadline has passed or deletion is not pending");
  return json({account:{state:"active"}});
}

export async function finalizeDueAccounts(env:Env,now=new Date()):Promise<number>{
  const due=await env.DB.prepare(`SELECT id,user_id FROM participants WHERE account_state='deletion_pending' AND deletion_due_at<=? ORDER BY deletion_due_at`).bind(now.toISOString()).all<{id:string;user_id:string}>();
  for(const participant of due.results)await finalizeAccount(env,participant.id,participant.user_id,now.toISOString());
  return due.results.length;
}

async function finalizeAccount(env:Env,participantId:string,userId:string,now:string):Promise<void>{
  const contributions=await env.DB.prepare(`SELECT pd.project_id,pd.document_id,d.title FROM project_documents pd JOIN documents d ON d.id=pd.document_id WHERE pd.source_owner_participant_id=? AND pd.state!='retracted'`).bind(participantId).all<{project_id:string;document_id:string;title:string}>();
  const memberships=await env.DB.prepare(`SELECT project_id,role FROM project_members WHERE participant_id=? ORDER BY project_id`).bind(participantId).all<{project_id:string;role:string}>();
  const statements:D1PreparedStatement[]=[env.DB.prepare(`UPDATE participants SET account_state='deleted',user_id=NULL,public_slug=NULL,created_at=NULL,withdrawn_at=NULL,deletion_due_at=NULL,deletion_finalized_at=? WHERE id=? AND account_state='deletion_pending' AND deletion_due_at<=?`).bind(now,participantId,now)];
  for(const c of contributions.results)statements.push(
    env.DB.prepare(`UPDATE project_documents SET state='retracted',tombstone_title=?,state_changed_at=?,state_changed_by_participant_id=NULL,state_transition_id=? WHERE project_id=? AND document_id=? AND state!='retracted' AND EXISTS(SELECT 1 FROM participants WHERE id=? AND account_state='deleted' AND deletion_finalized_at=?)`).bind(c.title,now,`account-finalize:${participantId}`,c.project_id,c.document_id,participantId,now),
    env.DB.prepare(`INSERT INTO project_events(id,project_id,event_type,actor_participant_id,details_json,created_at) SELECT ?,?,'contribution_retracted',?, ?,? WHERE changes()=1`).bind(opaque("pev"),c.project_id,participantId,JSON.stringify({documentId:c.document_id}),now)
  );
  for(const membership of memberships.results)statements.push(
    env.DB.prepare(`INSERT OR IGNORE INTO project_events(id,project_id,event_type,actor_participant_id,details_json,created_at) SELECT ?,?,'member_left',?,?,? WHERE EXISTS(SELECT 1 FROM participants WHERE id=? AND account_state='deleted' AND deletion_finalized_at=?) AND EXISTS(SELECT 1 FROM project_members WHERE project_id=? AND participant_id=?)`).bind(`account-departure:${participantId}:${membership.project_id}`,membership.project_id,participantId,JSON.stringify({participantId,withdrawContributions:false}),now,participantId,now,membership.project_id,participantId)
  );
  statements.push(
    env.DB.prepare(`DELETE FROM documents WHERE owner_type='participant' AND owner_id=? AND EXISTS(SELECT 1 FROM participants WHERE id=? AND account_state='deleted' AND deletion_finalized_at=?)`).bind(participantId,participantId,now),
    env.DB.prepare(`UPDATE project_invitations SET status='revoked',consumed_at=? WHERE invited_by_participant_id=? AND status='outstanding' AND EXISTS(SELECT 1 FROM participants WHERE id=? AND account_state='deleted')`).bind(now,participantId,participantId),
    env.DB.prepare(`DELETE FROM project_members WHERE participant_id=? AND EXISTS(SELECT 1 FROM participants WHERE id=? AND account_state='deleted')`).bind(participantId,participantId),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM participants WHERE id=? AND account_state='deleted')`).bind(userId,participantId),
    env.DB.prepare(`DELETE FROM auth_identities WHERE user_id=? AND EXISTS(SELECT 1 FROM participants WHERE id=? AND account_state='deleted')`).bind(userId,participantId),
    env.DB.prepare(`DELETE FROM users WHERE id=? AND EXISTS(SELECT 1 FROM participants WHERE id=? AND account_state='deleted')`).bind(userId,participantId),
    env.DB.prepare(`INSERT OR IGNORE INTO account_events(id,participant_id,event_type,details_json,created_at) SELECT ?,?,'account_deletion_finalized','{}',? WHERE EXISTS(SELECT 1 FROM participants WHERE id=? AND account_state='deleted' AND deletion_finalized_at=?)`).bind(`account-finalized:${participantId}`,participantId,now,participantId,now)
  );
  await env.DB.batch(statements);
}
