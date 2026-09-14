import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hashSecret } from "../src/auth";

const origin="https://loom.example";
const get=(url:string)=>SELF.fetch(url.startsWith("http")?url:origin+url);
const getManual=(url:string)=>SELF.fetch(url.startsWith("http")?url:origin+url,{redirect:"manual"});
const decode=(s:string)=>s.replace(/&(amp|lt|gt|quot|#39);/g,x=>({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&#39;":"'"})[x]!);
const anchors=(body:string)=>[...body.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)].map(m=>({href:decode(m[1]),label:decode(m[2])}));
type Menu={body:string;links:Map<string,string>;value:string};
async function menu(url="/agent-lab/keyboard/enter"):Promise<Menu>{const response=await get(url);expect(response.status).toBe(200);const body=await response.text(),links=new Map(anchors(body).map(a=>[a.label,a.href]));expect(body).not.toMatch(/<(?:form|button|script|iframe)\b/i);return {body,links,value:decode(body.match(/<pre id="value">([\s\S]*?)<\/pre>/)?.[1]??"")}}
const token=(m:Menu)=>new URL(m.links.get("a")!).searchParams.get("cap")!;
async function write(value:string){let m=await menu();for(const c of value)m=await menu(m.links.get(c===" "?"space":c)!);return m}
async function junction(m:Menu){const done=await get(m.links.get("done")!),read=anchors(await done.text())[0].href,response=await get(read),body=await response.text();return {response,body,actions:anchors(body)}}
async function row(raw:string){return env.DB.prepare(`SELECT c.id capability_id,c.chain_id,c.message_id,c.author_chain_id,c.predecessor_capability_id,c.expected_operation,c.expires_at,c.revoked_at,c.consumed_at,m.value,m.completed_at FROM agent_lab_keyboard_capabilities c LEFT JOIN agent_lab_keyboard_messages m ON m.id=c.message_id WHERE c.token_hash=?`).bind(await hashSecret(raw)).first<any>()}

describe("Agent Lab author continuity keyboard",()=>{
  it("self-freshens entrance and keeps current capability views non-consuming",async()=>{
    const before=(await env.DB.prepare(`SELECT count(*) n FROM agent_lab_keyboard_chains`).first<{n:number}>())!.n;
    const entrances=await Promise.all([getManual("/agent-lab/keyboard/enter"),getManual("/agent-lab/keyboard/enter")]);
    expect(entrances.map(x=>x.status)).toEqual([303,303]);expect(entrances[0].headers.get("location")).not.toBe(entrances[1].headers.get("location"));
    expect((await env.DB.prepare(`SELECT count(*) n FROM agent_lab_keyboard_chains`).first<{n:number}>())!.n).toBe(before);
    const fresh=await getManual(entrances[0].headers.get("location")!);expect(fresh.status).toBe(303);expect(fresh.headers.get("location")).toContain("/agent-lab/keyboard/view?cap=");
    const viewUrl=fresh.headers.get("location")!,first=await menu(viewUrl),raw=token(first),stored=await row(raw);
    await menu(viewUrl);await menu(viewUrl);expect(await row(raw)).toMatchObject({consumed_at:null,value:""});
    const action=await getManual(first.links.get("a")!);expect(action.status).toBe(303);expect(action.headers.get("location")).toContain("/agent-lab/keyboard/view?cap=");
    const successor=await menu(action.headers.get("location")!);expect(successor.value).toBe("a");await menu(action.headers.get("location")!);expect((await row(token(successor))).consumed_at).toBeNull();expect((await row(raw)).consumed_at).not.toBeNull();expect((await get(first.links.get("b")!)).status).toBe(403);expect(stored.chain_id).toBe((await row(token(successor))).chain_id);
    for(const bad of ["bad","labkey_000000000000000000000000000000000000"])expect((await get(`/agent-lab/keyboard/view?cap=${bad}`)).status).toBe(403);
  });

  it("creates one unaffiliated message chain and keeps the 28-link/128-symbol behavior",async()=>{
    const start=await menu("/agent-lab/keyboard/enter?fresh=unique");expect([...start.links.keys()]).toEqual([..."abcdefghijklmnopqrstuvwxyz","space","done"]);expect(new Set([...start.links.values()].map(x=>new URL(x).searchParams.get("cap"))).size).toBe(1);
    const initial=await row(token(start));expect(initial).toMatchObject({value:"",expected_operation:"choose",predecessor_capability_id:null});expect(await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_author_members WHERE message_chain_id=?`).bind(initial.chain_id).first()).toBeNull();
    let full=start;for(let i=0;i<128;i++)full=await menu(full.links.get("a")!);expect((await get(full.links.get("b")!)).status).toBe(403);expect((await get(full.links.get("done")!)).status).toBe(200);
  },15000);

  it("returns exact text and exactly two junction links sharing one capability",async()=>{
    const m=await write("oranges"),j=await junction(m);expect(j.response.headers.get("cache-control")).toBe("no-store");expect(decode(j.body.match(/<pre id="value">([\s\S]*?)<\/pre>/)![1])).toBe("oranges");expect(j.actions.map(x=>x.label)).toEqual(["next message","preserve author continuity"]);expect(new Set(j.actions.map(x=>new URL(x.href).searchParams.get("cap"))).size).toBe(1);
  });

  it("immediate continuation creates a distinct chain and one ordered author chain, with sibling replay safety",async()=>{
    const first=await write("a"),firstRow=await row(token(first)),j=await junction(first),next=j.actions[0].href,preserve=j.actions[1].href,winner=await get(next);expect(winner.status).toBe(200);expect((await get(preserve)).status).toBe(403);
    const body=await winner.text(),nextToken=new URL(anchors(body)[0].href).searchParams.get("cap")!,nextRow=await row(nextToken);expect(nextRow.chain_id).not.toBe(firstRow.chain_id);expect(nextRow.predecessor_capability_id).toBe((await row(new URL(next).searchParams.get("cap")!)).capability_id);
    const members=(await env.DB.prepare(`SELECT author_chain_id,message_chain_id,author_index FROM agent_lab_keyboard_author_members WHERE author_chain_id=(SELECT author_chain_id FROM agent_lab_keyboard_author_members WHERE message_chain_id=?) ORDER BY author_index`).bind(firstRow.chain_id).all<any>()).results;expect(members.map(x=>x.message_chain_id)).toEqual([firstRow.chain_id,nextRow.chain_id]);expect(members.map(x=>x.author_index)).toEqual([1,2]);
    const race=await junction(await write("race")),responses=await Promise.all([get(race.actions[0].href),get(race.actions[1].href),get(race.actions[0].href)]);expect(responses.filter(x=>x.status===200)).toHaveLength(1);expect(responses.filter(x=>x.status===403)).toHaveLength(2);
  });

  it("keeps an in-progress author member private until it is completed",async()=>{
    const first=await write("alpha"),firstRow=await row(token(first)),secondStart=await menu((await junction(first)).actions[0].href),second=await menu(secondStart.links.get("b")!),secondRow=await row(token(second));
    const membership=await env.DB.prepare(`SELECT author_chain_id,author_index FROM agent_lab_keyboard_author_members WHERE message_chain_id=?`).bind(secondRow.chain_id).first<{author_chain_id:string;author_index:number}>();expect(membership).toMatchObject({author_index:2});
    const authorUrl=`/agent-lab/keyboard/author?id=${membership!.author_chain_id}`,during=await (await get(authorUrl)).text();expect(during).toContain(firstRow.chain_id);expect(during).toContain("alpha");expect(during).not.toContain(secondRow.chain_id);expect(during).not.toContain(">b</pre>");
    expect((await get(second.links.get("done")!)).status).toBe(200);const after=await (await get(authorUrl)).text();expect(after).toContain(secondRow.chain_id);expect(after).toContain(">b</pre>");expect(after.indexOf(firstRow.chain_id)).toBeLessThan(after.indexOf(secondRow.chain_id));
  });

  it("preserves with one hash-only nonexpiring R, re-enters once, and supports a distinct R2",async()=>{
    const first=await write("oranges"),firstRow=await row(token(first)),j=await junction(first),decision=new URL(j.actions[1].href).searchParams.get("cap")!,preserved=await get(j.actions[1].href);expect(preserved.status).toBe(200);expect((await get(j.actions[0].href)).status).toBe(403);
    const body=await preserved.text(),visible=decode(body.match(/<pre id="reentry-url">([\s\S]*?)<\/pre>/)![1]),link=anchors(body);expect(link).toEqual([{label:"re-enter author chain",href:visible}]);expect(new URL(visible).origin).toBe(origin);const r1=new URL(visible).searchParams.get("cap")!,stored=await row(r1);expect(stored).toMatchObject({expected_operation:"reenter",expires_at:null,consumed_at:null});expect(JSON.stringify(stored)).not.toContain(r1);expect(stored.predecessor_capability_id).toBe((await row(decision)).capability_id);
    const entered=await menu(visible),secondRow=await row(token(entered));expect(secondRow.chain_id).not.toBe(firstRow.chain_id);expect(secondRow.predecessor_capability_id).toBe(stored.capability_id);expect((await get(visible)).status).toBe(403);
    let second=entered;for(const c of "apple")second=await menu(second.links.get(c)!);const j2=await junction(second),p2=await get(j2.actions[1].href),r2=new URL(anchors(await p2.text())[0].href).searchParams.get("cap")!;expect(r2).not.toBe(r1);
    const members=(await env.DB.prepare(`SELECT message_chain_id FROM agent_lab_keyboard_author_members WHERE author_chain_id=? ORDER BY author_index`).bind(stored.author_chain_id).all<any>()).results;expect(members.map(x=>x.message_chain_id)).toEqual([firstRow.chain_id,secondRow.chain_id]);
  });

  it("rejects invalid, revoked, and concurrent re-entry without fallback",async()=>{
    expect((await get("/agent-lab/keyboard/reenter?cap=bad")).status).toBe(403);const j=await junction(await write("x")),p=await get(j.actions[1].href),url=anchors(await p.text())[0].href,raw=new URL(url).searchParams.get("cap")!;await env.DB.prepare(`UPDATE agent_lab_keyboard_capabilities SET revoked_at=? WHERE token_hash=?`).bind(new Date().toISOString(),await hashSecret(raw)).run();const before=(await env.DB.prepare(`SELECT count(*) n FROM agent_lab_keyboard_chains`).first<{n:number}>())!.n;expect((await get(url)).status).toBe(403);expect((await env.DB.prepare(`SELECT count(*) n FROM agent_lab_keyboard_chains`).first<{n:number}>())!.n).toBe(before);
    const j2=await junction(await write("y")),p2=await get(j2.actions[1].href),url2=anchors(await p2.text())[0].href,responses=await Promise.all([get(url2),get(url2),get(url2)]);expect(responses.filter(x=>x.status===200)).toHaveLength(1);expect(responses.filter(x=>x.status===403)).toHaveLength(2);
  });

  it("migrates populated 0016 history and exposes safe ordered public pages",async()=>{
    const regression=(globalThis as any).__loomMigrationRegression;expect(regression.keyboardAuthorMigration.messages).toHaveLength(3);expect(regression.keyboardAuthorMigration.messages[0].chain_id).toBe("akc_migration");expect(regression.keyboardAuthorMigration.messages[1].chain_id).not.toBe("akc_migration");expect(regression.keyboardAuthorMigration.memberships.map((x:any)=>x.author_index)).toEqual([1,2]);expect(regression.keyboardAuthorMigration.memberships.some((x:any)=>x.message_chain_id==="akc_migration_single")).toBe(false);expect(regression.keyboardAuthorMigration.capabilities[1].predecessor_capability_id).toBe("akp_migration");expect(regression.foreignKeyErrors).toEqual([]);
    const incomplete=await menu(),incompleteRow=await row(token(incomplete));const current=await write("safe"),currentRow=await row(token(current));await junction(current);await env.DB.prepare(`UPDATE agent_lab_keyboard_messages SET value='<b>&bad</b>',symbol_count=11 WHERE chain_id=?`).bind(currentRow.chain_id).run();const index=await (await get("/agent-lab/keyboard/index")).text();expect(index).toContain("&lt;b&gt;&amp;bad&lt;/b&gt;");expect(index).not.toContain("<b>&bad</b>");expect(index).not.toContain(incompleteRow.chain_id);expect(index).not.toMatch(/labkey_|token_hash|reentry-url/);
    const detail=await (await get(`/agent-lab/keyboard/message?id=${currentRow.chain_id}`)).text();expect(detail).toContain("&lt;b&gt;");expect(detail).not.toMatch(/labkey_|token_hash/);
  });

  it("creates explicit ordered threads without inferring author continuity",async()=>{
    const rootMenu=await write("root"),root=await row(token(rootMenu));await junction(rootMenu);
    expect((await get("/agent-lab/keyboard/reply?to=missing")).status).toBe(404);
    const replyStart=await menu(`/agent-lab/keyboard/reply?to=${root.chain_id}`),reply=await row(token(replyStart));
    expect(await env.DB.prepare(`SELECT * FROM agent_lab_keyboard_author_members WHERE message_chain_id=?`).bind(reply.chain_id).first()).toBeNull();
    const membership=await env.DB.prepare(`SELECT thread_chain_id,thread_index,parent_message_chain_id FROM agent_lab_keyboard_thread_members WHERE message_chain_id=?`).bind(reply.chain_id).first<any>();expect(membership).toMatchObject({thread_index:2,parent_message_chain_id:root.chain_id});
    const hidden=await (await get(`/agent-lab/keyboard/thread?id=${membership.thread_chain_id}`)).text();expect(hidden).toContain("root");expect(hidden).not.toContain(reply.chain_id);
    let replyText=replyStart;for(const c of "<" /* unsupported: install escaped value directly for rendering assertion */)void c;
    await env.DB.prepare(`UPDATE agent_lab_keyboard_messages SET value='&lt;',symbol_count=4 WHERE chain_id=?`).bind(reply.chain_id).run();await junction(replyText);
    const rendered=await (await get(`/agent-lab/keyboard/thread?id=${membership.thread_chain_id}`)).text();expect(rendered.indexOf(root.chain_id)).toBeLessThan(rendered.indexOf(reply.chain_id));expect(rendered).toContain("&amp;lt;");expect(rendered).not.toMatch(/labkey_|token_hash/);
    const nestedStart=await menu(`/agent-lab/keyboard/reply?to=${reply.chain_id}`),nested=await row(token(nestedStart)),nestedMembership=await env.DB.prepare(`SELECT thread_chain_id,thread_index,parent_message_chain_id FROM agent_lab_keyboard_thread_members WHERE message_chain_id=?`).bind(nested.chain_id).first<any>();expect(nestedMembership).toMatchObject({thread_chain_id:membership.thread_chain_id,thread_index:3,parent_message_chain_id:reply.chain_id});
    const detail=await (await get(`/agent-lab/keyboard/message?id=${root.chain_id}`)).text();expect(detail).toContain(`/agent-lab/keyboard/thread?id=${membership.thread_chain_id}`);expect(detail).toContain(`/agent-lab/keyboard/reply?to=${root.chain_id}`);
    expect((globalThis as any).__loomMigrationRegression.keyboardThreadMigration).toEqual({historicalThreads:[],historicalMembers:[]});
  });

  it("keeps Slice 1 and ordinary authentication isolated",async()=>{expect((await get("/agent-lab/enter")).status).toBe(200);expect((await get("/api/me")).status).toBe(401);expect((await env.DB.prepare(`PRAGMA foreign_key_check`).all()).results).toEqual([])});
});
