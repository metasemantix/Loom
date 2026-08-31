import { hashSecret, opaque } from "./auth";
import { json, problem, readJson } from "./http";
import type { Env, Principal } from "./types";

const LABEL_LIMIT=120;
const TOKEN_PATTERN=/^loom_agent_[a-f0-9]{36}$/;
type Credential={id:string;project_id:string;authorized_by_participant_id:string|null;label:string;fingerprint:string;created_at:string;revoked_at:string|null;name:string;description:string;read_audience:string;lifecycle_state:string;deletion_due_at:string|null};

function audit(env:Env,credentialId:string|null,projectId:string|null,operation:string,target:string|null,allowed:boolean,result:string){
  return env.DB.prepare(`INSERT INTO machine_read_audit(id,credential_id,project_id,operation,target_document_id,occurred_at,allowed,result_code) VALUES(?,?,?,?,?,?,?,?)`).bind(opaque("mra"),credentialId,projectId,operation,target,new Date().toISOString(),allowed?1:0,result).run();
}

export async function createCredential(request:Request,env:Env,p:Principal,projectId:string){
  let value:Record<string,unknown>;try{value=await readJson(request)}catch(error){return problem(400,"invalid_request",(error as Error).message)}
  if(typeof value.label!=="string"||!value.label.trim()||value.label.trim().length>LABEL_LIMIT)return problem(400,"invalid_request",`label must contain 1 to ${LABEL_LIMIT} characters`);
  const token=opaque("loom_agent"),hash=await hashSecret(token),id=opaque("mac"),now=new Date().toISOString(),fingerprint=hash.slice(0,12);
  const result=await env.DB.prepare(`INSERT INTO project_machine_credentials(id,project_id,authorized_by_participant_id,label,token_hash,fingerprint,created_at) SELECT ?,x.id,?,?,?, ?,? FROM projects x JOIN project_members m ON m.project_id=x.id WHERE x.id=? AND x.lifecycle_state='active' AND m.participant_id=? AND m.role='owner'`).bind(id,p.participantId,value.label.trim(),hash,fingerprint,now,projectId,p.participantId).run();
  if(!result.meta.changes){const project=await env.DB.prepare(`SELECT x.lifecycle_state,m.role FROM projects x LEFT JOIN project_members m ON m.project_id=x.id AND m.participant_id=? WHERE x.id=?`).bind(p.participantId,projectId).first<{lifecycle_state:string;role:string|null}>();return !project||project.role!=="owner"?problem(403,"forbidden","Only the current project owner may create agent credentials"):problem(409,"project_archived","Agent credentials cannot be created unless the project is active")}
  return json({credential:{id,projectId,label:value.label.trim(),fingerprint,createdAt:now,revokedAt:null},token},201);
}

export async function listCredentials(env:Env,p:Principal,projectId:string){
  const owner=await env.DB.prepare(`SELECT 1 ok FROM project_members WHERE project_id=? AND participant_id=? AND role='owner'`).bind(projectId,p.participantId).first();if(!owner)return problem(403,"forbidden","Only the current project owner may manage agent credentials");
  const rows=await env.DB.prepare(`SELECT id,label,fingerprint,created_at,revoked_at FROM project_machine_credentials WHERE project_id=? ORDER BY created_at DESC,id DESC`).bind(projectId).all();return json({credentials:rows.results});
}

export async function revokeCredential(env:Env,p:Principal,projectId:string,id:string){
  const now=new Date().toISOString();const result=await env.DB.prepare(`UPDATE project_machine_credentials SET revoked_at=?,revoked_by_participant_id=? WHERE id=? AND project_id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM project_members WHERE project_id=? AND participant_id=? AND role='owner')`).bind(now,p.participantId,id,projectId,projectId,p.participantId).run();
  if(!result.meta.changes){const owner=await env.DB.prepare(`SELECT 1 ok FROM project_members WHERE project_id=? AND participant_id=? AND role='owner'`).bind(projectId,p.participantId).first();if(!owner)return problem(403,"forbidden","Only the current project owner may revoke agent credentials");return problem(404,"not_found","Active credential not found")}
  return new Response(null,{status:204});
}

async function authenticate(request:Request,env:Env,operation:string,target:string|null):Promise<{credential:Credential|null;response:Response|null}>{
  const authorization=request.headers.get("authorization")??"",match=/^Bearer ([^\s]+)$/.exec(authorization);
  if(!match||!TOKEN_PATTERN.test(match[1])){await audit(env,null,null,operation,target,false,"invalid_bearer_token");return {credential:null,response:problem(401,"invalid_bearer_token","A valid bearer credential is required")}}
  const hash=await hashSecret(match[1]);const credential=await env.DB.prepare(`SELECT c.id,c.project_id,c.authorized_by_participant_id,c.label,c.fingerprint,c.created_at,c.revoked_at,x.name,x.description,x.read_audience,x.lifecycle_state,x.deletion_due_at FROM project_machine_credentials c JOIN projects x ON x.id=c.project_id WHERE c.token_hash=?`).bind(hash).first<Credential>();
  if(!credential||credential.revoked_at){await audit(env,credential?.id??null,credential?.project_id??null,operation,target,false,credential?.revoked_at?"credential_revoked":"invalid_bearer_token");return {credential:null,response:problem(401,"invalid_bearer_token","A valid bearer credential is required")}}
  if(credential.lifecycle_state==="shell"){await audit(env,credential.id,credential.project_id,operation,target,false,"project_unavailable");return {credential:null,response:problem(410,"project_unavailable","The project no longer provides a readable corpus")}}
  return {credential,response:null};
}

export async function machineRead(request:Request,env:Env,operation:"introspect"|"project"|"documents"|"document",target:string|null=null){
  const auth=await authenticate(request,env,operation,target);if(auth.response)return auth.response;const c=auth.credential!;
  if(request.method!=="GET"){await audit(env,c.id,c.project_id,operation,target,false,"read_only_api");return problem(405,"read_only_api","Machine access is read-only")}
  if(operation==="introspect"){await audit(env,c.id,c.project_id,operation,null,true,"allowed");return json({caller:{authentication:"bearer",credential:{id:c.id,label:c.label,fingerprint:c.fingerprint,createdAt:c.created_at},grant:{projectId:c.project_id,capabilities:["project:read","documents:list","documents:read"]}}})}
  if(operation==="project"){await audit(env,c.id,c.project_id,operation,null,true,"allowed");return json({project:{id:c.project_id,name:c.name,description:c.description,readAudience:c.read_audience,status:c.lifecycle_state,deletionScheduled:c.deletion_due_at!==null},links:{documents:"/api/agent/documents"}})}
  if(operation==="documents"){
    const contributions=await env.DB.prepare(`SELECT pd.document_id id,CASE WHEN pd.state='active' AND d.id IS NOT NULL AND NOT(q.account_state='deletion_pending' AND q.deletion_due_at<=?) THEN 'available' ELSE 'unavailable' END availability,CASE WHEN pd.state='active' THEN d.title ELSE pd.tombstone_title END title,CASE WHEN pd.state='active' AND d.id IS NOT NULL THEN d.logical_path END logical_path,'participant' ownership_kind,'document' document_kind,pd.source_owner_participant_id owner_id,pd.added_at created_at,CASE WHEN pd.state='active' AND d.id IS NOT NULL AND NOT(q.account_state='deletion_pending' AND q.deletion_due_at<=?) THEN v.created_at END updated_at,CASE WHEN pd.state='active' AND d.id IS NOT NULL AND NOT(q.account_state='deletion_pending' AND q.deletion_due_at<=?) THEN d.compression END compression,CASE WHEN pd.state='active' AND d.id IS NOT NULL AND NOT(q.account_state='deletion_pending' AND q.deletion_due_at<=?) THEN '/api/agent/documents/'||pd.document_id END retrieval FROM project_documents pd LEFT JOIN documents d ON d.id=pd.document_id AND d.owner_type='participant' AND d.owner_id=pd.source_owner_participant_id AND d.deleted_at IS NULL LEFT JOIN participants q ON q.id=pd.source_owner_participant_id LEFT JOIN document_versions v ON v.id=d.current_version_id WHERE pd.project_id=?`).bind(new Date().toISOString(),new Date().toISOString(),new Date().toISOString(),new Date().toISOString(),c.project_id).all();
    const native=await env.DB.prepare(`SELECT d.id,'available' availability,d.title,d.logical_path,'project' ownership_kind,d.kind document_kind,d.owner_id,d.created_at,v.created_at updated_at,d.compression,'/api/agent/documents/'||d.id retrieval FROM documents d JOIN document_versions v ON v.id=d.current_version_id WHERE d.owner_type='project' AND d.owner_id=? AND d.deleted_at IS NULL`).bind(c.project_id).all();
    await audit(env,c.id,c.project_id,operation,null,true,"allowed");return json({documents:[...contributions.results,...native.results]});
  }
  const now=new Date().toISOString();const row=await env.DB.prepare(`SELECT d.id,d.title,d.logical_path,d.kind,d.owner_type ownership_kind,d.owner_id,d.compression,v.content,v.content_type,v.version_number,v.created_at updated_at FROM documents d JOIN document_versions v ON v.id=d.current_version_id WHERE d.id=? AND d.deleted_at IS NULL AND ((d.owner_type='project' AND d.owner_id=?) OR (d.owner_type='participant' AND EXISTS(SELECT 1 FROM project_documents pd JOIN participants q ON q.id=pd.source_owner_participant_id WHERE pd.project_id=? AND pd.document_id=d.id AND pd.source_owner_participant_id=d.owner_id AND pd.state='active' AND NOT(q.account_state='deletion_pending' AND q.deletion_due_at<=?))))`).bind(target,c.project_id,c.project_id,now).first();
  if(!row){await audit(env,c.id,c.project_id,operation,target,false,"document_unavailable");return problem(404,"not_found","Document not found")}
  await audit(env,c.id,c.project_id,operation,target,true,"allowed");return json({document:row});
}
