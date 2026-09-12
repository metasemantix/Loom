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
    env.DB.prepare(`INSERT INTO agent_lab_events(id,chain_id,capability_id,operation,outcome,entry_id,byte_count,content_hash,created_at) SELECT ?,chain_id,id,'write','allowed',?,?,?,? FROM agent_lab_capabilities WHERE consumption_id=?`).bind(opaque("ale"),entryId,byteCount,contentHash,at,consumptionId),
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

const keyboardCapabilityPattern=/^labkey_[0-9a-f]{36}$/;
const keyboardChoices=[..."abcdefghijklmnopqrstuvwxyz","space","done"] as const;
type KeyboardOperation="choose"|"read";
type KeyboardCapabilityRow=CapabilityRow&{message_id:string;symbol_count:number|null;completed_at:string|null};

function keyboardMenu(request:Request,value:string,capability:string):Response {
  const choices=keyboardChoices.map(choice=>`${choice}: ${absolute(request,"/agent-lab/keyboard/choose",{cap:capability,choice})}`).join("\n");
  return text(`value:\n${value}\n\n${choices}\n`);
}

async function rejectKeyboard(env:Env,operation:KeyboardOperation,raw:string|null,messageId?:string,validCapabilityOutcome?:string):Promise<Response> {
  const at=new Date().toISOString();
  let row:KeyboardCapabilityRow|null=null,outcome="malformed";
  if(raw&&keyboardCapabilityPattern.test(raw)){
    row=await env.DB.prepare(`SELECT c.id,c.chain_id,c.message_id,c.expected_operation,c.expires_at,c.consumed_at,m.symbol_count,m.completed_at FROM agent_lab_keyboard_capabilities c JOIN agent_lab_keyboard_messages m ON m.id=c.message_id WHERE c.token_hash=?`).bind(await hashSecret(raw)).first<KeyboardCapabilityRow>();
    if(!row)outcome="unknown";
    else if(row.expected_operation!==operation)outcome="wrong_operation";
    else if(row.consumed_at)outcome="replayed";
    else if(row.expires_at<=at)outcome="expired";
    else if(messageId!==undefined&&row.message_id!==messageId)outcome="wrong_chain";
    else if(row.completed_at)outcome="wrong_state";
    else if(validCapabilityOutcome)outcome=validCapabilityOutcome;
    else if(operation==="choose"&&row.symbol_count===128)outcome="length_limit";
    else outcome="wrong_state";
  }
  await env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(opaque("ake"),row?.chain_id??null,row?.message_id??null,row?.id??null,operation,outcome,row?.symbol_count??null,at).run();
  return text("Capability rejected.\n",403);
}

export async function enterAgentLabKeyboard(request:Request,env:Env):Promise<Response> {
  const now=new Date(),at=now.toISOString(),chainId=opaque("akc"),messageId=opaque("akm"),capabilityId=opaque("akp"),capability=opaque("labkey");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_chains(id,created_at) VALUES(?,?)`).bind(chainId,at),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_messages(id,chain_id,value,symbol_count,created_at) VALUES(?,?,'',0,?)`).bind(messageId,chainId,at),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,token_hash,expected_operation,created_at,expires_at) VALUES(?,?,?,?, 'choose',?,?)`).bind(capabilityId,chainId,messageId,await hashSecret(capability),at,expires(now)),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) VALUES(?,?,?,?,'enter','created',0,?)`).bind(opaque("ake"),chainId,messageId,capabilityId,at),
  ]);
  return keyboardMenu(request,"",capability);
}

export async function chooseAgentLabKeyboard(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url),capability=url.searchParams.get("cap"),choice=url.searchParams.get("choice");
  if(!choice||!keyboardChoices.includes(choice as typeof keyboardChoices[number]))return rejectKeyboard(env,"choose",capability,undefined,"invalid_choice");
  if(!capability||!keyboardCapabilityPattern.test(capability))return rejectKeyboard(env,"choose",capability);
  const now=new Date(),at=now.toISOString(),hash=await hashSecret(capability),consumptionId=opaque("aku"),next=opaque("labkey"),nextId=opaque("akp");
  if(choice==="done"){
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE agent_lab_keyboard_capabilities SET consumed_at=?,consumption_id=? WHERE token_hash=? AND expected_operation='choose' AND consumed_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM agent_lab_keyboard_messages m WHERE m.id=message_id AND m.chain_id=chain_id AND m.completed_at IS NULL)`).bind(at,consumptionId,hash,at),
      env.DB.prepare(`UPDATE agent_lab_keyboard_messages SET completed_at=? WHERE id=(SELECT message_id FROM agent_lab_keyboard_capabilities WHERE consumption_id=?) AND completed_at IS NULL`).bind(at,consumptionId),
      env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,token_hash,expected_operation,created_at,expires_at) SELECT ?,chain_id,message_id,?,'read',?,? FROM agent_lab_keyboard_capabilities WHERE consumption_id=?`).bind(nextId,await hashSecret(next),at,expires(now),consumptionId),
      env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) SELECT ?,c.chain_id,c.message_id,c.id,'complete','allowed',m.symbol_count,? FROM agent_lab_keyboard_capabilities c JOIN agent_lab_keyboard_messages m ON m.id=c.message_id WHERE c.consumption_id=?`).bind(opaque("ake"),at,consumptionId),
    ]);
    if((results[0].meta.changes??0)!==1)return rejectKeyboard(env,"choose",capability);
    const message=await env.DB.prepare(`SELECT id FROM agent_lab_keyboard_messages WHERE id=(SELECT message_id FROM agent_lab_keyboard_capabilities WHERE consumption_id=?)`).bind(consumptionId).first<{id:string}>();
    if(!message)throw new Error("Completed keyboard capability has no message");
    return text(`read: ${absolute(request,"/agent-lab/keyboard/read",{cap:next,id:message.id})}\n`);
  }
  const symbol=choice==="space"?" ":choice;
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE agent_lab_keyboard_capabilities SET consumed_at=?,consumption_id=? WHERE token_hash=? AND expected_operation='choose' AND consumed_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM agent_lab_keyboard_messages m WHERE m.id=message_id AND m.chain_id=chain_id AND m.completed_at IS NULL AND m.symbol_count<128)`).bind(at,consumptionId,hash,at),
    env.DB.prepare(`UPDATE agent_lab_keyboard_messages SET value=value||?,symbol_count=symbol_count+1 WHERE id=(SELECT message_id FROM agent_lab_keyboard_capabilities WHERE consumption_id=?) AND completed_at IS NULL AND symbol_count<128`).bind(symbol,consumptionId),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,token_hash,expected_operation,created_at,expires_at) SELECT ?,chain_id,message_id,?,'choose',?,? FROM agent_lab_keyboard_capabilities WHERE consumption_id=?`).bind(nextId,await hashSecret(next),at,expires(now),consumptionId),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) SELECT ?,c.chain_id,c.message_id,c.id,'choose','allowed',m.symbol_count,? FROM agent_lab_keyboard_capabilities c JOIN agent_lab_keyboard_messages m ON m.id=c.message_id WHERE c.consumption_id=?`).bind(opaque("ake"),at,consumptionId),
  ]);
  if((results[0].meta.changes??0)!==1)return rejectKeyboard(env,"choose",capability);
  const message=await env.DB.prepare(`SELECT value FROM agent_lab_keyboard_messages WHERE id=(SELECT message_id FROM agent_lab_keyboard_capabilities WHERE consumption_id=?)`).bind(consumptionId).first<{value:string}>();
  if(!message)throw new Error("Consumed keyboard choice has no message");
  return keyboardMenu(request,message.value,next);
}

export async function readAgentLabKeyboard(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url),capability=url.searchParams.get("cap"),messageId=url.searchParams.get("id")??"";
  if(!capability||!keyboardCapabilityPattern.test(capability))return rejectKeyboard(env,"read",capability,messageId||undefined);
  const at=new Date().toISOString(),hash=await hashSecret(capability),consumptionId=opaque("aku");
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE agent_lab_keyboard_capabilities SET consumed_at=?,consumption_id=? WHERE token_hash=? AND expected_operation='read' AND consumed_at IS NULL AND expires_at>? AND message_id=? AND EXISTS(SELECT 1 FROM agent_lab_keyboard_messages m WHERE m.id=message_id AND m.chain_id=chain_id AND m.completed_at IS NOT NULL)`).bind(at,consumptionId,hash,at,messageId),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) SELECT ?,c.chain_id,c.message_id,c.id,'read','allowed',m.symbol_count,? FROM agent_lab_keyboard_capabilities c JOIN agent_lab_keyboard_messages m ON m.id=c.message_id WHERE c.consumption_id=?`).bind(opaque("ake"),at,consumptionId),
  ]);
  if((results[0].meta.changes??0)!==1)return rejectKeyboard(env,"read",capability,messageId);
  const message=await env.DB.prepare(`SELECT value FROM agent_lab_keyboard_messages WHERE id=?`).bind(messageId).first<{value:string}>();
  if(!message)throw new Error("Consumed keyboard read has no message");
  return text(`value:\n${message.value}\n`);
}
