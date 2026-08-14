import { opaque } from "./auth";
import { json, problem, readJson } from "./http";
import type { Env, Principal } from "./types";

const AUDIENCES = new Set(["members_and_agents", "agents_only"]);
async function membership(env: Env, principal: Principal, id: string) {
  return env.DB.prepare(`SELECT pm.role,p.name,p.read_audience,p.created_by_participant_id FROM project_members pm JOIN projects p ON p.id=pm.project_id WHERE pm.project_id=? AND pm.participant_id=?`).bind(id, principal.participantId).first<{ role: string; name: string; read_audience: string; created_by_participant_id: string }>();
}
export async function listProjects(env: Env, principal: Principal): Promise<Response> {
  const rows = await env.DB.prepare(`SELECT p.id,p.name,p.read_audience,pm.role FROM projects p JOIN project_members pm ON pm.project_id=p.id WHERE pm.participant_id=? ORDER BY p.name,p.id`).bind(principal.participantId).all();
  return json({ projects: rows.results });
}
export async function createProject(request: Request, env: Env, principal: Principal): Promise<Response> {
  let body; try { body = await readJson(request); } catch (error) { return problem(400,"invalid_request",(error as Error).message); }
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120 || typeof body.readAudience !== "string" || !AUDIENCES.has(body.readAudience)) return problem(400,"invalid_request","invalid project name or readAudience");
  const id=opaque("prj"), now=new Date().toISOString();
  await env.DB.batch([env.DB.prepare(`INSERT INTO projects(id,name,created_by_participant_id,read_audience,created_at) VALUES(?,?,?,?,?)`).bind(id,body.name.trim(),principal.participantId,body.readAudience,now),env.DB.prepare(`INSERT INTO project_members(project_id,participant_id,role,joined_at) VALUES(?,?,'owner',?)`).bind(id,principal.participantId,now)]);
  return json({project:{id,name:body.name.trim(),readAudience:body.readAudience}},201);
}
export async function getProject(env: Env, principal: Principal, id: string): Promise<Response> {
  const member=await membership(env,principal,id); if(!member)return problem(404,"not_found","Project not found");
  const members=await env.DB.prepare(`SELECT pm.participant_id,u.display_name,pm.role,pm.joined_at FROM project_members pm JOIN participants p ON p.id=pm.participant_id JOIN users u ON u.id=p.user_id WHERE pm.project_id=? ORDER BY pm.joined_at`).bind(id).all();
  let documents: unknown[]=[];
  if(member.read_audience==="members_and_agents") documents=(await env.DB.prepare(`SELECT d.id,d.title,d.logical_path,d.visibility,d.owner_id owner_participant_id,u.display_name owner_display_name,v.content,v.content_type FROM project_documents pd JOIN documents d ON d.id=pd.document_id AND d.deleted_at IS NULL JOIN participants p ON p.id=d.owner_id JOIN users u ON u.id=p.user_id JOIN document_versions v ON v.id=d.current_version_id WHERE pd.project_id=? ORDER BY d.logical_path`).bind(id).all()).results;
  return json({project:{id,name:member.name,readAudience:member.read_audience,role:member.role},members:members.results,documents,documentsHiddenFromHumans:member.read_audience==="agents_only"});
}
export async function updateProject(request:Request,env:Env,principal:Principal,id:string):Promise<Response>{
  const member=await membership(env,principal,id);if(!member)return problem(404,"not_found","Project not found");if(member.role!=="owner")return problem(403,"forbidden","Only the project owner may change project policy");
  let body;try{body=await readJson(request)}catch(error){return problem(400,"invalid_request",(error as Error).message)}
  if(typeof body.readAudience!=="string"||!AUDIENCES.has(body.readAudience))return problem(400,"invalid_request","unsupported readAudience");
  await env.DB.prepare(`UPDATE projects SET read_audience=? WHERE id=?`).bind(body.readAudience,id).run();return json({project:{id,readAudience:body.readAudience}});
}
export async function addMember(request:Request,env:Env,principal:Principal,id:string):Promise<Response>{
  const member=await membership(env,principal,id);if(!member)return problem(404,"not_found","Project not found");if(member.role!=="owner")return problem(403,"forbidden","Only the project owner may add members");
  let body;try{body=await readJson(request)}catch(error){return problem(400,"invalid_request",(error as Error).message)}
  if(typeof body.participantId!=="string")return problem(400,"invalid_request","participantId is required");
  const target=await env.DB.prepare(`SELECT id FROM participants WHERE id=? AND withdrawn_at IS NULL`).bind(body.participantId).first();if(!target)return problem(404,"participant_not_found","Participant not found");
  try{await env.DB.prepare(`INSERT INTO project_members(project_id,participant_id,role,joined_at) VALUES(?,?,'member',?)`).bind(id,body.participantId,new Date().toISOString()).run()}catch{return problem(409,"already_member","Participant is already a member")};return json({member:{participantId:body.participantId}},201);
}
export async function removeMember(env:Env,principal:Principal,id:string,participantId:string):Promise<Response>{
  const member=await membership(env,principal,id);if(!member)return problem(404,"not_found","Project not found");
  if(participantId!==principal.participantId&&member.role!=="owner")return problem(403,"forbidden","Only the project owner may remove another member");
  if(participantId===member.created_by_participant_id)return problem(409,"owner_cannot_leave","The project owner cannot leave in this version");
  await env.DB.prepare(`DELETE FROM project_members WHERE project_id=? AND participant_id=?`).bind(id,participantId).run();return new Response(null,{status:204});
}
export async function linkDocument(request:Request,env:Env,principal:Principal,id:string):Promise<Response>{
  if(!await membership(env,principal,id))return problem(404,"not_found","Project not found");let body;try{body=await readJson(request)}catch(error){return problem(400,"invalid_request",(error as Error).message)}
  const document=await env.DB.prepare(`SELECT id FROM documents WHERE id=? AND owner_type='participant' AND owner_id=? AND deleted_at IS NULL`).bind(body.documentId,principal.participantId).first();if(!document)return problem(404,"not_found","Document not found");
  try{await env.DB.prepare(`INSERT INTO project_documents(project_id,document_id,added_by_participant_id,added_at) VALUES(?,?,?,?)`).bind(id,body.documentId,principal.participantId,new Date().toISOString()).run()}catch{return problem(409,"already_linked","Document is already linked")};return json({link:{projectId:id,documentId:body.documentId}},201);
}
export async function unlinkDocument(env:Env,principal:Principal,id:string,documentId:string):Promise<Response>{
  if(!await membership(env,principal,id))return problem(404,"not_found","Project not found");
  const result=await env.DB.prepare(`DELETE FROM project_documents WHERE project_id=? AND document_id IN (SELECT id FROM documents WHERE id=? AND owner_id=?)`).bind(id,documentId,principal.participantId).run();if(!result.meta.changes)return problem(404,"not_found","Linked document not found");return new Response(null,{status:204});
}
