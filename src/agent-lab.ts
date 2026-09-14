import { hashSecret, opaque } from "./auth";
import type { Env } from "./types";

const encoder = new TextEncoder();
const capabilityPattern = /^labcap_[0-9a-f]{36}$/;
type Operation = "write" | "read";
type CapabilityRow = { id:string; chain_id:string; expected_operation:string; expires_at:string; consumed_at:string|null };

function text(body:string,status=200):Response {
  return new Response(body,{status,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
}

function html(body:string):Response {
  return new Response(body,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}

function redirect(request:Request,path:string,parameters:Record<string,string>):Response {
  return new Response(null,{status:303,headers:{location:absolute(request,path,parameters),"cache-control":"no-store"}});
}

function escapeHtml(value:string):string {
  return value.replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]!);
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
type KeyboardOperation="choose"|"read"|"continue"|"reenter";
type KeyboardCapabilityRow={id:string;chain_id:string|null;message_id:string|null;message_chain_id:string|null;author_chain_id:string|null;expected_operation:string;expires_at:string|null;revoked_at:string|null;consumed_at:string|null;symbol_count:number|null;completed_at:string|null};

function keyboardMenu(request:Request,value:string,capability:string):Response {
  const choices=keyboardChoices.map(choice=>`<a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/choose",{cap:capability,choice}))}">${escapeHtml(choice)}</a>`).join("\n");
  return html(`<!doctype html>\n<meta charset="utf-8">\n<pre id="value">${escapeHtml(value)}</pre>\n<nav>\n${choices}\n</nav>\n`);
}

async function keyboardCapability(env:Env,raw:string):Promise<KeyboardCapabilityRow|null>{
  return env.DB.prepare(`SELECT c.id,c.chain_id,c.message_id,c.author_chain_id,c.expected_operation,c.expires_at,c.revoked_at,c.consumed_at,m.chain_id message_chain_id,m.symbol_count,m.completed_at FROM agent_lab_keyboard_capabilities c LEFT JOIN agent_lab_keyboard_messages m ON m.id=c.message_id WHERE c.token_hash=?`).bind(await hashSecret(raw)).first<KeyboardCapabilityRow>();
}
async function rejectKeyboard(env:Env,operation:KeyboardOperation,raw:string|null,messageId?:string,validCapabilityOutcome?:string,eventOperation:string=operation):Promise<Response> {
  const at=new Date().toISOString();let row:KeyboardCapabilityRow|null=null,outcome="malformed";
  if(raw&&keyboardCapabilityPattern.test(raw)){
    row=await keyboardCapability(env,raw);
    if(!row)outcome="unknown";else if(row.expected_operation!==operation)outcome="wrong_operation";else if(row.revoked_at)outcome="revoked";else if(row.consumed_at)outcome="replayed";else if(row.expires_at!==null&&row.expires_at<=at)outcome="expired";else if(operation!=="reenter"&&row.chain_id!==row.message_chain_id)outcome="wrong_chain";else if(messageId!==undefined&&row.message_id!==messageId)outcome="wrong_chain";else if(operation==="choose"&&row.completed_at)outcome="wrong_state";else if(operation!=="choose"&&operation!=="reenter"&&!row.completed_at)outcome="wrong_state";else if(validCapabilityOutcome)outcome=validCapabilityOutcome;else if(operation==="choose"&&row.symbol_count===128)outcome="length_limit";else outcome="wrong_state";
  }
  await env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,author_chain_id,capability_id,operation,outcome,symbol_count,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(opaque("ake"),row?.chain_id??null,row?.message_id??null,row?.author_chain_id??null,row?.id??null,eventOperation,outcome,row?.symbol_count??null,at).run();
  return text("Capability rejected.\n",403);
}

export async function enterAgentLabKeyboard(request:Request,env:Env):Promise<Response> {
  const fresh=new URL(request.url).searchParams.get("fresh");
  if(fresh===null)return redirect(request,"/agent-lab/keyboard/enter",{fresh:opaque("fresh")});
  if(fresh.length>128)return text("Fresh entrance value exceeds the 128-character limit.\n",400);
  const now=new Date(),at=now.toISOString(),chainId=opaque("akc"),messageId=opaque("akm"),capabilityId=opaque("akp"),capability=opaque("labkey");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_chains(id,created_at) VALUES(?,?)`).bind(chainId,at),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_messages(id,chain_id,value,symbol_count,created_at) VALUES(?,?, '',0,?)`).bind(messageId,chainId,at),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,token_hash,expected_operation,created_at,expires_at) VALUES(?,?,?,?, 'choose',?,?)`).bind(capabilityId,chainId,messageId,await hashSecret(capability),at,expires(now)),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) VALUES(?,?,?,?,'enter','created',0,?)`).bind(opaque("ake"),chainId,messageId,capabilityId,at),
  ]);return redirect(request,"/agent-lab/keyboard/view",{cap:capability});
}

export async function viewAgentLabKeyboard(request:Request,env:Env):Promise<Response>{
  const raw=new URL(request.url).searchParams.get("cap"),at=new Date().toISOString();
  if(!raw||!keyboardCapabilityPattern.test(raw))return text("Capability rejected.\n",403);
  const row=await keyboardCapability(env,raw);
  const structurallyValid=!!row&&!row.revoked_at&&!row.consumed_at&&(row.expires_at===null||row.expires_at>at)&&(
    row.expected_operation==="reenter"
      ? !!row.author_chain_id&&!row.chain_id&&!row.message_id&&!row.message_chain_id&&row.expires_at===null
      : !!row.chain_id&&!!row.message_id&&row.chain_id===row.message_chain_id&&!row.author_chain_id&&row.expires_at!==null
  );
  if(!structurallyValid||!row||!["choose","read","continue","reenter"].includes(row.expected_operation))return text("Capability rejected.\n",403);
  if(row.expected_operation==="choose"){
    if(row.completed_at||row.symbol_count===null||row.symbol_count>128)return text("Capability rejected.\n",403);
    const message=await env.DB.prepare(`SELECT value FROM agent_lab_keyboard_messages WHERE id=?`).bind(row.message_id).first<{value:string}>();
    return message?keyboardMenu(request,message.value,raw):text("Capability rejected.\n",403);
  }
  if(row.expected_operation==="reenter"){
    const target=absolute(request,"/agent-lab/keyboard/reenter",{cap:raw});
    return html(`<!doctype html>\n<meta charset="utf-8">\n<pre id="reentry-url">${escapeHtml(target)}</pre>\n<a href="${escapeHtml(target)}">re-enter author chain</a>\n`);
  }
  if(!row.completed_at)return text("Capability rejected.\n",403);
  if(row.expected_operation==="read")return html(`<!doctype html>\n<meta charset="utf-8">\n<a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/read",{cap:raw,id:row.message_id!}))}">read</a>\n`);
  const message=await env.DB.prepare(`SELECT value FROM agent_lab_keyboard_messages WHERE id=?`).bind(row.message_id).first<{value:string}>();
  if(!message)return text("Capability rejected.\n",403);
  return html(`<!doctype html>\n<meta charset="utf-8">\n<pre id="value">${escapeHtml(message.value)}</pre>\n<a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/continue",{cap:raw}))}">next message</a>\n<a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/preserve",{cap:raw}))}">preserve author continuity</a>\n`);
}

export async function chooseAgentLabKeyboard(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url),capability=url.searchParams.get("cap"),choice=url.searchParams.get("choice");
  if(!choice||!keyboardChoices.includes(choice as typeof keyboardChoices[number]))return rejectKeyboard(env,"choose",capability,undefined,"invalid_choice");if(!capability||!keyboardCapabilityPattern.test(capability))return rejectKeyboard(env,"choose",capability);
  const now=new Date(),at=now.toISOString(),hash=await hashSecret(capability),consumptionId=opaque("aku"),next=opaque("labkey"),nextId=opaque("akp");
  if(choice==="done"){
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE agent_lab_keyboard_capabilities SET consumed_at=?,consumption_id=? WHERE token_hash=? AND expected_operation='choose' AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM agent_lab_keyboard_messages m WHERE m.id=message_id AND m.chain_id=chain_id AND m.completed_at IS NULL)`).bind(at,consumptionId,hash,at),
      env.DB.prepare(`UPDATE agent_lab_keyboard_messages SET completed_at=? WHERE id=(SELECT message_id FROM agent_lab_keyboard_capabilities WHERE consumption_id=?) AND completed_at IS NULL`).bind(at,consumptionId),
      env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,predecessor_capability_id,token_hash,expected_operation,created_at,expires_at) SELECT ?,chain_id,message_id,id,?,'read',?,? FROM agent_lab_keyboard_capabilities WHERE consumption_id=?`).bind(nextId,await hashSecret(next),at,expires(now),consumptionId),
      env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) SELECT ?,c.chain_id,c.message_id,c.id,'complete','allowed',m.symbol_count,? FROM agent_lab_keyboard_capabilities c JOIN agent_lab_keyboard_messages m ON m.id=c.message_id WHERE c.consumption_id=?`).bind(opaque("ake"),at,consumptionId),
    ]);if((results[0].meta.changes??0)!==1)return rejectKeyboard(env,"choose",capability);
    return redirect(request,"/agent-lab/keyboard/view",{cap:next});
  }
  const symbol=choice==="space"?" ":choice;const results=await env.DB.batch([
    env.DB.prepare(`UPDATE agent_lab_keyboard_capabilities SET consumed_at=?,consumption_id=? WHERE token_hash=? AND expected_operation='choose' AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM agent_lab_keyboard_messages m WHERE m.id=message_id AND m.chain_id=chain_id AND m.completed_at IS NULL AND m.symbol_count<128)`).bind(at,consumptionId,hash,at),
    env.DB.prepare(`UPDATE agent_lab_keyboard_messages SET value=value||?,symbol_count=symbol_count+1 WHERE id=(SELECT message_id FROM agent_lab_keyboard_capabilities WHERE consumption_id=?) AND completed_at IS NULL AND symbol_count<128`).bind(symbol,consumptionId),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,predecessor_capability_id,token_hash,expected_operation,created_at,expires_at) SELECT ?,chain_id,message_id,id,?,'choose',?,? FROM agent_lab_keyboard_capabilities WHERE consumption_id=?`).bind(nextId,await hashSecret(next),at,expires(now),consumptionId),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) SELECT ?,c.chain_id,c.message_id,c.id,'choose','allowed',m.symbol_count,? FROM agent_lab_keyboard_capabilities c JOIN agent_lab_keyboard_messages m ON m.id=c.message_id WHERE c.consumption_id=?`).bind(opaque("ake"),at,consumptionId),
  ]);if((results[0].meta.changes??0)!==1)return rejectKeyboard(env,"choose",capability);return redirect(request,"/agent-lab/keyboard/view",{cap:next});
}

export async function readAgentLabKeyboard(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url),capability=url.searchParams.get("cap"),messageId=url.searchParams.get("id")??"";if(!capability||!keyboardCapabilityPattern.test(capability))return rejectKeyboard(env,"read",capability,messageId||undefined);
  const now=new Date(),at=now.toISOString(),hash=await hashSecret(capability),consumptionId=opaque("aku"),next=opaque("labkey"),nextId=opaque("akp");const results=await env.DB.batch([
    env.DB.prepare(`UPDATE agent_lab_keyboard_capabilities SET consumed_at=?,consumption_id=? WHERE token_hash=? AND expected_operation='read' AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>? AND message_id=? AND EXISTS(SELECT 1 FROM agent_lab_keyboard_messages m WHERE m.id=message_id AND m.chain_id=chain_id AND m.completed_at IS NOT NULL)`).bind(at,consumptionId,hash,at,messageId),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,predecessor_capability_id,token_hash,expected_operation,created_at,expires_at) SELECT ?,chain_id,message_id,id,?,'continue',?,? FROM agent_lab_keyboard_capabilities WHERE consumption_id=?`).bind(nextId,await hashSecret(next),at,expires(now),consumptionId),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) SELECT ?,c.chain_id,c.message_id,c.id,'read','allowed',m.symbol_count,? FROM agent_lab_keyboard_capabilities c JOIN agent_lab_keyboard_messages m ON m.id=c.message_id WHERE c.consumption_id=?`).bind(opaque("ake"),at,consumptionId),
  ]);if((results[0].meta.changes??0)!==1)return rejectKeyboard(env,"read",capability,messageId);const message=await env.DB.prepare(`SELECT value FROM agent_lab_keyboard_messages WHERE id=?`).bind(messageId).first<{value:string}>();if(!message)throw new Error("Consumed keyboard read has no message");
  return redirect(request,"/agent-lab/keyboard/view",{cap:next});
}

async function consumeDecision(request:Request,env:Env,mode:"continue"|"preserve"):Promise<Response>{
  const capability=new URL(request.url).searchParams.get("cap");if(!capability||!keyboardCapabilityPattern.test(capability))return rejectKeyboard(env,"continue",capability,undefined,undefined,mode);
  const now=new Date(),at=now.toISOString(),hash=await hashSecret(capability),use=opaque("aku"),authorId=opaque("aka"),chainId=opaque("akc"),messageId=opaque("akm"),next=opaque("labkey"),nextId=opaque("akp");
  const common=[
    env.DB.prepare(`UPDATE agent_lab_keyboard_capabilities SET consumed_at=?,consumption_id=? WHERE token_hash=? AND expected_operation='continue' AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM agent_lab_keyboard_messages m WHERE m.id=message_id AND m.chain_id=chain_id AND m.completed_at IS NOT NULL)`).bind(at,use,hash,at),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_author_chains(id,created_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM agent_lab_keyboard_capabilities c WHERE c.consumption_id=? AND NOT EXISTS(SELECT 1 FROM agent_lab_keyboard_author_members am WHERE am.message_chain_id=c.chain_id))`).bind(authorId,at,use),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_author_members(author_chain_id,message_chain_id,author_index,created_at) SELECT ?,c.chain_id,1,? FROM agent_lab_keyboard_capabilities c WHERE c.consumption_id=? AND NOT EXISTS(SELECT 1 FROM agent_lab_keyboard_author_members am WHERE am.message_chain_id=c.chain_id)`).bind(authorId,at,use),
  ];
  if(mode==="continue")common.push(
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_chains(id,created_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM agent_lab_keyboard_capabilities WHERE consumption_id=?)`).bind(chainId,at,use),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_messages(id,chain_id,value,symbol_count,created_at) SELECT ?,?,'',0,? WHERE EXISTS(SELECT 1 FROM agent_lab_keyboard_capabilities WHERE consumption_id=?)`).bind(messageId,chainId,at,use),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_author_members(author_chain_id,message_chain_id,author_index,created_at) SELECT am.author_chain_id,?,(SELECT MAX(x.author_index)+1 FROM agent_lab_keyboard_author_members x WHERE x.author_chain_id=am.author_chain_id),? FROM agent_lab_keyboard_capabilities c JOIN agent_lab_keyboard_author_members am ON am.message_chain_id=c.chain_id WHERE c.consumption_id=?`).bind(chainId,at,use),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,predecessor_capability_id,token_hash,expected_operation,created_at,expires_at) SELECT ?,?,?,id,?,'choose',?,? FROM agent_lab_keyboard_capabilities WHERE consumption_id=?`).bind(nextId,chainId,messageId,await hashSecret(next),at,expires(now),use),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,author_chain_id,capability_id,operation,outcome,symbol_count,created_at) SELECT ?,?,?,am.author_chain_id,c.id,'continue','allowed',0,? FROM agent_lab_keyboard_capabilities c JOIN agent_lab_keyboard_author_members am ON am.message_chain_id=? WHERE c.consumption_id=?`).bind(opaque("ake"),chainId,messageId,at,chainId,use)
  );else common.push(
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,author_chain_id,predecessor_capability_id,token_hash,expected_operation,created_at) SELECT ?,am.author_chain_id,c.id,?,'reenter',? FROM agent_lab_keyboard_capabilities c JOIN agent_lab_keyboard_author_members am ON am.message_chain_id=c.chain_id WHERE c.consumption_id=?`).bind(nextId,await hashSecret(next),at,use),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,author_chain_id,capability_id,operation,outcome,symbol_count,created_at) SELECT ?,c.chain_id,c.message_id,am.author_chain_id,c.id,'preserve','allowed',m.symbol_count,? FROM agent_lab_keyboard_capabilities c JOIN agent_lab_keyboard_messages m ON m.id=c.message_id JOIN agent_lab_keyboard_author_members am ON am.message_chain_id=c.chain_id WHERE c.consumption_id=?`).bind(opaque("ake"),at,use)
  );
  const results=await env.DB.batch(common);if((results[0].meta.changes??0)!==1)return rejectKeyboard(env,"continue",capability,undefined,undefined,mode);
  return redirect(request,"/agent-lab/keyboard/view",{cap:next});
}
export const continueAgentLabKeyboard=(request:Request,env:Env)=>consumeDecision(request,env,"continue");
export const preserveAgentLabKeyboard=(request:Request,env:Env)=>consumeDecision(request,env,"preserve");

export async function reenterAgentLabKeyboard(request:Request,env:Env):Promise<Response>{
  const capability=new URL(request.url).searchParams.get("cap");if(!capability||!keyboardCapabilityPattern.test(capability))return rejectKeyboard(env,"reenter",capability);
  const now=new Date(),at=now.toISOString(),hash=await hashSecret(capability),use=opaque("aku"),chainId=opaque("akc"),messageId=opaque("akm"),next=opaque("labkey"),nextId=opaque("akp");const results=await env.DB.batch([
    env.DB.prepare(`UPDATE agent_lab_keyboard_capabilities SET consumed_at=?,consumption_id=? WHERE token_hash=? AND expected_operation='reenter' AND consumed_at IS NULL AND revoked_at IS NULL AND author_chain_id IS NOT NULL`).bind(at,use,hash),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_chains(id,created_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM agent_lab_keyboard_capabilities WHERE consumption_id=?)`).bind(chainId,at,use),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_messages(id,chain_id,value,symbol_count,created_at) SELECT ?,?,'',0,? WHERE EXISTS(SELECT 1 FROM agent_lab_keyboard_capabilities WHERE consumption_id=?)`).bind(messageId,chainId,at,use),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_author_members(author_chain_id,message_chain_id,author_index,created_at) SELECT author_chain_id,?,(SELECT MAX(author_index)+1 FROM agent_lab_keyboard_author_members WHERE author_chain_id=c.author_chain_id),? FROM agent_lab_keyboard_capabilities c WHERE consumption_id=?`).bind(chainId,at,use),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,predecessor_capability_id,token_hash,expected_operation,created_at,expires_at) SELECT ?,?,?,id,?,'choose',?,? FROM agent_lab_keyboard_capabilities WHERE consumption_id=?`).bind(nextId,chainId,messageId,await hashSecret(next),at,expires(now),use),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,author_chain_id,capability_id,operation,outcome,symbol_count,created_at) SELECT ?,?,?,author_chain_id,id,'reenter','allowed',0,? FROM agent_lab_keyboard_capabilities WHERE consumption_id=?`).bind(opaque("ake"),chainId,messageId,at,use),
  ]);if((results[0].meta.changes??0)!==1)return rejectKeyboard(env,"reenter",capability);return redirect(request,"/agent-lab/keyboard/view",{cap:next});
}

function publicPage(body:string,status=200):Response{return new Response(`<!doctype html>\n<meta charset="utf-8">\n${body}`,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}})}
export async function indexAgentLabKeyboard(request:Request,env:Env):Promise<Response>{
  const rows=(await env.DB.prepare(`SELECT m.chain_id,m.value,m.completed_at,am.author_chain_id FROM agent_lab_keyboard_messages m LEFT JOIN agent_lab_keyboard_author_members am ON am.message_chain_id=m.chain_id WHERE m.completed_at IS NOT NULL ORDER BY m.completed_at DESC,m.chain_id DESC LIMIT 100`).all<{chain_id:string;value:string;completed_at:string;author_chain_id:string|null}>()).results;
  const items=rows.map(row=>`<li><pre class="value">${escapeHtml(row.value)}</pre><time>${escapeHtml(row.completed_at)}</time> <code>${escapeHtml(row.chain_id)}</code>${row.author_chain_id?` <a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/author",{id:row.author_chain_id}))}">${escapeHtml(row.author_chain_id)}</a>`:""} <a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/message",{id:row.chain_id}))}">detail</a></li>`).join("\n");return publicPage(`<ol>\n${items}\n</ol>\n`);
}
export async function messageAgentLabKeyboard(request:Request,env:Env):Promise<Response>{
  const id=new URL(request.url).searchParams.get("id")??"",row=await env.DB.prepare(`SELECT m.chain_id,m.value,m.completed_at,am.author_chain_id,tm.thread_chain_id FROM agent_lab_keyboard_messages m LEFT JOIN agent_lab_keyboard_author_members am ON am.message_chain_id=m.chain_id LEFT JOIN agent_lab_keyboard_thread_members tm ON tm.message_chain_id=m.chain_id WHERE m.chain_id=? AND m.completed_at IS NOT NULL`).bind(id).first<{chain_id:string;value:string;completed_at:string;author_chain_id:string|null;thread_chain_id:string|null}>();if(!row)return publicPage("<p>Not found.</p>\n",404);return publicPage(`<pre id="value">${escapeHtml(row.value)}</pre>\n<time>${escapeHtml(row.completed_at)}</time>\n<code>${escapeHtml(row.chain_id)}</code>${row.author_chain_id?`\n<a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/author",{id:row.author_chain_id}))}">${escapeHtml(row.author_chain_id)}</a>`:""}${row.thread_chain_id?`\n<a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/thread",{id:row.thread_chain_id}))}">thread ${escapeHtml(row.thread_chain_id)}</a>`:""}\n<a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/reply",{to:row.chain_id}))}">reply</a>\n`);
}
export async function authorAgentLabKeyboard(request:Request,env:Env):Promise<Response>{
  const id=new URL(request.url).searchParams.get("id")??"",exists=await env.DB.prepare(`SELECT id FROM agent_lab_keyboard_author_chains WHERE id=?`).bind(id).first();if(!exists)return publicPage("<p>Not found.</p>\n",404);const rows=(await env.DB.prepare(`SELECT am.author_index,m.chain_id,m.value,m.completed_at FROM agent_lab_keyboard_author_members am JOIN agent_lab_keyboard_messages m ON m.chain_id=am.message_chain_id WHERE am.author_chain_id=? AND m.completed_at IS NOT NULL ORDER BY am.author_index`).bind(id).all<{author_index:number;chain_id:string;value:string;completed_at:string}>()).results;return publicPage(`<code>${escapeHtml(id)}</code>\n<ol>\n${rows.map(row=>`<li value="${row.author_index}"><pre>${escapeHtml(row.value)}</pre><code>${escapeHtml(row.chain_id)}</code> <a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/message",{id:row.chain_id}))}">detail</a></li>`).join("\n")}\n</ol>\n`);
}

export async function replyAgentLabKeyboard(request:Request,env:Env):Promise<Response>{
  const target=new URL(request.url).searchParams.get("to")??"";
  const completed=await env.DB.prepare(`SELECT chain_id FROM agent_lab_keyboard_messages WHERE chain_id=? AND completed_at IS NOT NULL`).bind(target).first<{chain_id:string}>();
  if(!completed)return publicPage("<p>Not found.</p>\n",404);
  const existing=await env.DB.prepare(`SELECT thread_chain_id FROM agent_lab_keyboard_thread_members WHERE message_chain_id=?`).bind(target).first<{thread_chain_id:string}>();
  // A deterministic root-derived ID makes simultaneous first replies converge.
  const threadId=existing?.thread_chain_id??`akt_${(await hashSecret(target)).slice(0,36)}`;
  const now=new Date(),at=now.toISOString(),chainId=opaque("akc"),messageId=opaque("akm"),capabilityId=opaque("akp"),capability=opaque("labkey");
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO agent_lab_keyboard_thread_chains(id,created_at) VALUES(?,?)`).bind(threadId,at),
    env.DB.prepare(`INSERT OR IGNORE INTO agent_lab_keyboard_thread_members(thread_chain_id,message_chain_id,thread_index,parent_message_chain_id,created_at) VALUES(?,?,1,NULL,?)`).bind(threadId,target,at),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_chains(id,created_at) VALUES(?,?)`).bind(chainId,at),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_messages(id,chain_id,value,symbol_count,created_at) VALUES(?,?, '',0,?)`).bind(messageId,chainId,at),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_thread_members(thread_chain_id,message_chain_id,thread_index,parent_message_chain_id,created_at) SELECT ?,?,COALESCE(MAX(thread_index),0)+1,?,? FROM agent_lab_keyboard_thread_members WHERE thread_chain_id=?`).bind(threadId,chainId,target,at,threadId),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,token_hash,expected_operation,created_at,expires_at) VALUES(?,?,?,?, 'choose',?,?)`).bind(capabilityId,chainId,messageId,await hashSecret(capability),at,expires(now)),
    env.DB.prepare(`INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at) VALUES(?,?,?,?,'enter','created',0,?)`).bind(opaque("ake"),chainId,messageId,capabilityId,at),
  ]);
  return redirect(request,"/agent-lab/keyboard/view",{cap:capability});
}

export async function threadAgentLabKeyboard(request:Request,env:Env):Promise<Response>{
  const id=new URL(request.url).searchParams.get("id")??"",exists=await env.DB.prepare(`SELECT id FROM agent_lab_keyboard_thread_chains WHERE id=?`).bind(id).first();
  if(!exists)return publicPage("<p>Not found.</p>\n",404);
  const rows=(await env.DB.prepare(`SELECT tm.thread_index,tm.parent_message_chain_id,m.chain_id,m.value,m.completed_at FROM agent_lab_keyboard_thread_members tm JOIN agent_lab_keyboard_messages m ON m.chain_id=tm.message_chain_id WHERE tm.thread_chain_id=? AND m.completed_at IS NOT NULL ORDER BY tm.thread_index`).bind(id).all<{thread_index:number;parent_message_chain_id:string|null;chain_id:string;value:string;completed_at:string}>()).results;
  return publicPage(`<code>${escapeHtml(id)}</code>\n<ol>\n${rows.map(row=>`<li value="${row.thread_index}"><pre>${escapeHtml(row.value)}</pre><a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/message",{id:row.chain_id}))}"><code>${escapeHtml(row.chain_id)}</code></a>${row.parent_message_chain_id?` <span>reply to <a href="${escapeHtml(absolute(request,"/agent-lab/keyboard/message",{id:row.parent_message_chain_id}))}"><code>${escapeHtml(row.parent_message_chain_id)}</code></a></span>`:` <span>root</span>`}</li>`).join("\n")}\n</ol>\n`);
}
