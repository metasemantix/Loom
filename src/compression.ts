import { opaque } from "./auth";
import type { Env } from "./types";

export const COMPRESSION_PROMPT_VERSION = "compression-prompt-v3";
export const COMPRESSION_FORMAT = "structured-v3";
export const COMPRESSION_SCHEMA_VERSION = 1;
export const COMPRESSION_MAX_CHARACTERS = 2000;
export const DOCUMENT_KINDS = ["design_spec","idea_collection","meeting","incident_report","reference","general"] as const;

export const COMPRESSION_PROMPT = `Create a structured semantic projection of the document below for an AI agent deciding whether to retrieve the full document.

Return valid JSON only, with exactly this universal envelope:
{"schema_version":1,"source_revision":"[source revision ID]","document_kind":"...","gist":"...","topics":["..."],"contents":{}}

Choose the best fitting document_kind from: design_spec, idea_collection, meeting, incident_report, reference, general. Do not force an ill-fitting kind; use general as the fallback.

Use a document-sensitive contents payload:
- design_spec: decisions, constraints, open_questions, and key_points arrays where useful.
- idea_collection: an items array. Preserve every independently meaningful idea as an independent object with name, kind, gist, and topics fields.
- meeting: decisions, actions, and unresolved_matters arrays where useful.
- incident_report: events, observations, interpretations, and unresolved_matters arrays where useful. Preserve source distinctions between observation and interpretation.
- reference: entities, facts, and caveats arrays where useful.
- general: a restrained source-grounded object suited to the document; do not force another kind's taxonomy.

Keep gist compact and retrieval-oriented. Topics and all contents must be grounded in the source. Compression describes what the source contains: do not add source-external inference, downstream synthesis, judgment, cross-document reasoning, mechanisms, reusable patterns, or other derived cognition.

The complete JSON, including spaces, must not exceed 2,000 characters.

DOCUMENT TITLE:
[document title]

AUTHORITATIVE SOURCE REVISION ID:
[source revision ID]

DOCUMENT:
[full document text]`;

export function compressionRequest(title:string,content:string,sourceRevisionId:string) {
  return COMPRESSION_PROMPT.replaceAll("[document title]",title).replaceAll("[source revision ID]",sourceRevisionId).replaceAll("[full document text]",content);
}

type Projection={schema_version:number;source_revision:string;document_kind:string;gist:string;topics:string[];contents:Record<string,unknown>};
export function validateCompression(value:unknown, sourceVersionId:unknown):{text:string;artifact:Projection}|{error:string}{
  if(typeof value!=="string")return {error:"compression must be a JSON string"};
  if(value.length>COMPRESSION_MAX_CHARACTERS)return {error:"compression must be null or no more than 2,000 characters"};
  let artifact:unknown;try{artifact=JSON.parse(value)}catch{return {error:"compression must be valid JSON"}}
  if(!artifact||typeof artifact!=="object"||Array.isArray(artifact))return {error:"compression must be a JSON object"};
  const a=artifact as Record<string,unknown>;
  if(a.schema_version!==COMPRESSION_SCHEMA_VERSION)return {error:"compression schema_version must be 1"};
  if(typeof a.source_revision!=="string"||!a.source_revision)return {error:"compression source_revision must be a non-empty string"};
  if(typeof sourceVersionId!=="string"||!sourceVersionId)return {error:"sourceVersionId is required when saving compression"};
  if(a.source_revision!==sourceVersionId)return {error:"compression source_revision must match sourceVersionId"};
  if(typeof a.document_kind!=="string"||!DOCUMENT_KINDS.includes(a.document_kind as typeof DOCUMENT_KINDS[number]))return {error:`compression document_kind must be one of ${DOCUMENT_KINDS.join(", ")}`};
  if(typeof a.gist!=="string"||!a.gist.trim())return {error:"compression gist must be a non-empty string"};
  if(!Array.isArray(a.topics)||a.topics.some(x=>typeof x!=="string"))return {error:"compression topics must be an array of strings"};
  if(!a.contents||typeof a.contents!=="object"||Array.isArray(a.contents))return {error:"compression contents must be an object"};
  const contents=a.contents as Record<string,unknown>;
  const arrayFields:Record<string,string[]>={
    design_spec:["decisions","constraints","open_questions","key_points"],
    meeting:["decisions","actions","unresolved_matters"],
    incident_report:["events","observations","interpretations","unresolved_matters"],
    reference:["entities","facts","caveats"]
  };
  for(const field of arrayFields[a.document_kind]??[]){
    if(field in contents&&!Array.isArray(contents[field]))return {error:`${a.document_kind} contents.${field} must be an array when present`};
  }
  if(a.document_kind==="idea_collection"){
    const items=contents.items;
    if(!Array.isArray(items))return {error:"idea_collection contents.items must be an array"};
    for(const item of items){if(!item||typeof item!=="object"||Array.isArray(item))return {error:"each idea_collection item must be an object"};const i=item as Record<string,unknown>;if(typeof i.name!=="string"||!i.name.trim()||typeof i.kind!=="string"||!i.kind.trim()||typeof i.gist!=="string"||!i.gist.trim()||!Array.isArray(i.topics)||i.topics.some(x=>typeof x!=="string"))return {error:"each idea_collection item requires non-empty string name, kind, gist, and string-array topics"}}
  }
  if(a.document_kind==="general"&&Object.keys(contents).some(key=>!key.trim()))return {error:"general contents field names must be non-empty"};
  return {text:value,artifact:a as Projection};
}

export function compressionSelect(alias="d") { return `,${alias}.current_version_id,${alias}.selected_compression_revision_id compression_revision_id,cr.source_version_id compression_source_version_id,cr.created_at compression_created_at,cr.actor_type compression_actor_type,cr.actor_id compression_actor_id,CASE WHEN cr.actor_type='human' THEN COALESCE((SELECT display_name FROM users WHERE id=cr.actor_id),(SELECT u.display_name FROM participants p JOIN users u ON u.id=p.user_id WHERE p.id=cr.actor_id),(SELECT provenance_identifier || ' (former user)' FROM participants WHERE id=cr.actor_id)) END compression_actor_display_name,cr.prompt_version compression_prompt_version,cr.artifact_format compression_format,cr.schema_version compression_schema_version,cr.artifact_json compression_artifact_json,sv.version_number compression_source_version_number,CASE WHEN cr.id IS NULL THEN 'missing' WHEN cr.source_version_id IS NULL THEN 'unknown' WHEN cr.source_version_id=${alias}.current_version_id THEN 'current' ELSE 'stale' END compression_freshness`; }
export function compressionJoins(alias="d") { return ` LEFT JOIN compression_revisions cr ON cr.id=${alias}.selected_compression_revision_id AND cr.document_id=${alias}.id LEFT JOIN document_versions sv ON sv.id=cr.source_version_id AND sv.document_id=${alias}.id`; }
export function exposeStructuredCompression(row:Record<string,unknown>):Record<string,unknown>{const {compression_artifact_json:raw,...visible}=row;return {...visible,compression_structured:raw&&row.compression_format===COMPRESSION_FORMAT?JSON.parse(String(raw)):null}}

export function saveCompressionStatements(env:Env, input:{documentId:string;text:string|null;sourceVersionId:string;actorId:string;actorType?:string;authorizeSql:string;authorizeBindings:unknown[]}) {
  const id=opaque("cmp"),now=new Date().toISOString(), text=input.text===""?null:input.text;
  if(text===null)return {id:null, statements:[env.DB.prepare(`UPDATE documents SET compression=NULL,selected_compression_revision_id=NULL WHERE id=? AND current_version_id=? AND (${input.authorizeSql})`).bind(input.documentId,input.sourceVersionId,...input.authorizeBindings)]};
  return {id,statements:[
    env.DB.prepare(`INSERT INTO compression_revisions(id,document_id,revision_number,text,source_version_id,actor_type,actor_id,created_at,prompt_version,artifact_format,schema_version,artifact_json) SELECT ?,d.id,COALESCE((SELECT MAX(revision_number)+1 FROM compression_revisions WHERE document_id=d.id),1),?,?,?,?,?,?,?,?,? FROM documents d WHERE d.id=? AND d.current_version_id=? AND EXISTS(SELECT 1 FROM document_versions v WHERE v.id=? AND v.document_id=d.id) AND (${input.authorizeSql})`).bind(id,text,input.sourceVersionId,input.actorType??"human",input.actorId,now,COMPRESSION_PROMPT_VERSION,COMPRESSION_FORMAT,COMPRESSION_SCHEMA_VERSION,text,input.documentId,input.sourceVersionId,input.sourceVersionId,...input.authorizeBindings),
    env.DB.prepare(`UPDATE documents SET compression=?,selected_compression_revision_id=? WHERE id=? AND EXISTS(SELECT 1 FROM compression_revisions WHERE id=? AND document_id=documents.id)`).bind(text,id,input.documentId,id)
  ]};
}
