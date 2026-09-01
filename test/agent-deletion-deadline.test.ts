import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";

const origin="http://example.com";

async function sha256(value:string):Promise<string>{
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function participant(){
  const now=new Date().toISOString(),user="usr_agent_deadline",id="par_agent_deadline",token="session-agent-deadline";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)").bind(user,"Deadline owner",now),
    env.DB.prepare("INSERT INTO participants(id,user_id,public_slug,created_at,provenance_identifier) VALUES(?,?,?,?,?)").bind(id,user,id,now,"test-agent-deadline"),
    env.DB.prepare("INSERT INTO sessions(id,user_id,secret_hash,expires_at,created_at) VALUES(?,?,?,?,?)").bind("sid_agent_deadline",user,await sha256(token),new Date(Date.now()+60_000).toISOString(),now),
  ]);
  return {cookie:`loom_session=${token}`};
}

beforeEach(async()=>{
  await env.DB.exec("DELETE FROM machine_read_audit; DELETE FROM project_machine_checkins; DELETE FROM project_machine_credentials; DELETE FROM account_events; DELETE FROM project_events; DELETE FROM project_invitations; DELETE FROM project_documents; DELETE FROM project_members; DELETE FROM projects; DELETE FROM sessions; DELETE FROM document_events; DELETE FROM document_versions; DELETE FROM documents; DELETE FROM participants; DELETE FROM auth_identities; DELETE FROM users;");
});

it("fails machine reads closed at the project deletion deadline before finalization",async()=>{
  const owner=await participant();
  const projectResponse=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Lifecycle corpus",readAudience:"agents_only"})}),projectId=(await projectResponse.json<any>()).project.id;
  const nativeResponse=await SELF.fetch(`${origin}/api/projects/${projectId}/native-documents`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Lifecycle document",content:"still readable",contentType:"text/plain"})}),documentId=(await nativeResponse.json<any>()).document.id;
  const credentialResponse=await SELF.fetch(`${origin}/api/projects/${projectId}/agent-credentials`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({label:"Lifecycle reader"})}),credential=await credentialResponse.json<any>(),headers={authorization:`Bearer ${credential.token}`};

  await SELF.fetch(`${origin}/api/projects/${projectId}/archive`,{method:"POST",headers:{cookie:owner.cookie,origin}});
  expect((await SELF.fetch(`${origin}/api/agent/documents/${documentId}`,{headers})).status).toBe(200);
  await SELF.fetch(`${origin}/api/projects/${projectId}/unarchive`,{method:"POST",headers:{cookie:owner.cookie,origin}});

  const scheduled=await SELF.fetch(`${origin}/api/projects/${projectId}/deletion`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Lifecycle corpus"})});
  expect(scheduled.status).toBe(201);
  expect((await SELF.fetch(`${origin}/api/agent/me`,{headers})).status).toBe(200);
  expect((await SELF.fetch(`${origin}/api/agent/documents`,{headers})).status).toBe(200);
  expect((await SELF.fetch(`${origin}/api/agent/documents/${documentId}`,{headers})).status).toBe(200);

  await env.DB.prepare(`UPDATE projects SET deletion_due_at=? WHERE id=?`).bind("2026-01-01T00:00:00.000Z",projectId).run();
  expect(await env.DB.prepare(`SELECT lifecycle_state FROM projects WHERE id=?`).bind(projectId).first()).toEqual({lifecycle_state:"archived"});
  expect(await env.DB.prepare(`SELECT revoked_at FROM project_machine_credentials WHERE id=?`).bind(credential.credential.id).first()).toEqual({revoked_at:null});
  expect((await SELF.fetch(`${origin}/api/agent/me`,{headers})).status).toBe(410);
  expect((await SELF.fetch(`${origin}/api/agent/documents`,{headers})).status).toBe(410);
  expect((await SELF.fetch(`${origin}/api/agent/documents/${documentId}`,{headers})).status).toBe(410);

  const {finalizeDueProjects}=await import("../src/project-deletion");
  await finalizeDueProjects(env,new Date("2026-01-01T00:00:00.000Z"));
  expect(await env.DB.prepare(`SELECT lifecycle_state FROM projects WHERE id=?`).bind(projectId).first()).toEqual({lifecycle_state:"shell"});
  expect(await env.DB.prepare(`SELECT revoked_at FROM project_machine_credentials WHERE id=?`).bind(credential.credential.id).first()).toEqual({revoked_at:"2026-01-01T00:00:00.000Z"});
  expect((await SELF.fetch(`${origin}/api/agent/me`,{headers})).status).toBe(401);
});
