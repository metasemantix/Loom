import { opaque } from "./auth";
import { json, problem, readJson } from "./http";
import type { Env, Principal } from "./types";

const CONTENT_TYPES = new Set(["text/markdown", "application/json", "text/plain"]);
const KINDS = new Set(["profile", "introduction", "document"]);
const VISIBILITIES = new Set(["private", "public"]);
export const MAX_CONTENT_BYTES = 256_000;

interface DocumentRow {
  id: string; kind: string; title: string; logical_path: string; visibility: string;
  original_filename: string | null; original_content_type: string | null;
  created_at: string; version_id: string; version_number: number; content: string;
  content_type: string; updated_at: string;
}

const currentDocuments = `
 SELECT d.id,d.kind,d.title,d.logical_path,d.visibility,d.original_filename,d.original_content_type,d.created_at,
 v.id version_id,v.version_number,v.content,v.content_type,v.created_at updated_at
 FROM documents d JOIN document_versions v ON v.id=d.current_version_id
 WHERE d.owner_type='participant' AND d.owner_id=? AND d.deleted_at IS NULL`;

function contentError(content: unknown, contentType: unknown): string | null {
  if (typeof content !== "string" || new TextEncoder().encode(content).byteLength > MAX_CONTENT_BYTES) return "content must be a string no larger than 256,000 bytes";
  if (typeof contentType !== "string" || !CONTENT_TYPES.has(contentType)) return "unsupported contentType";
  if (contentType === "application/json") try { JSON.parse(content); } catch { return "content must be valid JSON"; }
  return null;
}

function validPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 240 && value.length > 0 && value === value.trim() && !value.startsWith("/") && !value.endsWith("/") && !value.includes("//") && !value.split("/").some((part) => part === "." || part === ".." || !part);
}

export async function listDocuments(env: Env, principal: Principal): Promise<Response> {
  const rows = await env.DB.prepare(`${currentDocuments} ORDER BY d.logical_path,d.id`).bind(principal.participantId).all<DocumentRow>();
  return json({ documents: rows.results });
}

async function insertDocument(env: Env, principal: Principal, input: { title: string; kind: string; visibility: string; content: string; contentType: string; logicalPath?: string; originalFilename?: string; originalContentType?: string }): Promise<Response> {
  const error = contentError(input.content, input.contentType);
  if (error) return problem(400, "invalid_request", error);
  if (!input.title.trim() || input.title.length > 120 || !KINDS.has(input.kind) || !VISIBILITIES.has(input.visibility)) return problem(400, "invalid_request", "invalid title, kind, or visibility");
  const now = new Date().toISOString(), documentId = opaque("doc"), versionId = opaque("ver");
  const logicalPath = input.logicalPath ?? `${input.kind === "document" ? "documents" : `${input.kind}s`}/${documentId}`;
  if (!validPath(logicalPath)) return problem(400, "invalid_request", "logicalPath must be a valid relative path");
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO documents(id,owner_type,owner_id,kind,title,logical_path,current_version_id,visibility,created_at,original_filename,original_content_type) VALUES(?,'participant',?,?,?,?,?,?,?,?,?)`)
        .bind(documentId, principal.participantId, input.kind, input.title.trim(), logicalPath, versionId, input.visibility, now, input.originalFilename ?? null, input.originalContentType ?? null),
      env.DB.prepare(`INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES(?,?,1,?,?,'human',?,?)`)
        .bind(versionId, documentId, input.content, input.contentType, principal.userId, now),
    ]);
  } catch { return problem(409, "path_conflict", "That logical path is already in use"); }
  return json({ document: { id: documentId, versionId, versionNumber: 1, logicalPath } }, 201);
}

export async function createDocument(request: Request, env: Env, principal: Principal): Promise<Response> {
  let body; try { body = await readJson(request); } catch (error) { return problem(400, "invalid_request", (error as Error).message); }
  return insertDocument(env, principal, { title: String(body.title ?? ""), kind: String(body.kind ?? ""), visibility: String(body.visibility ?? ""), content: body.content as string, contentType: String(body.contentType ?? "text/markdown"), logicalPath: body.logicalPath as string | undefined });
}

export async function uploadDocument(request: Request, env: Env, principal: Principal): Promise<Response> {
  let form: FormData; try { form = await request.formData(); } catch { return problem(400, "invalid_upload", "Expected multipart form data"); }
  const file = form.get("file");
  if (!(file instanceof File)) return problem(400, "invalid_upload", "A file is required");
  if (file.size > MAX_CONTENT_BYTES) return problem(413, "file_too_large", "Files may not exceed 256,000 bytes");
  const extension = file.name.toLowerCase().match(/\.(md|txt|json)$/)?.[1];
  const contentType = extension === "md" ? "text/markdown" : extension === "txt" ? "text/plain" : extension === "json" ? "application/json" : null;
  if (!contentType) return problem(415, "unsupported_file", "Only .md, .txt, and .json files are supported");
  const content = await file.text();
  const title = String(form.get("title") || file.name.replace(/\.[^.]+$/, ""));
  const path = String(form.get("logicalPath") || `uploads/${file.name}`);
  return insertDocument(env, principal, { title, kind: "document", visibility: String(form.get("visibility") || "private"), content, contentType, logicalPath: path, originalFilename: file.name, originalContentType: file.type || contentType });
}

async function ownedDocument(env: Env, principal: Principal, id: string): Promise<{ id: string; version_number: number; title: string; logical_path: string; visibility: string } | null> {
  return env.DB.prepare(`SELECT d.id,d.title,d.logical_path,d.visibility,v.version_number FROM documents d JOIN document_versions v ON v.id=d.current_version_id WHERE d.id=? AND d.owner_type='participant' AND d.owner_id=? AND d.deleted_at IS NULL`)
    .bind(id, principal.participantId).first();
}

export async function updateDocument(request: Request, env: Env, principal: Principal, id: string): Promise<Response> {
  const document = await ownedDocument(env, principal, id); if (!document) return problem(404, "not_found", "Document not found");
  let body; try { body = await readJson(request); } catch (error) { return problem(400, "invalid_request", (error as Error).message); }
  const contentType = body.contentType ?? "text/markdown", error = contentError(body.content, contentType);
  if (error) return problem(400, "invalid_request", error);
  const versionId = opaque("ver"), now = new Date().toISOString(), next = document.version_number + 1;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES(?,?,?,?,?,'human',?,?)`).bind(versionId, id, next, body.content, contentType, principal.userId, now),
    env.DB.prepare(`UPDATE documents SET current_version_id=? WHERE id=? AND owner_id=?`).bind(versionId, id, principal.participantId),
  ]);
  return json({ document: { id, versionId, versionNumber: next } });
}

export async function updateMetadata(request: Request, env: Env, principal: Principal, id: string): Promise<Response> {
  const document = await ownedDocument(env, principal, id); if (!document) return problem(404, "not_found", "Document not found");
  let body; try { body = await readJson(request); } catch (error) { return problem(400, "invalid_request", (error as Error).message); }
  const next = { title: body.title ?? document.title, logical_path: body.logicalPath ?? document.logical_path, visibility: body.visibility ?? document.visibility };
  if (typeof next.title !== "string" || !next.title.trim() || next.title.length > 120) return problem(400, "invalid_request", "title must be between 1 and 120 characters");
  if (!validPath(next.logical_path)) return problem(400, "invalid_request", "logicalPath must be a valid relative path");
  if (typeof next.visibility !== "string" || !VISIBILITIES.has(next.visibility)) return problem(400, "invalid_request", "unsupported visibility");
  const changes: Record<string, { previous: string; new: string }> = {};
  if (next.title.trim() !== document.title) changes.title = { previous: document.title, new: next.title.trim() };
  if (next.logical_path !== document.logical_path) changes.logicalPath = { previous: document.logical_path, new: next.logical_path };
  if (next.visibility !== document.visibility) changes.visibility = { previous: document.visibility, new: next.visibility };
  if (!Object.keys(changes).length) return json({ document: { id, ...next }, changed: false });
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE documents SET title=?,logical_path=?,visibility=? WHERE id=? AND owner_id=?`).bind(next.title.trim(), next.logical_path, next.visibility, id, principal.participantId),
      env.DB.prepare(`INSERT INTO document_events(id,document_id,event_type,actor_type,actor_id,changes_json,created_at) VALUES(?,?,'metadata_changed','human',?,?,?)`).bind(opaque("evt"), id, principal.userId, JSON.stringify(changes), now),
    ]);
  } catch { return problem(409, "path_conflict", "That logical path is already in use"); }
  return json({ document: { id, title: next.title.trim(), logicalPath: next.logical_path, visibility: next.visibility }, changed: true });
}

export async function deleteDocument(env: Env, principal: Principal, id: string): Promise<Response> {
  if (!await ownedDocument(env, principal, id)) return problem(404, "not_found", "Document not found");
  await env.DB.prepare(`DELETE FROM documents WHERE id=? AND owner_id=?`).bind(id, principal.participantId).run();
  return new Response(null, { status: 204 });
}

export async function history(env: Env, principal: Principal, id: string): Promise<Response> {
  if (!await ownedDocument(env, principal, id)) return problem(404, "not_found", "Document not found");
  const versions = await env.DB.prepare(`SELECT v.id,v.version_number,v.content,v.content_type,v.actor_type,v.actor_id,CASE WHEN v.actor_type='human' THEN COALESCE(u.display_name,'Unknown person') END actor_display_name,v.created_at FROM document_versions v LEFT JOIN users u ON v.actor_type='human' AND u.id=v.actor_id WHERE v.document_id=? ORDER BY v.version_number DESC`).bind(id).all<Record<string, unknown>>();
  const events = await env.DB.prepare(`SELECT e.id,e.event_type,e.actor_type,e.actor_id,CASE WHEN e.actor_type='human' THEN COALESCE(u.display_name,'Unknown person') END actor_display_name,e.changes_json,e.created_at FROM document_events e LEFT JOIN users u ON e.actor_type='human' AND u.id=e.actor_id WHERE e.document_id=? ORDER BY e.created_at DESC,e.id DESC`).bind(id).all<Record<string, unknown>>();
  const parsedEvents = events.results.map((event) => ({ ...event, changes: JSON.parse(event.changes_json as string), changes_json: undefined }));
  const timeline: Array<Record<string, unknown> & { entry_type: string }> = [
    ...versions.results.map((version) => ({ ...version, entry_type: "content_revision" })),
    ...parsedEvents.map((event) => ({ ...event, entry_type: "metadata_event" })),
  ];
  timeline.sort((left, right) => {
    const timestamp = String(right["created_at"]).localeCompare(String(left["created_at"]));
    if (timestamp) return timestamp;
    // A stable tie-break keeps the API deterministic even at D1's timestamp precision.
    return String(right["id"]).localeCompare(String(left["id"]));
  });
  return json({ versions: versions.results, events: parsedEvents, timeline });
}

export async function context(_request: Request, env: Env, participantId: string, format: "json" | "md", principal: Principal | null): Promise<Response> {
  const participant = await env.DB.prepare(`SELECT p.id,u.display_name FROM participants p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.withdrawn_at IS NULL`).bind(participantId).first<{ id: string; display_name: string }>();
  if (!participant) return problem(404, "not_found", "Participant not found");
  const isOwner = principal?.participantId === participantId;
  const rows = await env.DB.prepare(`${currentDocuments} AND (?=1 OR d.visibility='public') ORDER BY d.logical_path,d.id`).bind(participantId, isOwner ? 1 : 0).all<DocumentRow>();
  // Visibility is mutable, so projections must not remain anonymously readable from a stale cache.
  const headers = { "cache-control": isOwner ? "private, no-store" : "public, no-cache, must-revalidate" };
  if (format === "json") return json({ schemaVersion: 1, participant: { id: participant.id, displayName: participant.display_name }, documents: rows.results }, 200, headers);
  const rendered = [`# ${participant.display_name}`, `Participant: ${participant.id}`, ""];
  for (const row of rows.results) rendered.push(`## ${row.title}`, `Document: ${row.id}`, `Path: ${row.logical_path}`, `Kind: ${row.kind}`, `Content-Type: ${row.content_type}`, `Updated: ${row.updated_at}`, "", row.content, "");
  return new Response(rendered.join("\n"), { headers: { "content-type": "text/markdown; charset=utf-8", ...headers } });
}
