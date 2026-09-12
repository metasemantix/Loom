import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hashSecret } from "../src/auth";

const origin="https://loom.example";
const get=(url:string)=>SELF.fetch(url.startsWith("http")?url:origin+url);
async function enter(){
  const response=await get("/agent-lab/enter"),body=await response.text(),write=body.match(/write: (\S+)/)?.[1];
  expect(response.status).toBe(200);expect(write).toBeTruthy();
  return {response,body,write:write!};
}
async function write(value:string){
  const start=await enter(),url=new URL(start.write);url.searchParams.set("value",value);
  const response=await get(url.toString()),body=await response.text(),entry=body.match(/entry: (\S+)/)?.[1],read=body.match(/read: (\S+)/)?.[1];
  return {...start,response,body,entry,read,writeUrl:url.toString()};
}

describe("isolated experimental GET capability chain",()=>{
  it("creates a fresh anonymous chain and advertises an absolute write URL",async()=>{
    const first=await enter(),second=await enter();
    expect(new URL(first.write).origin).toBe(origin);expect(new URL(first.write).pathname).toBe("/agent-lab/write");
    const firstCapability=new URL(first.write).searchParams.get("cap")!;
    expect(firstCapability).not.toBe(new URL(second.write).searchParams.get("cap"));
    expect(first.response.headers.get("content-type")).toBe("text/plain; charset=utf-8");expect(first.response.headers.get("cache-control")).toBe("no-store");
    expect((await env.DB.prepare("SELECT count(*) count FROM agent_lab_chains").first<{count:number}>())!.count).toBeGreaterThanOrEqual(2);
    const issued=await env.DB.prepare("SELECT created_at,expires_at FROM agent_lab_capabilities WHERE token_hash=?").bind(await hashSecret(firstCapability)).first<{created_at:string;expires_at:string}>();
    expect(issued).toBeTruthy();
    expect(Math.abs(Date.parse(issued!.expires_at)-Date.parse(issued!.created_at)-24*60*60*1000)).toBeLessThanOrEqual(1_000);
  });

  it("writes and reads a nonce exactly, with plain-text non-cacheable responses",async()=>{
    const nonce=`nonce-${crypto.randomUUID()}`,created=await write(nonce);
    expect(created.entry).toMatch(/^ent_/);expect(created.read).toBeTruthy();
    expect(created.response.headers.get("content-type")).toBe("text/plain; charset=utf-8");expect(created.response.headers.get("cache-control")).toBe("no-store");
    const read=await get(created.read!),body=await read.text();
    expect(read.status).toBe(200);expect(read.headers.get("content-type")).toBe("text/plain; charset=utf-8");expect(read.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatch(new RegExp(`^value:\\n${nonce.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\nsuccessor capability: labcap_`));
    expect((await env.DB.prepare("SELECT value FROM agent_lab_entries WHERE id=?").bind(created.entry).first<{value:string}>())?.value).toBe(nonce);
  });

  it("validates nonempty values and UTF-8 byte size",async()=>{
    const empty=await enter();expect((await get(empty.write)).status).toBe(400);
    expect((await write("a".repeat(1024))).response.status).toBe(200);
    expect((await write("a".repeat(1025))).response.status).toBe(400);
    expect((await write("é".repeat(512))).response.status).toBe(200);
    expect((await write("é".repeat(512)+"a")).response.status).toBe(400);
  });

  it("allows each write and read capability only once",async()=>{
    const created=await write("single-use"),writeReplay=await get(created.writeUrl);
    expect(writeReplay.status).toBe(403);expect(await writeReplay.text()).toBe("Capability rejected.\n");
    expect((await env.DB.prepare("SELECT count(*) count FROM agent_lab_entries WHERE id=?").bind(created.entry).first<{count:number}>())?.count).toBe(1);
    const firstRead=await get(created.read!),replay=await get(created.read!);
    expect(firstRead.status).toBe(200);expect(replay.status).toBe(403);expect(await replay.text()).toBe("Capability rejected.\n");
    const capabilityCount=(await env.DB.prepare("SELECT count(*) count FROM agent_lab_capabilities WHERE chain_id=(SELECT chain_id FROM agent_lab_entries WHERE id=?)").bind(created.entry).first<{count:number}>())!.count;
    expect(capabilityCount).toBe(3);
  });

  it("rejects wrong-operation, cross-chain, expired, malformed, and unknown capabilities uniformly",async()=>{
    const a=await enter(),b=await write("other-chain"),aCap=new URL(a.write).searchParams.get("cap")!;
    const wrongOperation=await get(`/agent-lab/read?cap=${aCap}&id=${b.entry}`);
    const crossChainUrl=new URL(b.read!);crossChainUrl.searchParams.set("id",(await write("foreign")).entry!);
    const crossChain=await get(crossChainUrl.toString());
    const exp=await enter(),expCap=new URL(exp.write).searchParams.get("cap")!;
    await env.DB.prepare("UPDATE agent_lab_capabilities SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?").bind(await hashSecret(expCap)).run();
    const responses=[wrongOperation,crossChain,await get(`/agent-lab/write?cap=${expCap}&value=x`),await get("/agent-lab/write?cap=bad&value=x"),await get(`/agent-lab/write?cap=labcap_${"0".repeat(36)}&value=x`)];
    for(const response of responses){expect(response.status).toBe(403);expect(await response.text()).toBe("Capability rejected.\n");expect(response.headers.get("cache-control")).toBe("no-store")}
  });

  it("never persists raw capabilities or duplicates scratch content in events",async()=>{
    const secretValue=`secret-value-${crypto.randomUUID()}`,created=await write(secretValue),rawA=new URL(created.writeUrl).searchParams.get("cap")!,rawB=new URL(created.read!).searchParams.get("cap")!;
    await get(created.read!);
    const capabilities=JSON.stringify((await env.DB.prepare("SELECT * FROM agent_lab_capabilities").all()).results),events=JSON.stringify((await env.DB.prepare("SELECT * FROM agent_lab_events").all()).results);
    expect(capabilities).not.toContain(rawA);expect(capabilities).not.toContain(rawB);expect(events).not.toContain(rawA);expect(events).not.toContain(rawB);expect(events).not.toContain(secretValue);
  });

  it("does not fork under concurrent write consumption",async()=>{
    const start=await enter(),url=new URL(start.write),capability=url.searchParams.get("cap")!;url.searchParams.set("value","race");
    const responses=await Promise.all([get(url.toString()),get(url.toString()),get(url.toString())]);
    expect(responses.filter(response=>response.status===200)).toHaveLength(1);expect(responses.filter(response=>response.status===403)).toHaveLength(2);
    const chainId=(await env.DB.prepare("SELECT chain_id FROM agent_lab_capabilities WHERE token_hash=?").bind(await hashSecret(capability)).first<{chain_id:string}>())!.chain_id;
    expect((await env.DB.prepare("SELECT count(*) count FROM agent_lab_entries WHERE chain_id=?").bind(chainId).first<{count:number}>())!.count).toBe(1);
    expect((await env.DB.prepare("SELECT count(*) count FROM agent_lab_capabilities WHERE chain_id=? AND expected_operation='read'").bind(chainId).first<{count:number}>())!.count).toBe(1);
  });

  it("keeps the anonymous routing exception lab-only and out of discovery",async()=>{
    expect((await get("/api/me")).status).toBe(401);expect((await get("/agent-lab/not-a-route")).status).toBe(401);
    expect(await (await get("/llms.txt")).text()).not.toContain("agent-lab");
  });

  it("applies the isolated schema after the populated historical fixture",async()=>{
    expect(await env.DB.prepare("SELECT id FROM documents WHERE id='doc_migration'").first()).toBeTruthy();
    expect((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agent_lab_%'").all()).results).toHaveLength(8);
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
});
