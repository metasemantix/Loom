import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { DEV_PARTICIPANT_ID, DEV_USER_ID } from "../src/dev-auth";

const origin = "http://example.com";

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function participant(suffix: string): Promise<{ id: string; userId: string; cookie: string }> {
  const now = new Date().toISOString(), user = `usr_${suffix}`, id = `par_${suffix}`, token = `session-${suffix}`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)").bind(user, `User ${suffix}`, now),
    env.DB.prepare("INSERT INTO participants(id,user_id,public_slug,created_at,provenance_identifier) VALUES(?,?,?,?,?)").bind(id, user, id, now, `test-person-${suffix}`),
    env.DB.prepare("INSERT INTO sessions(id,user_id,secret_hash,expires_at,created_at) VALUES(?,?,?,?,?)").bind(`sid_${suffix}`, user, await sha256(token), new Date(Date.now() + 60_000).toISOString(), now),
  ]);
  return { id, userId: user, cookie: `loom_session=${token}` };
}

async function create(cookie: string, visibility = "private"): Promise<string> {
  const response = await SELF.fetch(`${origin}/api/me/documents`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ title: "Notes", kind: "document", visibility, content: "first", contentType: "text/markdown" }) });
  expect(response.status).toBe(201);
  return (await response.json<{ document: { id: string } }>()).document.id;
}

async function zipFiles(response: Response): Promise<Map<string, string>> {
  const bytes = new Uint8Array(await response.arrayBuffer()), view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true), extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30, dataStart = nameStart + nameLength + extraLength;
    files.set(decoder.decode(bytes.slice(nameStart, nameStart + nameLength)), decoder.decode(bytes.slice(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return files;
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM machine_read_audit; DELETE FROM project_machine_checkins; DELETE FROM project_machine_credentials; DELETE FROM account_events; DELETE FROM project_events; DELETE FROM project_invitations; DELETE FROM project_documents; DELETE FROM project_members; DELETE FROM projects; DELETE FROM sessions; DELETE FROM document_events; DELETE FROM document_versions; DELETE FROM documents; DELETE FROM participants; DELETE FROM auth_identities; DELETE FROM users;");
});

describe("local development authentication", () => {
  const local = "http://localhost:8787";
  const devEnv = () => ({ ...env, DEV_AUTH_BYPASS: "1" });
  const cookieFrom = (response: Response) => response.headers.get("set-cookie")!.split(";", 1)[0];

  it("leaves Discord authentication unchanged when bypass is disabled", async () => {
    const response = await worker.fetch(new Request(`${local}/me`), env);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${local}/login`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("creates a deterministic participant and an ordinary resolvable session", async () => {
    const login = await worker.fetch(new Request(`${local}/me`), devEnv());
    expect(login.status).toBe(302);
    const cookie = cookieFrom(login);
    expect(await env.DB.prepare("SELECT id,user_id,provenance_identifier FROM participants WHERE id=?").bind(DEV_PARTICIPANT_ID).first()).toEqual({ id: DEV_PARTICIPANT_ID, user_id: DEV_USER_ID, provenance_identifier: "local-development" });
    const me = await worker.fetch(new Request(`${local}/api/me`, { headers: { cookie } }), devEnv());
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { id: DEV_USER_ID }, participant: { id: DEV_PARTICIPANT_ID } });
  });

  it("reuses the existing development participant without duplicates", async () => {
    await worker.fetch(new Request(`${local}/me`), devEnv());
    await worker.fetch(new Request(`${local}/projects`), devEnv());
    expect((await env.DB.prepare("SELECT count(*) count FROM participants WHERE provenance_identifier='local-development'").first<{count:number}>())?.count).toBe(1);
    expect((await env.DB.prepare("SELECT count(*) count FROM users WHERE id=?").bind(DEV_USER_ID).first<{count:number}>())?.count).toBe(1);
  });

  it("fails closed on a non-local hostname even when opted in", async () => {
    const response = await worker.fetch(new Request("https://loom.example/me"), devEnv());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://loom.example/login");
    expect(await env.DB.prepare("SELECT id FROM participants WHERE id=?").bind(DEV_PARTICIPANT_ID).first()).toBeNull();
  });

  it("keeps ownership authorization active and visibly labels rendered dev mode", async () => {
    const other = await participant("other_owner"), otherDocument = await create(other.cookie);
    const login = await worker.fetch(new Request(`${local}/me`), devEnv()), cookie = cookieFrom(login);
    const denied = await worker.fetch(new Request(`${local}/api/me/documents/${otherDocument}`, { method: "DELETE", headers: { cookie, origin: local } }), devEnv());
    expect(denied.status).toBe(404);
    expect(await env.DB.prepare("SELECT id FROM documents WHERE id=?").bind(otherDocument).first()).toBeTruthy();
    const page = await worker.fetch(new Request(`${local}/me`, { headers: { cookie } }), devEnv());
    const html = await page.text();
    expect(html).toContain('<strong class="dev-auth" role="status">DEV AUTH</strong>');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
    for (const script of scripts) expect(() => new Function(script)).not.toThrow();
  });
});

describe("migration upgrade safety",()=>{
  it("preserves existing corpus state and makes existing machine credentials read-only",()=>{const result=(globalThis as typeof globalThis & {__loomMigrationRegression:{before:unknown;after:unknown;afterProjectDeletionMigration:unknown;migratedCredential:unknown;foreignKeyErrors:unknown[]}}).__loomMigrationRegression;expect(result.after).toEqual(result.before);expect(result.afterProjectDeletionMigration).toEqual(result.before);expect(result.migratedCredential).toEqual({id:"mac_migration",checkin_enabled:0});expect(result.foreignKeyErrors).toEqual([])})
});

async function invite(projectId:string, inviter:{cookie:string}, recipient:{cookie:string}) {
  const created=await SELF.fetch(`${origin}/api/projects/${projectId}/invitations`,{method:"POST",headers:{cookie:inviter.cookie,origin}});
  expect(created.status).toBe(201);const token=(await created.json<{invitation:{token:string}}>()).invitation.token;
  const accepted=await SELF.fetch(`${origin}/api/invitations/${token}`,{method:"POST",headers:{cookie:recipient.cookie,origin}});expect(accepted.status).toBe(201);
  return token;
}

describe("document metadata and uploads", () => {
  it("lets only the owner change visibility, title, and path and records a distinct event", async () => {
    const alice = await participant("alice"), bob = await participant("bob"), id = await create(alice.cookie, "private");
    const mutation = (cookie: string, body: object) => SELF.fetch(`${origin}/api/me/documents/${id}/metadata`, { method: "PUT", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await mutation(bob.cookie, { visibility: "public" })).status).toBe(404);
    expect((await SELF.fetch(`${origin}/participants/${alice.id}/context.json`).then((r) => r.json<{documents: unknown[]}>())) .documents).toHaveLength(0);
    expect((await mutation(alice.cookie, { title: "Renamed", logicalPath: "research/notes.md", visibility: "public" })).status).toBe(200);
    expect((await SELF.fetch(`${origin}/participants/${alice.id}/context.json`).then((r) => r.json<{documents: Array<{title:string;logical_path:string}>}>())).documents[0]).toMatchObject({ title: "Renamed", logical_path: "research/notes.md" });
    expect((await mutation(alice.cookie, { visibility: "private" })).status).toBe(200);
    expect((await SELF.fetch(`${origin}/participants/${alice.id}/context.json`).then((r) => r.json<{documents: unknown[]}>())).documents).toHaveLength(0);
    const history = await SELF.fetch(`${origin}/api/me/documents/${id}/versions`, { headers: { cookie: alice.cookie } }).then((r) => r.json<{events:Array<{actor_id:string;event_type:string;changes:Record<string,{previous:string;new:string}>}>;versions:unknown[]}>());
    expect(history.versions).toHaveLength(1);
    expect(history.events[1]).toMatchObject({ event_type: "metadata_changed", actor_id: alice.userId, changes: { title: { previous: "Notes", new: "Renamed" }, logicalPath: { previous: expect.any(String), new: "research/notes.md" }, visibility: { previous: "private", new: "public" } } });
    expect(history.events[0].changes.visibility).toEqual({ previous: "public", new: "private" });
  });

  it("returns content revisions and metadata events as one newest-first timeline", async () => {
    const alice = await participant("alice"), id = await create(alice.cookie);
    await SELF.fetch(`${origin}/api/me/documents/${id}/metadata`, { method: "PUT", headers: { cookie: alice.cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ visibility: "public" }) });
    await SELF.fetch(`${origin}/api/me/documents/${id}`, { method: "PUT", headers: { cookie: alice.cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ content: "second", contentType: "text/plain" }) });
    const versions = await env.DB.prepare(`SELECT id,version_number FROM document_versions WHERE document_id=? ORDER BY version_number`).bind(id).all<{id:string;version_number:number}>();
    await env.DB.batch([
      env.DB.prepare(`UPDATE document_versions SET created_at=? WHERE id=?`).bind("2026-01-01T00:00:00.000Z", versions.results[0].id),
      env.DB.prepare(`UPDATE document_events SET created_at=? WHERE document_id=?`).bind("2026-01-02T00:00:00.000Z", id),
      env.DB.prepare(`UPDATE document_versions SET created_at=? WHERE id=?`).bind("2026-01-03T00:00:00.000Z", versions.results[1].id),
    ]);
    const history = await SELF.fetch(`${origin}/api/me/documents/${id}/versions`, { headers: { cookie: alice.cookie } }).then((response) => response.json<{timeline:Array<{entry_type:string;created_at:string;version_number?:number;changes?:Record<string,{previous:string;new:string}>}>}>());
    expect(history.timeline.map((entry) => [entry.entry_type, entry.created_at])).toEqual([
      ["content_revision", "2026-01-03T00:00:00.000Z"],
      ["metadata_event", "2026-01-02T00:00:00.000Z"],
      ["content_revision", "2026-01-01T00:00:00.000Z"],
    ]);
    expect(history.timeline[1].changes?.visibility).toEqual({ previous: "private", new: "public" });
  });

  it("rejects conflicting paths and validates upload format, JSON, ownership, and size", async () => {
    const alice = await participant("alice"), bob = await participant("bob"), first = await create(alice.cookie), second = await create(alice.cookie);
    const setPath = (id:string,path:string) => SELF.fetch(`${origin}/api/me/documents/${id}/metadata`, { method:"PUT", headers:{cookie:alice.cookie,origin,"content-type":"application/json"}, body:JSON.stringify({logicalPath:path}) });
    expect((await setPath(first,"folder/item")).status).toBe(200); expect((await setPath(second,"folder/item")).status).toBe(409);
    async function upload(file: File) { const form=new FormData();form.set("file",file);return SELF.fetch(`${origin}/api/me/documents/upload`,{method:"POST",headers:{cookie:alice.cookie,origin},body:form}); }
    expect((await upload(new File(["{bad"],"bad.json",{type:"application/json"}))).status).toBe(400);
    expect((await upload(new File(["x"],"bad.html",{type:"text/html"}))).status).toBe(415);
    expect((await upload(new File([new Uint8Array(256001)],"large.txt",{type:"text/plain"}))).status).toBe(413);
    const content="# Exact\n\nunchanged";expect((await upload(new File([content],"artifact.md",{type:"text/markdown"}))).status).toBe(201);
    const mine=await SELF.fetch(`${origin}/api/me/documents`,{headers:{cookie:alice.cookie}}).then(r=>r.json<{documents:Array<{content:string;original_filename:string}>}>());
    expect(mine.documents.find(d=>d.original_filename==="artifact.md")?.content).toBe(content);
    expect((await SELF.fetch(`${origin}/api/me/documents`,{headers:{cookie:bob.cookie}}).then(r=>r.json<{documents:unknown[]}>())).documents).toHaveLength(0);
  });
});

describe("Control Room identity", () => {
  it("renames only the authenticated Loom identity while stable IDs and provenance lookup remain unchanged", async () => {
    const alice=await participant("alice"),bob=await participant("bob"),id=await create(alice.cookie);
    const before=await SELF.fetch(`${origin}/api/me/profile`,{headers:{cookie:alice.cookie}}).then(r=>r.json<{participant:{id:string;lookupId:string}}>())
    expect((await SELF.fetch(`${origin}/api/me/profile`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({displayName:"Alice Loom"})})).status).toBe(200);
    const after=await SELF.fetch(`${origin}/api/me/profile`,{headers:{cookie:alice.cookie}}).then(r=>r.json<{participant:{id:string;displayName:string;lookupId:string}}>())
    expect(after.participant).toMatchObject({id:before.participant.id,displayName:"Alice Loom",lookupId:before.participant.lookupId});
    expect((await SELF.fetch(`${origin}/participants/${alice.id}/context.json`)).json().then((j:any)=>j.participant.displayName)).resolves.toBe("Alice Loom");
    await SELF.fetch(`${origin}/api/me/profile`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({displayName:"Bob Loom"})});
    const history=await SELF.fetch(`${origin}/api/me/documents/${id}/versions`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>());expect(history.versions[0]).toMatchObject({actor_id:alice.userId,actor_display_name:"Alice Loom"});
  });
});

describe("project link corpora", () => {
  it("describes projects and exposes only the authenticated member's eligible link choices", async () => {
    const alice=await participant("alice"),bob=await participant("bob"),mine=await create(alice.cookie),theirs=await create(bob.cookie);
    const response=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Readable",description:"A concise purpose",readAudience:"members_and_agents"})});
    const projectId=(await response.json<{project:{id:string}}>()).project.id;await invite(projectId,alice,bob);
    let view=await SELF.fetch(`${origin}/api/projects/${projectId}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>());expect(view.project.description).toBe("A concise purpose");expect(view.eligibleDocuments.map((d:any)=>d.id)).toEqual([mine]);
    expect((await SELF.fetch(`${origin}/api/projects/${projectId}/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId:theirs})})).status).toBe(404);
    await SELF.fetch(`${origin}/api/projects/${projectId}/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId:mine})});
    view=await SELF.fetch(`${origin}/api/projects/${projectId}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>());expect(view.eligibleDocuments).toEqual([]);
    expect((await SELF.fetch(`${origin}/api/projects/${projectId}`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({description:"no"})})).status).toBe(403);
  });

  it("uses explicit, single-use invitations whose previews reveal no corpus", async () => {
    const alice=await participant("alice"),bob=await participant("bob"),carol=await participant("carol"),documentId=await create(alice.cookie);
    const created=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Invite me",description:"Preview purpose",readAudience:"members_and_agents"})});const id=(await created.json<any>()).project.id;
    await SELF.fetch(`${origin}/api/projects/${id}/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId})});
    expect((await SELF.fetch(`${origin}/api/projects/${id}/invitations`,{method:"POST",headers:{cookie:bob.cookie,origin}})).status).toBe(404);
    const made=await SELF.fetch(`${origin}/api/projects/${id}/invitations`,{method:"POST",headers:{cookie:alice.cookie,origin}}).then(r=>r.json<any>());const token=made.invitation.token;
    const preview=await SELF.fetch(`${origin}/api/invitations/${token}`).then(r=>r.json<any>());expect(preview.invitation).toMatchObject({projectName:"Invite me",projectDescription:"Preview purpose",active:true,memberCount:1});expect(JSON.stringify(preview)).not.toContain("first");
    expect((await env.DB.prepare(`SELECT count(*) count FROM project_members WHERE project_id=?`).bind(id).first<any>()).count).toBe(1);
    expect((await SELF.fetch(`${origin}/api/invitations/${token}`,{method:"POST",headers:{cookie:bob.cookie,origin}})).status).toBe(201);expect((await SELF.fetch(`${origin}/api/invitations/${token}`,{method:"POST",headers:{cookie:carol.cookie,origin}})).status).toBe(410);
    const declined=(await SELF.fetch(`${origin}/api/projects/${id}/invitations`,{method:"POST",headers:{cookie:alice.cookie,origin}}).then(r=>r.json<any>())).invitation.token;expect((await SELF.fetch(`${origin}/api/invitations/${declined}/decline`,{method:"POST",headers:{cookie:carol.cookie,origin}})).status).toBe(204);expect((await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:carol.cookie}})).status).toBe(404);
    const revoked=await SELF.fetch(`${origin}/api/projects/${id}/invitations`,{method:"POST",headers:{cookie:alice.cookie,origin}}).then(r=>r.json<any>());await SELF.fetch(`${origin}/api/projects/${id}/invitations/${revoked.invitation.id}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}});expect((await SELF.fetch(`${origin}/api/invitations/${revoked.invitation.token}`,{method:"POST",headers:{cookie:carol.cookie,origin}})).status).toBe(410);
    const expired=await SELF.fetch(`${origin}/api/projects/${id}/invitations`,{method:"POST",headers:{cookie:alice.cookie,origin}}).then(r=>r.json<any>());await env.DB.prepare(`UPDATE project_invitations SET expires_at=? WHERE id=?`).bind("2000-01-01T00:00:00.000Z",expired.invitation.id).run();expect((await SELF.fetch(`${origin}/api/invitations/${expired.invitation.token}`,{method:"POST",headers:{cookie:carol.cookie,origin}})).status).toBe(410);
  });

  it("enforces admin boundaries, transfers ownership, and cleans links on departure", async () => {
    const alice=await participant("alice"),bob=await participant("bob"),carol=await participant("carol"),bobDoc=await create(bob.cookie);const made=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Roles",readAudience:"members_and_agents"})}).then(r=>r.json<any>());const id=made.project.id;await invite(id,alice,bob);await invite(id,alice,carol);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/members/${bob.id}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({role:"admin"})})).status).toBe(200);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/members/${alice.id}`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({role:"member"})})).status).toBe(403);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/members/${alice.id}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})).status).toBe(409);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/ownership`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({participantId:bob.id,confirm:true})})).status).toBe(200);
    const roles=await env.DB.prepare(`SELECT participant_id,role FROM project_members WHERE project_id=? ORDER BY participant_id`).bind(id).all<any>();expect(roles.results).toContainEqual({participant_id:alice.id,role:"admin"});expect(roles.results.filter((m:any)=>m.role==="owner")).toEqual([{participant_id:bob.id,role:"owner"}]);
    await SELF.fetch(`${origin}/api/projects/${id}/documents`,{method:"POST",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId:bobDoc})});
    expect((await SELF.fetch(`${origin}/api/projects/${id}/members/${alice.id}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})).status).toBe(204);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/members/${carol.id}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(204);expect(await env.DB.prepare(`SELECT id FROM documents WHERE id=?`).bind(bobDoc).first()).toBeTruthy();
  });
  it("supports membership and policy reads without transferring document authority", async () => {
    const alice=await participant("alice"),bob=await participant("bob"),documentId=await create(alice.cookie,"private");
    const created=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Shared",readAudience:"members_and_agents"})});expect(created.status).toBe(201);const projectId=(await created.json<{project:{id:string}}>()).project.id;
    await invite(projectId,alice,bob);
    expect((await SELF.fetch(`${origin}/api/projects/${projectId}/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId})})).status).toBe(201);
    const added=await env.DB.prepare(`SELECT actor_participant_id,details_json,created_at FROM project_events WHERE project_id=? AND event_type='contribution_added'`).bind(projectId).first<any>();expect(added.actor_participant_id).toBe(alice.id);expect(JSON.parse(added.details_json)).toEqual({documentId,sourceOwnerParticipantId:alice.id,contributedByParticipantId:alice.id});expect(added.created_at).toBeTruthy();
    const view=await SELF.fetch(`${origin}/api/projects/${projectId}`,{headers:{cookie:bob.cookie}}).then(r=>r.json<{documents:Array<{id:string;owner_participant_id:string}>}>());expect(view.documents[0]).toMatchObject({id:documentId,owner_participant_id:alice.id});
    expect(JSON.stringify(view)).not.toContain("first");
    expect((await SELF.fetch(`${origin}/api/documents/${documentId}?project=${projectId}`,{headers:{cookie:bob.cookie}})).status).toBe(200);
    const outsider=await participant("outsider");
    expect((await SELF.fetch(`${origin}/api/documents/${documentId}?project=${projectId}`,{headers:{cookie:outsider.cookie}})).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/me/documents/${documentId}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/me/documents/${documentId}`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({content:"steal",contentType:"text/plain"})})).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/projects/${projectId}/documents/${documentId}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})).status).toBe(204);
    expect((await SELF.fetch(`${origin}/api/me/documents`,{headers:{cookie:alice.cookie}}).then(r=>r.json<{documents:unknown[]}>())).documents).toHaveLength(1);
    expect((await SELF.fetch(`${origin}/api/projects/${projectId}/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId})})).status).toBe(201);expect((await SELF.fetch(`${origin}/api/documents/${documentId}?project=${projectId}`,{headers:{cookie:bob.cookie}})).status).toBe(200);const restoration=await env.DB.prepare(`SELECT actor_participant_id,details_json FROM project_events WHERE project_id=? AND event_type='contribution_reauthorized' ORDER BY created_at DESC LIMIT 1`).bind(projectId).first<any>();expect(restoration.actor_participant_id).toBe(alice.id);expect(JSON.parse(restoration.details_json)).toMatchObject({documentId,ownerParticipantId:alice.id});expect((await env.DB.prepare(`SELECT count(*) count FROM project_documents WHERE project_id=? AND document_id=?`).bind(projectId,documentId).first<any>()).count).toBe(1);const lifecycleEvents=await env.DB.prepare(`SELECT event_type FROM project_events WHERE project_id=? AND event_type LIKE 'contribution_%' ORDER BY created_at,id`).bind(projectId).all<any>();expect(lifecycleEvents.results.map((event:any)=>event.event_type).sort()).toEqual(["contribution_added","contribution_reauthorized","contribution_retracted"].sort());
    await SELF.fetch(`${origin}/api/projects/${projectId}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({readAudience:"agents_only"})});
    const hidden=await SELF.fetch(`${origin}/api/projects/${projectId}`,{headers:{cookie:bob.cookie}}).then(r=>r.json<any>());expect(hidden.documentsHiddenFromHumans).toBe(true);expect(hidden.documents[0]).toMatchObject({id:documentId,state:"active",version_number:null});
    expect((await SELF.fetch(`${origin}/api/documents/${documentId}?project=${projectId}`,{headers:{cookie:bob.cookie}})).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/documents/${documentId}`,{headers:{cookie:alice.cookie}})).status).toBe(200);
    await SELF.fetch(`${origin}/api/me/documents/${documentId}/metadata`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Title at deletion",logicalPath:"private/should-not-survive",visibility:"public"})});
    expect((await SELF.fetch(`${origin}/api/me/documents/${documentId}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})).status).toBe(204);
    expect((await env.DB.prepare(`SELECT count(*) count FROM project_documents WHERE document_id=?`).bind(documentId).first<{count:number}>())!.count).toBe(1);expect(await env.DB.prepare(`SELECT id FROM documents WHERE id=?`).bind(documentId).first()).toBeNull();expect((await env.DB.prepare(`SELECT count(*) count FROM document_versions WHERE document_id=?`).bind(documentId).first<any>()).count).toBe(0);
    const tombstone=await SELF.fetch(`${origin}/api/projects/${projectId}`,{headers:{cookie:bob.cookie}}).then(r=>r.json<any>());expect(tombstone.documents[0]).toMatchObject({id:documentId,title:"Title at deletion",state:"retracted",logical_path:null,visibility:null,owner_participant_id:alice.id,version_number:null,updated_at:null});expect(JSON.stringify(tombstone)).not.toContain("private/should-not-survive");expect(JSON.stringify(tombstone)).not.toContain("first");
    expect((await SELF.fetch(`${origin}/api/documents/${documentId}?project=${projectId}`,{headers:{cookie:bob.cookie}})).status).toBe(404);expect((await SELF.fetch(`${origin}/api/documents/${documentId}`,{headers:{cookie:alice.cookie}})).status).toBe(404);expect((await SELF.fetch(`${origin}/api/me/documents/${documentId}/metadata`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Cannot return"})})).status).toBe(404);
    const ownerContributions=await SELF.fetch(`${origin}/api/me/contributions`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>());expect(ownerContributions.contributions[0]).toMatchObject({document_id:documentId,title:"Title at deletion",state:"retracted"});const deletionEvent=await env.DB.prepare(`SELECT details_json FROM project_events WHERE project_id=? AND event_type='contribution_retracted' ORDER BY created_at DESC LIMIT 1`).bind(projectId).first<any>();expect(JSON.parse(deletionEvent.details_json)).toEqual({documentId});expect(deletionEvent.details_json).not.toContain("delet");
  });

  it("revokes only a removed member's project links without deleting source documents", async () => {
    const alice=await participant("alice"),bob=await participant("bob"),carol=await participant("carol"),bobDocument=await create(bob.cookie,"private"),carolDocument=await create(carol.cookie,"private");
    const created=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Shared",readAudience:"members_and_agents"})});
    const projectId=(await created.json<{project:{id:string}}>()).project.id;
    for(const member of [bob,carol]) await invite(projectId,alice,member);
    for(const [member,documentId] of [[bob,bobDocument],[carol,carolDocument]] as const) expect((await SELF.fetch(`${origin}/api/projects/${projectId}/documents`,{method:"POST",headers:{cookie:member.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId})})).status).toBe(201);

    expect((await SELF.fetch(`${origin}/api/projects/${projectId}/members/${bob.id}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})).status).toBe(204);
    expect((await env.DB.prepare(`SELECT owner_id FROM documents WHERE id=?`).bind(bobDocument).first<{owner_id:string}>())?.owner_id).toBe(bob.id);
    const links=await env.DB.prepare(`SELECT document_id,state FROM project_documents WHERE project_id=? ORDER BY document_id`).bind(projectId).all<{document_id:string;state:string}>();
    expect(links.results).toContainEqual({document_id:bobDocument,state:"suspended_after_removal"});
    const view=await SELF.fetch(`${origin}/api/projects/${projectId}`,{headers:{cookie:alice.cookie}}).then((response)=>response.json<{documents:Array<{id:string}>}>());
    expect(view.documents.map((document)=>document.id).sort()).toEqual([bobDocument,carolDocument].sort());
    expect((await SELF.fetch(`${origin}/api/me/documents`,{headers:{cookie:bob.cookie}}).then((response)=>response.json<{documents:Array<{id:string}>}>())).documents.map((document)=>document.id)).toContain(bobDocument);
  });

  it("never leaves an active dangling contribution when linking races source deletion", async () => {
    const alice=await participant("alice"),documentId=await create(alice.cookie,"private"),created=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Commit boundary",readAudience:"members_and_agents"})}).then(r=>r.json<any>()),projectId=created.project.id;
    const [link,deleted]=await Promise.all([SELF.fetch(`${origin}/api/projects/${projectId}/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId})}),SELF.fetch(`${origin}/api/me/documents/${documentId}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})]);expect([201,404]).toContain(link.status);expect(deleted.status).toBe(204);
    const final=await env.DB.prepare(`SELECT pd.document_id,pd.state,pd.tombstone_title,d.id source_id FROM project_documents pd LEFT JOIN documents d ON d.id=pd.document_id WHERE pd.project_id=? AND pd.document_id=?`).bind(projectId,documentId).first<any>();if(link.status===201){expect(final).toMatchObject({document_id:documentId,state:"retracted",source_id:null,tombstone_title:"Notes"})}else expect(final).toBeNull();
    expect((await env.DB.prepare(`SELECT count(*) count FROM project_documents pd LEFT JOIN documents d ON d.id=pd.document_id WHERE pd.state='active' AND d.id IS NULL`).first<any>()).count).toBe(0);expect((await SELF.fetch(`${origin}/api/documents/${documentId}?project=${projectId}`,{headers:{cookie:alice.cookie}})).status).toBe(404);
  });

  it("enforces the live-source invariant at the database boundary", async () => {
    const alice=await participant("alice"),created=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Structural guard",readAudience:"members_and_agents"})}).then(r=>r.json<any>()),projectId=created.project.id;
    await expect(env.DB.prepare(`INSERT INTO project_documents(project_id,document_id,source_owner_participant_id,added_by_participant_id,added_at,state) VALUES(?,?,?,?,?,'active')`).bind(projectId,"doc_missing",alice.id,alice.id,new Date().toISOString()).run()).rejects.toThrow("active contribution requires a live owned source");
  });

  it("enforces archive and voluntary-leave contribution lifecycles", async () => {
    const alice=await participant("alice"),bob=await participant("bob"),doc=await create(bob.cookie,"private");
    const made=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Lifecycle",readAudience:"members_and_agents"})}).then(r=>r.json<any>()),id=made.project.id;
    await invite(id,alice,bob);await SELF.fetch(`${origin}/api/projects/${id}/documents`,{method:"POST",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId:doc})});
    const pending=await SELF.fetch(`${origin}/api/projects/${id}/invitations`,{method:"POST",headers:{cookie:alice.cookie,origin}}).then(r=>r.json<any>());
    expect((await SELF.fetch(`${origin}/api/projects/${id}/archive`,{method:"POST",headers:{cookie:bob.cookie,origin}})).status).toBe(403);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/archive`,{method:"POST",headers:{cookie:alice.cookie,origin}})).status).toBe(200);
    expect((await SELF.fetch(`${origin}/api/invitations/${pending.invitation.token}`,{method:"POST",headers:{cookie:bob.cookie,origin}})).status).toBe(410);
    expect((await SELF.fetch(`${origin}/api/projects/${id}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({description:"blocked"})})).status).toBe(409);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/members/${bob.id}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({role:"admin"})})).status).toBe(409);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/ownership`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({participantId:bob.id,confirm:true})})).status).toBe(409);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/members/${bob.id}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})).status).toBe(409);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/documents`,{method:"POST",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId:doc})})).status).toBe(409);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/members/${bob.id}`,{method:"DELETE",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({withdrawContributions:false})})).status).toBe(204);
    expect((await env.DB.prepare(`SELECT state FROM project_documents WHERE project_id=? AND document_id=?`).bind(id,doc).first<any>()).state).toBe("active");
    expect((await SELF.fetch(`${origin}/api/projects/${id}/documents/${doc}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(204);
    expect((await env.DB.prepare(`SELECT state FROM project_documents WHERE project_id=? AND document_id=?`).bind(id,doc).first<any>()).state).toBe("retracted");
    expect((await SELF.fetch(`${origin}/api/projects/${id}/unarchive`,{method:"POST",headers:{cookie:alice.cookie,origin}})).status).toBe(200);
  });

  it("uses live metadata only while a contribution is active and freezes tombstones", async () => {
    const alice=await participant("alice"),bob=await participant("bob"),doc=await create(bob.cookie,"private");
    const made=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Metadata",readAudience:"members_and_agents"})}).then(r=>r.json<any>()),id=made.project.id;await invite(id,alice,bob);
    await SELF.fetch(`${origin}/api/projects/${id}/documents`,{method:"POST",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId:doc})});
    await SELF.fetch(`${origin}/api/me/documents/${doc}/metadata`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Current project title"})});
    let contribution=(await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>())).documents[0];
    expect(contribution).toMatchObject({id:doc,title:"Current project title",state:"active"});expect(contribution.logical_path).toBeTruthy();expect(contribution.visibility).toBe("private");
    await SELF.fetch(`${origin}/api/projects/${id}/members/${bob.id}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}});
    contribution=(await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>())).documents[0];
    expect(contribution).toMatchObject({id:doc,title:"Current project title",state:"suspended_after_removal",logical_path:null,visibility:null});
    await SELF.fetch(`${origin}/api/me/documents/${doc}/metadata`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Private later title",logicalPath:"private/later",visibility:"public"})});
    contribution=(await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>())).documents[0];
    expect(contribution).toMatchObject({id:doc,title:"Current project title",state:"suspended_after_removal",logical_path:null,visibility:null});
    expect((await SELF.fetch(`${origin}/api/me/contributions/${id}/${doc}/reauthorize`,{method:"POST",headers:{cookie:alice.cookie,origin}})).status).toBe(404);
    const restored=await SELF.fetch(`${origin}/api/me/contributions/${id}/${doc}/reauthorize`,{method:"POST",headers:{cookie:bob.cookie,origin}});expect(restored.status).toBe(200);expect(await restored.json<any>()).toMatchObject({contribution:{projectId:id,documentId:doc,state:"active"}});
    expect((await env.DB.prepare(`SELECT count(*) count FROM project_members WHERE project_id=? AND participant_id=?`).bind(id,bob.id).first<any>()).count).toBe(0);
    expect((await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:bob.cookie}})).status).toBe(404);expect((await SELF.fetch(`${origin}/api/documents/${doc}?project=${id}`,{headers:{cookie:alice.cookie}})).status).toBe(200);
    contribution=(await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>())).documents[0];expect(contribution).toMatchObject({id:doc,title:"Private later title",state:"active"});
    await SELF.fetch(`${origin}/api/me/documents/${doc}/metadata`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Second suspension title"})});await invite(id,alice,bob);await SELF.fetch(`${origin}/api/projects/${id}/members/${bob.id}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}});
    contribution=(await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>())).documents[0];expect(contribution).toMatchObject({id:doc,title:"Second suspension title",state:"suspended_after_removal"});expect((await SELF.fetch(`${origin}/api/documents/${doc}?project=${id}`,{headers:{cookie:alice.cookie}})).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/me/contributions/${id}/${doc}/reauthorize`,{method:"POST",headers:{cookie:bob.cookie,origin}})).status).toBe(200);await SELF.fetch(`${origin}/api/me/documents/${doc}/metadata`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Retraction title"})});expect((await SELF.fetch(`${origin}/api/projects/${id}/documents/${doc}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(204);
    contribution=(await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>())).documents[0];expect(contribution).toMatchObject({id:doc,title:"Retraction title",state:"retracted"});expect((await SELF.fetch(`${origin}/api/documents/${doc}?project=${id}`,{headers:{cookie:alice.cookie}})).status).toBe(404);
    const events=await env.DB.prepare(`SELECT event_type,actor_participant_id,details_json,created_at FROM project_events WHERE project_id=? AND event_type IN ('contribution_reauthorized','contribution_suspended','contribution_retracted') ORDER BY created_at,id`).bind(id).all<any>();expect(events.results.filter((x:any)=>x.event_type==="contribution_reauthorized")).toHaveLength(2);for(const event of events.results.filter((x:any)=>x.event_type==="contribution_reauthorized")){expect(event.actor_participant_id).toBe(bob.id);expect(JSON.parse(event.details_json)).toMatchObject({documentId:doc,ownerParticipantId:bob.id});expect(event.created_at).toBeTruthy()}
    const activity=await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>());expect(activity.events.map((event:any)=>event.event_type)).toEqual(expect.arrayContaining(["member_removed","contribution_suspended","contribution_reauthorized","contribution_retracted"]));expect(activity.events.some((event:any)=>event.document_title==="Retraction title")).toBe(true);const addedActivity=activity.events.find((event:any)=>event.event_type==="contribution_added");expect(addedActivity).toMatchObject({document_id:doc});expect(JSON.stringify(activity.events)).not.toContain("first");expect(JSON.stringify(activity.events)).not.toContain("private/later");expect(activity.events.every((event:any)=>!("details_json" in event))).toBe(true);
  });

  it("makes stale lifecycle transitions conflict without false events", async () => {
    const alice=await participant("alice");const made=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Race",readAudience:"members_and_agents"})}).then(r=>r.json<any>()),id=made.project.id;
    const options={method:"POST",headers:{cookie:alice.cookie,origin}};const statuses=(await Promise.all([SELF.fetch(`${origin}/api/projects/${id}/archive`,options),SELF.fetch(`${origin}/api/projects/${id}/archive`,options)])).map(r=>r.status).sort();expect(statuses).toEqual([200,409]);
    expect((await env.DB.prepare(`SELECT count(*) count FROM project_events WHERE project_id=? AND event_type='project_archived'`).bind(id).first<any>()).count).toBe(1);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/invitations`,{method:"POST",headers:{cookie:alice.cookie,origin}})).status).toBe(409);
  });
});

describe("participant ownership", () => {
  it("does not let one participant read, edit, delete, or inspect another participant's document", async () => {
    const alice = await participant("alice"), bob = await participant("bob"), documentId = await create(alice.cookie);
    const list = await SELF.fetch(`${origin}/api/me/documents`, { headers: { cookie: bob.cookie } });
    expect((await list.json<{ documents: unknown[] }>()).documents).toEqual([]);
    const options: RequestInit = { method: "PUT", headers: { cookie: bob.cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ content: "stolen", contentType: "text/plain" }) };
    expect((await SELF.fetch(`${origin}/api/me/documents/${documentId}`, options)).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/me/documents/${documentId}/versions`, { headers: { cookie: bob.cookie } })).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/me/documents/${documentId}`, { method: "DELETE", headers: { cookie: bob.cookie, origin } })).status).toBe(404);
  });

  it("creates immutable revisions for owner edits and erases all history on delete", async () => {
    const alice = await participant("alice"), documentId = await create(alice.cookie);
    const update = await SELF.fetch(`${origin}/api/me/documents/${documentId}`, { method: "PUT", headers: { cookie: alice.cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ content: "second", contentType: "text/plain" }) });
    expect(update.status).toBe(200);
    const versions = await SELF.fetch(`${origin}/api/me/documents/${documentId}/versions`, { headers: { cookie: alice.cookie } });
    expect((await versions.json<{ versions: Array<{ version_number: number; content: string }> }>()).versions.map((v) => [v.version_number, v.content])).toEqual([[2, "second"], [1, "first"]]);
    expect((await SELF.fetch(`${origin}/api/me/documents/${documentId}`, { method: "DELETE", headers: { cookie: alice.cookie, origin } })).status).toBe(204);
    expect((await env.DB.prepare("SELECT count(*) count FROM document_versions WHERE document_id=?").bind(documentId).first<{ count: number }>())!.count).toBe(0);
  });

  it("reports each revision's stored actor and resolves only human display names", async () => {
    const alice = await participant("alice"), bob = await participant("bob"), documentId = await create(alice.cookie);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES(?,?,2,?,'text/plain','human',?,?)").bind("ver_bob", documentId, "human edit", bob.userId, now),
      env.DB.prepare("INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES(?,?,3,?,'text/plain','agent',?,?)").bind("ver_agent", documentId, "agent edit", "agent_42", now),
      env.DB.prepare("INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES(?,?,4,?,'text/plain','system',NULL,?)").bind("ver_system", documentId, "system edit", now),
      env.DB.prepare("INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES(?,?,5,?,'text/plain','human',?,?)").bind("ver_unknown", documentId, "unknown edit", "usr_missing", now),
    ]);

    const response = await SELF.fetch(`${origin}/api/me/documents/${documentId}/versions`, { headers: { cookie: alice.cookie } });
    expect(response.status).toBe(200);
    const versions = await response.json<{ versions: Array<{ actor_type: string; actor_id: string | null; actor_display_name: string | null }> }>();
    expect(versions.versions.map(({ actor_type, actor_id, actor_display_name }) => ({ actor_type, actor_id, actor_display_name }))).toEqual([
      { actor_type: "human", actor_id: "usr_missing", actor_display_name: "Unknown person" },
      { actor_type: "system", actor_id: null, actor_display_name: null },
      { actor_type: "agent", actor_id: "agent_42", actor_display_name: null },
      { actor_type: "human", actor_id: bob.userId, actor_display_name: "User bob" },
      { actor_type: "human", actor_id: alice.userId, actor_display_name: "User alice" },
    ]);
  });
});

describe("authorization and stable reads", () => {
  it("requires a session and a same-origin mutation", async () => {
    expect((await SELF.fetch(`${origin}/api/me/documents`)).status).toBe(401);
    const alice = await participant("alice");
    expect((await SELF.fetch(`${origin}/api/me/documents`, { method: "POST", headers: { cookie: alice.cookie, "content-type": "application/json" }, body: "{}" })).status).toBe(403);
  });

  it("projects only public documents to anonymous Markdown and JSON reads", async () => {
    const alice = await participant("alice");
    await create(alice.cookie, "private");
    await create(alice.cookie, "public");
    const anonymous = await SELF.fetch(`${origin}/participants/${alice.id}/context.json`);
    expect(anonymous.status).toBe(200);
    expect((await anonymous.json<{ documents: Array<{ visibility: string }> }>()).documents.map((d) => d.visibility)).toEqual(["public"]);
    const owner = await SELF.fetch(`${origin}/participants/${alice.id}/context.json`, { headers: { cookie: alice.cookie } });
    expect((await owner.json<{ documents: unknown[] }>()).documents).toHaveLength(2);
    const markdown = await SELF.fetch(`${origin}/participants/${alice.id}/context.md`);
    expect(markdown.headers.get("content-type")).toContain("text/markdown");
    expect(await markdown.text()).toContain("Document: doc_");
  });
});

describe("portable participant export", () => {
  it("exports private documents and complete revision history only for the signed-in owner", async () => {
    const alice = await participant("alice"), bob = await participant("bob");
    const aliceDocument = await create(alice.cookie, "private");
    const bobDocument = await create(bob.cookie, "public");
    await SELF.fetch(`${origin}/api/me/documents/${aliceDocument}`, { method: "PUT", headers: { cookie: alice.cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ content: "second revision", contentType: "text/plain" }) });

    const response = await SELF.fetch(`${origin}/api/me/export`, { headers: { cookie: alice.cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="loom-space-${alice.id}.zip"`);
    const files = await zipFiles(response);
    const manifestText = files.get("manifest.json")!;
    const manifest = JSON.parse(manifestText) as { participant: { id: string; displayName: string }; documents: Array<{ id: string; visibility: string; currentVersion: { number: number }; revisions: Array<{ versionNumber: number; content: string; actor: { type: string; id: string } }> }> };
    expect(manifest.participant).toEqual({ id: alice.id, displayName: "User alice" });
    expect(manifest.documents).toHaveLength(1);
    expect(manifest.documents[0].id).toBe(aliceDocument);
    expect(manifest.documents[0].visibility).toBe("private");
    expect(manifest.documents[0].currentVersion.number).toBe(2);
    expect(manifest.documents[0].revisions.map((revision) => [revision.versionNumber, revision.content, revision.actor.type, revision.actor.id])).toEqual([
      [1, "first", "human", alice.userId],
      [2, "second revision", "human", alice.userId],
    ]);
    expect(files.get(`documents/${aliceDocument}/current.txt`)).toBe("second revision");
    expect(files.get(`documents/${aliceDocument}/revisions/000001.md`)).toBe("first");
    expect([...files.keys()].join("\n")).not.toContain(bobDocument);
    expect(manifestText).not.toContain("User bob");
  });

  it("requires authentication and never serializes session or OAuth secrets", async () => {
    expect((await SELF.fetch(`${origin}/api/me/export`)).status).toBe(401);
    const alice = await participant("alice");
    await create(alice.cookie);
    await env.DB.prepare("INSERT INTO oauth_states(state_hash,expires_at) VALUES(?,?)").bind("oauth-state-secret", new Date(Date.now() + 60_000).toISOString()).run();
    const response = await SELF.fetch(`${origin}/api/me/export`, { headers: { cookie: alice.cookie } });
    const archiveText = new TextDecoder().decode(await response.arrayBuffer());
    expect(archiveText).not.toContain("session-alice");
    expect(archiveText).not.toContain(await sha256("session-alice"));
    expect(archiveText).not.toContain("oauth-state-secret");
  });
});

describe("browser UI", () => {
  it("emits syntactically valid browser JavaScript for every scripted page", async () => {
    const alice=await participant("alice");
    const id=await create(alice.cookie);for(const path of ["/me","/projects","/control-room",`/documents/${id}`,"/invitations/inv_example"]){const html=await SELF.fetch(origin+path,{headers:{cookie:alice.cookie}}).then(r=>r.text());const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);expect(scripts.length).toBeGreaterThan(0);for(const script of scripts)expect(()=>new Function(script)).not.toThrow()}
  });
  it("uses collapsed collection forms and keeps administration on document detail", async () => {
    const alice = await participant("alice");
    const id = await create(alice.cookie);
    const response = await SELF.fetch(`${origin}/me`, { headers: { cookie: alice.cookie } });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("Add document…");expect(html).toContain('id="add-panel" class="panel" hidden');
    expect(html).not.toContain("d.content");expect(html).not.toContain('href="/api/me/export"');
    const detail=await SELF.fetch(`${origin}/documents/${id}`,{headers:{cookie:alice.cookie}}).then(r=>r.text());
    expect(detail).toContain("Edit content");expect(detail).toContain("Revision history");expect(detail).toContain("This cannot be undone.");expect(detail).toContain("method:'DELETE'");
    expect(detail).toContain("function revisionAuthor");
    expect(detail).toContain("x.actor_display_name||'Unknown person'");
    expect(detail).toContain("x.actor_id?'Agent '+x.actor_id:'Agent'");
    expect(detail).toContain("return 'System'");
    expect(detail).toContain("'By '+revisionAuthor(x)+' · '");
    expect(detail).toContain("field+': '+change.previous+' → '+change.new");
  });

  it("preserves compact project administration and an intact picker during link confirmation", async () => {
    const alice=await participant("alice"),html=await SELF.fetch(`${origin}/projects`,{headers:{cookie:alice.cookie}}).then(r=>r.text());
    expect(html).toContain("Archive project");
    expect(html).toContain("else if(j.canUnarchive)");expect(html).toContain("cannot be unarchived while its owner has account deletion pending");expect(html).toContain("Recover ownership and unarchive");expect(html).toContain("j.recoveryRequired?'/recover':'/unarchive'");
    expect(html).toContain("p.status==='active'&&p.role==='owner'");
    expect(html).toContain("j.canAdminister&&p.status==='active'");
    expect(html).toContain("Their contributed content will become unavailable, while contribution history remains.");
    expect(html).toContain("{description:area.value}");
    expect(html).toContain("Save description");
    expect(html).toContain("button('Cancel',()=>descriptionPanel.replaceChildren())");
    expect(html).toContain("d.append(el('h3','Project administration'))");
    expect(html).toContain("d.append(descriptionPanel)");
    expect(html).not.toContain("d.append(el('h3','Project details'),el('p',p.description");
    expect(html).toContain("const linkConfirm=el('div');lf.className='panel';lf.append(");
    expect(html).toContain("ask(linkConfirm,'Explicitly grant");
    expect(html).not.toContain("ask(lf,'Explicitly grant");
    expect(html).toContain("Add to project");expect(html).toContain("Show details");expect(html).toContain("Hide details");
    expect(html).toContain("document.createElement('details')");expect(html).toContain("Write new");expect(html).toContain("Copy from My Space");expect(html).toContain("native-documents/upload");
    expect(html).not.toContain("np.name='logicalPath'");
    expect(html).toContain("Restore contribution");expect(html).toContain("x.project_status==='active'");expect(html).toContain("/reauthorize");expect(html).toContain("x.document_id");
    expect(html).toContain("Are you sure you want to leave this project?");expect(html).toContain("withdrawContributions:check.checked");expect(html).toContain("check.type='checkbox'");expect(html).not.toContain("check.checked=true");
  });

  it("mounts and submits the Unarchive confirmation for an archived project", async () => {
    class BrowserElement {
      children: BrowserElement[] = [];
      textContent = "";
      className = "";
      type = "";
      role = "";
      hidden = false;
      onclick?: () => unknown;
      onsubmit?: (event: { preventDefault(): void }) => unknown;
      parent?: BrowserElement;
      append(...nodes: Array<BrowserElement | string>) { for (const node of nodes) if (node instanceof BrowserElement) { node.parent = this; this.children.push(node); } }
      prepend(node: BrowserElement) { node.parent = this; this.children.unshift(node); }
      replaceChildren(...nodes: BrowserElement[]) { this.children = []; this.append(...nodes); }
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
      focus() {}
      setAttribute() {}
      querySelector(selector: string): BrowserElement | null { return this.querySelectorAll(selector)[0] ?? null; }
      querySelectorAll(selector: string): BrowserElement[] {
        const matches = (node: BrowserElement) => selector === "button" ? node.type === "button" : selector === "section" ? node.tag === "section" : selector === ".notice" ? node.className.split(" ").includes("notice") : false;
        const found: BrowserElement[] = [];
        const visit = (node: BrowserElement) => { for (const child of node.children) { if (matches(child)) found.push(child); visit(child); } };
        visit(this); return found;
      }
      constructor(readonly tag: string) {}
    }
    const alice = await participant("alice");
    const html = await SELF.fetch(`${origin}/projects`, { headers: { cookie: alice.cookie } }).then((response) => response.text());
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
    const helpers = script.slice(script.indexOf("function el"), script.indexOf("function toggle"));
    const projectProgram = script.slice(script.indexOf("function memberRow"), script.indexOf("newForm.onsubmit"));
    const browserProgram = helpers + projectProgram + ";return {openProject};";
    const document = { createElement: (tag: string) => new BrowserElement(tag) };
    const requests: Array<{ url: string; method?: string }> = [];
    const project = { id: "archived-project", name: "Finished work", description: "Kept in the collapsed overview", status: "archived", readAudience: "members_and_agents", role: "owner" };
    const fetch = async (url: string, options: { method?: string } = {}) => {
      requests.push({ url, method: options.method });
      if (url === "/api/projects/archived-project/unarchive") return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ project, canAdminister: true, canUnarchive: true, members: [], documents: [], events: [], documentsHiddenFromHumans: false }) };
    };
    const { openProject } = new Function("document", "fetch", "URL", "location", "navigator", browserProgram)(document, fetch, URL, { origin }, {});
    const card = new BrowserElement("article"), toggle = new BrowserElement("button"); toggle.textContent = "Show details"; card.append(toggle);
    await openProject(project.id, card, toggle);
    expect(toggle.textContent).toBe("Hide details");
    expect(card.querySelectorAll("section")).toHaveLength(1);
    const unarchive = card.querySelectorAll("button").find((button) => button.textContent === "Unarchive project");
    expect(unarchive).toBeTruthy();
    await unarchive!.onclick!();
    const confirmation = card.querySelectorAll("button").find((button) => button.textContent === "Continue");
    expect(confirmation).toBeTruthy();
    await confirmation!.onclick!();
    expect(requests).toContainEqual({ url: "/api/projects/archived-project/unarchive", method: "POST" });
    await openProject(project.id, card, toggle);
    expect(toggle.textContent).toBe("Show details"); expect(card.querySelectorAll("section")).toHaveLength(0);
    await openProject(project.id, card, toggle);
    expect(toggle.textContent).toBe("Hide details"); expect(card.querySelectorAll("section")).toHaveLength(1);
  });

  it("inserts project and Control Room values with text-only DOM APIs", async () => {
    const alice = await participant("alice"), dangerous = `<img src=x onerror="alert('xss')">`;
    await SELF.fetch(`${origin}/api/me/profile`, { method: "PUT", headers: { cookie: alice.cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ displayName: dangerous }) });
    const created = await SELF.fetch(`${origin}/api/projects`, { method: "POST", headers: { cookie: alice.cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ name: dangerous, readAudience: "members_and_agents" }) });
    expect((await created.json<{project:{name:string}}>()).project.name).toBe(dangerous);
    const projectsHtml = await SELF.fetch(`${origin}/projects`, { headers: { cookie: alice.cookie } }).then((response) => response.text());
    const controlRoomHtml = await SELF.fetch(`${origin}/control-room`, { headers: { cookie: alice.cookie } }).then((response) => response.text());
    expect(projectsHtml).not.toContain("innerHTML");
    expect(controlRoomHtml).not.toContain("innerHTML");
    expect(projectsHtml).toContain("n.textContent=text");
    expect(controlRoomHtml).toContain("v.textContent=value");
    expect(projectsHtml).not.toContain(dangerous);
    expect(controlRoomHtml).not.toContain(dangerous);
    expect(controlRoomHtml).toContain('href="/api/me/export"');
    expect(projectsHtml).toContain("Add project…");
    for(const path of ["/me","/projects","/control-room","/invitations/inv_example"]){const html=await SELF.fetch(origin+path,{headers:{cookie:alice.cookie}}).then(r=>r.text()),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).join("\n");expect(scripts).not.toContain("innerHTML");for(const popup of ["prompt(","confirm(","alert("])expect(scripts).not.toContain(popup)}
  });

  it("redirects a 127.0.0.1 OAuth start to the configured canonical localhost origin", async () => {
    const response = await SELF.fetch("http://127.0.0.1:8787/auth/discord", { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:8787/auth/discord");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("scheduled account lifecycle", () => {
  it("blocks unresolved ownership, requires exact confirmation, freezes immediately, and cancels intact", async () => {
    const alice=await participant("alice"),bob=await participant("graceadmin"),documentId=await create(alice.cookie), publicDocumentId=await create(alice.cookie,"public");
    const made=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Needs a decision",readAudience:"members_and_agents"})}).then(r=>r.json<any>());
    const schedule=(name:string)=>SELF.fetch(`${origin}/api/me/account-deletion`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({displayName:name})});
    expect((await schedule("wrong")).status).toBe(400);
    const blocked=await schedule("User alice");expect(blocked.status).toBe(409);expect((await blocked.json<any>()).unresolvedOwnedProjects).toEqual([expect.objectContaining({id:made.project.id,name:"Needs a decision"})]);
    expect((await env.DB.prepare(`SELECT count(*) count FROM project_members WHERE project_id=? AND role='owner'`).bind(made.project.id).first<any>()).count).toBe(1);
    await invite(made.project.id,alice,bob);await SELF.fetch(`${origin}/api/projects/${made.project.id}/members/${bob.id}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({role:"admin"})});
    await SELF.fetch(`${origin}/api/projects/${made.project.id}/archive`,{method:"POST",headers:{cookie:alice.cookie,origin}});
    const before=Date.now(),scheduled=await schedule("User alice"),after=Date.now();expect(scheduled.status).toBe(201);
    const lifecycle=await env.DB.prepare(`SELECT account_state,deletion_due_at FROM participants WHERE id=?`).bind(alice.id).first<any>();
    expect(lifecycle.account_state).toBe("deletion_pending");expect(new Date(lifecycle.deletion_due_at).getTime()).toBeGreaterThanOrEqual(before+259200000);expect(new Date(lifecycle.deletion_due_at).getTime()).toBeLessThanOrEqual(after+259200000);
    expect((await SELF.fetch(`${origin}/participants/${alice.id}/context.json`,{headers:{cookie:alice.cookie}})).status).toBe(423);
    expect((await SELF.fetch(`${origin}/participants/${alice.id}/context.md`,{headers:{cookie:alice.cookie}})).status).toBe(423);
    const publicContext=await SELF.fetch(`${origin}/participants/${alice.id}/context.json`).then(r=>r.json<any>());expect(publicContext.documents.map((d:any)=>d.id)).toEqual([publicDocumentId]);
    expect((await SELF.fetch(`${origin}/api/me/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"blocked"})})).status).toBe(423);
    expect((await SELF.fetch(`${origin}/api/me/export`,{headers:{cookie:alice.cookie}})).status).toBe(200);
    const blockedUnarchive=await SELF.fetch(`${origin}/api/projects/${made.project.id}/unarchive`,{method:"POST",headers:{cookie:bob.cookie,origin}});expect(blockedUnarchive.status).toBe(409);expect((await blockedUnarchive.json<any>()).error.code).toBe("project_owner_deletion_pending");
    const blockedRecovery=await SELF.fetch(`${origin}/api/projects/${made.project.id}/recover`,{method:"POST",headers:{cookie:bob.cookie,origin}});expect(blockedRecovery.status).toBe(409);expect((await blockedRecovery.json<any>()).error.code).toBe("project_owner_deletion_pending");
    const frozenProject=await SELF.fetch(`${origin}/api/projects/${made.project.id}`,{headers:{cookie:bob.cookie}}).then(r=>r.json<any>());expect(frozenProject).toMatchObject({canUnarchive:false,unarchiveBlockedReason:"project_owner_deletion_pending"});
    expect((await SELF.fetch(`${origin}/me`,{headers:{cookie:alice.cookie}})).text()).resolves.toContain("Your account is frozen");
    expect((await SELF.fetch(`${origin}/api/me/account-deletion/cancel`,{method:"POST",headers:{cookie:alice.cookie,origin}})).status).toBe(200);
    expect((await SELF.fetch(`${origin}/api/projects/${made.project.id}/unarchive`,{method:"POST",headers:{cookie:bob.cookie,origin}})).status).toBe(200);
    expect((await env.DB.prepare(`SELECT account_state FROM participants WHERE id=?`).bind(alice.id).first<any>()).account_state).toBe("active");
    expect(await env.DB.prepare(`SELECT id FROM documents WHERE id=?`).bind(documentId).first()).toBeTruthy();
  });

  it("rejects late cancellation and finalizes irreversibly and idempotently", async () => {
    const alice=await participant("deleteme"),bob=await participant("bobstays"),carol=await participant("ordinarymember"),dave=await participant("inviteaccept"),eve=await participant("invitedecline"),documentId=await create(alice.cookie,"public");
    const providerId="reusable-discord-id";await env.DB.prepare(`INSERT INTO auth_identities(id,user_id,provider,provider_user_id,created_at) VALUES('idn_old',?,'discord',?,?)`).bind(alice.userId,providerId,new Date().toISOString()).run();
    const made=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Archive",readAudience:"members_and_agents"})}).then(r=>r.json<any>());await invite(made.project.id,alice,bob);await SELF.fetch(`${origin}/api/projects/${made.project.id}/members/${bob.id}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({role:"admin"})});
    const stranded=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"No administrator",readAudience:"members_and_agents"})}).then(r=>r.json<any>());await invite(stranded.project.id,alice,carol);await SELF.fetch(`${origin}/api/projects/${stranded.project.id}/archive`,{method:"POST",headers:{cookie:alice.cookie,origin}});
    const adminProject=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Admin departure",readAudience:"members_and_agents"})}).then(r=>r.json<any>());await invite(adminProject.project.id,bob,alice);await SELF.fetch(`${origin}/api/projects/${adminProject.project.id}/members/${alice.id}`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({role:"admin"})});
    await SELF.fetch(`${origin}/api/projects/${made.project.id}/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId})});
    const invitation=await SELF.fetch(`${origin}/api/projects/${adminProject.project.id}/invitations`,{method:"POST",headers:{cookie:alice.cookie,origin}}).then(r=>r.json<any>());expect((await SELF.fetch(`${origin}/api/invitations/${invitation.invitation.token}`).then(r=>r.json<any>())).invitation.active).toBe(true);
    await SELF.fetch(`${origin}/api/projects/${made.project.id}/archive`,{method:"POST",headers:{cookie:alice.cookie,origin}});
    await SELF.fetch(`${origin}/api/me/account-deletion`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({displayName:"User deleteme"})});
    const due="2000-01-01T00:00:00.000Z";await env.DB.prepare(`UPDATE participants SET deletion_due_at=? WHERE id=?`).bind(due,alice.id).run();
    expect((await SELF.fetch(`${origin}/api/me/account-deletion/cancel`,{method:"POST",headers:{cookie:alice.cookie,origin}})).status).toBe(409);
    const duePreview=await SELF.fetch(`${origin}/api/invitations/${invitation.invitation.token}`).then(r=>r.json<any>());expect(duePreview.invitation.active).toBe(false);expect((await SELF.fetch(`${origin}/api/invitations/${invitation.invitation.token}`,{method:"POST",headers:{cookie:dave.cookie,origin}})).status).toBe(410);expect((await SELF.fetch(`${origin}/api/invitations/${invitation.invitation.token}/decline`,{method:"POST",headers:{cookie:eve.cookie,origin}})).status).toBe(410);expect(await env.DB.prepare(`SELECT participant_id FROM project_members WHERE project_id=? AND participant_id=?`).bind(adminProject.project.id,dave.id).first()).toBeNull();
    const expiredExport=await SELF.fetch(`${origin}/api/me/export`,{headers:{cookie:alice.cookie}});expect(expiredExport.status).toBe(410);expect((await expiredExport.json<any>()).error.code).toBe("account_deletion_due");
    expect((await SELF.fetch(`${origin}/api/me/documents`,{headers:{cookie:alice.cookie}})).status).toBe(410);expect((await SELF.fetch(`${origin}/participants/${alice.id}/context.json`,{headers:{cookie:alice.cookie}})).status).toBe(410);expect((await SELF.fetch(`${origin}/participants/${alice.id}/context.json`)).status).toBe(404);expect((await SELF.fetch(`${origin}/api/documents/${documentId}?project=${made.project.id}`,{headers:{cookie:bob.cookie}})).status).toBe(404);
    const logicallyUnavailable=await SELF.fetch(`${origin}/api/projects/${made.project.id}`,{headers:{cookie:bob.cookie}}).then(r=>r.json<any>());expect(logicallyUnavailable.documents[0]).toMatchObject({id:documentId,state:"retracted",logical_path:null,visibility:null,version_number:null,updated_at:null});
    expect(await env.DB.prepare(`SELECT id FROM documents WHERE id=?`).bind(documentId).first()).toBeTruthy();
    const {finalizeDueAccounts}=await import("../src/accounts");await finalizeDueAccounts(env,new Date("2026-01-01T00:00:00.000Z"));await finalizeDueAccounts(env,new Date("2026-01-01T00:00:00.000Z"));
    const tombstone=await env.DB.prepare(`SELECT id,user_id,public_slug,created_at,withdrawn_at,account_state,provenance_identifier,deletion_due_at,deletion_finalized_at FROM participants WHERE id=?`).bind(alice.id).first<any>();expect(tombstone).toMatchObject({id:alice.id,user_id:null,public_slug:null,created_at:null,withdrawn_at:null,account_state:"deleted",deletion_due_at:null});expect(tombstone.provenance_identifier).toBeTruthy();expect(tombstone.deletion_finalized_at).toBeTruthy();expect(await env.DB.prepare(`SELECT id FROM users WHERE id=?`).bind(alice.userId).first()).toBeNull();
    expect(await env.DB.prepare(`SELECT id FROM documents WHERE id=?`).bind(documentId).first()).toBeNull();expect((await env.DB.prepare(`SELECT count(*) count FROM document_versions WHERE document_id=?`).bind(documentId).first<any>()).count).toBe(0);
    expect((await SELF.fetch(`${origin}/api/documents/${documentId}?project=${made.project.id}`,{headers:{cookie:bob.cookie}})).status).toBe(404);
    expect((await env.DB.prepare(`SELECT state,tombstone_title FROM project_documents WHERE document_id=?`).bind(documentId).first<any>())).toMatchObject({state:"retracted",tombstone_title:"Notes"});
    expect(await env.DB.prepare(`SELECT id FROM auth_identities WHERE user_id=?`).bind(alice.userId).first()).toBeNull();expect(await env.DB.prepare(`SELECT id FROM sessions WHERE user_id=?`).bind(alice.userId).first()).toBeNull();
    expect(await env.DB.prepare(`SELECT participant_id FROM project_members WHERE project_id=? AND participant_id=?`).bind(made.project.id,alice.id).first()).toBeNull();expect(await env.DB.prepare(`SELECT participant_id FROM project_members WHERE project_id=? AND participant_id=?`).bind(made.project.id,bob.id).first()).toBeTruthy();
    expect((await env.DB.prepare(`SELECT status FROM project_invitations WHERE id=?`).bind(invitation.invitation.id).first<any>()).status).toBe("revoked");
    expect((await env.DB.prepare(`SELECT count(*) count FROM account_events WHERE participant_id=? AND event_type='account_deletion_finalized'`).bind(alice.id).first<any>()).count).toBe(1);
    const departure=await env.DB.prepare(`SELECT actor_participant_id,details_json FROM project_events WHERE project_id=? AND event_type='member_left'`).bind(made.project.id).first<any>();expect(departure.actor_participant_id).toBe(alice.id);expect(JSON.parse(departure.details_json)).toEqual({participantId:alice.id,withdrawContributions:false});
    const adminDeparture=await env.DB.prepare(`SELECT actor_participant_id,details_json FROM project_events WHERE project_id=? AND event_type='member_left'`).bind(adminProject.project.id).first<any>();expect(adminDeparture.actor_participant_id).toBe(alice.id);expect(JSON.parse(adminDeparture.details_json)).toEqual({participantId:alice.id,withdrawContributions:false});
    const ordinaryUnarchive=await SELF.fetch(`${origin}/api/projects/${made.project.id}/unarchive`,{method:"POST",headers:{cookie:bob.cookie,origin}});expect(ordinaryUnarchive.status).toBe(409);expect((await ordinaryUnarchive.json<any>()).error.code).toBe("project_ownerless_recovery_required");expect((await env.DB.prepare(`SELECT lifecycle_state FROM projects WHERE id=?`).bind(made.project.id).first<any>()).lifecycle_state).toBe("archived");expect((await env.DB.prepare(`SELECT role FROM project_members WHERE project_id=? AND participant_id=?`).bind(made.project.id,bob.id).first<any>()).role).toBe("admin");
    const recovery=await SELF.fetch(`${origin}/api/projects/${made.project.id}/recover`,{method:"POST",headers:{cookie:bob.cookie,origin}});expect(recovery.status).toBe(200);expect(await recovery.json<any>()).toMatchObject({project:{status:"active",ownerParticipantId:bob.id,recoveredOwnership:true}});
    const recovered=await env.DB.prepare(`SELECT x.lifecycle_state,pm.role FROM projects x JOIN project_members pm ON pm.project_id=x.id AND pm.participant_id=? WHERE x.id=?`).bind(bob.id,made.project.id).first<any>();expect(recovered).toEqual({lifecycle_state:"active",role:"owner"});expect((await env.DB.prepare(`SELECT count(*) count FROM project_members WHERE project_id=? AND role='owner'`).bind(made.project.id).first<any>()).count).toBe(1);
    expect((await SELF.fetch(`${origin}/api/projects/${stranded.project.id}/recover`,{method:"POST",headers:{cookie:carol.cookie,origin}})).status).toBe(403);expect((await env.DB.prepare(`SELECT lifecycle_state FROM projects WHERE id=?`).bind(stranded.project.id).first<any>()).lifecycle_state).toBe("archived");expect((await env.DB.prepare(`SELECT count(*) count FROM project_members WHERE project_id=? AND role='owner'`).bind(stranded.project.id).first<any>()).count).toBe(0);expect((await env.DB.prepare(`SELECT count(*) count FROM projects x WHERE x.lifecycle_state='active' AND NOT EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=x.id AND pm.role='owner')`).first<any>()).count).toBe(0);
    const projectView=await SELF.fetch(`${origin}/api/projects/${made.project.id}`,{headers:{cookie:bob.cookie}}).then(r=>r.json<any>());expect(projectView.events).toContainEqual(expect.objectContaining({event_type:"member_left",actor_display_name:`${tombstone.provenance_identifier} (former user)`}));expect(projectView.events.filter((e:any)=>e.event_type==="ownership_transferred")).toHaveLength(1);expect(projectView.events.filter((e:any)=>e.event_type==="project_unarchived")).toHaveLength(1);
    const start=await SELF.fetch(`${origin}/auth/discord`,{redirect:"manual"}),state=/loom_oauth_state=([^;]+)/.exec(start.headers.get("set-cookie")||"")?.[1];expect(state).toBeTruthy();
    const originalFetch=globalThis.fetch,fetchSpy=vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;if(url==="https://discord.com/api/oauth2/token")return new Response(JSON.stringify({access_token:"replacement-token"}),{status:200,headers:{"content-type":"application/json"}});if(url==="https://discord.com/api/users/@me")return new Response(JSON.stringify({id:providerId,username:"User deleteme"}),{status:200,headers:{"content-type":"application/json"}});return originalFetch(input as RequestInfo,init)});
    let callback:Response;try{callback=await SELF.fetch(`${origin}/auth/discord/callback?state=${encodeURIComponent(state!)}&code=new-code`,{headers:{cookie:`loom_oauth_state=${state}`},redirect:"manual"})}finally{fetchSpy.mockRestore()}expect(callback!.status).toBe(302);
    const replacement=await env.DB.prepare(`SELECT u.id user_id,p.id participant_id,p.provenance_identifier FROM auth_identities i JOIN users u ON u.id=i.user_id JOIN participants p ON p.user_id=u.id WHERE i.provider='discord' AND i.provider_user_id=?`).bind(providerId).first<any>();expect(replacement.user_id).not.toBe(alice.userId);expect(replacement.participant_id).not.toBe(alice.id);expect(replacement.provenance_identifier).not.toBe(tombstone.provenance_identifier);
    const unchanged=await env.DB.prepare(`SELECT id,user_id,provenance_identifier,account_state FROM participants WHERE id=?`).bind(alice.id).first<any>();expect(unchanged).toEqual({id:alice.id,user_id:null,provenance_identifier:tombstone.provenance_identifier,account_state:"deleted"});
  });
});

describe("project-native documents",()=>{
  async function project(owner:{cookie:string}){const r=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Native",readAudience:"members_and_agents"})});return (await r.json<any>()).project.id}
  async function native(projectId:string,actor:{cookie:string},body:any={title:"Shared",logicalPath:"shared.md",content:"one",contentType:"text/markdown"}){return SELF.fetch(`${origin}/api/projects/${projectId}/native-documents`,{method:"POST",headers:{cookie:actor.cookie,origin,"content-type":"application/json"},body:JSON.stringify(body)})}
  it("authorizes project-deletion cancellation at database mutation time",async()=>{
    const alice=await participant("alice"),id=await project(alice),principal={userId:alice.userId,participantId:alice.id,displayName:"User alice",accountState:"active" as const,deletionDueAt:null};
    const {scheduleProjectDeletion,cancelProjectDeletion}=await import("../src/project-deletion"),schedule=(at:Date)=>scheduleProjectDeletion(new Request(`${origin}/schedule`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:"Native"})}),env,principal,id,at);
    const firstAt=new Date("2029-01-01T00:00:00.000Z");expect((await schedule(firstAt)).status).toBe(201);
    expect((await cancelProjectDeletion(env,principal,id,new Date("2029-01-02T00:00:00.000Z"),new Date("2029-01-02T00:00:00.000Z"))).status).toBe(200);
    expect(await env.DB.prepare(`SELECT lifecycle_state,deletion_due_at FROM projects WHERE id=?`).bind(id).first()).toEqual({lifecycle_state:"archived",deletion_due_at:null});
    const secondAt=new Date("2029-01-03T00:00:00.000Z");expect((await schedule(secondAt)).status).toBe(201);
    const due="2029-01-06T00:00:00.000Z";expect((await env.DB.prepare(`SELECT deletion_due_at FROM projects WHERE id=?`).bind(id).first<any>()).deletion_due_at).toBe(due);
    const raced=await cancelProjectDeletion(env,principal,id,new Date("2029-01-05T23:59:59.999Z"),new Date(due));expect(raced.status).toBe(409);
    expect((await env.DB.prepare(`SELECT deletion_due_at FROM projects WHERE id=?`).bind(id).first<any>()).deletion_due_at).toBe(due);
  });
  it("schedules owner-confirmed deletion and finalizes an inert, content-free provenance shell",async()=>{
    const alice=await participant("alice"),bob=await participant("bob"),id=await project(alice);
    await invite(id,alice,bob);
    await SELF.fetch(`${origin}/api/projects/${id}/members/${bob.id}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({role:"admin"})});
    const source=await create(alice.cookie),sourceVersion=await env.DB.prepare(`SELECT id,content FROM document_versions WHERE document_id=?`).bind(source).first<any>();
    expect((await SELF.fetch(`${origin}/api/projects/${id}/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId:source})})).status).toBe(201);
    const made=await native(id,alice),doc=(await made.json<any>()).document.id;
    await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({content:"two",contentType:"text/plain"})});
    const mutate=(actor:{cookie:string},title:string)=>SELF.fetch(`${origin}/api/projects/${id}/deletion`,{method:"POST",headers:{cookie:actor.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title})});
    expect((await mutate(bob,"Native")).status).toBe(403);
    expect((await mutate(alice,"native")).status).toBe(400);
    const scheduled=await mutate(alice,"Native");expect(scheduled.status).toBe(201);
    const body=await scheduled.json<any>();expect(new Date(body.project.deletionDueAt).getTime()-new Date(body.project.deletionScheduledAt).getTime()).toBe(3*86400_000);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/unarchive`,{method:"POST",headers:{cookie:bob.cookie,origin}})).status).toBe(409);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/deletion`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(403);
    await env.DB.prepare(`UPDATE projects SET deletion_due_at=? WHERE id=?`).bind("2026-01-01T00:00:00.000Z",id).run();
    expect((await SELF.fetch(`${origin}/api/projects/${id}/deletion`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})).status).toBe(409);
    const {finalizeDueProjects}=await import("../src/project-deletion");await finalizeDueProjects(env,new Date("2026-01-01T00:00:00.000Z"));
    expect(await env.DB.prepare(`SELECT lifecycle_state,deletion_finalized_at FROM projects WHERE id=?`).bind(id).first<any>()).toMatchObject({lifecycle_state:"shell",deletion_finalized_at:"2026-01-01T00:00:00.000Z"});
    expect((await env.DB.prepare(`SELECT count(*) count FROM project_members WHERE project_id=?`).bind(id).first<any>()).count).toBe(0);
    expect((await env.DB.prepare(`SELECT participant_id,participant_provenance_identifier,historical_role,joined_at,finalized_at FROM project_membership_shell WHERE project_id=? ORDER BY historical_role DESC`).bind(id).all<any>()).results).toEqual(expect.arrayContaining([
      expect.objectContaining({participant_id:alice.id,participant_provenance_identifier:"test-person-alice",historical_role:"owner",finalized_at:"2026-01-01T00:00:00.000Z"}),
      expect.objectContaining({participant_id:bob.id,participant_provenance_identifier:"test-person-bob",historical_role:"admin",finalized_at:"2026-01-01T00:00:00.000Z"})
    ]));
    expect((await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:alice.cookie}})).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:bob.cookie}})).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/projects/${id}/unarchive`,{method:"POST",headers:{cookie:bob.cookie,origin}})).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{headers:{cookie:alice.cookie}})).status).toBe(404);
    expect((await env.DB.prepare(`SELECT count(*) count FROM document_versions WHERE document_id=?`).bind(doc).first<any>()).count).toBe(0);
    expect((await env.DB.prepare(`SELECT revision_id,version_number,actor_type,created_at FROM project_document_revision_shell WHERE document_id=? ORDER BY version_number`).bind(doc).all<any>()).results).toHaveLength(2);
    expect(await env.DB.prepare(`SELECT id,title,current_version_id,deleted_at FROM documents WHERE id=?`).bind(doc).first<any>()).toMatchObject({id:doc,title:"Shared",current_version_id:null,deleted_at:"2026-01-01T00:00:00.000Z"});
    expect(await env.DB.prepare(`SELECT id,deleted_at,current_version_id FROM documents WHERE id=?`).bind(source).first<any>()).toMatchObject({id:source,deleted_at:null,current_version_id:sourceVersion.id});
    expect(await env.DB.prepare(`SELECT id,content FROM document_versions WHERE id=?`).bind(sourceVersion.id).first<any>()).toEqual(sourceVersion);
    expect((await env.DB.prepare(`SELECT state FROM project_documents WHERE project_id=? AND document_id=?`).bind(id,source).first<any>()).state).toBe("retracted");
    const html=await SELF.fetch(`${origin}/projects`,{headers:{cookie:bob.cookie}}).then(r=>r.text()),script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]??"";expect(()=>new Function(script)).not.toThrow();
  });
  it("assigns creation paths, accepts direct uploads, and exposes document history",async()=>{const alice=await participant("alice"),id=await project(alice);const made=await native(id,alice,{title:"No plumbing",content:"one",contentType:"text/plain"});expect(made.status).toBe(201);const doc=(await made.json<any>()).document.id,row=await env.DB.prepare("SELECT logical_path FROM documents WHERE id=?").bind(doc).first<any>();expect(row.logical_path).toBe(`documents/${doc}`);const form=new FormData();form.set("file",new File(["uploaded"],"field-notes.md",{type:"text/markdown"}));const uploaded=await SELF.fetch(`${origin}/api/projects/${id}/native-documents/upload`,{method:"POST",headers:{cookie:alice.cookie,origin},body:form});expect(uploaded.status).toBe(201);const uploadId=(await uploaded.json<any>()).document.id;expect(await env.DB.prepare("SELECT title,logical_path,owner_type,owner_id FROM documents WHERE id=?").bind(uploadId).first()).toEqual({title:"field-notes",logical_path:`documents/${uploadId}`,owner_type:"project",owner_id:id});await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({content:"two",contentType:"text/plain"})});await SELF.fetch(`${origin}/api/project-documents/${doc}/metadata`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Renamed",logicalPath:"organized/renamed.txt"})});const history=await SELF.fetch(`${origin}/api/project-documents/${doc}/versions`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>());expect(history.timeline.map((x:any)=>x.entry_type)).toEqual(expect.arrayContaining(["content_revision","metadata_event"]));const html=await SELF.fetch(`${origin}/project-documents/${doc}`,{headers:{cookie:alice.cookie}}).then(r=>r.text());expect(html).toContain("Revision history");expect(html).toContain("/versions");expect(html).toContain("body.timeline");const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]??"";expect(()=>new Function(script)).not.toThrow()});
  it("shows contribution relationships in My Space without mistaking copies for links",async()=>{const alice=await participant("alice"),id=await project(alice),source=await create(alice.cookie);expect((await SELF.fetch(`${origin}/api/projects/${id}/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId:source})})).status).toBe(201);expect((await SELF.fetch(`${origin}/api/projects/${id}/native-documents/copy/${source}`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({confirmProjectOwnership:true})})).status).toBe(201);const documents=await SELF.fetch(`${origin}/api/me/documents`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>());expect(documents.documents.find((x:any)=>x.id===source).project_links).toEqual([{project_id:id,project_name:"Native",state:"active",can_open_project:true}]);const html=await SELF.fetch(`${origin}/me`,{headers:{cookie:alice.cookie}}).then(r=>r.text());expect(html).toContain("Linked to:");expect(html).toContain("d.project_links");expect(html).toContain("can_open_project")});
  it("separates project ownership from provenance and permits member revisions without resetting the deadline",async()=>{const alice=await participant("alice"),bob=await participant("bob"),id=await project(alice);await invite(id,alice,bob);const made=await native(id,bob);expect(made.status).toBe(201);const result=await made.json<any>(),doc=result.document.id;expect(result.document).toMatchObject({owner:{type:"project",id},createdBy:bob.id});const before=(await env.DB.prepare(`SELECT owner_type,owner_id,created_by_participant_id,creator_deletion_until FROM documents WHERE id=?`).bind(doc).first<any>());expect(before).toMatchObject({owner_type:"project",owner_id:id,created_by_participant_id:bob.id});expect(new Date(before.creator_deletion_until).getTime()-new Date((await env.DB.prepare(`SELECT created_at FROM documents WHERE id=?`).bind(doc).first<any>()).created_at).getTime()).toBe(72*3600_000);const edit=await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({content:"two",contentType:"text/plain"})});expect(edit.status).toBe(200);expect((await env.DB.prepare(`SELECT creator_deletion_until FROM documents WHERE id=?`).bind(doc).first<any>()).creator_deletion_until).toBe(before.creator_deletion_until);expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{headers:{cookie:bob.cookie}})).status).toBe(200)});
  it("enforces creator deletion before but not at the exact deadline, including after removal and while archived",async()=>{const alice=await participant("alice"),bob=await participant("bob"),id=await project(alice);await invite(id,alice,bob);let made=await native(id,bob),doc=(await made.json<any>()).document.id;await SELF.fetch(`${origin}/api/projects/${id}/members/${bob.id}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}});expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{headers:{cookie:bob.cookie}})).status).toBe(404);expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(204);await invite(id,alice,bob);made=await native(id,bob,{title:"Archived",logicalPath:"archived.md",content:"x",contentType:"text/plain"});doc=(await made.json<any>()).document.id;await SELF.fetch(`${origin}/api/projects/${id}/archive`,{method:"POST",headers:{cookie:alice.cookie,origin}});expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({content:"no",contentType:"text/plain"})})).status).toBe(409);expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(204);await SELF.fetch(`${origin}/api/projects/${id}/unarchive`,{method:"POST",headers:{cookie:alice.cookie,origin}});made=await native(id,bob,{title:"Boundary",logicalPath:"boundary.md",content:"x",contentType:"text/plain"});doc=(await made.json<any>()).document.id;const at=new Date().toISOString();await env.DB.prepare(`UPDATE documents SET creator_deletion_until=? WHERE id=?`).bind(at,doc).run();expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(403);expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})).status).toBe(204)});
  it("creates independent copies and keeps personal export participant-owned",async()=>{const alice=await participant("alice"),id=await project(alice),source=await create(alice.cookie);const copied=await SELF.fetch(`${origin}/api/projects/${id}/native-documents/copy/${source}`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({confirmProjectOwnership:true})});expect(copied.status).toBe(201);const copy=(await copied.json<any>()).document.id;expect(copy).not.toBe(source);await SELF.fetch(`${origin}/api/me/documents/${source}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({content:"source changed",contentType:"text/plain"})});expect((await SELF.fetch(`${origin}/api/project-documents/${copy}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>())).document.content).toBe("first");await SELF.fetch(`${origin}/api/me/documents/${source}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}});expect((await SELF.fetch(`${origin}/api/project-documents/${copy}`,{headers:{cookie:alice.cookie}})).status).toBe(200);const personal=await zipFiles(await SELF.fetch(`${origin}/api/me/export`,{headers:{cookie:alice.cookie}}));expect(personal.get("manifest.json")).not.toContain(copy);const projectArchive=await zipFiles(await SELF.fetch(`${origin}/api/projects/${id}/export`,{headers:{cookie:alice.cookie}}));expect(projectArchive.get("manifest.json")).toContain(copy);expect(projectArchive.get(`documents/${copy}/current.md`)).toBe("first")});
  it("blocks ordinary member deletion after expiry and account hard deadline authority",async()=>{const alice=await participant("alice"),bob=await participant("bob"),id=await project(alice);await invite(id,alice,bob);let made=await native(id,bob),doc=(await made.json<any>()).document.id;await env.DB.prepare(`UPDATE documents SET creator_deletion_until=? WHERE id=?`).bind(new Date(Date.now()-1).toISOString(),doc).run();expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(403);expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})).status).toBe(204);made=await native(id,bob,{title:"Survives",logicalPath:"survives.md",content:"x",contentType:"text/plain"});doc=(await made.json<any>()).document.id;await env.DB.prepare(`UPDATE participants SET account_state='deletion_pending',deletion_due_at=? WHERE id=?`).bind(new Date(Date.now()-1).toISOString(),bob.id).run();expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(410);expect(await env.DB.prepare(`SELECT id FROM documents WHERE id=?`).bind(doc).first()).toBeTruthy()});
  it("denies agents_only native bodies through reads, history, exports, and project UI links",async()=>{const alice=await participant("alice");const made=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Agents",readAudience:"agents_only"})}).then(r=>r.json<any>()),id=made.project.id;const created=await native(id,alice),doc=(await created.json<any>()).document.id;expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{headers:{cookie:alice.cookie}})).status).toBe(404);expect((await SELF.fetch(`${origin}/api/project-documents/${doc}/versions`,{headers:{cookie:alice.cookie}})).status).toBe(404);const exported=await SELF.fetch(`${origin}/api/projects/${id}/export`,{headers:{cookie:alice.cookie}});expect(exported.status).toBe(403);const projectView=await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>());expect(projectView.nativeDocuments[0]).toMatchObject({id:doc,title:"Shared"});expect(projectView.documentsHiddenFromHumans).toBe(true);const html=await SELF.fetch(`${origin}/projects`,{headers:{cookie:alice.cookie}}).then(r=>r.text());expect(html).toContain("if(!j.documentsHiddenFromHumans)li.append(open)");expect(html).toContain("if(!j.documentsHiddenFromHumans){const exportLink")});
  it("rechecks copy source ownership and current availability inside the commit batch",async()=>{const alice=await participant("alice"),id=await project(alice),source=await create(alice.cookie),principal={userId:alice.userId,participantId:alice.id,displayName:"User alice",accountState:"active" as const,deletionDueAt:null};const {createProjectDocument}=await import("../src/project-documents");let intercepted=false;const DB=new Proxy(env.DB,{get(target,property,receiver){if(property==="batch")return async(statements:D1PreparedStatement[])=>{if(!intercepted){intercepted=true;await env.DB.prepare(`DELETE FROM documents WHERE id=?`).bind(source).run()}return env.DB.batch(statements)};const value=Reflect.get(target,property,receiver);return typeof value==="function"?value.bind(target):value}});const response=await createProjectDocument(new Request(`${origin}/copy`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirmProjectOwnership:true})}),{...env,DB},principal,id,source);expect(response.status).toBe(409);expect(intercepted).toBe(true);expect((await env.DB.prepare(`SELECT count(*) count FROM documents WHERE owner_type='project' AND source_document_id=?`).bind(source).first<any>()).count).toBe(0)});
  it("shows only live UI authority and preserves deletion-time title in project activity",async()=>{const alice=await participant("alice"),bob=await participant("bob"),id=await project(alice);await invite(id,alice,bob);const made=await native(id,bob,{title:"Durable title",logicalPath:"durable.md",content:"x",contentType:"text/plain"}),doc=(await made.json<any>()).document.id;await env.DB.prepare(`UPDATE documents SET creator_deletion_until=? WHERE id=?`).bind(new Date(Date.now()-1).toISOString(),doc).run();let view=await SELF.fetch(`${origin}/api/project-documents/${doc}`,{headers:{cookie:bob.cookie}}).then(r=>r.json<any>());expect(view.document).toMatchObject({can_edit:1,can_delete:0});await SELF.fetch(`${origin}/api/projects/${id}/archive`,{method:"POST",headers:{cookie:alice.cookie,origin}});view=await SELF.fetch(`${origin}/api/project-documents/${doc}`,{headers:{cookie:bob.cookie}}).then(r=>r.json<any>());expect(view.document).toMatchObject({can_edit:0,can_delete:0});await SELF.fetch(`${origin}/api/projects/${id}/unarchive`,{method:"POST",headers:{cookie:alice.cookie,origin}});expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})).status).toBe(204);const event=await env.DB.prepare(`SELECT details_json FROM project_events WHERE project_id=? AND event_type='native_document_deleted'`).bind(id).first<any>();expect(JSON.parse(event.details_json)).toEqual({documentId:doc,title:"Durable title"});const activity=await SELF.fetch(`${origin}/api/projects/${id}`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>());expect(activity.events).toContainEqual(expect.objectContaining({event_type:"native_document_deleted",document_id:doc,document_title:"Durable title"}));const html=await SELF.fetch(`${origin}/project-documents/${doc}`,{headers:{cookie:alice.cookie}}).then(r=>r.text());expect(html).toContain("if(d.can_edit)");expect(html).toContain("if(d.can_delete)");expect(html).toContain("Save document details");expect(html).toContain("Save content revision");expect(html).not.toContain("Save changes")});
  it("freezes creator deletion while account deletion is pending, then restores it after cancellation until its own deadline",async()=>{const alice=await participant("alice"),bob=await participant("bob"),id=await project(alice);await invite(id,alice,bob);const made=await native(id,bob),doc=(await made.json<any>()).document.id,due=new Date(Date.now()+3600_000).toISOString();await env.DB.prepare(`UPDATE participants SET account_state='deletion_pending',deletion_due_at=? WHERE id=?`).bind(due,bob.id).run();expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(423);expect(await env.DB.prepare(`SELECT id FROM documents WHERE id=?`).bind(doc).first()).toBeTruthy();expect((await SELF.fetch(`${origin}/api/me/account-deletion/cancel`,{method:"POST",headers:{cookie:bob.cookie,origin}})).status).toBe(200);expect((await SELF.fetch(`${origin}/api/project-documents/${doc}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(204)});

});

describe("read-only machine access",()=>{
  it("hands conversation credentials through canonical introspection and publishes only that GPT Action",async()=>{
    const owner=await participant("gpt_action_owner");
    const projectResponse=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Action corpus",readAudience:"agents_only"})});
    const projectId=(await projectResponse.json<any>()).project.id;
    const createActionCredential=()=>SELF.fetch(`${origin}/api/projects/${projectId}/agent-credentials`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({label:"Action reader"})}).then(r=>r.json<any>());
    const created=await createActionCredential(),token=created.token;
    const handoff=(credential:unknown,init:RequestInit={})=>SELF.fetch(`${origin}/api/gpt-action/authenticate`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({credential}),...init});

    const canonical=await SELF.fetch(`${origin}/api/agent/me`,{headers:{authorization:`Bearer ${token}`}}).then(r=>r.json<any>());
    const accepted=await handoff(token);expect(accepted.status).toBe(200);expect(accepted.headers.get("cache-control")).toBe("no-store");expect(await accepted.json()).toEqual(canonical);
    for(const credential of ["malformed",`loom_agent_${"0".repeat(36)}`]){const denied=await handoff(credential);expect(denied.status).toBe(401);expect(denied.headers.get("cache-control")).toBe("no-store");expect(await denied.text()).not.toContain(String(credential))}
    const malformedJson=await SELF.fetch(`${origin}/api/gpt-action/authenticate`,{method:"POST",headers:{"content-type":"application/json"},body:'{"credential":"loom_agent_secret'});expect(malformedJson.status).toBe(400);expect(malformedJson.headers.get("cache-control")).toBe("no-store");expect(await malformedJson.json()).toEqual({error:{code:"invalid_request",message:"Malformed JSON request"}});
    const unsupported=await SELF.fetch(`${origin}/api/gpt-action/authenticate`,{method:"GET",headers:{authorization:`Bearer ${token}`}});expect(unsupported.status).toBe(405);expect(unsupported.headers.get("cache-control")).toBe("no-store");

    await SELF.fetch(`${origin}/api/projects/${projectId}/archive`,{method:"POST",headers:{cookie:owner.cookie,origin}});expect((await handoff(token)).status).toBe(200);
    await env.DB.prepare("UPDATE projects SET lifecycle_state='shell' WHERE id=?").bind(projectId).run();expect((await handoff(token)).status).toBe(410);
    await env.DB.prepare("UPDATE projects SET lifecycle_state='active' WHERE id=?").bind(projectId).run();
    await SELF.fetch(`${origin}/api/projects/${projectId}/agent-credentials/${created.credential.id}`,{method:"DELETE",headers:{cookie:owner.cookie,origin}});expect((await handoff(token)).status).toBe(401);

    const audits=(await env.DB.prepare("SELECT operation,result_code FROM machine_read_audit ORDER BY occurred_at,id").all()).results;expect(JSON.stringify(audits)).not.toContain(token);
    const schemaResponse=await SELF.fetch(`${origin}/openapi/gpt-action.json`),schema=await schemaResponse.json<any>();expect(schemaResponse.status).toBe(200);expect(schema.openapi).toBe("3.1.0");expect(schema.servers).toEqual([{url:"https://loom.metasemantix.workers.dev"}]);expect(Object.keys(schema.paths)).toEqual(["/api/gpt-action/authenticate"]);expect(Object.keys(schema.paths["/api/gpt-action/authenticate"])).toEqual(["post"]);expect(schema.paths["/api/gpt-action/authenticate"].post.operationId).toBe("authenticateLoomCredential");expect(JSON.stringify(schema).match(/operationId/g)).toHaveLength(1);expect(JSON.stringify(schema)).not.toContain(token);
  });

  it("publishes non-secret discovery and a parseable unauthenticated workbench",async()=>{
    const orientation=await SELF.fetch(`${origin}/llms.txt`);expect(orientation.status).toBe(200);expect(orientation.headers.get("content-type")).toContain("text/plain");const text=await orientation.text();expect(text.length).toBeLessThan(500);expect(text).toContain("/agent");expect(text).toContain("/.well-known/loom-agent");expect(text).toContain("/login");
    const discovery=await SELF.fetch(`${origin}/.well-known/loom-agent`).then(r=>r.json<any>());expect(discovery).toMatchObject({service:"Loom",protocolVersion:"1",entrance:"/agent",authentication:{scheme:"Bearer"},orientation:"/llms.txt"});expect(JSON.stringify(discovery)).not.toMatch(/projectId|credential|token_hash/);
    expect((await SELF.fetch(`${origin}/login`)).status).toBe(200);const page=await SELF.fetch(`${origin}/agent`),html=await page.text();expect(page.status).toBe(200);expect(html).toContain("ordinary Loom sign-in");expect(html).toContain('type="password"');expect(html).not.toContain("localStorage");const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]??"";expect(()=>new Function(script)).not.toThrow();
  });

  it("keeps reads default-only and commits explicitly authorized check-ins with machine provenance",async()=>{
    const owner=await participant("checkin_owner"),other=await participant("checkin_other");const made=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Check-ins",readAudience:"agents_only"})}).then(r=>r.json<any>()),projectId=made.project.id;
    const createCredential=async(checkinEnabled:boolean,cookie=owner.cookie)=>SELF.fetch(`${origin}/api/projects/${projectId}/agent-credentials`,{method:"POST",headers:{cookie,origin,"content-type":"application/json"},body:JSON.stringify({label:checkinEnabled?"Reporter":"Reader",checkinEnabled})});
    expect((await createCredential(true,other.cookie)).status).toBe(403);const readonly=await createCredential(false).then(r=>r.json<any>()),enabled=await createCredential(true).then(r=>r.json<any>()),readHeaders={authorization:`Bearer ${readonly.token}`},writeHeaders={authorization:`Bearer ${enabled.token}`};
    expect((await SELF.fetch(`${origin}/api/agent/me`,{headers:readHeaders}).then(r=>r.json<any>())).caller.grant.capabilities).not.toContain("agent_checkin:write");expect((await SELF.fetch(`${origin}/api/agent/check-in`,{method:"POST",headers:{...readHeaders,"content-type":"application/json"},body:JSON.stringify({value:"no"})})).status).toBe(403);
    expect((await SELF.fetch(`${origin}/api/agent/me`,{headers:writeHeaders}).then(r=>r.json<any>())).caller.grant.capabilities).toContain("agent_checkin:write");const checked=await SELF.fetch(`${origin}/api/agent/check-in`,{method:"POST",headers:{...writeHeaders,"content-type":"application/json"},body:JSON.stringify({value:"ready"})});expect(checked.status).toBe(201);const checkin=(await checked.json<any>()).checkin;expect(checkin).toMatchObject({projectId,credentialId:enabled.credential.id,value:"ready"});expect(await env.DB.prepare(`SELECT credential_id,project_id,value,created_at FROM project_machine_checkins WHERE id=?`).bind(checkin.id).first()).toMatchObject({credential_id:enabled.credential.id,project_id:projectId,value:"ready"});
    const listing=await SELF.fetch(`${origin}/api/projects/${projectId}/agent-credentials`,{headers:{cookie:owner.cookie}}).then(r=>r.json<any>());expect(listing.credentials.find((x:any)=>x.id===enabled.credential.id).capabilities).toContain("agent_checkin:write");expect(JSON.stringify(listing)).not.toContain(enabled.token);expect(JSON.stringify(listing)).not.toContain("token_hash");
    for(const body of [{},{value:""},{value:"x".repeat(501)}])expect((await SELF.fetch(`${origin}/api/agent/check-in`,{method:"POST",headers:{...writeHeaders,"content-type":"application/json"},body:JSON.stringify(body)})).status).toBe(400);
    await SELF.fetch(`${origin}/api/projects/${projectId}/archive`,{method:"POST",headers:{cookie:owner.cookie,origin}});const introspection=await SELF.fetch(`${origin}/api/agent/me`,{headers:writeHeaders}).then(r=>r.json<any>());expect(introspection.caller.grant.capabilities).not.toContain("agent_checkin:write");expect((await SELF.fetch(`${origin}/api/agent/check-in`,{method:"POST",headers:{...writeHeaders,"content-type":"application/json"},body:JSON.stringify({value:"stale"})})).status).toBe(403);expect((await SELF.fetch(`${origin}/api/agent/project`,{headers:writeHeaders})).status).toBe(200);
    await SELF.fetch(`${origin}/api/projects/${projectId}/unarchive`,{method:"POST",headers:{cookie:owner.cookie,origin}});await SELF.fetch(`${origin}/api/projects/${projectId}/agent-credentials/${enabled.credential.id}`,{method:"DELETE",headers:{cookie:owner.cookie,origin}});expect((await SELF.fetch(`${origin}/api/agent/check-in`,{method:"POST",headers:{...writeHeaders,"content-type":"application/json"},body:JSON.stringify({value:"revoked"})})).status).toBe(401);
  });
  it("creates a one-time secret, reads the live scoped corpus, audits, and revokes immediately",async()=>{
    const owner=await participant("agent_owner"),other=await participant("agent_other");
    const projectResponse=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Agent corpus",readAudience:"agents_only"})});
    const projectId=(await projectResponse.json<any>()).project.id,source=await create(owner.cookie);
    await SELF.fetch(`${origin}/api/me/documents/${source}/metadata`,{method:"PUT",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({compression:"Participant summary"})});
    await SELF.fetch(`${origin}/api/projects/${projectId}/documents`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId:source})});
    const nativeResponse=await SELF.fetch(`${origin}/api/projects/${projectId}/native-documents`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Native",content:"native body",contentType:"text/plain"})}),nativeId=(await nativeResponse.json<any>()).document.id;
    expect((await SELF.fetch(`${origin}/api/projects/${projectId}/agent-credentials`,{method:"POST",headers:{cookie:other.cookie,origin,"content-type":"application/json"},body:JSON.stringify({label:"Denied"})})).status).toBe(403);
    const created=await SELF.fetch(`${origin}/api/projects/${projectId}/agent-credentials`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({label:"Research client"})});expect(created.status).toBe(201);
    const creation=await created.json<any>(),token=creation.token,headers={authorization:`Bearer ${token}`};expect(token).toMatch(/^loom_agent_[a-f0-9]{36}$/);
    const stored=await env.DB.prepare(`SELECT token_hash,fingerprint FROM project_machine_credentials WHERE id=?`).bind(creation.credential.id).first<any>();expect(stored.token_hash).not.toContain(token);expect(stored.fingerprint).toHaveLength(12);
    expect((await SELF.fetch(`${origin}/api/agent/me`,{headers}).then(r=>r.json<any>())).caller.grant.projectId).toBe(projectId);
    const discovery=await SELF.fetch(`${origin}/api/agent/documents`,{headers}).then(r=>r.json<any>());expect(discovery.documents).toEqual(expect.arrayContaining([expect.objectContaining({id:source,ownership_kind:"participant",compression:"Participant summary"}),expect.objectContaining({id:nativeId,ownership_kind:"project"})]));
    expect((await SELF.fetch(`${origin}/api/agent/documents/${source}`,{headers}).then(r=>r.json<any>())).document.content).toBe("first");expect((await SELF.fetch(`${origin}/api/agent/documents/${nativeId}`,{headers})).status).toBe(200);
    const outside=await create(other.cookie);expect((await SELF.fetch(`${origin}/api/agent/documents/${outside}`,{headers})).status).toBe(404);
    await SELF.fetch(`${origin}/api/projects/${projectId}/documents/${source}`,{method:"DELETE",headers:{cookie:owner.cookie,origin}});expect((await SELF.fetch(`${origin}/api/agent/documents/${source}`,{headers})).status).toBe(404);
    const afterRetraction=await SELF.fetch(`${origin}/api/agent/documents`,{headers}).then(r=>r.json<any>()),tombstone=afterRetraction.documents.find((document:any)=>document.id===source);expect(tombstone).toMatchObject({availability:"unavailable",compression:null,retrieval:null});expect(tombstone).not.toHaveProperty("content");
    expect((await SELF.fetch(`${origin}/api/agent/documents`,{method:"POST",headers})).status).toBe(405);expect((await SELF.fetch(`${origin}/api/agent/me`,{headers:{authorization:"Bearer malformed"}})).status).toBe(401);expect((await SELF.fetch(`${origin}/api/agent/me`,{headers:{authorization:`Bearer loom_agent_${"0".repeat(36)}`}})).status).toBe(401);
    expect((await SELF.fetch(`${origin}/api/projects/${projectId}/agent-credentials/${creation.credential.id}`,{method:"DELETE",headers:{cookie:other.cookie,origin}})).status).toBe(403);
    expect((await SELF.fetch(`${origin}/api/projects/${projectId}/agent-credentials/${creation.credential.id}`,{method:"DELETE",headers:{cookie:owner.cookie,origin}})).status).toBe(204);expect((await SELF.fetch(`${origin}/api/agent/me`,{headers})).status).toBe(401);
    const audit=(await env.DB.prepare(`SELECT credential_id,project_id,operation,target_document_id,allowed,result_code FROM machine_read_audit WHERE credential_id=? ORDER BY occurred_at,id`).bind(creation.credential.id).all<any>()).results;expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({project_id:projectId,operation:"document",target_document_id:source,allowed:1,result_code:"allowed"}),expect.objectContaining({project_id:projectId,operation:"documents",allowed:0,result_code:"read_only_api"}),expect.objectContaining({project_id:projectId,allowed:0,result_code:"credential_revoked"})]));expect(JSON.stringify(audit)).not.toContain(token);expect(JSON.stringify(audit)).not.toContain("native body");
  });

  it("preserves archived reads and atomically ends live grants at shell finalization",async()=>{
    const owner=await participant("agent_lifecycle");
    const projectResponse=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Lifecycle corpus",readAudience:"agents_only"})}),projectId=(await projectResponse.json<any>()).project.id;
    const nativeResponse=await SELF.fetch(`${origin}/api/projects/${projectId}/native-documents`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Lifecycle document",content:"still readable",contentType:"text/plain"})}),documentId=(await nativeResponse.json<any>()).document.id;
    const credentialResponse=await SELF.fetch(`${origin}/api/projects/${projectId}/agent-credentials`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({label:"Lifecycle reader"})}),credential=await credentialResponse.json<any>(),headers={authorization:`Bearer ${credential.token}`};
    await SELF.fetch(`${origin}/api/projects/${projectId}/archive`,{method:"POST",headers:{cookie:owner.cookie,origin}});expect((await SELF.fetch(`${origin}/api/agent/documents/${documentId}`,{headers})).status).toBe(200);
    await SELF.fetch(`${origin}/api/projects/${projectId}/unarchive`,{method:"POST",headers:{cookie:owner.cookie,origin}});
    const scheduled=await SELF.fetch(`${origin}/api/projects/${projectId}/deletion`,{method:"POST",headers:{cookie:owner.cookie,origin,"content-type":"application/json"},body:JSON.stringify({title:"Lifecycle corpus"})});expect(scheduled.status).toBe(201);expect((await SELF.fetch(`${origin}/api/agent/documents/${documentId}`,{headers})).status).toBe(200);
    await env.DB.prepare(`UPDATE projects SET deletion_due_at=? WHERE id=?`).bind("2026-01-01T00:00:00.000Z",projectId).run();const {finalizeDueProjects}=await import("../src/project-deletion");await finalizeDueProjects(env,new Date("2026-01-01T00:00:00.000Z"));
    expect(await env.DB.prepare(`SELECT lifecycle_state FROM projects WHERE id=?`).bind(projectId).first()).toEqual({lifecycle_state:"shell"});expect(await env.DB.prepare(`SELECT revoked_at FROM project_machine_credentials WHERE id=?`).bind(credential.credential.id).first()).toEqual({revoked_at:"2026-01-01T00:00:00.000Z"});expect((await SELF.fetch(`${origin}/api/agent/me`,{headers})).status).toBe(401);
  });
});
