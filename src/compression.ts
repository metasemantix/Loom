import { opaque } from "./auth";
import type { Env } from "./types";

export const COMPRESSION_PROMPT_VERSION = "compression-prompt-v2";
export const COMPRESSION_PROMPT = `Create a concise semantic compression of the document below for an AI agent that must decide whether the full document is relevant.

Preserve:
- the document’s main subject and purpose;
- important entities, concepts, decisions, constraints, and unresolved questions;
- distinctions or caveats that materially affect interpretation.

Do not:
- add information not present in the document;
- turn it into a generic summary or prose introduction;
- omit important limitations merely to make it shorter.

Write compact factual prose intended for retrieval and triage, not for a human-facing abstract.

The compression must not exceed 2,000 characters, including spaces.

Return only the compression text, with no heading, commentary, or explanation.

DOCUMENT TITLE:
[document title]

DOCUMENT:
[full document text]`;

export function compressionRequest(title:string,content:string) {
  return COMPRESSION_PROMPT.replace("[document title]",title).replace("[full document text]",content);
}

export function compressionSelect(alias="d") { return `,${alias}.current_version_id,${alias}.selected_compression_revision_id compression_revision_id,cr.source_version_id compression_source_version_id,cr.created_at compression_created_at,cr.actor_type compression_actor_type,cr.actor_id compression_actor_id,CASE WHEN cr.actor_type='human' THEN COALESCE((SELECT display_name FROM users WHERE id=cr.actor_id),(SELECT u.display_name FROM participants p JOIN users u ON u.id=p.user_id WHERE p.id=cr.actor_id),(SELECT provenance_identifier || ' (former user)' FROM participants WHERE id=cr.actor_id)) END compression_actor_display_name,cr.prompt_version compression_prompt_version,sv.version_number compression_source_version_number,CASE WHEN cr.id IS NULL THEN 'missing' WHEN cr.source_version_id IS NULL THEN 'unknown' WHEN cr.source_version_id=${alias}.current_version_id THEN 'current' ELSE 'stale' END compression_freshness`; }
export function compressionJoins(alias="d") { return ` LEFT JOIN compression_revisions cr ON cr.id=${alias}.selected_compression_revision_id AND cr.document_id=${alias}.id LEFT JOIN document_versions sv ON sv.id=cr.source_version_id AND sv.document_id=${alias}.id`; }

export function saveCompressionStatements(env:Env, input:{documentId:string;text:string|null;sourceVersionId:string;actorId:string;actorType?:string;authorizeSql:string;authorizeBindings:unknown[]}) {
  const id=opaque("cmp"),now=new Date().toISOString(), text=input.text===""?null:input.text;
  if(text===null)return {id:null, statements:[env.DB.prepare(`UPDATE documents SET compression=NULL,selected_compression_revision_id=NULL WHERE id=? AND current_version_id=? AND (${input.authorizeSql})`).bind(input.documentId,input.sourceVersionId,...input.authorizeBindings)]};
  return {id,statements:[
    env.DB.prepare(`INSERT INTO compression_revisions(id,document_id,revision_number,text,source_version_id,actor_type,actor_id,created_at,prompt_version) SELECT ?,d.id,COALESCE((SELECT MAX(revision_number)+1 FROM compression_revisions WHERE document_id=d.id),1),?,? ,?,?,?,? FROM documents d WHERE d.id=? AND d.current_version_id=? AND EXISTS(SELECT 1 FROM document_versions v WHERE v.id=? AND v.document_id=d.id) AND (${input.authorizeSql})`).bind(id,text,input.sourceVersionId,input.actorType??"human",input.actorId,now,COMPRESSION_PROMPT_VERSION,input.documentId,input.sourceVersionId,input.sourceVersionId,...input.authorizeBindings),
    env.DB.prepare(`UPDATE documents SET compression=?,selected_compression_revision_id=? WHERE id=? AND EXISTS(SELECT 1 FROM compression_revisions WHERE id=? AND document_id=documents.id)`).bind(text,id,input.documentId,id)
  ]};
}
