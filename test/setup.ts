import { env } from "cloudflare:workers";
import migration from "../migrations/0001_initial.sql?raw";
import productSlice from "../migrations/0002_product_slice.sql?raw";
import humanProjects from "../migrations/0003_human_projects.sql?raw";
import projectLifecycle from "../migrations/0004_project_lifecycle.sql?raw";
import accountLifecycle from "../migrations/0005_account_lifecycle.sql?raw";
import minimalTombstones from "../migrations/0006_minimal_participant_tombstones.sql?raw";
import projectNativeDocuments from "../migrations/0007_project_native_documents.sql?raw";
import projectDeletion from "../migrations/0008_scheduled_project_deletion.sql?raw";
import agentReadAccess from "../migrations/0009_agent_read_access.sql?raw";
import agentCheckins from "../migrations/0010_agent_checkins.sql?raw";
import compressionRevisions from "../migrations/0011_compression_revisions.sql?raw";
import structuredCompression from "../migrations/0012_structured_compression_v3.sql?raw";
import expandedCompressionSize from "../migrations/0013_expand_compression_size.sql?raw";
import agentGetCapabilityExperiment from "../migrations/0014_agent_get_capability_experiment.sql?raw";
import agentLabKeyboard from "../migrations/0015_agent_lab_keyboard.sql?raw";
import agentLabKeyboardContinuity from "../migrations/0016_agent_lab_keyboard_continuity.sql?raw";
import agentLabAuthorReentry from "../migrations/0017_agent_lab_author_reentry.sql?raw";
import agentLabKeyboardThreads from "../migrations/0018_agent_lab_keyboard_threads.sql?raw";

function statements(sql:string){const result:string[]=[],lines:string[]=[],flush=()=>{const value=lines.join("\n").trim().replace(/;$/,"");lines.length=0;if(value)result.push(value)};let trigger=false;for(const line of sql.split("\n")){if(/^CREATE TRIGGER\b/.test(line.trim()))trigger=true;lines.push(line);if(trigger?/^END;$/.test(line.trim()):line.trim().endsWith(";")){flush();trigger=false}}flush();return result}
async function apply(sql:string){for(const statement of statements(sql))await env.DB.prepare(statement).run()}
for(const sql of [migration,productSlice,humanProjects,projectLifecycle,accountLifecycle,minimalTombstones])await apply(sql);

// Exercise 0007 as an upgrade, not merely as part of an empty initialization.
const at="2026-01-01T00:00:00.000Z";
await env.DB.batch([
  env.DB.prepare(`INSERT INTO users(id,display_name,created_at) VALUES('usr_migration','Migration User',?)`).bind(at),
  env.DB.prepare(`INSERT INTO participants(id,user_id,public_slug,created_at,provenance_identifier) VALUES('par_migration','usr_migration','par_migration',?,'migration-user')`).bind(at),
  env.DB.prepare(`INSERT INTO projects(id,name,created_by_participant_id,read_audience,created_at,description) VALUES('prj_migration','Migration Project','par_migration','members_and_agents',?,'')`).bind(at),
  env.DB.prepare(`INSERT INTO project_members(project_id,participant_id,role,joined_at) VALUES('prj_migration','par_migration','owner',?)`).bind(at),
  env.DB.prepare(`INSERT INTO documents(id,owner_type,owner_id,kind,title,logical_path,current_version_id,visibility,created_at) VALUES('doc_migration','participant','par_migration','document','Existing document','existing.md','ver_migration_2','private',?)`).bind(at),
  env.DB.prepare(`INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES('ver_migration_1','doc_migration',1,'first revision','text/markdown','human','usr_migration',?)`).bind(at),
  env.DB.prepare(`INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES('ver_migration_2','doc_migration',2,'second revision','text/plain','human','usr_migration',?)`).bind(at),
  env.DB.prepare(`INSERT INTO document_events(id,document_id,event_type,actor_type,actor_id,changes_json,created_at) VALUES('dev_migration','doc_migration','metadata_changed','human','usr_migration','{}',?)`).bind(at),
  env.DB.prepare(`INSERT INTO project_documents(project_id,document_id,source_owner_participant_id,added_by_participant_id,added_at,state,tombstone_title) VALUES('prj_migration','doc_migration','par_migration','par_migration',?,'active','Existing document')`).bind(at),
]);
const snapshot=async()=>({
  document:await env.DB.prepare(`SELECT id,owner_type,owner_id,current_version_id,visibility FROM documents WHERE id='doc_migration'`).first(),
  versions:(await env.DB.prepare(`SELECT id,version_number,content FROM document_versions WHERE document_id='doc_migration' ORDER BY version_number`).all()).results,
  event:await env.DB.prepare(`SELECT id,document_id,event_type,changes_json FROM document_events WHERE id='dev_migration'`).first(),
  contribution:await env.DB.prepare(`SELECT project_id,document_id,source_owner_participant_id,state FROM project_documents WHERE project_id='prj_migration' AND document_id='doc_migration'`).first(),
  membership:await env.DB.prepare(`SELECT project_id,participant_id,role,joined_at FROM project_members WHERE project_id='prj_migration' AND participant_id='par_migration'`).first(),
});
const before=await snapshot();
await apply(projectNativeDocuments);
const after=await snapshot();
await apply(projectDeletion);
const afterProjectDeletionMigration=await snapshot();
await apply(agentReadAccess);
await env.DB.prepare(`INSERT INTO project_machine_credentials(id,project_id,authorized_by_participant_id,label,token_hash,fingerprint,created_at) VALUES('mac_migration','prj_migration','par_migration','Existing reader','migration-hash','migration-fp',?)`).bind(at).run();
await apply(agentCheckins);
const migratedCredential=await env.DB.prepare(`SELECT id,checkin_enabled FROM project_machine_credentials WHERE id='mac_migration'`).first();
// Exercise both compression migrations in historical order against populated data.
await env.DB.prepare(`UPDATE documents SET compression='Historical prose compression' WHERE id='doc_migration'`).run();
await apply(compressionRevisions);
const migratedProseCompression=await env.DB.prepare(`SELECT id,text,source_version_id,actor_type,actor_id,created_at,prompt_version,migrated_at FROM compression_revisions WHERE document_id='doc_migration'`).first();
await apply(structuredCompression);
const migratedStructuredColumns=await env.DB.prepare(`SELECT text,prompt_version,artifact_format,schema_version,artifact_json FROM compression_revisions WHERE document_id='doc_migration'`).first();
const structuredArtifact=JSON.stringify({schema_version:1,source_revision:"ver_migration_2",document_kind:"idea_collection",gist:"A heterogeneous set of independently useful migration ideas.",topics:["migration","retrieval"],contents:{items:[{name:"Constraint-preserving rebuild",kind:"database migration",gist:"Rebuilds a constrained SQLite table while preserving identity and provenance.",topics:["sqlite","constraints"]},{name:"Structured retrieval",kind:"semantic projection",gist:"Keeps independent ideas discoverable in a structured artifact.",topics:["compression","retrieval"]}]}});
await env.DB.prepare(`INSERT INTO compression_revisions(id,document_id,revision_number,text,source_version_id,actor_type,actor_id,created_at,prompt_version,migrated_at,artifact_format,schema_version,artifact_json) VALUES('cmp_structured_migration','doc_migration',2,?,'ver_migration_2','human','usr_migration',?,'compression-prompt-v3',NULL,'structured-v3',1,?)`).bind(structuredArtifact,at,structuredArtifact).run();
await env.DB.prepare(`UPDATE documents SET compression=?,selected_compression_revision_id='cmp_structured_migration' WHERE id='doc_migration'`).bind(structuredArtifact).run();
const compressionRowsBeforeExpansion=(await env.DB.prepare(`SELECT * FROM compression_revisions WHERE document_id='doc_migration' ORDER BY revision_number`).all()).results;
await apply(expandedCompressionSize);
const compressionRowsAfterExpansion=(await env.DB.prepare(`SELECT * FROM compression_revisions WHERE document_id='doc_migration' ORDER BY revision_number`).all()).results;
const selectedCompressionAfterExpansion=await env.DB.prepare(`SELECT selected_compression_revision_id FROM documents WHERE id='doc_migration'`).first();
await apply(agentGetCapabilityExperiment);
// Exercise 0015 as an upgrade from a populated database through 0014.
await env.DB.batch([
  env.DB.prepare(`INSERT INTO agent_lab_chains(id,created_at) VALUES('alc_migration',?)`).bind(at),
  env.DB.prepare(`INSERT INTO agent_lab_capabilities(id,chain_id,token_hash,expected_operation,created_at,expires_at) VALUES('acp_migration','alc_migration','migration-lab-hash','write',?,'2027-01-01T00:00:00.000Z')`).bind(at),
]);
await apply(agentLabKeyboard);
// Exercise 0016 against populated 0015 keyboard state, including consumed rows and telemetry.
await env.DB.batch([
  env.DB.prepare(`INSERT INTO agent_lab_keyboard_chains(id,created_at) VALUES('akc_migration',?)`).bind(at),
  env.DB.prepare(`INSERT INTO agent_lab_keyboard_messages(id,chain_id,value,symbol_count,completed_at,created_at) VALUES('akm_migration','akc_migration','old',3,?,?)`).bind(at,at),
  env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,token_hash,expected_operation,created_at,expires_at,consumed_at,consumption_id) VALUES('akp_migration','akc_migration','akm_migration','keyboard-migration-hash','read',?,'2027-01-01T00:00:00.000Z',?,'aku_migration')`).bind(at,at),
  env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) VALUES('ake_migration','akc_migration','akm_migration','akp_migration','read','allowed',3,?)`).bind(at),
]);
const keyboardBefore={
  chain:await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_chains WHERE id='akc_migration'`).first(),
  message:await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_messages WHERE id='akm_migration'`).first(),
  capability:await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_capabilities WHERE id='akp_migration'`).first(),
  event:await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_events WHERE id='ake_migration'`).first(),
};
await apply(agentLabKeyboardContinuity);
const keyboardAfter={
  chain:await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_chains WHERE id='akc_migration'`).first(),
  message:await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_messages WHERE id='akm_migration'`).first(),
  capability:await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_capabilities WHERE id='akp_migration'`).first(),
  event:await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_events WHERE id='ake_migration'`).first(),
};
// Exercise 0017 against real 0016 multi-message history.
await env.DB.batch([
  env.DB.prepare(`INSERT INTO agent_lab_keyboard_messages(id,chain_id,message_index,value,symbol_count,completed_at,created_at) VALUES('akm_migration_2','akc_migration',2,'later',5,?,?)`).bind(at,at),
  env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,predecessor_capability_id,token_hash,expected_operation,created_at,expires_at) VALUES('akp_migration_2','akc_migration','akm_migration_2','akp_migration','keyboard-migration-hash-2','choose',?,'2027-01-01T00:00:00.000Z')`).bind(at),
  env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) VALUES('ake_migration_2','akc_migration','akm_migration_2','akp_migration_2','continue','allowed',0,?)`).bind(at),
  env.DB.prepare(`INSERT INTO agent_lab_keyboard_chains(id,created_at) VALUES('akc_migration_single',?)`).bind(at),
  env.DB.prepare(`INSERT INTO agent_lab_keyboard_messages(id,chain_id,message_index,value,symbol_count,completed_at,created_at) VALUES('akm_migration_single','akc_migration_single',1,'solo',4,?,?)`).bind(at,at),
]);
await apply(agentLabAuthorReentry);
const keyboardAuthorMigration={
  messages:(await env.DB.prepare(`SELECT id,chain_id,value FROM agent_lab_keyboard_messages WHERE id LIKE 'akm_migration%' ORDER BY id`).all()).results,
  memberships:(await env.DB.prepare(`SELECT am.author_chain_id,am.message_chain_id,am.author_index FROM agent_lab_keyboard_author_members am JOIN agent_lab_keyboard_messages m ON m.chain_id=am.message_chain_id WHERE m.id LIKE 'akm_migration%' ORDER BY am.author_index`).all()).results,
  capabilities:(await env.DB.prepare(`SELECT id,chain_id,message_id,predecessor_capability_id FROM agent_lab_keyboard_capabilities WHERE id LIKE 'akp_migration%' ORDER BY id`).all()).results,
  events:(await env.DB.prepare(`SELECT id,chain_id,message_id,outcome FROM agent_lab_keyboard_events WHERE id LIKE 'ake_migration%' ORDER BY id`).all()).results,
};
await apply(agentLabKeyboardThreads);
const keyboardThreadMigration={
  historicalThreads:(await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_thread_chains`).all()).results,
  historicalMembers:(await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_thread_members`).all()).results,
};
const foreignKeyErrors=(await env.DB.prepare(`PRAGMA foreign_key_check`).all()).results;
(globalThis as typeof globalThis & {__loomMigrationRegression?:unknown}).__loomMigrationRegression={before,after,afterProjectDeletionMigration,migratedCredential,migratedProseCompression,migratedStructuredColumns,compressionRowsBeforeExpansion,compressionRowsAfterExpansion,selectedCompressionAfterExpansion,keyboardBefore,keyboardAfter,keyboardAuthorMigration,keyboardThreadMigration,foreignKeyErrors};
