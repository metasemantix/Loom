import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

export const NOW = new Date("2030-06-15T12:00:00.000Z");
export const BEFORE = "2030-06-15T12:00:00.001Z";
export const AT = NOW.toISOString();
export const AFTER = "2030-06-15T11:59:59.999Z";
export const origin = "http://example.com";

export const ids = {
  participants: { owner:"par_refowner", admin:"par_refadmin", member:"par_refmember", former:"par_refformer", pending:"par_refpending", deleted:"par_refdeleted" },
  projects: { active:"prj_refactive", archived:"prj_refarchived", agentsOnly:"prj_refagents" },
  documents: { private:"doc_refprivate", public:"doc_refpublic", contribution:"doc_refcontribution", suspendedContribution:"doc_refsuspended", retractedContribution:"doc_refretracted", nativeLive:"doc_refnativelive", nativeExpired:"doc_refnativeexpired", nativeDeletedCreator:"doc_refnativedeletedcreator", copy:"doc_refcopy" },
  invitations: { outstanding:"inv_refoutstanding", accepted:"inv_refaccepted", declined:"inv_refdeclined", revoked:"inv_refrevoked", expired:"inv_refexpired" },
  credentials: { readOnly:"mac_refreadonly", checkin:"mac_refcheckin", revoked:"mac_refrevoked", archived:"mac_refarchived" },
} as const;

export const agentTokens={readOnly:`loom_agent_${"1".repeat(36)}`,checkin:`loom_agent_${"2".repeat(36)}`,revoked:`loom_agent_${"3".repeat(36)}`,archived:`loom_agent_${"4".repeat(36)}`} as const;
export const agentRequest=(path:string,token:keyof typeof agentTokens,init:RequestInit={})=>SELF.fetch(origin+path,{...init,headers:{authorization:`Bearer ${agentTokens[token]}`,...init.headers}});

export type ActorAlias=keyof typeof ids.participants;
export function actor(alias:ActorAlias){const participantId=ids.participants[alias];return {participantId,userId:`usr_ref_${alias}`,displayName:`Reference ${alias}`,accountState:"active" as const,deletionDueAt:null,cookie:`loom_session=session-ref-${alias}`}}
export function request(path:string,alias:ActorAlias,init:RequestInit={}){return SELF.fetch(origin+path,{...init,headers:{cookie:actor(alias).cookie,origin,...init.headers}})}

async function hash(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("")}
const q=(sql:string,...values:unknown[])=>env.DB.prepare(sql).bind(...values);

/** Recreates a populated current-schema world. Historical migration fixtures remain in setup.ts. */
export async function resetReferenceWorld(){
  await env.DB.exec("DELETE FROM machine_read_audit; DELETE FROM project_machine_checkins; DELETE FROM project_machine_credentials; DELETE FROM account_events; DELETE FROM project_events; DELETE FROM project_invitations; DELETE FROM project_documents; DELETE FROM project_members; DELETE FROM projects; DELETE FROM sessions; DELETE FROM document_events; DELETE FROM document_versions; DELETE FROM documents; DELETE FROM participants; DELETE FROM auth_identities; DELETE FROM users;");
  const statements:D1PreparedStatement[]=[];
  for(const alias of ["owner","admin","member","former","pending"] as const){const a=actor(alias);statements.push(q("INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)",a.userId,a.displayName,AT),q("INSERT INTO participants(id,user_id,public_slug,created_at,provenance_identifier,account_state,deletion_due_at) VALUES(?,?,?,?,?,'active',NULL)",a.participantId,a.userId,a.participantId,AT,`reference-${alias}`),q("INSERT INTO sessions(id,user_id,secret_hash,expires_at,created_at) VALUES(?,?,?,?,?)",`sid_ref_${alias}`,a.userId,await hash(`session-ref-${alias}`),"2099-01-01T00:00:00.000Z",AT))}
  statements.push(q("UPDATE participants SET account_state='deletion_pending',deletion_due_at=? WHERE id=?","2030-07-01T00:00:00.000Z",ids.participants.pending));
  statements.push(q("INSERT INTO participants(id,user_id,public_slug,created_at,provenance_identifier,account_state,deletion_finalized_at) VALUES(?,NULL,NULL,NULL,?,'deleted',?)",ids.participants.deleted,"reference-deleted",AT));
  for(const [id,name,state,audience] of [[ids.projects.active,"Reference active","active","members_and_agents"],[ids.projects.archived,"Reference archived","archived","members_and_agents"],[ids.projects.agentsOnly,"Reference agents","active","agents_only"]]) statements.push(q("INSERT INTO projects(id,name,created_by_participant_id,read_audience,created_at,description,lifecycle_state) VALUES(?,?,?,?,?,'Reference project',?)",id,name,ids.participants.owner,audience,AT,state));
  for(const project of Object.values(ids.projects)){statements.push(q("INSERT INTO project_members(project_id,participant_id,role,joined_at) VALUES(?,?,?,?)",project,ids.participants.owner,"owner",AT));if(project===ids.projects.active)statements.push(q("INSERT INTO project_members(project_id,participant_id,role,joined_at) VALUES(?,?,?,?)",project,ids.participants.admin,"admin",AT),q("INSERT INTO project_members(project_id,participant_id,role,joined_at) VALUES(?,?,?,?)",project,ids.participants.member,"member",AT))}
  statements.push(
    q("INSERT INTO project_machine_credentials(id,project_id,authorized_by_participant_id,label,token_hash,fingerprint,created_at,checkin_enabled) VALUES(?,?,?,?,?,?,?,0)",ids.credentials.readOnly,ids.projects.active,ids.participants.owner,"Reference reader","6882a80ec6602ef9c782ce842dee7a75c54ff211a9e1fada571d3141e16c99cb","ref-readonly",AT),
    q("INSERT INTO project_machine_credentials(id,project_id,authorized_by_participant_id,label,token_hash,fingerprint,created_at,checkin_enabled) VALUES(?,?,?,?,?,?,?,1)",ids.credentials.checkin,ids.projects.active,ids.participants.owner,"Reference check-in","ed602b5a9606b9399f119145d8cc2ea6a32be9b6cd8e31d63a2f444159198964","ref-checkin",AT),
    q("INSERT INTO project_machine_credentials(id,project_id,authorized_by_participant_id,label,token_hash,fingerprint,created_at,revoked_at,checkin_enabled) VALUES(?,?,?,?,?,?,?,?,1)",ids.credentials.revoked,ids.projects.active,ids.participants.owner,"Reference revoked","9e60c72693bb8838b71b7cffe66c93b8d08c9aebc860938fc08f1818551c7017","ref-revoked",AT,AT),
    q("INSERT INTO project_machine_credentials(id,project_id,authorized_by_participant_id,label,token_hash,fingerprint,created_at,checkin_enabled) VALUES(?,?,?,?,?,?,?,1)",ids.credentials.archived,ids.projects.archived,ids.participants.owner,"Reference archived","8ecd824b9c6e2b360feec70a353204da2d75ba831e9a3316c63b31c8d84d1585","ref-archived",AT),
  );
  const personal=[[ids.documents.private,"Private","private",ids.participants.owner],[ids.documents.public,"Public","public",ids.participants.owner],[ids.documents.contribution,"Contribution","private",ids.participants.former],[ids.documents.suspendedContribution,"Suspended contribution","private",ids.participants.former],[ids.documents.retractedContribution,"Retracted contribution","private",ids.participants.former]];
  for(const [id,title,visibility,owner] of personal){const version=`ver_${id}`;statements.push(q("INSERT INTO documents(id,owner_type,owner_id,kind,title,logical_path,current_version_id,visibility,created_at) VALUES(?,'participant',?,'document',?,?,?, ?,?)",id,owner,title,`${id}.md`,version,visibility,AT),q("INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES(?,?,1,?,'text/markdown','human',?,?)",version,id,`Body of ${title}`,owner,AT))}
  statements.push(q("INSERT INTO project_documents(project_id,document_id,source_owner_participant_id,added_by_participant_id,added_at,state,tombstone_title) VALUES(?,?,?,?,?,'active','Contribution')",ids.projects.active,ids.documents.contribution,ids.participants.former,ids.participants.former,AT));
  statements.push(q("INSERT INTO project_documents(project_id,document_id,source_owner_participant_id,added_by_participant_id,added_at,state,tombstone_title,state_changed_at) VALUES(?,?,?,?,?,'suspended_after_removal','Suspended contribution',?)",ids.projects.active,ids.documents.suspendedContribution,ids.participants.former,ids.participants.former,AT,AT),q("INSERT INTO project_documents(project_id,document_id,source_owner_participant_id,added_by_participant_id,added_at,state,tombstone_title,state_changed_at) VALUES(?,?,?,?,?,'retracted','Retracted contribution',?)",ids.projects.active,ids.documents.retractedContribution,ids.participants.former,ids.participants.former,AT,AT));
  const native=[[ids.documents.nativeLive,"Live entitlement",ids.participants.member,BEFORE,null],[ids.documents.nativeExpired,"Expired entitlement",ids.participants.member,AFTER,null],[ids.documents.nativeDeletedCreator,"Deleted creator survives",ids.participants.deleted,AFTER,null],[ids.documents.copy,"Independent copy",ids.participants.owner,BEFORE,ids.documents.public]];
  for(const [id,title,creator,until,source] of native){const version=`ver_${id}`;statements.push(q("INSERT INTO documents(id,owner_type,owner_id,kind,title,logical_path,current_version_id,visibility,created_at,created_by_participant_id,creator_deletion_until,source_document_id,source_owner_participant_id) VALUES(?,'project',?,'document',?,?,?,'private',?,?,?,?,?)",id,ids.projects.active,title,`${id}.md`,version,"2030-06-12T12:00:00.000Z",creator,until,source,source?ids.participants.owner:null),q("INSERT INTO document_versions(id,document_id,version_number,content,content_type,actor_type,actor_id,created_at) VALUES(?,?,1,?,'text/markdown','human',?,?)",version,id,`Body of ${title}`,creator,AT))}
  const invitationStates=[[ids.invitations.outstanding,"outstanding","2031-01-01T00:00:00.000Z"],[ids.invitations.accepted,"accepted","2031-01-01T00:00:00.000Z"],[ids.invitations.declined,"declined","2031-01-01T00:00:00.000Z"],[ids.invitations.revoked,"revoked","2031-01-01T00:00:00.000Z"],[ids.invitations.expired,"outstanding","2029-01-01T00:00:00.000Z"]];
  for(const [id,status,expires] of invitationStates)statements.push(q("INSERT INTO project_invitations(id,project_id,token_hash,invited_by_participant_id,created_at,expires_at,status) VALUES(?,?,?,?,?,?,?)",id,ids.projects.active,`hash-${id}`,ids.participants.owner,AT,expires,status));
  await env.DB.batch(statements);
}

export const coveredCases=new Set<string>();
export function acceptanceCase(name:string,run:()=>void|Promise<void>){coveredCases.add(name);it(name,run)}
export function expectStatus(response:Response,status:number){expect(response.status).toBe(status);return response}
