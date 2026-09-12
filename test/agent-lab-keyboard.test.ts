import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hashSecret } from "../src/auth";

const origin="https://loom.example";
const get=(url:string)=>SELF.fetch(url.startsWith("http")?url:origin+url);
type Menu={response:Response;body:string;value:string;links:Map<string,string>};

function decodeHtml(value:string):string {
  const entities:Record<string,string>={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&#39;":"'"};
  return value.replace(/&(amp|lt|gt|quot|#39);/g,entity=>entities[entity]!);
}
function anchors(body:string):Array<{label:string;href:string}>{
  return [...body.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)].map(match=>({href:decodeHtml(match[1]),label:decodeHtml(match[2])}));
}
function onlyHref(body:string):string {
  const found=anchors(body);expect(found).toHaveLength(1);return found[0].href;
}
function expectNativeActionsOnly(body:string):void {
  expect(body).not.toMatch(/<(?:form|button|script|iframe)\b/i);expect(body).not.toMatch(/(?:javascript:|http-equiv=["']?refresh)/i);
}
async function menu(url="/agent-lab/keyboard/enter"):Promise<Menu>{
  const response=await get(url),body=await response.text(),valueMatch=body.match(/<pre id="value">([\s\S]*?)<\/pre>/),links=new Map<string,string>();
  for(const anchor of anchors(body))links.set(anchor.label,anchor.href);
  expectNativeActionsOnly(body);
  return {response,body,value:decodeHtml(valueMatch?.[1]??""),links};
}
function cap(current:Menu){return new URL(current.links.get("a")!).searchParams.get("cap")!}
async function choose(current:Menu,choice:string){return menu(current.links.get(choice)!)}
async function messageFor(raw:string){
  return env.DB.prepare(`SELECT m.id,m.chain_id,m.message_index,m.value,m.symbol_count,m.completed_at,c.id capability_id,c.predecessor_capability_id,c.expected_operation FROM agent_lab_keyboard_messages m JOIN agent_lab_keyboard_capabilities c ON c.message_id=m.id WHERE c.token_hash=?`).bind(await hashSecret(raw)).first<{id:string;chain_id:string;message_index:number;value:string;symbol_count:number;completed_at:string|null;capability_id:string;predecessor_capability_id:string|null;expected_operation:string}>();
}
async function latestOutcome(raw:string){
  return env.DB.prepare(`SELECT e.outcome FROM agent_lab_keyboard_events e JOIN agent_lab_keyboard_capabilities c ON c.id=e.capability_id WHERE c.token_hash=? ORDER BY e.created_at DESC,e.rowid DESC LIMIT 1`).bind(await hashSecret(raw)).first<{outcome:string}>();
}
async function capabilityCount(raw:string){
  return env.DB.prepare(`SELECT count(*) count FROM agent_lab_keyboard_capabilities WHERE chain_id=(SELECT chain_id FROM agent_lab_keyboard_capabilities WHERE token_hash=?)`).bind(await hashSecret(raw)).first<{count:number}>();
}

describe("verbatim-link compositional keyboard",()=>{
  it("enters with a fresh empty persisted message and one deterministic 28-link menu",async()=>{
    const first=await menu("/agent-lab/keyboard/enter?fresh=run-one"),second=await menu("/agent-lab/keyboard/enter?fresh=run-two"),stable=await menu(),labels=[..."abcdefghijklmnopqrstuvwxyz","space","done"];
    expect(first.response.status).toBe(200);expect(first.value).toBe("");expect([...first.links.keys()]).toEqual(labels);expect(first.links.size).toBe(28);
    const capabilities=new Set([...first.links.entries()].map(([label,link])=>{const parsed=new URL(link);expect(parsed.origin).toBe(origin);expect(parsed.pathname).toBe("/agent-lab/keyboard/choose");expect(parsed.searchParams.get("choice")).toBe(label);return parsed.searchParams.get("cap")}));
    expect(capabilities.size).toBe(1);expect(cap(first)).not.toBe(cap(second));
    expect(cap(first)).not.toBe(cap(second));expect(cap(stable)).not.toBe(cap(first));
    expect(await messageFor(cap(first))).toMatchObject({value:"",symbol_count:0,message_index:1,completed_at:null,predecessor_capability_id:null});
    expect(first.body).not.toContain("run-one");expect(JSON.stringify((await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_capabilities WHERE chain_id=?`).bind((await messageFor(cap(first)))!.chain_id).all()).results)).not.toContain("run-one");
    expect(anchors(first.body).map(anchor=>anchor.label)).toEqual(labels);expect(first.body).not.toContain(`${first.links.get("a")}`);
    expect(first.response.headers.get("content-type")).toBe("text/html; charset=utf-8");expect(first.response.headers.get("cache-control")).toBe("no-store");
  });

  it("persists every partial while composing pebble through returned URLs",async()=>{
    let current=await menu();
    for(const partial of ["p","pe","peb","pebb","pebbl","pebble"]){current=await choose(current,partial.at(-1)!);expect(current.value).toBe(partial);expect((await messageFor(cap(current)))?.value).toBe(partial)}
    expect(current.links.size).toBe(28);
  });

  it("escapes the exact current value and every action href in rendered HTML",async()=>{
    const current=await menu(),row=await messageFor(cap(current)),unsafeValue=`<unsafe & "quoted">`;
    await env.DB.prepare(`UPDATE agent_lab_keyboard_messages SET value=?,symbol_count=? WHERE id=?`).bind(unsafeValue,unsafeValue.length,row!.id).run();
    const rendered=await choose(current,"p");
    expect(rendered.value).toBe(`<unsafe & "quoted">p`);expect(rendered.body).toContain(`&lt;unsafe &amp; &quot;quoted&quot;&gt;p`);
    expect(rendered.body).not.toContain(`<unsafe`);expect(rendered.body).toContain("&amp;choice=a");expect(rendered.links.get("a")).toContain("&choice=a");
  });

  it("consumes a shared choice once, creates one successor, and cannot fork",async()=>{
    const start=await menu(),old=cap(start),p=start.links.get("p")!,sibling=start.links.get("q")!;
    const selected=await menu(p);expect(selected.value).toBe("p");expect(cap(selected)).not.toBe(old);
    const rejected=await get(sibling);expect(rejected.status).toBe(403);expect(await rejected.text()).toBe("Capability rejected.\n");
    const row=await messageFor(old);expect(row?.value).toBe("p");
    expect((await env.DB.prepare(`SELECT count(*) count FROM agent_lab_keyboard_capabilities WHERE chain_id=? AND expected_operation='choose'`).bind(row!.chain_id).first<{count:number}>())?.count).toBe(2);
    const race=await menu(),responses=await Promise.all([get(race.links.get("a")!),get(race.links.get("b")!),get(race.links.get("c")!)]);
    expect(responses.filter(item=>item.status===200)).toHaveLength(1);expect(responses.filter(item=>item.status===403)).toHaveLength(2);
    const raced=await messageFor(cap(race));expect(raced?.symbol_count).toBe(1);
    expect((await env.DB.prepare(`SELECT count(*) count FROM agent_lab_keyboard_capabilities WHERE chain_id=? AND expected_operation='choose'`).bind(raced!.chain_id).first<{count:number}>())?.count).toBe(2);
  });

  it("classifies invalid choices by capability state without consuming or issuing successors",async()=>{
    const invalidRequest=async(current:Menu)=>{const invalid=new URL(current.links.get("a")!);invalid.searchParams.set("choice","A");const response=await get(invalid.toString());expect(response.status).toBe(403);expect(await response.text()).toBe("Capability rejected.\n")};

    const live=await menu(),liveRaw=cap(live);await invalidRequest(live);
    expect((await latestOutcome(liveRaw))?.outcome).toBe("invalid_choice");expect((await capabilityCount(liveRaw))?.count).toBe(1);
    const spaced=await choose(live,"space");expect(spaced.value).toBe(" ");expect((await messageFor(cap(spaced)))?.symbol_count).toBe(1);

    const consumed=await menu(),consumedRaw=cap(consumed);await choose(consumed,"a");const consumedCount=(await capabilityCount(consumedRaw))?.count;await invalidRequest(consumed);
    expect((await latestOutcome(consumedRaw))?.outcome).toBe("replayed");expect((await capabilityCount(consumedRaw))?.count).toBe(consumedCount);

    const expired=await menu(),expiredRaw=cap(expired);await env.DB.prepare(`UPDATE agent_lab_keyboard_capabilities SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?`).bind(await hashSecret(expiredRaw)).run();await invalidRequest(expired);
    expect((await latestOutcome(expiredRaw))?.outcome).toBe("expired");expect((await capabilityCount(expiredRaw))?.count).toBe(1);

    const completed=await menu(),chooseRaw=cap(completed),done=await get(completed.links.get("done")!),readUrl=onlyHref(await done.text()),readRaw=new URL(readUrl).searchParams.get("cap")!,invalidRead=new URL(completed.links.get("a")!);invalidRead.searchParams.set("cap",readRaw);invalidRead.searchParams.set("choice","A");const beforeReadReject=(await capabilityCount(chooseRaw))?.count;
    expect((await get(invalidRead.toString())).status).toBe(403);expect((await latestOutcome(readRaw))?.outcome).toBe("wrong_operation");expect((await capabilityCount(readRaw))?.count).toBe(beforeReadReject);
  });

  it("rejects symbol 129 without consumption while allowing done from the same menu",async()=>{
    let current=await menu();for(let index=0;index<128;index++)current=await choose(current,"a");
    expect(current.value).toBe("a".repeat(128));const currentCap=cap(current),extra=await get(current.links.get("b")!);
    expect(extra.status).toBe(403);expect((await messageFor(currentCap))?.symbol_count).toBe(128);
    const done=await get(current.links.get("done")!);expect(done.status).toBe(200);expect(new URL(onlyHref(await done.text())).pathname).toBe("/agent-lab/keyboard/read");
  });

  it("completes, reads, and continues nonempty and empty messages",async()=>{
    for(const expected of ["pebble",""]){
      let current=await menu();for(const letter of expected)current=await choose(current,letter);
      const stale=current.links.get("a")!,before=await messageFor(cap(current)),done=await get(current.links.get("done")!),doneBody=await done.text(),readUrl=onlyHref(doneBody),parsedRead=new URL(readUrl);
      expect(done.status).toBe(200);expect(done.headers.get("content-type")).toBe("text/html; charset=utf-8");expect(done.headers.get("cache-control")).toBe("no-store");expect(anchors(doneBody)).toEqual([{label:"read",href:readUrl}]);expectNativeActionsOnly(doneBody);
      expect(parsedRead.origin).toBe(origin);expect(parsedRead.pathname).toBe("/agent-lab/keyboard/read");expect(parsedRead.searchParams.get("id")).toBe(before!.id);expect(parsedRead.searchParams.get("cap")).toMatch(/^labkey_/);
      const after=await env.DB.prepare(`SELECT value,symbol_count,completed_at FROM agent_lab_keyboard_messages WHERE id=?`).bind(before!.id).first<{value:string;symbol_count:number;completed_at:string|null}>();
      expect(after).toMatchObject({value:expected,symbol_count:expected.length});expect(after?.completed_at).toBeTruthy();expect((await get(stale)).status).toBe(403);
      const read=await get(readUrl),readBody=await read.text(),continueUrl=onlyHref(readBody),continueToken=new URL(continueUrl).searchParams.get("cap")!;
      expect(read.status).toBe(200);expect(read.headers.get("content-type")).toBe("text/html; charset=utf-8");expect(read.headers.get("cache-control")).toBe("no-store");expect(decodeHtml(readBody.match(/<pre id="value">([\s\S]*?)<\/pre>/)![1])).toBe(expected);expectNativeActionsOnly(readBody);
      expect(new URL(continueUrl).pathname).toBe("/agent-lab/keyboard/continue");expect(await messageFor(continueToken)).toMatchObject({chain_id:before!.chain_id,id:before!.id,expected_operation:"continue"});
      const capabilityRows=(await env.DB.prepare(`SELECT id,predecessor_capability_id,expected_operation FROM agent_lab_keyboard_capabilities WHERE chain_id=? ORDER BY rowid DESC LIMIT 2`).bind(before!.chain_id).all<{id:string;predecessor_capability_id:string|null;expected_operation:string}>()).results;
      expect(capabilityRows[0]).toMatchObject({predecessor_capability_id:capabilityRows[1].id,expected_operation:"continue"});
      const countAfterRead=(await capabilityCount(continueToken))!.count;expect((await get(readUrl)).status).toBe(403);expect((await capabilityCount(continueToken))!.count).toBe(countAfterRead);
      const next=await menu(continueUrl),nextRow=await messageFor(cap(next));expect(next.value).toBe("");expect(next.links.size).toBe(28);expect(nextRow).toMatchObject({chain_id:before!.chain_id,message_index:2,predecessor_capability_id:(await messageFor(continueToken))!.capability_id});
      expect((await env.DB.prepare(`SELECT value,completed_at FROM agent_lab_keyboard_messages WHERE id=?`).bind(before!.id).first<{value:string;completed_at:string|null}>())).toMatchObject({value:expected});
      expect((await get(continueUrl)).status).toBe(403);
    }
  });

  it("supports recursive message continuity and keeps the 128-symbol bound per message",async()=>{
    let current=await menu();for(const letter of "pebble")current=await choose(current,letter);
    const first=await messageFor(cap(current)),read1=onlyHref(await (await get(current.links.get("done")!)).text()),continue1=onlyHref(await (await get(read1)).text());
    current=await menu(continue1);for(const letter of "loom")current=await choose(current,letter);
    const second=await messageFor(cap(current)),read2=onlyHref(await (await get(current.links.get("done")!)).text()),continue2=onlyHref(await (await get(read2)).text());let third=await menu(continue2);
    expect(first).toMatchObject({message_index:1,value:"pebble"});expect(second).toMatchObject({message_index:2,value:"loom",chain_id:first!.chain_id});expect(await messageFor(cap(third))).toMatchObject({message_index:3,chain_id:first!.chain_id,value:""});
    expect(await env.DB.prepare(`SELECT value FROM agent_lab_keyboard_messages WHERE id=?`).bind(first!.id).first()).toEqual({value:"pebble"});
    for(let index=0;index<128;index++)third=await choose(third,"a");
    expect((await get(third.links.get("b")!)).status).toBe(403);
  },15000);

  it("allows only one concurrent continuation and rejects invalid continuation states without successors",async()=>{
    const start=await menu(),readUrl=onlyHref(await (await get(start.links.get("done")!)).text()),continueUrl=onlyHref(await (await get(readUrl)).text()),token=new URL(continueUrl).searchParams.get("cap")!,row=await messageFor(token),before=(await capabilityCount(token))!.count;
    const raced=await Promise.all([get(continueUrl),get(continueUrl),get(continueUrl)]);expect(raced.filter(response=>response.status===200)).toHaveLength(1);expect(raced.filter(response=>response.status===403)).toHaveLength(2);
    expect((await env.DB.prepare(`SELECT count(*) count FROM agent_lab_keyboard_messages WHERE chain_id=?`).bind(row!.chain_id).first<{count:number}>())!.count).toBe(2);expect((await capabilityCount(token))!.count).toBe(before+1);
    for(const url of ["/agent-lab/keyboard/continue?cap=bad",`/agent-lab/keyboard/continue?cap=labkey_${"0".repeat(36)}`,`/agent-lab/keyboard/continue?cap=${cap(await menu())}`]){const response=await get(url);expect(response.status).toBe(403);expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");expect(response.headers.get("cache-control")).toBe("no-store")}
  });

  it("rejects malformed, unknown, expired, wrong-operation, and cross-message tokens without successors",async()=>{
    const first=await menu(),second=await menu(),firstRaw=cap(first),secondMessage=await messageFor(cap(second));
    const expired=await menu(),expiredRaw=cap(expired);await env.DB.prepare(`UPDATE agent_lab_keyboard_capabilities SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?`).bind(await hashSecret(expiredRaw)).run();
    const completed=await get(first.links.get("done")!),readUrl=onlyHref(await completed.text()),readToken=new URL(readUrl).searchParams.get("cap")!,before=(await env.DB.prepare(`SELECT count(*) count FROM agent_lab_keyboard_capabilities`).first<{count:number}>())!.count;
    const responses=[await get("/agent-lab/keyboard/choose?cap=bad&choice=a"),await get(`/agent-lab/keyboard/choose?cap=labkey_${"0".repeat(36)}&choice=a`),await get(expired.links.get("a")!),await get(`/agent-lab/keyboard/choose?cap=${readToken}&choice=a`),await get(`/agent-lab/keyboard/read?cap=${readToken}&id=${secondMessage!.id}`)];
    for(const response of responses){expect(response.status).toBe(403);expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");expect(response.headers.get("cache-control")).toBe("no-store")}
    expect((await env.DB.prepare(`SELECT count(*) count FROM agent_lab_keyboard_capabilities`).first<{count:number}>())!.count).toBe(before);
  });

  it("never persists caller-supplied read IDs in rejection events",async()=>{
    const attackerId=`attacker-controlled-${crypto.randomUUID()}`;
    expect((await get(`/agent-lab/keyboard/read?cap=bad&id=${attackerId}`)).status).toBe(403);
    expect((await get(`/agent-lab/keyboard/read?cap=labkey_${"0".repeat(36)}&id=${attackerId}`)).status).toBe(403);
    const unresolved=(await env.DB.prepare(`SELECT message_id,outcome FROM agent_lab_keyboard_events WHERE operation='read' ORDER BY rowid DESC LIMIT 2`).all<{message_id:string|null;outcome:string}>()).results;
    expect(unresolved.map(event=>event.outcome)).toEqual(["unknown","malformed"]);expect(unresolved.every(event=>event.message_id===null)).toBe(true);expect(JSON.stringify(unresolved)).not.toContain(attackerId);

    const owner=await menu(),foreign=await menu(),actualMessage=await messageFor(cap(owner)),foreignMessage=await messageFor(cap(foreign)),done=await get(owner.links.get("done")!),readUrl=new URL(onlyHref(await done.text())),readRaw=readUrl.searchParams.get("cap")!;
    readUrl.searchParams.set("id",foreignMessage!.id);expect((await get(readUrl.toString())).status).toBe(403);
    const rejected=await env.DB.prepare(`SELECT e.message_id,e.outcome FROM agent_lab_keyboard_events e JOIN agent_lab_keyboard_capabilities c ON c.id=e.capability_id WHERE c.token_hash=? ORDER BY e.rowid DESC LIMIT 1`).bind(await hashSecret(readRaw)).first<{message_id:string;outcome:string}>();
    expect(rejected).toEqual({message_id:actualMessage!.id,outcome:"wrong_chain"});expect(rejected?.message_id).not.toBe(foreignMessage!.id);
  });

  it("never persists raw capabilities or message content in events and preserves isolation",async()=>{
    let current=await menu();current=await choose(current,"p");const choiceToken=cap(current),done=await get(current.links.get("done")!),readUrl=onlyHref(await done.text()),readToken=new URL(readUrl).searchParams.get("cap")!;await get(readUrl);
    const capabilities=JSON.stringify((await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_capabilities`).all()).results),events=JSON.stringify((await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_events`).all()).results);
    expect(capabilities).not.toContain(choiceToken);expect(capabilities).not.toContain(readToken);expect(events).not.toContain(choiceToken);expect(events).not.toContain(readToken);expect(events).not.toContain('"value"');
    expect((await get("/agent-lab/keyboard/nope")).status).toBe(401);expect((await get("/api/me")).status).toBe(401);expect(await (await get("/llms.txt")).text()).not.toContain("keyboard");
    expect(await env.DB.prepare(`SELECT id FROM agent_lab_chains WHERE id='alc_migration'`).first()).toBeTruthy();expect(await env.DB.prepare(`SELECT id FROM documents WHERE id='doc_migration'`).first()).toBeTruthy();expect((await env.DB.prepare(`PRAGMA foreign_key_check`).all()).results).toEqual([]);
  });
});
