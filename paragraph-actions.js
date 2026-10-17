import {elements} from './ui/dom.js';
import {revisionParagraphs} from './revision.js';
import {iconMarkup} from './icons.js';

export const LONG_PRESS_TOOLS=[['copy','复制本段','copy'],['copy-body','复制正文','copy'],['copy-source','复制原消息','copy'],['select','选段修改','edit'],['revision','高级重骰','sliders'],['regen','重骰','reroll'],['next','继续','continue'],['versions','回复版本','book'],['edit','手工编辑','edit'],['read','阅读与回合记录','book'],['branch','创建分支','branch'],['delete','删除本条','trash'],['rollback','回溯','rollback'],['message','消息操作','tools'],['more','更多','more']];
export function longPressSlots(settings={}){
 const slots=settings.长按菜单??['copy','select','regen','more'];
 if(!Array.isArray(slots)||!slots.includes('more')||new Set(slots).size!==slots.length||slots.some(id=>!LONG_PRESS_TOOLS.some(t=>t[0]===id)))throw Error('长按菜单配置无效：须保留更多且不能重复');
 return [...slots];
}

// Styling is shared with the isolated message renderer; inputs stay native.
export const paragraphInteractionCSS=`
.story,.story *{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.story :is(input,textarea,[contenteditable=true]){user-select:text;-webkit-user-select:text}
.tisya-paragraph-selected{outline:1px solid #e2a0a6!important;outline-offset:5px;background:#84334430!important;border-radius:2px;box-shadow:inset 2px 0 #e8a3aa}
.tisya-paragraph-selected,.tisya-paragraph-selected *{color:#ffbfc6!important}
`;
const excluded='button,a,input,textarea,select,summary,[contenteditable=true],iframe,audio,video,.mes_button,.mes_edit_buttons';
const normalize=text=>text.replace(/\s+/gu,'').replace(/\u200b/g,'');

// Resolve against the current source, not DOM text as a new source of truth.
export function paragraphTargets(document,root,source,format=x=>x){
 const parts=revisionParagraphs(source),numbered=[...root.querySelectorAll('.reading-paragraph[data-paragraph]')];
 if(numbered.length===parts.length&&numbered.every((n,i)=>Number(n.dataset.paragraph)===parts[i].id))return numbered.map((node,i)=>({node,id:parts[i].id,raw:parts[i].raw}));
 const nodes=[...root.querySelectorAll('p,pre,blockquote,li')].filter(n=>!n.parentElement.closest('p,pre,blockquote,li'));
 if(!nodes.length&&root.textContent.trim())nodes.push(root);
 const text=raw=>{const template=document.createElement('template');template.innerHTML=format(raw);return normalize(template.content.textContent??'');};
 // A transformed/merged paragraph without a proven mapping is not selectable.
 const expected=parts.map(p=>text(p.raw)),actual=nodes.map(n=>normalize(n.textContent));
 if(expected.length!==actual.length||expected.some((s,i)=>s!==actual[i]))return [];
 return nodes.map((node,i)=>({node,id:parts[i].id,raw:parts[i].raw}));
}

export function mountParagraphActions(document,{capture,validate,assertIdle,format=x=>x,onRevise,onEdit,onRead,onMessage,onAction,onConfigure,getSettings=()=>({}),onError=()=>{},holdMs=550}){
 const win=document.defaultView,chat=document.querySelector('#chat');let hold=null,menu=null,selection=null,suppressed=null,alive=true;
 const make=elements(document);
 const guard=fn=>{try{return fn();}catch(e){reset();onError(e);}};
 function cancelHold(){if(hold)win.clearTimeout(hold.timer);hold=null;}
 function closeMenu(){menu?.remove();menu=null;}
 function clearSelection(){if(!selection)return;for(const row of selection.rows)row.node.classList.remove('tisya-paragraph-selected');selection.bar.remove();selection=null;}
 function reset(){cancelHold();closeMenu();clearSelection();}
 function target(event){
  const path=event.composedPath();if(path.some(n=>n.matches?.(excluded)))return null;
  const node=path.find(n=>n.matches?.('#chat .mes')),root=path.find(n=>n.matches?.('.story,.mes_text'));
  if(!node||!root||root.classList.contains('tisya-source-concealed')||node.querySelector('.edit_textarea'))return null;
  return {node,root,leaf:path.find(n=>n.nodeType===1)};
 }
 function locate(hit){
  const token=capture(hit.node);validate(token);
  const rows=paragraphTargets(document,hit.root,token.text,raw=>format(raw,token));
  const row=rows.find(r=>r.node===hit.leaf||r.node.contains(hit.leaf));return {token,rows,row,root:hit.root};
 }
 function check(){if(!alive)return;guard(()=>{if(menu){validate(menu._token);}if(selection){validate(selection.token);if(!selection.root.isConnected||selection.rows.some(r=>!r.node.isConnected))throw Error('正文已更新，请重新选择段落');}});}
 function update(){if(!selection)return;for(const row of selection.rows)row.node.classList.toggle('tisya-paragraph-selected',selection.ids.has(row.id));selection.count.textContent='已选 '+selection.ids.size+' 段';selection.done.disabled=!selection.ids.size;}
 function begin(item){
  assertIdle();validate(item.token);if(!item.row)throw Error('此处排版无法对应原段落，请从“高级重骰”选择');
  closeMenu();clearSelection();const bar=make('div'),count=make('span'),cancel=make('button','取消'),done=make('button','✓');
  bar.id='tisya-paragraph-selection';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','多选修改');count.setAttribute('aria-live','polite');
  for(const b of [cancel,done])b.type='button';done.setAttribute('aria-label','完成选段，进入修改指令');bar.append(count,cancel,done);document.body.append(bar);
  selection={...item,ids:new Set([item.row.id]),bar,count,done};update();
  cancel.onclick=()=>clearSelection();done.onclick=()=>guard(()=>{assertIdle();validate(selection.token);const token=selection.token,ids=[...selection.ids].sort((a,b)=>a-b);clearSelection();onRevise(token,ids);});
 }
 function show(item,x,y,more=false){
  closeMenu();const current=menu=make('div');menu._token=item.token;menu.id='tisya-paragraph-menu';menu.setAttribute('role','dialog');menu.setAttribute('aria-label',more?'更多段落操作':'段落操作');
  const finish=()=>{if(menu===current)closeMenu();};
  const add=(label,fn,icon='more')=>{const b=make('button');b.type='button';b.className='tisya-orb-button';b.setAttribute('aria-label',label);b.title=label;b.innerHTML=iconMarkup(icon);const caption=make('small',label);caption.className='tisya-orb-caption';caption.setAttribute('aria-hidden','true');b.append(caption);b.onclick=()=>{suppressed=null;Promise.resolve().then(()=>{validate(item.token);return fn();}).catch(e=>{if(menu===current)reset();onError(e);});};current.append(b);return b;};
  const user=item.token.message.is_user||item.token.message.is_system||item.token.message.role==='tool';
  const copy=async text=>{await win.navigator.clipboard.writeText(text);finish();};
  const mutate=fn=>()=>{assertIdle();validate(item.token);finish();return fn();};
  const actions={
   copy:()=>{if(!item.row)throw Error('无法定位此段原文，请使用复制正文或复制原消息');return copy(item.row.raw);},
   'copy-body':()=>copy(revisionParagraphs(item.token.text).map(p=>p.raw).join('\n\n')),
   'copy-source':()=>copy(item.token.text),
   select:()=>begin(item),
   revision:mutate(()=>onRevise(item.token,item.row?[item.row.id]:undefined)),
   edit:mutate(()=>onEdit(item.token)),
   read:()=>{finish();return onRead?.(item.token);},
   message:()=>{finish();return onMessage?.(item.token);},
   more:()=>show(item,x,y,true),
   ...Object.fromEntries(['regen','next','versions','branch','delete','rollback'].map(id=>[id,mutate(()=>onAction?.(item.token,id))])),
  };
  const visible=longPressSlots(getSettings());
  const ids=more?LONG_PRESS_TOOLS.map(t=>t[0]).filter(id=>id!=='more'&&!visible.includes(id)):visible;
  for(const id of ids){if(user&&['select','revision','versions'].includes(id)||id==='regen'&&(item.token.message.is_system||item.token.message.role==='tool'))continue;if(id==='read'&&!onRead||id==='message'&&!onMessage||['regen','next','versions','branch','delete','rollback'].includes(id)&&!onAction)continue;const tool=LONG_PRESS_TOOLS.find(t=>t[0]===id);add(id==='regen'&&item.token.message.is_user?'重投下一条':tool[1],actions[id],tool[2]);}
  if(more){if(onConfigure)add('配置长按菜单',()=>{finish();return onConfigure(item.token);},'sliders');add('返回',()=>show(item,x,y),'left');}
  const dismiss=add('关闭',finish,'close');document.body.append(current);
  const viewport=win.visualViewport,left=viewport?.offsetLeft??0,top=viewport?.offsetTop??0,width=viewport?.width??win.innerWidth,height=viewport?.height??win.innerHeight;
  current.style.maxWidth=Math.max(0,width-16)+'px';current.style.maxHeight=Math.max(0,height-24)+'px';
  const w=current.getBoundingClientRect().width||300,h=current.getBoundingClientRect().height||150;
  current.style.left=Math.max(left+8,Math.min(x-w/2,left+width-w-8))+'px';current.style.top=Math.max(top+8,Math.min(y-h-16,top+height-h-8))+'px';dismiss.focus({preventScroll:true});
 }
 const down=e=>{
  cancelHold();if(e.button!==0||e.isPrimary===false)return;
  const hit=target(e);if(!hit)return;
  if(selection)return;
  hold={x:e.clientX,y:e.clientY,pointer:e.pointerId,timer:win.setTimeout(()=>{hold=null;guard(()=>{const item=locate(hit);suppressed={node:hit.node,until:Date.now()+900};document.getSelection()?.removeAllRanges();show(item,e.clientX,e.clientY);});},holdMs)};
 };
 const move=e=>{if(hold&&(e.pointerId!==hold.pointer||Math.hypot(e.clientX-hold.x,e.clientY-hold.y)>10))cancelHold();};
 const click=e=>{
  const hit=target(e);
  if(suppressed&&Date.now()<suppressed.until&&hit?.node===suppressed.node){e.preventDefault();e.stopPropagation();suppressed=null;return;}
  if(selection&&hit){e.preventDefault();e.stopPropagation();guard(()=>{assertIdle();validate(selection.token);const item=locate(hit);if(item.token.message!==selection.token.message)throw Error('一次只能修改同一条回复中的段落');if(!item.row)throw Error('此处排版无法对应原段落');if(selection.ids.has(item.row.id))selection.ids.delete(item.row.id);else selection.ids.add(item.row.id);update();});return;}
  if(menu&&!menu.contains(e.target))closeMenu();
 };
 const native=e=>{if(target(e)){e.preventDefault();if(e.type==='contextmenu')e.stopPropagation();}};
 const escape=e=>{if(e.key==='Escape')reset();};
 const listeners=[['pointerdown',down],['pointermove',move],['pointerup',cancelHold],['pointercancel',cancelHold],['click',click],['contextmenu',native],['selectstart',native],['keydown',escape],['scroll',cancelHold]];
 for(const [name,fn]of listeners)document.addEventListener(name,fn,true);
 return {check,dispose(){alive=false;reset();for(const [name,fn]of listeners)document.removeEventListener(name,fn,true);},active:()=>selection!==null};
}
