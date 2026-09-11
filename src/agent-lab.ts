import { hashSecret, opaque } from "./auth";
import type { Env } from "./types";

const encoder = new TextEncoder();
const capabilityPattern = /^labcap_[0-9a-f]{36}$/;
type Operation = "write" | "read";
type CapabilityRow = { id:string; chain_id:string; expected_operation:string; expires_at:string; consumed_at:string|null };

function text(body:string,status=200):Response {
  return new Response(body,{status,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
}

function absolute(request:Request,path:string,parameters:Record<string,string>):string {
  const next=new URL(path,new URL(request.url).origin);
  for(const [name,value] of Object.entries(parameters))next.searchParams.set(name,value);
  return next.toString();
}

function expires(now:Date):string { return new Date(now.getTime()+24*60*60*1000).toISOString(); }

async function rejected(env:Env,operation:Operation,raw:string|null,entryId?:string):Promise<Response> {
  const now=new Date().toISOString();
  let row:CapabilityRow|null=null,outcome="malformed";
  if(raw&&capabilityPattern.test(raw)){
    row=await env.DB.prepare(`SELECT id,chain_id,expected_operation,expires_at,consumed_at FROM agent_lab_capabilities WHERE token_hash=?`).bind(await hashSecret(raw)).first<CapabilityRow>();
    if(!row)outcome="unknown";
    else if(row.expected_operation!==operation)outcome="wrong_operation";
    else if(row.consumed_at)outcome="replayed";
    else if(row.expires_at<=now)outcome="expired";
    else outcome="wrong_chain";
  }
  await env.DB.prepare(`INSERT INTO agent_lab_events(id,chain_id,capability_id,operation,outcome,entry_id,created_at) VALUES(?,?,?,?,?,?,?)`)
    .bind(opaque("ale"),row?.chain_id??null,row?.id??null,operation,outcome,entryId??null,now).run();
  // Deliberately identical for every capability rejection: do not provide a token oracle.
  return text("Capability rejected.\n",403);
}

export async function enterAgentLab(request:Request,env:Env):Promise<Response> {
  const now=new Date(),created=now.toISOString(),chainId=opaque("alc"),capabilityId=opaque("acp"),capability=opaque("labcap");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO agent_lab_chains(id,created_at) VALUES(?,?)`).bind(chainId,created),
    env.DB.prepare(`INSERT INTO agent_lab_capabilities(id,chain_id,token_hash,expected_operation,created_at,expires_at) VALUES(?,?,?,'write',?,?)`).bind(capabilityId,chainId,await hashSecret(capability),created,expires(now)),
    env.DB.prepare(`INSERT INTO agent_lab_events(id,chain_id,capability_id,operation,outcome,created_at) VALUES(?,?,?,'enter','created',?)`).bind(opaque("ale"),chainId,capabilityId,created),
  ]);
  return text(`write: ${absolute(request,"/agent-lab/write",{cap:capability,value:""})}\n`);
}

export async function writeAgentLab(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url),capability=url.searchParams.get("cap"),value=url.searchParams.get("value");
  if(value===null||value.length===0)return text("A nonempty value is required.\n",400);
  const byteCount=encoder.encode(value).byteLength;
  if(byteCount>1024)return text("Value exceeds the 1,024-byte UTF-8 limit.\n",400);
  if(!capability||!capabilityPattern.test(capability))return rejected(env,"write",capability);
  const now=new Date(),at=now.toISOString(),hash=await hashSecret(capability),consumptionId=opaque("use"),entryId=opaque("ent"),successor=opaque("labcap"),successorId=opaque("acp"),contentHash=await hashSecret(value);
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE agent_lab_capabilities SET consumed_at=?,consumption_id=? WHERE token_hash=? AND expected_operation='write' AND consumed_at IS NULL AND expires_at>?`).bind(at,consumptionId,hash,at),
    env.DB.prepare(`INSERT INTO agent_lab_entries(id,chain_id,entry_index,value,byte_count,content_hash,created_at) SELECT ?,chain_id,COALESCE((SELECT MAX(e.entry_index)+1 FROM agent_lab_entries e WHERE e.chain_id=agent_lab_capabilities.chain_id),1),?,?,?,? FROM agent_lab_capabilities WHERE consumption_id=?`).bind(entryId,value,byteCount,contentHash,at,consumptionId),
    env.DB.prepare(`INSERT INTO agent_lab_capabilities(id,chain_id,token_hash,expected_operation,created_at,expires_at) SELECT ?,chain_id,?,'read',?,? FROM agent_lab_capabilities WHERE consumption_id=?`).bind(successorId,await hashSecret(successor),at,expires(now),consumptionId),
    env.DB.prepare(`INSERT INTO agent_lab_events(id,chain_id,capability_id,operation,outcome,entry_id,byte_count,content_hash,created_at) SELECT ?,chain_id,id,'write','allowed',?,?,?,?,? FROM agent_lab_capabilities WHERE consumption_id=?`).bind(opaque("ale"),entryId,byteCount,contentHash,at,consumptionId),
  ]);
  if((results[0].meta.changes??0)!==1)return rejected(env,"write",capability);
  return text(`entry: ${entryId}\nread: ${absolute(request,"/agent-lab/read",{cap:successor,id:entryId})}\n`);
}

export async function readAgentLab(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url),capability=url.searchParams.get("cap"),entryId=url.searchParams.get("id")??"";
  if(!capability||!capabilityPattern.test(capability))return rejected(env,"read",capability,entryId||undefined);
  const now=new Date(),at=now.toISOString(),hash=await hashSecret(capability),consumptionId=opaque("use"),successor=opaque("labcap"),successorId=opaque("acp");
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE agent_lab_capabilities SET consumed_at=?,consumption_id=? WHERE token_hash=? AND expected_operation='read' AND consumed_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM agent_lab_entries WHERE id=? AND chain_id=agent_lab_capabilities.chain_id)`).bind(at,consumptionId,hash,at,entryId),
    env.DB.prepare(`INSERT INTO agent_lab_capabilities(id,chain_id,token_hash,expected_operation,created_at,expires_at) SELECT ?,chain_id,?,'complete',?,? FROM agent_lab_capabilities WHERE consumption_id=?`).bind(successorId,await hashSecret(successor),at,expires(now),consumptionId),
    env.DB.prepare(`INSERT INTO agent_lab_events(id,chain_id,capability_id,operation,outcome,entry_id,created_at) SELECT ?,chain_id,id,'read','allowed',?,? FROM agent_lab_capabilities WHERE consumption_id=?`).bind(opaque("ale"),entryId,at,consumptionId),
  ]);
  if((results[0].meta.changes??0)!==1)return rejected(env,"read",capability,entryId);
  const entry=await env.DB.prepare(`SELECT value FROM agent_lab_entries WHERE id=? AND chain_id=(SELECT chain_id FROM agent_lab_capabilities WHERE consumption_id=?)`).bind(entryId,consumptionId).first<{value:string}>();
  if(!entry)throw new Error("Consumed agent-lab read has no entry");
  return text(`value:\n${entry.value}\nsuccessor capability: ${successor}\n`);
}
