import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const origin = "http://example.com";

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function participant(suffix: string): Promise<{ id: string; userId: string; cookie: string }> {
  const now = new Date().toISOString(), user = `usr_${suffix}`, id = `par_${suffix}`, token = `session-${suffix}`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)").bind(user, `User ${suffix}`, now),
    env.DB.prepare("INSERT INTO participants(id,user_id,public_slug,created_at) VALUES(?,?,?,?)").bind(id, user, id, now),
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
  await env.DB.exec("DELETE FROM project_documents; DELETE FROM project_members; DELETE FROM projects; DELETE FROM sessions; DELETE FROM document_events; DELETE FROM document_versions; DELETE FROM documents; DELETE FROM participants; DELETE FROM auth_identities; DELETE FROM users;");
});

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
    expect(after.participant).toEqual({id:before.participant.id,displayName:"Alice Loom",lookupId:before.participant.lookupId});
    expect((await SELF.fetch(`${origin}/participants/${alice.id}/context.json`)).json().then((j:any)=>j.participant.displayName)).resolves.toBe("Alice Loom");
    await SELF.fetch(`${origin}/api/me/profile`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({displayName:"Bob Loom"})});
    const history=await SELF.fetch(`${origin}/api/me/documents/${id}/versions`,{headers:{cookie:alice.cookie}}).then(r=>r.json<any>());expect(history.versions[0]).toMatchObject({actor_id:alice.userId,actor_display_name:"Alice Loom"});
  });
});

describe("project link corpora", () => {
  it("supports membership and policy reads without transferring document authority", async () => {
    const alice=await participant("alice"),bob=await participant("bob"),documentId=await create(alice.cookie,"private");
    const created=await SELF.fetch(`${origin}/api/projects`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({name:"Shared",readAudience:"members_and_agents"})});expect(created.status).toBe(201);const projectId=(await created.json<{project:{id:string}}>()).project.id;
    expect((await SELF.fetch(`${origin}/api/projects/${projectId}/members`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({participantId:bob.id})})).status).toBe(201);
    expect((await SELF.fetch(`${origin}/api/projects/${projectId}/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId})})).status).toBe(201);
    const view=await SELF.fetch(`${origin}/api/projects/${projectId}`,{headers:{cookie:bob.cookie}}).then(r=>r.json<{documents:Array<{id:string;owner_participant_id:string}>}>());expect(view.documents[0]).toMatchObject({id:documentId,owner_participant_id:alice.id});
    expect((await SELF.fetch(`${origin}/api/me/documents/${documentId}`,{method:"DELETE",headers:{cookie:bob.cookie,origin}})).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/me/documents/${documentId}`,{method:"PUT",headers:{cookie:bob.cookie,origin,"content-type":"application/json"},body:JSON.stringify({content:"steal",contentType:"text/plain"})})).status).toBe(404);
    expect((await SELF.fetch(`${origin}/api/projects/${projectId}/documents/${documentId}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}})).status).toBe(204);
    expect((await SELF.fetch(`${origin}/api/me/documents`,{headers:{cookie:alice.cookie}}).then(r=>r.json<{documents:unknown[]}>())).documents).toHaveLength(1);
    await SELF.fetch(`${origin}/api/projects/${projectId}/documents`,{method:"POST",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({documentId})});
    await SELF.fetch(`${origin}/api/projects/${projectId}`,{method:"PUT",headers:{cookie:alice.cookie,origin,"content-type":"application/json"},body:JSON.stringify({readAudience:"agents_only"})});
    const hidden=await SELF.fetch(`${origin}/api/projects/${projectId}`,{headers:{cookie:bob.cookie}}).then(r=>r.json<{documents:unknown[];documentsHiddenFromHumans:boolean}>());expect(hidden).toMatchObject({documents:[],documentsHiddenFromHumans:true});
    await SELF.fetch(`${origin}/api/me/documents/${documentId}`,{method:"DELETE",headers:{cookie:alice.cookie,origin}});expect((await env.DB.prepare(`SELECT count(*) count FROM project_documents WHERE document_id=?`).bind(documentId).first<{count:number}>())!.count).toBe(0);
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
  it("exposes document metadata and the existing edit, history, and confirmed-delete capabilities", async () => {
    const alice = await participant("alice");
    const response = await SELF.fetch(`${origin}/me`, { headers: { cookie: alice.cookie } });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("Kind: ");
    expect(html).toContain("Visibility: ");
    expect(html).toContain("Save revision");
    expect(html).toContain("Revision history");
    expect(html).toContain("close=button('Close',()=>panel.replaceChildren())");
    expect(html).toContain("By '+revisionAuthor(v)+' · ");
    expect(html).toContain("Unknown person");
    expect(html).toContain("Agent '+v.actor_id");
    expect(html).toContain("return 'System'");
    expect(html).toContain("This cannot be undone.");
    expect(html).toContain("method:'PUT'");
    expect(html).toContain("method:'DELETE'");
    expect(html).toContain('href="/api/me/export"');
  });

  it("redirects a 127.0.0.1 OAuth start to the configured canonical localhost origin", async () => {
    const response = await SELF.fetch("http://127.0.0.1:8787/auth/discord", { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:8787/auth/discord");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
