const style = `<style>body{font:16px system-ui;max-width:760px;margin:3rem auto;padding:0 1rem;color:#172033}a,button{color:#3454d1}textarea,input,select{box-sizing:border-box;width:100%;padding:.65rem;margin:.3rem 0 1rem}textarea{min-height:12rem}article{border:1px solid #ccd3df;padding:1rem;margin:1rem 0;border-radius:8px}.meta{color:#526078}.actions{display:flex;gap:.75rem}.actions button{width:auto}.edit,.history{margin-top:1rem}.history pre{white-space:pre-wrap}</style>`;

export function loginPage(): Response {
  return new Response(`<!doctype html><title>Loom — Sign in</title>${style}<main><h1>Loom</h1><p>Your participant-owned writing space.</p><a href="/auth/discord">Continue with Discord</a></main>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export function spacePage(displayName: string, participantId: string): Response {
  return new Response(`<!doctype html><title>My Space — Loom</title>${style}<main><nav><a href="/me">My Space / Documents</a> · <a href="/projects">Projects</a> · <a href="/control-room">Control Room / Profile</a></nav><h1>${escapeHtml(displayName)}’s space</h1><p><a href="/api/me/export" download>Export my space</a> as a portable ZIP archive.</p><h2>Create</h2><form id="new"><label>Title<input name="title" maxlength="120" required></label><label>Kind<select name="kind"><option value="document">Document</option><option value="profile">Profile</option><option value="introduction">Introduction</option></select></label><label>Visibility<select name="visibility"><option value="private">Private</option><option value="public">Public</option></select></label><label>Markdown<textarea name="content" required></textarea></label><button>Create document</button></form><h2>Upload</h2><form id="upload"><label>File (.md, .txt, .json; max 256 KB)<input type="file" name="file" accept=".md,.txt,.json" required></label><label>Visibility<select name="visibility"><option value="private">Private</option><option value="public">Public</option></select></label><button>Upload file</button></form><h2>Documents</h2><section id="documents" aria-live="polite"></section></main><script>
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
  actions.append(button('Edit content',()=>showEdit(d,panels)),button('Rename / move / visibility',()=>showMetadata(d,panels)),button('Revision history',()=>showHistory(d,panels)),button('Delete',()=>removeDocument(d)));
  article.append(heading,meta,content,actions,panels);return article;
}
function showMetadata(d,panel){panel.replaceChildren();const form=document.createElement('form');form.innerHTML='<label>Title<input name="title" maxlength="120" required></label><label>Logical path<input name="logicalPath" maxlength="240" required></label><label>Visibility<select name="visibility"><option value="private">Private</option><option value="public">Public</option></select></label><button>Save document details</button>';form.elements.namedItem('title').value=d.title;form.elements.namedItem('logicalPath').value=d.logical_path;form.elements.namedItem('visibility').value=d.visibility;form.append(button('Cancel',()=>panel.replaceChildren()));panel.append(form);form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),r=await fetch('/api/me/documents/'+d.id+'/metadata',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({title:f.get('title'),logicalPath:f.get('logicalPath'),visibility:f.get('visibility')})});if(r.ok)await load();else alert(errorMessage(await r.json()))}}
function showEdit(d,panel){
  panel.replaceChildren();const form=document.createElement('form'),label=document.createElement('label'),textarea=document.createElement('textarea'),save=document.createElement('button'),cancel=button('Cancel',()=>panel.replaceChildren());
  form.className='edit';label.textContent='Content';textarea.name='content';textarea.required=true;textarea.value=d.content;save.textContent='Save revision';
  label.append(textarea);form.append(label,save,cancel);panel.append(form);
  form.onsubmit=async e=>{e.preventDefault();save.disabled=true;const r=await fetch('/api/me/documents/'+d.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({content:textarea.value,contentType:d.content_type})});if(r.ok)await load();else{save.disabled=false;alert(errorMessage(await r.json()))}};
}
async function showHistory(d,panel){
  panel.replaceChildren();const status=document.createElement('p');status.textContent='Loading revision history…';panel.append(status);
  const r=await fetch('/api/me/documents/'+d.id+'/versions'),j=await r.json();if(!r.ok){status.textContent=errorMessage(j);return}
  const section=document.createElement('section');section.className='history';const title=document.createElement('h3'),close=button('Close',()=>panel.replaceChildren());title.textContent='Revision history';section.append(title,close);
  for(const entry of j.timeline){const h=document.createElement('h4'),meta=document.createElement('p'),date=document.createElement('time'),body=document.createElement('pre');meta.className='meta';meta.append('By '+revisionAuthor(entry)+' · ');date.dateTime=entry.created_at;date.textContent=new Date(entry.created_at).toLocaleString();meta.append(date);if(entry.entry_type==='content_revision'){h.textContent='Content revision '+entry.version_number;body.textContent=entry.content}else{h.textContent='Document details changed';body.textContent=Object.entries(entry.changes).map(([field,change])=>field+': '+change.previous+' → '+change.new).join('\n')}section.append(h,meta,body)}
  panel.replaceChildren(section);
}
async function removeDocument(d){
  if(!confirm('Delete “'+d.title+'” and all of its revision history? This cannot be undone.'))return;
  const r=await fetch('/api/me/documents/'+d.id,{method:'DELETE'});if(r.ok)await load();else alert(errorMessage(await r.json()));
}
document.querySelector('#new').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/me/documents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:f.get('title'),kind:f.get('kind'),visibility:f.get('visibility'),content:f.get('content'),contentType:'text/markdown'})});if(r.ok){e.target.reset();load()}else alert(errorMessage(await r.json()))};load();
document.querySelector('#upload').onsubmit=async e=>{e.preventDefault();const r=await fetch('/api/me/documents/upload',{method:'POST',body:new FormData(e.target)});if(r.ok){e.target.reset();load()}else alert(errorMessage(await r.json()))};
</script>`, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'" } });
}

export function controlRoomPage(): Response {
  return new Response(`<!doctype html><title>Control Room — Loom</title>${style}<main><nav><a href="/me">My Space / Documents</a> · <a href="/projects">Projects</a></nav><h1>Control Room / Profile</h1><dl id="identity"></dl><form id="profile"><label>Loom display name<input name="displayName" maxlength="80" required></label><button>Save display name</button></form></main><script>const identity=document.querySelector('#identity'),form=document.querySelector('#profile');function identityRow(label,value,code=false){const term=document.createElement('dt'),description=document.createElement('dd'),content=code?document.createElement('code'):description;term.textContent=label;if(code){content.textContent=value;description.append(content)}else description.textContent=value;identity.append(term,description)}async function load(){const r=await fetch('/api/me/profile'),j=await r.json();identity.replaceChildren();identityRow('Stable participant ID',j.participant.id,true);identityRow('Provenance lookup ID',j.participant.lookupId,true);identityRow('Connected providers',j.identities.map(i=>i.provider+' ('+i.provider_user_id+')').join(', ')||'None');form.elements.namedItem('displayName').value=j.participant.displayName}form.onsubmit=async e=>{e.preventDefault();const displayName=form.elements.namedItem('displayName');const r=await fetch('/api/me/profile',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:displayName.value})});if(r.ok)load();else alert((await r.json()).error.message)};load()</script>`, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'" } });
}

export function projectsPage(): Response {
  return new Response(`<!doctype html><title>Projects — Loom</title>${style}<main><nav><a href="/me">My Space / Documents</a> · <a href="/control-room">Control Room / Profile</a></nav><h1>Projects</h1><p>Projects reference participant-owned documents; they do not copy or transfer ownership. Adding a document grants the project’s read audience access, but never write or delete authority.</p><form id="new"><label>Name<input name="name" required maxlength="120"></label><label>Read audience<select name="readAudience"><option value="members_and_agents">Members and agents</option><option value="agents_only">Agents only (documents hidden from human browsing)</option></select></label><button>Create project</button></form><section id="projects"></section></main><script>
const section=document.querySelector('#projects');
function element(tag,textValue,className){const node=document.createElement(tag);if(textValue!==undefined)node.textContent=textValue;if(className)node.className=className;return node}
function labeledInput(textValue,name){const label=element('label',textValue),input=document.createElement('input');input.name=name;label.append(input);return {label,input}}
function submitButton(textValue){const result=element('button',textValue);result.type='submit';return result}
function memberRow(member){const row=element('li');row.textContent=member.display_name+' · '+member.participant_id+' · '+member.role;return row}
function documentRow(documentValue){const row=element('li'),title=element('strong',documentValue.title),metadata=element('span',' — '+documentValue.logical_path+' · owner '+documentValue.owner_display_name+' ('+documentValue.owner_participant_id+')'),content=element('pre',documentValue.content);row.append(title,metadata,content);return row}
async function load(){const j=await(await fetch('/api/projects')).json();section.replaceChildren(...j.projects.map(p=>{const article=element('article'),heading=element('h2',p.name),meta=element('p','Read audience: '+p.read_audience+' · Role: '+p.role,'meta'),open=element('button','Open project');open.type='button';open.onclick=()=>openProject(p.id,article);article.append(heading,meta,open);return article}))}
async function openProject(id,article){const j=await(await fetch('/api/projects/'+id)).json();article.querySelectorAll('section').forEach(node=>node.remove());const details=element('section'),membersHeading=element('h3','Members'),members=element('ul');members.append(...j.members.map(memberRow));const documentsHeading=element('h3','Linked documents'),documents=element('ul');if(j.documentsHiddenFromHumans)documents.append(element('li','Hidden from human members by agents_only policy'));else documents.append(...j.documents.map(documentRow));const memberForm=document.createElement('form'),memberField=labeledInput('Add existing participant ID','participantId');memberForm.append(memberField.label,submitButton('Add member'));const documentForm=document.createElement('form'),documentField=labeledInput('Link one of your document IDs','documentId');documentForm.append(documentField.label,submitButton('Link my document'));memberForm.onsubmit=async e=>{e.preventDefault();await fetch('/api/projects/'+id+'/members',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({participantId:memberField.input.value})});openProject(id,article)};documentForm.onsubmit=async e=>{e.preventDefault();if(!confirm('This grants the project-defined read audience access. Ownership and write control stay with you.'))return;await fetch('/api/projects/'+id+'/documents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documentId:documentField.input.value})});openProject(id,article)};details.append(membersHeading,members,documentsHeading,documents,memberForm,documentForm);article.append(details)}
document.querySelector('#new').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),r=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:f.get('name'),readAudience:f.get('readAudience')})});if(r.ok){e.target.reset();load()}else alert((await r.json()).error.message)};load()</script>`, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'" } });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
