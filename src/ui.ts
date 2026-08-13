const style = `<style>body{font:16px system-ui;max-width:760px;margin:3rem auto;padding:0 1rem;color:#172033}a,button{color:#3454d1}textarea,input,select{box-sizing:border-box;width:100%;padding:.65rem;margin:.3rem 0 1rem}textarea{min-height:12rem}article{border:1px solid #ccd3df;padding:1rem;margin:1rem 0;border-radius:8px}.meta{color:#526078}.actions{display:flex;gap:.75rem}.actions button{width:auto}.edit,.history{margin-top:1rem}.history pre{white-space:pre-wrap}</style>`;

export function loginPage(): Response {
  return new Response(`<!doctype html><title>Loom — Sign in</title>${style}<main><h1>Loom</h1><p>Your participant-owned writing space.</p><a href="/auth/discord">Continue with Discord</a></main>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export function spacePage(displayName: string, participantId: string): Response {
  return new Response(`<!doctype html><title>My Space — Loom</title>${style}<main><h1>${escapeHtml(displayName)}’s space</h1><p>Your stable participant ID: <code>${participantId}</code></p><form id="new"><label>Title<input name="title" maxlength="120" required></label><label>Kind<select name="kind"><option value="document">Document</option><option value="profile">Profile</option><option value="introduction">Introduction</option></select></label><label>Visibility<select name="visibility"><option value="private">Private</option><option value="public">Public</option></select></label><label>Markdown<textarea name="content" required></textarea></label><button>Create document</button></form><section id="documents" aria-live="polite"></section></main><script>
const docs=document.querySelector('#documents');
function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;return b}
function errorMessage(body){return body&&body.error?body.error.message:'Something went wrong'}
function revisionAuthor(v){
  if(v.actor_type==='human')return v.actor_display_name||'Unknown person';
  if(v.actor_type==='agent')return v.actor_id?'Agent '+v.actor_id:'Agent';
  if(v.actor_type==='system')return 'System';
  return 'Unknown actor';
}
async function load(){
  const r=await fetch('/api/me/documents'),j=await r.json();
  docs.replaceChildren(...j.documents.map(renderDocument));
}
function renderDocument(d){
  const article=document.createElement('article'),heading=document.createElement('h2'),meta=document.createElement('p'),content=document.createElement('pre'),actions=document.createElement('div'),panels=document.createElement('div');
  heading.textContent=d.title;
  meta.className='meta';meta.textContent='Kind: '+d.kind+' · Visibility: '+d.visibility+' · Revision '+d.version_number;
  content.textContent=d.content;actions.className='actions';
  actions.append(button('Edit',()=>showEdit(d,panels)),button('Revision history',()=>showHistory(d,panels)),button('Delete',()=>removeDocument(d)));
  article.append(heading,meta,content,actions,panels);return article;
}
function showEdit(d,panel){
  panel.replaceChildren();const form=document.createElement('form'),label=document.createElement('label'),textarea=document.createElement('textarea'),save=document.createElement('button'),cancel=button('Cancel',()=>panel.replaceChildren());
  form.className='edit';label.textContent='Content';textarea.name='content';textarea.required=true;textarea.value=d.content;save.textContent='Save revision';
  label.append(textarea);form.append(label,save,cancel);panel.append(form);
  form.onsubmit=async e=>{e.preventDefault();save.disabled=true;const r=await fetch('/api/me/documents/'+d.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({content:textarea.value,contentType:d.content_type})});if(r.ok)await load();else{save.disabled=false;alert(errorMessage(await r.json()))}};
}
async function showHistory(d,panel){
  panel.replaceChildren();const status=document.createElement('p');status.textContent='Loading revision history…';panel.append(status);
  const r=await fetch('/api/me/documents/'+d.id+'/versions'),j=await r.json();if(!r.ok){status.textContent=errorMessage(j);return}
  const section=document.createElement('section');section.className='history';const title=document.createElement('h3');title.textContent='Revision history';section.append(title);
  for(const v of j.versions){const h=document.createElement('h4'),meta=document.createElement('p'),date=document.createElement('time'),body=document.createElement('pre');h.textContent='Revision '+v.version_number;meta.className='meta';meta.append('By '+revisionAuthor(v)+' · ');date.dateTime=v.created_at;date.textContent=new Date(v.created_at).toLocaleString();meta.append(date);body.textContent=v.content;section.append(h,meta,body)}
  panel.replaceChildren(section);
}
async function removeDocument(d){
  if(!confirm('Delete “'+d.title+'” and all of its revision history? This cannot be undone.'))return;
  const r=await fetch('/api/me/documents/'+d.id,{method:'DELETE'});if(r.ok)await load();else alert(errorMessage(await r.json()));
}
document.querySelector('#new').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/me/documents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:f.get('title'),kind:f.get('kind'),visibility:f.get('visibility'),content:f.get('content'),contentType:'text/markdown'})});if(r.ok){e.target.reset();load()}else alert(errorMessage(await r.json()))};load();
</script>`, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'" } });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
