import {iconMarkup} from './icons.js';
export const DEFAULT_SLOTS=['tisya-attach','tisya-previous-message','tisya-next-message','tisya-top-message','options_button','extensionsMenuButton','tisya-phrases'];
export function shortcutPreferences(settings){
 const v=settings.输入快捷栏??{位置:DEFAULT_SLOTS,常用语:[]};
 if(!v||!Array.isArray(v.位置)||v.位置.length!==7||v.位置.some(x=>x!==null&&(typeof x!=='string'||!x))||new Set(v.位置.filter(Boolean)).size!==v.位置.filter(Boolean).length||!Array.isArray(v.常用语)||v.常用语.some(x=>!x||typeof x.id!=='string'||typeof x.text!=='string'||!x.text.trim())||new Set(v.常用语.map(x=>x.id)).size!==v.常用语.length)throw Error('输入快捷栏配置损坏；未覆盖原设置');
 return structuredClone(v);
}
export function appendPhrase(document,text){
 const input=document.querySelector('#send_textarea');if(!input||input.disabled||input.readOnly)throw Error('输入框暂不可用');
 input.value+=text;input.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));input.focus();input.setSelectionRange(input.value.length,input.value.length);
}
export function mountInputShortcuts(document,{getSettings,save,onError=()=>{},requirementsControl=null,phoneControl=null,onPhone}={}){
 const win=document.defaultView,composer=document.querySelector('#nonQRFormItems'),left=document.querySelector('#leftSendForm'),right=document.querySelector('#rightSendForm');
 if(!composer||!left||!right)throw Error('输入快捷栏尚未就绪');
 const knownPhone=document.getElementById('tisya-phone-open');
 if(knownPhone&&(phoneControl?phoneControl!==knownPhone:!composer.contains(knownPhone)))throw Error('手机入口不属于当前输入区，未建立重复入口');
 phoneControl??=knownPhone;
 for(const node of [requirementsControl,phoneControl].filter(Boolean))if(node.ownerDocument!==document||node.tagName!=='BUTTON'||['send_but','mes_stop','tisya-menu-trigger'].includes(node.id))throw Error('输入快捷入口无效，原生发送控件未改动');
 const make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 let alive=true,busy=false,phonePending=false,view='more',serial=0,preferences=shortcutPreferences(getSettings());const entries=new Map(),coreEntries=[];
 const root=make('section');root.id='tisya-shortcuts';root.setAttribute('aria-label','输入快捷栏');const bar=make('div'),core=make('div'),rail=make('div');bar.className='tisya-shortcut-bar';core.className='tisya-shortcut-core';core.setAttribute('role','group');core.setAttribute('aria-label','常用入口');rail.className='tisya-shortcut-rail';rail.setAttribute('role','group');rail.setAttribute('aria-label','自定快捷位');const slots=Array.from({length:7},()=>{const n=make('div');n.className='tisya-shortcut-slot';rail.append(n);return n;});bar.append(core,rail);
 const more=make('button');more.type='button';more.id='tisya-shortcut-more';more.innerHTML=iconMarkup('more')+'<span>更多</span>';more.setAttribute('aria-expanded','false');bar.append(more);
 const panel=make('div');panel.className='tisya-shortcut-panel';panel.hidden=true;const header=make('nav'),content=make('div'),overflow=make('div');overflow.className='tisya-shortcut-overflow';const status=make('p');status.setAttribute('role','status');panel.append(header,content,overflow,status);root.append(bar,panel);composer.prepend(root);
 function adoptCore(node,{phone=false,own=false}={}){const anchor=node.parentNode?document.createComment('tisya core shortcut'):null;if(anchor)node.before(anchor);const row={node,anchor,own,classAbsent:!node.hasAttribute('class'),classes:['tisya-shortcut-item','tisya-shortcut-core-item'].filter(name=>!node.classList.contains(name))};
  if(phone){row.children=[...node.childNodes];row.attributes=Object.fromEntries(['title','aria-label'].map(name=>[name,node.getAttribute(name)]));node.innerHTML=iconMarkup('phone')+'<span>手机</span>';if(!node.title)node.title='打开手机';if(!node.hasAttribute('aria-label'))node.setAttribute('aria-label','打开手机');}
  node.classList.add(...row.classes);core.append(node);coreEntries.push(row);
 }
 if(requirementsControl)adoptCore(requirementsControl);
 if(phoneControl)adoptCore(phoneControl,{phone:true});
 else if(typeof onPhone==='function'){const phone=make('button');phone.id='tisya-phone-open';phone.type='button';adoptCore(phone,{phone:true,own:true});phone.onclick=async()=>{if(!alive||phonePending)return;phonePending=true;phone.disabled=true;phone.dataset.busy='true';close();try{await onPhone();}catch(e){if(alive)notice(e);}finally{if(alive){phonePending=false;phone.disabled=false;delete phone.dataset.busy;}}};}
 core.addEventListener('click',close);
 const phrases=make('button');phrases.id='tisya-phrases';phrases.type='button';phrases.innerHTML=iconMarkup('book')+'<span>常用语</span>';phrases.onclick=()=>open('phrases');
 entries.set(phrases.id,{node:phrases,label:'常用语',own:true});
 const top=make('button');top.id='tisya-top-message';top.type='button';top.dataset.tisyaShortcut='top';top.innerHTML=iconMarkup('previous')+'<span>回顶</span>';top.title='回到已载入消息顶部';top.onclick=()=>{const chat=document.getElementById('chat');if(!chat)return;chat.scrollTo({top:win.getComputedStyle(chat).flexDirection==='column-reverse'?-chat.scrollHeight:0,behavior:'instant'});};entries.set(top.id,{node:top,label:'回顶',own:true});
 function notice(e){status.textContent=e.message;status.setAttribute('role','alert');onError(e);}
 function label(n){return n.getAttribute('data-tisya-tool-label')||n.getAttribute('aria-label')||n.title||n.textContent.trim()||'扩展操作';}
 function scan(){if(!alive)return;let changed=false;for(const parent of [left,right])for(const node of [...parent.children]){
  if(['send_but','mes_stop','tisya-menu-trigger'].includes(node.id)||node===root||coreEntries.some(e=>e.node===node))continue;
  if([...entries.values()].some(e=>e.node===node))continue;
  const id=node.id||'native-extra-'+(++serial),anchor=document.createComment('tisya shortcut');parent.insertBefore(anchor,node);entries.set(id,{node,label:label(node),anchor});changed=true;
 }if(changed)renderPositions();}
 function renderPositions(){for(const [id,e]of entries){const position=preferences.位置.indexOf(id),target=position<0?overflow:slots[position];if(e.node.parentNode!==target)target.append(e.node);e.node.classList.add('tisya-shortcut-item');e.node.dataset.shortcutKey=id;}
  slots.forEach((slot,i)=>{slot.setAttribute('aria-label','快捷位 '+(i+1));slot.dataset.empty=String(!slot.children.length);});
 }
 async function persist(next){if(busy)return false;busy=true;root.dataset.saving='true';try{const current=shortcutPreferences(getSettings());if(JSON.stringify(current)!==JSON.stringify(preferences))throw Error('快捷栏已在其他位置修改，请重新打开');await save(next);if(!alive)return false;preferences=shortcutPreferences(getSettings());renderPositions();return true;}catch(e){notice(e);return false;}finally{busy=false;delete root.dataset.saving;}}
 function position(){if(panel.hidden)return;const r=root.getBoundingClientRect(),v=win.visualViewport;Object.assign(panel.style,{position:'fixed',left:r.left+'px',right:'auto',width:r.width+'px',bottom:Math.max(8,win.innerHeight-r.top+8)+'px',maxHeight:Math.max(80,r.top-(v?.offsetTop??0)-16)+'px'});}
 function close(){panel.hidden=true;more.setAttribute('aria-expanded','false');}
 function open(mode='more'){if(!alive)return;view=mode;panel.hidden=false;more.setAttribute('aria-expanded','true');content.replaceChildren();header.replaceChildren();status.textContent='';status.setAttribute('role','status');overflow.hidden=mode!=='more';
  for(const [key,text]of [['more','更多'],['slots','配置位置'],['phrases','常用语']]){const b=make('button',text);b.type='button';b.setAttribute('aria-pressed',String(mode===key));b.onclick=()=>{if(!busy)open(key);};header.append(b);}const dismiss=make('button','收起');dismiss.type='button';dismiss.onclick=close;header.append(dismiss);
  if(mode==='slots')positionsEditor();if(mode==='phrases')phraseEditor();position();
 }
 function positionsEditor(){const form=make('form'),selects=[];preferences.位置.forEach((value,i)=>{const row=make('label','位置 '+(i+1)),select=make('select');select.setAttribute('aria-label','位置 '+(i+1));const empty=make('option','留空');empty.value='';select.append(empty);for(const [id,e]of entries){const opt=make('option',e.label);opt.value=id;select.append(opt);}if(value&&!entries.has(value)){const opt=make('option','暂未加载：'+value);opt.value=value;select.append(opt);}select.value=value??'';select.onchange=()=>{for(const other of selects)if(other!==select&&select.value&&other.value===select.value)other.value='';};selects.push(select);row.append(select);form.append(row);});const apply=make('button','保存位置');apply.type='submit';form.append(apply);form.onsubmit=async e=>{e.preventDefault();apply.disabled=true;const ok=await persist({...preferences,位置:selects.map(x=>x.value||null)});if(ok)open('more');else apply.disabled=false;};content.append(form);}
 function phraseEditor(){const list=make('div'),form=make('form'),input=make('textarea'),apply=make('button','新增'),cancel=make('button','取消编辑');let editing=null;input.setAttribute('aria-label','常用语内容');input.rows=3;apply.type='submit';cancel.type='button';cancel.hidden=true;cancel.onclick=()=>{editing=null;input.value='';apply.textContent='新增';cancel.hidden=true;};
  for(const row of preferences.常用语){const item=make('div');item.className='tisya-phrase-row';const use=make('button',row.text),edit=make('button','修改'),remove=make('button','删除');for(const b of [use,edit,remove])b.type='button';use.className='tisya-phrase-use';use.onclick=()=>{try{appendPhrase(document,row.text);close();}catch(e){notice(e);}};edit.onclick=()=>{editing=row.id;input.value=row.text;apply.textContent='保存修改';cancel.hidden=false;input.focus();};remove.onclick=async()=>{remove.disabled=true;if(await persist({...preferences,常用语:preferences.常用语.filter(x=>x.id!==row.id)}))open('phrases');else remove.disabled=false;};item.append(use,edit,remove);list.append(item);}
  if(!preferences.常用语.length)list.append(make('p','还没有常用语，在下方添加。'));
  form.onsubmit=async e=>{e.preventDefault();if(!input.value.trim()){notice(Error('请填写常用语'));return;}apply.disabled=true;const text=input.value,id=editing??win.crypto.randomUUID(),rows=editing?preferences.常用语.map(x=>x.id===editing?{id,text}:x):[...preferences.常用语,{id,text}];if(await persist({...preferences,常用语:rows}))open('phrases');else apply.disabled=false;};form.append(input,apply,cancel);content.append(list,form);
 }
 win.addEventListener('resize',position);win.visualViewport?.addEventListener('resize',position);
 more.onclick=()=>panel.hidden?open('more'):close();const outside=e=>{if(!root.contains(e.target))close();},escape=e=>{if(e.key==='Escape'){close();more.focus();}};document.addEventListener('pointerdown',outside);root.addEventListener('keydown',escape);
 const observer=new win.MutationObserver(scan);observer.observe(left,{childList:true});observer.observe(right,{childList:true});scan();renderPositions();
 return {open,refresh(){preferences=shortcutPreferences(getSettings());renderPositions();if(!panel.hidden)open(view);},dispose(){alive=false;observer.disconnect();win.removeEventListener('resize',position);win.visualViewport?.removeEventListener('resize',position);document.removeEventListener('pointerdown',outside);root.removeEventListener('keydown',escape);core.removeEventListener('click',close);for(const e of coreEntries){e.node.classList.remove(...e.classes);if(e.classAbsent&&!e.node.getAttribute('class'))e.node.removeAttribute('class');if(e.children)e.node.replaceChildren(...e.children);for(const [name,value]of Object.entries(e.attributes??{}))if(value===null)e.node.removeAttribute(name);else e.node.setAttribute(name,value);if(e.anchor?.parentNode)e.anchor.replaceWith(e.node);else if(!e.own)e.node.remove();}for(const e of entries.values()){e.node.classList.remove('tisya-shortcut-item');delete e.node.dataset.shortcutKey;if(e.anchor?.parentNode){e.anchor.replaceWith(e.node);}else if(!e.own)left.append(e.node);}root.remove();}};
}
