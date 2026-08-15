import { hashSecret, opaque } from "./auth";
import { json, problem, readJson } from "./http";
import type { Env, Principal } from "./types";

const AUDIENCES = new Set(["members_and_agents", "agents_only"]);
const DESCRIPTION_LIMIT = 500;
type Role = "owner" | "admin" | "member";
type Membership = { role: Role; name: string; description: string; read_audience: string };

async function membership(env: Env, principal: Principal, id: string) {
  return env.DB.prepare(`SELECT pm.role,p.name,p.description,p.read_audience FROM project_members pm JOIN projects p ON p.id=pm.project_id WHERE pm.project_id=? AND pm.participant_id=?`).bind(id, principal.participantId).first<Membership>();
}
function administers(role: Role) { return role === "owner" || role === "admin"; }
async function body(request: Request) { return readJson(request); }

export async function listProjects(env: Env, principal: Principal): Promise<Response> {
  const rows = await env.DB.prepare(`SELECT p.id,p.name,p.description,p.read_audience,pm.role FROM projects p JOIN project_members pm ON pm.project_id=p.id WHERE pm.participant_id=? ORDER BY p.name,p.id`).bind(principal.participantId).all();
  return json({ projects: rows.results });
}
export async function createProject(request: Request, env: Env, principal: Principal): Promise<Response> {
  let value; try { value = await body(request); } catch (error) { return problem(400,"invalid_request",(error as Error).message); }
  const description = typeof value.description === "string" ? value.description.trim() : "";
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 120 || description.length > DESCRIPTION_LIMIT || typeof value.readAudience !== "string" || !AUDIENCES.has(value.readAudience)) return problem(400,"invalid_request","invalid project name, description, or readAudience");
  const id=opaque("prj"), now=new Date().toISOString();
  await env.DB.batch([env.DB.prepare(`INSERT INTO projects(id,name,description,created_by_participant_id,read_audience,created_at) VALUES(?,?,?,?,?,?)`).bind(id,value.name.trim(),description,principal.participantId,value.readAudience,now),env.DB.prepare(`INSERT INTO project_members(project_id,participant_id,role,joined_at) VALUES(?,?,'owner',?)`).bind(id,principal.participantId,now)]);
  return json({project:{id,name:value.name.trim(),description,readAudience:value.readAudience}},201);
}
export async function getProject(env: Env, principal: Principal, id: string): Promise<Response> {
  const member=await membership(env,principal,id); if(!member)return problem(404,"not_found","Project not found");
  const members=await env.DB.prepare(`SELECT pm.participant_id,u.display_name,pm.role,pm.joined_at FROM project_members pm JOIN participants p ON p.id=pm.participant_id JOIN users u ON u.id=p.user_id WHERE pm.project_id=? ORDER BY CASE pm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.display_name`).bind(id).all();
  const eligible=(await env.DB.prepare(`SELECT d.id,d.title,d.logical_path FROM documents d WHERE d.owner_type='participant' AND d.owner_id=? AND d.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM project_documents pd WHERE pd.project_id=? AND pd.document_id=d.id) ORDER BY d.logical_path,d.title`).bind(principal.participantId,id).all()).results;
  let documents: unknown[]=[];
  if(member.read_audience==="members_and_agents") documents=(await env.DB.prepare(`SELECT d.id,d.title,d.logical_path,d.visibility,d.owner_id owner_participant_id,u.display_name owner_display_name,v.version_number,v.created_at updated_at FROM project_documents pd JOIN documents d ON d.id=pd.document_id AND d.deleted_at IS NULL JOIN participants p ON p.id=d.owner_id JOIN users u ON u.id=p.user_id JOIN document_versions v ON v.id=d.current_version_id WHERE pd.project_id=? ORDER BY d.logical_path`).bind(id).all()).results;
  let invitations: unknown[]=[];
  if(administers(member.role)) invitations=(await env.DB.prepare(`SELECT i.id,i.created_at,i.expires_at,u.display_name invited_by_display_name FROM project_invitations i JOIN participants p ON p.id=i.invited_by_participant_id JOIN users u ON u.id=p.user_id WHERE i.project_id=? AND i.status='outstanding' AND i.expires_at>? ORDER BY i.created_at DESC`).bind(id,new Date().toISOString()).all()).results;
  return json({project:{id,name:member.name,description:member.description,readAudience:member.read_audience,role:member.role},members:members.results,documents,eligibleDocuments:eligible,invitations,canAdminister:administers(member.role),documentsHiddenFromHumans:member.read_audience==="agents_only"});
}
export async function updateProject(request:Request,env:Env,principal:Principal,id:string):Promise<Response>{
  const member=await membership(env,principal,id);if(!member)return problem(404,"not_found","Project not found");
  let value;try{value=await body(request)}catch(error){return problem(400,"invalid_request",(error as Error).message)}
  const updates:string[]=[], bindings:unknown[]=[];
  if("description" in value){if(!administers(member.role))return problem(403,"forbidden","Only project administrators may edit the description");if(typeof value.description!=="string"||value.description.length>DESCRIPTION_LIMIT)return problem(400,"invalid_request",`description must be at most ${DESCRIPTION_LIMIT} characters`);updates.push("description=?");bindings.push(value.description.trim())}
  if("readAudience" in value){if(member.role!=="owner")return problem(403,"forbidden","Only the project owner may change read policy");if(typeof value.readAudience!=="string"||!AUDIENCES.has(value.readAudience))return problem(400,"invalid_request","unsupported readAudience");updates.push("read_audience=?");bindings.push(value.readAudience)}
  if(!updates.length)return problem(400,"invalid_request","No supported project changes supplied");
  await env.DB.prepare(`UPDATE projects SET ${updates.join(",")} WHERE id=?`).bind(...bindings,id).run();return json({project:{id}});
}
export async function linkDocument(request:Request,env:Env,principal:Principal,id:string):Promise<Response>{
  if(!await membership(env,principal,id))return problem(404,"not_found","Project not found");let value;try{value=await body(request)}catch(error){return problem(400,"invalid_request",(error as Error).message)}
  if(typeof value.documentId!=="string")return problem(400,"invalid_request","documentId is required");
  const document=await env.DB.prepare(`SELECT id FROM documents WHERE id=? AND owner_type='participant' AND owner_id=? AND deleted_at IS NULL`).bind(value.documentId,principal.participantId).first();if(!document)return problem(404,"not_found","Document not found");
  try{await env.DB.prepare(`INSERT INTO project_documents(project_id,document_id,added_by_participant_id,added_at) VALUES(?,?,?,?)`).bind(id,value.documentId,principal.participantId,new Date().toISOString()).run()}catch{return problem(409,"already_linked","Document is already linked")};return json({link:{projectId:id,documentId:value.documentId}},201);
}
export async function unlinkDocument(env:Env,principal:Principal,id:string,documentId:string):Promise<Response>{
  if(!await membership(env,principal,id))return problem(404,"not_found","Project not found");
  const result=await env.DB.prepare(`DELETE FROM project_documents WHERE project_id=? AND document_id IN (SELECT id FROM documents WHERE id=? AND owner_type='participant' AND owner_id=?)`).bind(id,documentId,principal.participantId).run();if(!result.meta.changes)return problem(404,"not_found","Linked document not found");return new Response(null,{status:204});
}
export async function createInvitation(env:Env,principal:Principal,id:string):Promise<Response>{
  const member=await membership(env,principal,id);if(!member)return problem(404,"not_found","Project not found");if(!administers(member.role))return problem(403,"forbidden","Only project administrators may invite people");
  const token=opaque("inv"),now=new Date(),expires=new Date(now.getTime()+7*86400_000);
  const invitationId=opaque("pin");await env.DB.prepare(`INSERT INTO project_invitations(id,project_id,token_hash,invited_by_participant_id,status,created_at,expires_at) VALUES(?,?,?,?,'outstanding',?,?)`).bind(invitationId,id,await hashSecret(token),principal.participantId,now.toISOString(),expires.toISOString()).run();
  return json({invitation:{id:invitationId,token,url:`/invitations/${token}`,expiresAt:expires.toISOString()}},201);
}
export async function revokeInvitation(env:Env,principal:Principal,id:string,invitationId:string):Promise<Response>{
  const member=await membership(env,principal,id);if(!member)return problem(404,"not_found","Project not found");if(!administers(member.role))return problem(403,"forbidden","Only project administrators may revoke invitations");
  const result=await env.DB.prepare(`UPDATE project_invitations SET status='revoked',consumed_at=? WHERE id=? AND project_id=? AND status='outstanding'`).bind(new Date().toISOString(),invitationId,id).run();if(!result.meta.changes)return problem(404,"not_found","Outstanding invitation not found");return new Response(null,{status:204});
}
async function invitation(env:Env,token:string){return env.DB.prepare(`SELECT i.id,i.project_id,i.status,i.expires_at,p.name,p.description,p.read_audience,inviter.display_name inviter_display_name,owner.display_name owner_display_name,(SELECT count(*) FROM project_members WHERE project_id=p.id) member_count FROM project_invitations i JOIN projects p ON p.id=i.project_id JOIN participants ip ON ip.id=i.invited_by_participant_id JOIN users inviter ON inviter.id=ip.user_id JOIN project_members om ON om.project_id=p.id AND om.role='owner' JOIN participants op ON op.id=om.participant_id JOIN users owner ON owner.id=op.user_id WHERE i.token_hash=?`).bind(await hashSecret(token)).first<Record<string,unknown>>();}
export async function previewInvitation(env:Env,token:string):Promise<Response>{
  const invite=await invitation(env,token);if(!invite)return problem(404,"not_found","Invitation not found");const active=invite.status==="outstanding"&&String(invite.expires_at)>new Date().toISOString();
  return json({invitation:{projectName:invite.name,projectDescription:invite.description,readAudience:invite.read_audience,inviterDisplayName:invite.inviter_display_name,ownerDisplayName:invite.owner_display_name,memberCount:invite.member_count,active}});
}
export async function respondInvitation(env:Env,principal:Principal,token:string,decision:"accept"|"decline"):Promise<Response>{
  const invite=await invitation(env,token);if(!invite)return problem(404,"not_found","Invitation not found");const now=new Date().toISOString();if(invite.status!=="outstanding"||String(invite.expires_at)<=now)return problem(410,"invitation_unavailable","Invitation has expired or already been used");
  if(decision==="decline"){await env.DB.prepare(`UPDATE project_invitations SET status='declined',consumed_by_participant_id=?,consumed_at=? WHERE id=? AND status='outstanding' AND expires_at>?`).bind(principal.participantId,now,invite.id,now).run();return new Response(null,{status:204});}
  const results=await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO project_members(project_id,participant_id,role,joined_at) SELECT project_id,?,'member',? FROM project_invitations WHERE id=? AND status='outstanding' AND expires_at>?`).bind(principal.participantId,now,invite.id,now),
    env.DB.prepare(`UPDATE project_invitations SET status='accepted',consumed_by_participant_id=?,consumed_at=? WHERE id=? AND status='outstanding' AND expires_at>?`).bind(principal.participantId,now,invite.id,now),
  ]);if(!results[1].meta.changes)return problem(410,"invitation_unavailable","Invitation has expired or already been used");return json({projectId:invite.project_id},201);
}
export async function changeRole(request:Request,env:Env,principal:Principal,id:string,targetId:string):Promise<Response>{
  const actor=await membership(env,principal,id);if(!actor)return problem(404,"not_found","Project not found");if(actor.role!=="owner")return problem(403,"forbidden","Only the owner may change administrator roles");
  let value;try{value=await body(request)}catch(error){return problem(400,"invalid_request",(error as Error).message)}if(value.role!=="admin"&&value.role!=="member")return problem(400,"invalid_request","role must be admin or member");
  const target=await env.DB.prepare(`SELECT role FROM project_members WHERE project_id=? AND participant_id=?`).bind(id,targetId).first<{role:Role}>();if(!target)return problem(404,"not_found","Member not found");if(target.role==="owner")return problem(409,"owner_role_protected","Transfer ownership instead");
  await env.DB.prepare(`UPDATE project_members SET role=? WHERE project_id=? AND participant_id=?`).bind(value.role,id,targetId).run();return json({member:{participantId:targetId,role:value.role}});
}
export async function transferOwnership(request:Request,env:Env,principal:Principal,id:string):Promise<Response>{
  const actor=await membership(env,principal,id);if(!actor)return problem(404,"not_found","Project not found");if(actor.role!=="owner")return problem(403,"forbidden","Only the owner may transfer ownership");
  let value;try{value=await body(request)}catch(error){return problem(400,"invalid_request",(error as Error).message)}if(typeof value.participantId!=="string"||value.confirm!==true)return problem(400,"confirmation_required","Confirm the ownership transfer");
  const target=await env.DB.prepare(`SELECT role FROM project_members WHERE project_id=? AND participant_id=?`).bind(id,value.participantId).first();if(!target||value.participantId===principal.participantId)return problem(400,"invalid_target","Target must be another current member");const now=new Date().toISOString();
  await env.DB.batch([env.DB.prepare(`UPDATE project_members SET role='admin' WHERE project_id=? AND participant_id=? AND role='owner'`).bind(id,principal.participantId),env.DB.prepare(`UPDATE project_members SET role='owner' WHERE project_id=? AND participant_id=?`).bind(id,value.participantId),env.DB.prepare(`INSERT INTO project_events(id,project_id,event_type,actor_participant_id,details_json,created_at) VALUES(?,?,'ownership_transferred',?,?,?)`).bind(opaque("pev"),id,principal.participantId,JSON.stringify({previousOwnerParticipantId:principal.participantId,newOwnerParticipantId:value.participantId}),now)]);return json({projectId:id,ownerParticipantId:value.participantId,previousOwnerRole:"admin"});
}
export async function removeMember(env:Env,principal:Principal,id:string,targetId:string):Promise<Response>{
  const actor=await membership(env,principal,id);if(!actor)return problem(404,"not_found","Project not found");const target=await env.DB.prepare(`SELECT role FROM project_members WHERE project_id=? AND participant_id=?`).bind(id,targetId).first<{role:Role}>();if(!target)return problem(404,"not_found","Member not found");
  const self=targetId===principal.participantId;if(target.role==="owner")return problem(409,"owner_cannot_leave","The owner must transfer ownership before leaving");if(!self){if(!administers(actor.role))return problem(403,"forbidden","Only project administrators may remove members");if(target.role==="admin"&&actor.role!=="owner")return problem(403,"forbidden","Only the owner may remove an administrator");}
  await env.DB.batch([env.DB.prepare(`DELETE FROM project_documents WHERE project_id=? AND document_id IN (SELECT id FROM documents WHERE owner_type='participant' AND owner_id=?)`).bind(id,targetId),env.DB.prepare(`DELETE FROM project_members WHERE project_id=? AND participant_id=?`).bind(id,targetId)]);return new Response(null,{status:204});
}
