import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const origin = "http://example.com";

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function participant(suffix: string): Promise<{ id: string; cookie: string }> {
  const now = new Date().toISOString(), user = `usr_${suffix}`, id = `par_${suffix}`, token = `session-${suffix}`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)").bind(user, `User ${suffix}`, now),
    env.DB.prepare("INSERT INTO participants(id,user_id,public_slug,created_at) VALUES(?,?,?,?)").bind(id, user, id, now),
    env.DB.prepare("INSERT INTO sessions(id,user_id,secret_hash,expires_at,created_at) VALUES(?,?,?,?,?)").bind(`sid_${suffix}`, user, await sha256(token), new Date(Date.now() + 60_000).toISOString(), now),
  ]);
  return { id, cookie: `loom_session=${token}` };
}

async function create(cookie: string, visibility = "private"): Promise<string> {
  const response = await SELF.fetch(`${origin}/api/me/documents`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ title: "Notes", kind: "document", visibility, content: "first", contentType: "text/markdown" }) });
  expect(response.status).toBe(201);
  return (await response.json<{ document: { id: string } }>()).document.id;
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM sessions; DELETE FROM document_versions; DELETE FROM documents; DELETE FROM participants; DELETE FROM auth_identities; DELETE FROM users;");
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
