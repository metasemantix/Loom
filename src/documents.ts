import { opaque } from "./auth";
import { json, problem, readJson } from "./http";
import type { Env, Principal } from "./types";

const CONTENT_TYPES = new Set(["text/markdown", "application/json", "text/plain"]);
const KINDS = new Set(["profile", "introduction", "document"]);
const VISIBILITIES = new Set(["private", "public"]);
const MAX_CONTENT = 256_000;

interface DocumentRow {
  id: string; kind: string; title: string; logical_path: string; visibility: string;
  created_at: string; version_id: string; version_number: number; content: string;
  content_type: string; updated_at: string;
}

const currentDocuments = `
 SELECT d.id,d.kind,d.title,d.logical_path,d.visibility,d.created_at,
 v.id version_id,v.version_number,v.content,v.content_type,v.created_at updated_at
 FROM documents d JOIN document_versions v ON v.id=d.current_version_id
 WHERE d.owner_type='participant' AND d.owner_id=? AND d.deleted_at IS NULL`;

function validate(body: Record<string, unknown>, creating: boolean): { title?: string; kind?: string; visibility?: string; content: string; contentType: string } | string {
  const content = body.content;
  const contentType = body.contentType ?? "text/markdown";
  if (typeof content !== "string" || content.length > MAX_CONTENT) return "content must be a string no larger than 256,000 characters";
  if (typeof contentType !== "string" || !CONTENT_TYPES.has(contentType)) return "unsupported contentType";
  if (contentType === "application/json") try { JSON.parse(content); } catch { return "content must be valid JSON"; }
  if (creating) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 120) return "title is required and must be at most 120 characters";
    if (typeof body.kind !== "string" || !KINDS.has(body.kind)) return "unsupported kind";
    if (typeof body.visibility !== "string" || !VISIBILITIES.has(body.visibility)) return "unsupported visibility";
  }
  return { content, contentType, title: body.title as string | undefined, kind: body.kind as string | undefined, visibility: body.visibility as string | undefined };
}

export async function listDocuments(env: Env, principal: Principal): Promise<Response> {
  const rows = await env.DB.prepare(`${currentDocuments} ORDER BY d.created_at,d.id`).bind(principal.participantId).all<DocumentRow>();
  return json({ documents: rows.results });
}

export async function createDocument(request: Request, env: Env, principal: Principal): Promise<Response> {
  let body; try { body = await readJson(request); } catch (error) { return problem(400, "invalid_request", (error as Error).message); }
  const input = validate(body, true); if (typeof input === "string") return problem(400, "invalid_request", input);
  const now = new Date().toISOString(), documentId = opaque("doc"), versionId = opaque("ver");
  const logicalPath = `${input.kind === "document" ? "documents" : `${input.kind}s`}/${documentId}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO documents(id,owner_type,owner_id,kind,title,logical_path,current_version_id,visibility,created_at) VALUES(?,'participant',?,?,?,?,?,?,?)`)
      .bind(documentId, principal.participantId, input.kind, input.title!.trim(), logicalPath, versionId, input.visibility, now),
    env.DB.prepare(`INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES(?,?,1,?,?,'human',?,?)`)
      .bind(versionId, documentId, input.content, input.contentType, principal.userId, now),
  ]);
  return json({ document: { id: documentId, versionId, versionNumber: 1, logicalPath } }, 201);
}

async function ownedDocument(env: Env, principal: Principal, id: string): Promise<{ id: string; version_number: number } | null> {
  return env.DB.prepare(`SELECT d.id,v.version_number FROM documents d JOIN document_versions v ON v.id=d.current_version_id WHERE d.id=? AND d.owner_type='participant' AND d.owner_id=? AND d.deleted_at IS NULL`)
    .bind(id, principal.participantId).first<{ id: string; version_number: number }>();
}

export async function updateDocument(request: Request, env: Env, principal: Principal, id: string): Promise<Response> {
  const document = await ownedDocument(env, principal, id); if (!document) return problem(404, "not_found", "Document not found");
  let body; try { body = await readJson(request); } catch (error) { return problem(400, "invalid_request", (error as Error).message); }
  const input = validate(body, false); if (typeof input === "string") return problem(400, "invalid_request", input);
  const versionId = opaque("ver"), now = new Date().toISOString(), next = document.version_number + 1;
  const result = await env.DB.batch([
    env.DB.prepare(`INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES(?,?,?,?,?,'human',?,?)`)
      .bind(versionId, id, next, input.content, input.contentType, principal.userId, now),
    env.DB.prepare(`UPDATE documents SET current_version_id=? WHERE id=? AND owner_id=?`).bind(versionId, id, principal.participantId),
  ]);
  if (!result.every((entry) => entry.success)) return problem(409, "write_conflict", "Document could not be updated");
  return json({ document: { id, versionId, versionNumber: next } });
}

export async function deleteDocument(env: Env, principal: Principal, id: string): Promise<Response> {
  const document = await ownedDocument(env, principal, id); if (!document) return problem(404, "not_found", "Document not found");
  // Hard deletion intentionally removes revision content as required for participant-controlled erasure.
  await env.DB.prepare(`DELETE FROM documents WHERE id=? AND owner_id=?`).bind(id, principal.participantId).run();
  return new Response(null, { status: 204 });
}

export async function history(env: Env, principal: Principal, id: string): Promise<Response> {
  const document = await ownedDocument(env, principal, id); if (!document) return problem(404, "not_found", "Document not found");
  const rows = await env.DB.prepare(`
    SELECT v.id,v.version_number,v.content,v.content_type,v.actor_type,v.actor_id,
      CASE WHEN v.actor_type='human' THEN COALESCE(u.display_name, 'Unknown person') END actor_display_name,
      v.created_at
    FROM document_versions v
    LEFT JOIN users u ON v.actor_type='human' AND u.id=v.actor_id
    WHERE v.document_id=?
    ORDER BY v.version_number DESC
  `).bind(id).all();
  return json({ versions: rows.results });
}

export async function context(request: Request, env: Env, participantId: string, format: "json" | "md", principal: Principal | null): Promise<Response> {
  const participant = await env.DB.prepare(`SELECT p.id,u.display_name FROM participants p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.withdrawn_at IS NULL`).bind(participantId).first<{ id: string; display_name: string }>();
  if (!participant) return problem(404, "not_found", "Participant not found");
  const isOwner = principal?.participantId === participantId;
  const rows = await env.DB.prepare(`${currentDocuments} AND (?=1 OR d.visibility='public') ORDER BY d.logical_path,d.id`).bind(participantId, isOwner ? 1 : 0).all<DocumentRow>();
  if (format === "json") return json({ schemaVersion: 1, participant: { id: participant.id, displayName: participant.display_name }, documents: rows.results }, 200, { "cache-control": isOwner ? "private, no-store" : "public, max-age=60" });
  const rendered = [`# ${participant.display_name}`, `Participant: ${participant.id}`, ""];
  for (const row of rows.results) rendered.push(`## ${row.title}`, `Document: ${row.id}`, `Kind: ${row.kind}`, `Content-Type: ${row.content_type}`, `Updated: ${row.updated_at}`, "", row.content, "");
  return new Response(rendered.join("\n"), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": isOwner ? "private, no-store" : "public, max-age=60" } });
}
