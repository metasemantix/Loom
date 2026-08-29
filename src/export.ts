import type { Env, Principal } from "./types";
import { problem } from "./http";

interface ExportRow {
  document_id: string;
  kind: string;
  title: string;
  logical_path: string;
  visibility: string;
  original_filename: string | null;
  original_content_type: string | null;
  document_created_at: string;
  current_version_id: string;
  version_id: string;
  version_number: number;
  content: string;
  content_type: string;
  actor_type: string;
  actor_id: string | null;
  actor_display_name: string | null;
  version_created_at: string;
}

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

/** A deliberately small, uncompressed ZIP writer: portable and dependency-free. */
export function zip(files: Array<{ name: string; content: string }>): Uint8Array {
  const localParts: Uint8Array[] = [], centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), data = encoder.encode(file.content), crc = crc32(data);
    const local = concat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
    localParts.push(local);
    centralParts.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += local.length;
  }
  const central = concat(centralParts);
  return concat([...localParts, central, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0)]);
}

export async function exportProject(env:Env,principal:Principal,projectId:string):Promise<Response>{
  const project=await env.DB.prepare(`SELECT x.id,x.name,x.description,x.read_audience,x.lifecycle_state FROM projects x JOIN project_members m ON m.project_id=x.id WHERE x.id=? AND m.participant_id=?`).bind(projectId,principal.participantId).first<Record<string,string>>();
  if(!project)return problem(404,"not_found","Project not found");
  const rows=await env.DB.prepare(`SELECT d.id,d.title,d.logical_path,d.created_at,d.created_by_participant_id,d.source_document_id,v.id version_id,v.version_number,v.content,v.content_type,v.actor_id,v.created_at version_created_at FROM documents d JOIN document_versions v ON v.document_id=d.id WHERE d.owner_type='project' AND d.owner_id=? AND d.deleted_at IS NULL ORDER BY d.logical_path,d.id,v.version_number`).bind(projectId).all<Record<string,string|number|null>>();
  const files:Array<{name:string;content:string}>=[],documents=new Map<string,Array<Record<string,string|number|null>>>();for(const row of rows.results){const list=documents.get(row.id as string)??[];list.push(row);documents.set(row.id as string,list)}
  const manifest={schemaVersion:1,exportedAt:new Date().toISOString(),project,documents:[...documents.values()].map(revisions=>{const first=revisions[0],current=revisions[revisions.length-1],directory=`documents/${first.id}`;for(const revision of revisions)files.push({name:`${directory}/revisions/${String(revision.version_number).padStart(6,"0")}.${extension(revision.content_type as string)}`,content:revision.content as string});files.push({name:`${directory}/current.${extension(current.content_type as string)}`,content:current.content as string});return{id:first.id,title:first.title,logicalPath:first.logical_path,createdAt:first.created_at,createdBy:first.created_by_participant_id,sourceDocumentId:first.source_document_id,currentVersion:current.version_number,revisions:revisions.map(r=>({id:r.version_id,number:r.version_number,actorParticipantId:r.actor_id,createdAt:r.version_created_at}))}})};
  files.unshift({name:"manifest.json",content:JSON.stringify(manifest,null,2)+"\n"});const body=zip(files);return new Response(body.buffer as ArrayBuffer,{headers:{"content-type":"application/zip","content-disposition":`attachment; filename="loom-project-${projectId}.zip"`,"cache-control":"private, no-store","x-content-type-options":"nosniff"}})
}

function extension(contentType: string): string {
  if (contentType === "text/markdown") return "md";
  if (contentType === "application/json") return "json";
  return "txt";
}

export async function exportSpace(env: Env, principal: Principal): Promise<Response> {
  const account=await env.DB.prepare(`SELECT account_state,deletion_due_at FROM participants WHERE id=?`).bind(principal.participantId).first<{account_state:string;deletion_due_at:string|null}>();
  if(!account||account.account_state==='deleted'||account.account_state==='deletion_pending'&&!!account.deletion_due_at&&account.deletion_due_at<=new Date().toISOString())return problem(410,"account_deletion_due","The account deletion deadline has passed");
  const result = await env.DB.prepare(`
    SELECT d.id document_id,d.kind,d.title,d.logical_path,d.visibility,d.original_filename,d.original_content_type,d.created_at document_created_at,
      d.current_version_id,v.id version_id,v.version_number,v.content,v.content_type,
      v.actor_type,v.actor_id,
      CASE WHEN v.actor_type='human' THEN COALESCE(u.display_name, 'Unknown person') END actor_display_name,
      v.created_at version_created_at
    FROM documents d
    JOIN document_versions v ON v.document_id=d.id
    LEFT JOIN users u ON v.actor_type='human' AND u.id=v.actor_id
    WHERE d.owner_type='participant' AND d.owner_id=? AND d.deleted_at IS NULL
    ORDER BY d.logical_path,d.id,v.version_number
  `).bind(principal.participantId).all<ExportRow>();

  const documents = new Map<string, ExportRow[]>();
  for (const row of result.results) {
    const revisions = documents.get(row.document_id) ?? [];
    revisions.push(row);
    documents.set(row.document_id, revisions);
  }

  const files: Array<{ name: string; content: string }> = [];
  const eventRows = await env.DB.prepare(`SELECT e.id,e.document_id,e.event_type,e.actor_type,e.actor_id,CASE WHEN e.actor_type='human' THEN COALESCE(u.display_name,'Unknown person') END actor_display_name,e.changes_json,e.created_at FROM document_events e JOIN documents d ON d.id=e.document_id LEFT JOIN users u ON e.actor_type='human' AND u.id=e.actor_id WHERE d.owner_type='participant' AND d.owner_id=? ORDER BY e.created_at,e.id`).bind(principal.participantId).all<Record<string, string | null>>();
  const manifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    participant: { id: principal.participantId, displayName: principal.displayName },
    documents: [...documents.values()].map((revisions) => {
      const first = revisions[0], current = revisions.find((revision) => revision.version_id === first.current_version_id)!;
      const directory = `documents/${first.document_id}`;
      for (const revision of revisions) files.push({ name: `${directory}/revisions/${String(revision.version_number).padStart(6, "0")}.${extension(revision.content_type)}`, content: revision.content });
      files.push({ name: `${directory}/current.${extension(current.content_type)}`, content: current.content });
      return {
        id: first.document_id,
        title: first.title,
        kind: first.kind,
        logicalPath: first.logical_path,
        visibility: first.visibility,
        originalFile: first.original_filename ? { filename: first.original_filename, contentType: first.original_content_type } : null,
        contentType: current.content_type,
        createdAt: first.document_created_at,
        currentVersion: { id: current.version_id, number: current.version_number, createdAt: current.version_created_at, contentType: current.content_type, file: `${directory}/current.${extension(current.content_type)}` },
        revisions: revisions.map((revision) => ({
          id: revision.version_id,
          versionNumber: revision.version_number,
          timestamp: revision.version_created_at,
          contentType: revision.content_type,
          actor: { type: revision.actor_type, id: revision.actor_id, displayName: revision.actor_display_name },
          file: `${directory}/revisions/${String(revision.version_number).padStart(6, "0")}.${extension(revision.content_type)}`,
          content: revision.content,
        })),
        events: eventRows.results.filter((event) => event.document_id === first.document_id).map((event) => ({ id: event.id, type: event.event_type, timestamp: event.created_at, actor: { type: event.actor_type, id: event.actor_id, displayName: event.actor_display_name }, changes: JSON.parse(event.changes_json!) })),
      };
    }),
  };
  files.unshift({ name: "manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` });
  const body = zip(files);
  return new Response(body.buffer as ArrayBuffer, { headers: {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="loom-space-${principal.participantId}.zip"`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  } });
}
