import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteProjectDocument } from "../../src/project-documents";
import { finalizeDueAccounts } from "../../src/accounts";
import { acceptanceCase, actor, AT, BEFORE, coveredCases, expectStatus, ids, NOW, origin, request, resetReferenceWorld } from "./harness";
import { caseName, operationBranches } from "./catalog";

beforeEach(resetReferenceWorld);
const json={"content-type":"application/json"};

describe("deterministic acceptance: project-native documents",()=>{
  for(const role of ["owner","admin","member"] as const)acceptanceCase(caseName("project-native.create",`${role}.active.allowed`),async()=>{const response=await request(`/api/projects/${ids.projects.active}/native-documents`,role,{method:"POST",headers:json,body:JSON.stringify({title:`Made by ${role}`,logicalPath:`${role}.md`,content:"content",contentType:"text/plain"})});expectStatus(response,201);expect(await env.DB.prepare("SELECT owner_type,owner_id,created_by_participant_id FROM documents WHERE title=?").bind(`Made by ${role}`).first()).toEqual({owner_type:"project",owner_id:ids.projects.active,created_by_participant_id:ids.participants[role]})});
  acceptanceCase(caseName("project-native.edit","admin.active.allowed"),async()=>{expectStatus(await request(`/api/project-documents/${ids.documents.nativeLive}`,"admin",{method:"PUT",headers:json,body:JSON.stringify({content:"admin revision",contentType:"text/plain"})}),200);expect((await env.DB.prepare("SELECT count(*) count FROM document_versions WHERE document_id=?").bind(ids.documents.nativeLive).first<{count:number}>())!.count).toBe(2)});
  acceptanceCase(caseName("project-native.delete","creator.voluntary-leave.before.allowed"),async()=>{expectStatus(await request(`/api/projects/${ids.projects.active}/members/${ids.participants.member}`,"member",{method:"DELETE",headers:json,body:JSON.stringify({withdrawContributions:false})}),204);expectStatus(await request(`/api/project-documents/${ids.documents.nativeLive}`,"member"),404);expectStatus(await deleteProjectDocument(env,actor("member"),ids.documents.nativeLive,NOW),204)});
  acceptanceCase(caseName("project-native.delete","creator.before.allowed"),async()=>{expectStatus(await deleteProjectDocument(env,actor("member"),ids.documents.nativeLive,NOW),204)});
  acceptanceCase(caseName("project-native.delete","creator.at.denied"),async()=>{await env.DB.prepare("UPDATE documents SET creator_deletion_until=? WHERE id=?").bind(AT,ids.documents.nativeLive).run();expectStatus(await deleteProjectDocument(env,actor("member"),ids.documents.nativeLive,NOW),403);expect(await env.DB.prepare("SELECT id FROM documents WHERE id=?").bind(ids.documents.nativeLive).first()).toBeTruthy()});
  acceptanceCase(caseName("project-native.delete","creator.after.denied"),async()=>{expectStatus(await deleteProjectDocument(env,actor("member"),ids.documents.nativeExpired,NOW),403)});
  acceptanceCase(caseName("project-native.provenance","deleted-creator.resolves-tombstone"),async()=>{const view=await request(`/api/projects/${ids.projects.active}`,"owner").then(r=>r.json<any>());expect(view.nativeDocuments.find((d:any)=>d.id===ids.documents.nativeDeletedCreator).creator_display_name).toBe("reference-deleted (former user)");expectStatus(await request(`/api/project-documents/${ids.documents.nativeDeletedCreator}`,"owner"),200)});
  acceptanceCase(caseName("project-native.provenance","deleted-revision-actor.resolves-tombstone"),async()=>{const history=await request(`/api/project-documents/${ids.documents.nativeDeletedCreator}/versions`,"owner").then(r=>r.json<any>());expect(history.versions[0]).toMatchObject({actor_id:ids.participants.deleted,actor_display_name:"reference-deleted (former user)"})});
});

describe("reference world",()=>{
  it("contains stable aliases for the current semantic states",async()=>{expect((await env.DB.prepare("SELECT lifecycle_state FROM projects WHERE id=?").bind(ids.projects.archived).first<any>()).lifecycle_state).toBe("archived");expect((await env.DB.prepare("SELECT read_audience FROM projects WHERE id=?").bind(ids.projects.agentsOnly).first<any>()).read_audience).toBe("agents_only");expect((await env.DB.prepare("SELECT status,count(*) count FROM project_invitations GROUP BY status").all()).results).toEqual(expect.arrayContaining([expect.objectContaining({status:"outstanding"}),expect.objectContaining({status:"accepted"}),expect.objectContaining({status:"declined"}),expect.objectContaining({status:"revoked"})]))});
  it("keeps the project document when its creator account is finalized",async()=>{await env.DB.prepare("UPDATE participants SET account_state='deletion_pending',deletion_due_at=? WHERE id=?").bind("2029-01-01T00:00:00.000Z",ids.participants.member).run();await finalizeDueAccounts(env,NOW);expect(await env.DB.prepare("SELECT id FROM documents WHERE id=?").bind(ids.documents.nativeLive).first()).toBeTruthy()});
});

describe("acceptance inventory",()=>{
  it("makes every current branch and missing executable coverage searchable",()=>{const inventory=Object.entries(operationBranches).flatMap(([operation,branches])=>branches.map(branch=>caseName(operation as keyof typeof operationBranches,branch)));const report=inventory.map(name=>({name,covered:coveredCases.has(name)}));expect(report.filter(x=>x.covered).map(x=>x.name)).toEqual(expect.arrayContaining([...coveredCases]));expect(report.some(x=>!x.covered)).toBe(true)});
});
