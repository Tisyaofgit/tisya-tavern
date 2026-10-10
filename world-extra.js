import {runDisplay} from './reader-core.js';
import {observeDisplaySize,CARD_MOTION_CSS} from './visual-core.js';

// Original full-envelope partition and reader ACL; no regex rerun on individual
// pages, no raw-message fallback and no state write while displaying history.
export function readWorldExtra(source){return runDisplay({source,groups:[]}).extraPanels;}
const fail=code=>{throw Error(code);};
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// Port of r243 card-display.cjs splitDisplayDocuments. Fences own whole documents.
export function splitExtraDocuments(html){
 const lines=html.match(/[^\n]*\n|[^\n]+$/g)||[],parts=[];let plain='',fence=null,body='';
 const flush=()=>{if(plain.trim())parts.push(plain);plain='';};
 for(const line of lines){const start=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(line);
  if(!fence){if(!start){plain+=line;continue;}fence={mark:start[1][0],length:start[1].length,info:start[2].trim().toLowerCase()};body='';continue;}
  if(start&&start[1][0]===fence.mark&&start[1].length>=fence.length&&!start[2].trim()){
   if(['html','htm'].includes(fence.info)||(!fence.info&&/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(body))){flush();parts.push(body);}
   else plain+='<pre><code>'+escape(body)+'</code></pre>';fence=null;body='';
  }else body+=line;
 }
 if(fence)fail('TISYA_EXTRA_FENCE_INCOMPLETE');flush();if(parts.length>32)fail('TISYA_EXTRA_DOCUMENT_LIMIT');return parts;
}
function inspect(document,html){
 const template=document.createElement('template');template.innerHTML=html;
 if(/<%/.test(html)||template.content.querySelector('script,iframe,object,embed,form,input,button,select,textarea,audio,video,meta[http-equiv],base,link'))fail('TISYA_EXTRA_RUNTIME_REQUIRED');
 for(const node of template.content.querySelectorAll('*'))for(const attr of node.attributes)if(/^on/i.test(attr.name)||/^(?:href|src|xlink:href)$/i.test(attr.name)&&/^\s*(?:javascript|vbscript):/i.test(attr.value))fail('TISYA_EXTRA_RUNTIME_REQUIRED');
 return template;
}
function mountDocument(document,container,html,label,{formatBody,onError}){
 const template=inspect(document,html),authored=!!template.content.querySelector('style,div,section,article,table,details,html');
 if(!authored)html=formatBody(html);
 inspect(document,html);
 const frame=document.createElement('iframe');frame.title=label;frame.dataset.tisyaExtraDocument='';frame.sandbox='allow-same-origin';frame.referrerPolicy='no-referrer';
 frame.style.cssText='display:block;width:100%;max-width:100%;height:1px;border:0;background:transparent';
 let alive=true,sizing=null,paused=false,ready=false,pending=null;const added=[];
 const resourceError=()=>{if(alive)onError(Error('TISYA_EXTRA_RESOURCE_FAILED'));};
 function syncFonts(){const doc=frame.contentDocument;if(!doc?.fonts)return;for(const face of document.fonts??[])if(face.family.replace(/["']/g,'')==='TisyaReading'&&face.status==='loaded'&&!added.includes(face)){doc.fonts.add(face);added.push(face);}}
 const folds=()=>[...(frame.contentDocument?.querySelectorAll('details')??[])];
 function restore(state){if(!Array.isArray(state)||state.some(x=>typeof x!=='boolean'))return;pending=[...state];if(ready){folds().forEach((n,i)=>{if(i<pending.length)n.open=pending[i];});pending=null;}}
 const timer=setTimeout(()=>{if(alive&&!ready)onError(Error('TISYA_EXTRA_LOAD_TIMEOUT'));},15000);
 frame.onload=()=>{if(!alive||ready)return;try{
  const doc=frame.contentDocument;if(!doc?.body)fail('TISYA_EXTRA_DOCUMENT_UNAVAILABLE');
  syncFonts();doc.addEventListener('error',resourceError,true);for(const img of doc.images)if(img.complete&&!img.naturalWidth)resourceError();
  doc.documentElement.toggleAttribute('data-tisya-card-paused',paused);
  sizing=observeDisplaySize(doc,h=>{if(alive)frame.style.height=h+'px';},onError);ready=true;if(pending)restore(pending);clearTimeout(timer);
 }catch(error){clearTimeout(timer);onError(error);}};
 const head='<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; img-src https: data: blob:; font-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><style>html{color-scheme:dark;background:transparent}body{margin:0;display:flow-root;font:16px/1.8 TisyaReading,serif;color:#dce5d4;overflow-wrap:anywhere;background:transparent}img,video,svg{max-width:100%;height:auto}pre{white-space:pre-wrap}'+CARD_MOTION_CSS+'</style>';
 const h=/^\s*(?:<!doctype[^>]*>\s*)?<html\b[^>]*>\s*(?:<head\b[^>]*>)?/i.exec(html);
 frame.srcdoc=h?html.slice(0,h[0].length)+(/<head\b/i.test(h[0])?head:'<head>'+head+'</head>')+html.slice(h[0].length):'<!doctype html><html><head>'+head+'</head><body>'+html+'</body></html>';
 container.append(frame);
 return {source:html,capture:()=>pending??folds().map(n=>n.open),restore,refresh(value){paused=value;if(ready)syncFonts();frame.contentDocument?.documentElement?.toggleAttribute('data-tisya-card-paused',paused);sizing?.refresh();},dispose(){alive=false;clearTimeout(timer);sizing?.dispose();frame.contentDocument?.removeEventListener('error',resourceError,true);for(const face of added)frame.contentDocument?.fonts?.delete(face);frame.onload=null;frame.remove();}};
}
export function mountWorldExtra(document,container,{source,structured,formatBody,onError=()=>{}}){
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 let alive=true,children=[],active=null,paused=false;const pages=[],nav=make('nav',undefined,'extra-tabs');nav.setAttribute('aria-label','世界扩展页面');
 container.replaceChildren();
 let rows;try{rows=structured?readWorldExtra(source):[];}catch(error){container.append(make('p','本条扩展未通过结构或公开权限校验，原消息仍保留。','public-note'));onError(error);return {refresh(){},capture(){},restore(){},dispose(){alive=false;container.replaceChildren();}};}
 if(!rows.length)container.append(make('p','本条没有可展示的世界扩展。','public-note'));
 else container.append(nav);
 function select(id){if(!alive)return;active=id;for(const row of pages){row.panel.hidden=row.id!==id;row.button.setAttribute('aria-pressed',String(row.id===id));}for(const child of children)child.refresh(paused||child.page!==active);}
 for(const [index,row]of rows.entries()){
  const panel=make('section',undefined,'extra-page'),button=make('button');button.type='button';
  const template=document.createElement('template');template.innerHTML=row.html;
  const title=(row.label||template.content.querySelector('h1,h2,h3,title')?.textContent||row.ruleName||row.tag||'扩展 '+(index+1)).slice(0,100);button.textContent=title;button.onclick=()=>select(row.id);nav.append(button);container.append(panel);pages.push({id:row.id,panel,button});
  const failed=error=>{if(!alive)return;let note=panel.querySelector('.extra-error');if(!note){note=make('p',undefined,'public-note extra-error');note.setAttribute('role','status');panel.append(note);const raw=make('details'),summary=make('summary','查看原始扩展文本'),pre=make('pre',row.html);raw.append(summary,pre);panel.append(raw);}note.textContent=error.message==='TISYA_EXTRA_RUNTIME_REQUIRED'?'这一页需要卡片脚本或交互运行时，尚未接入；原始内容保留。':error.message==='TISYA_EXTRA_RESOURCE_FAILED'?'这一页有图片未能加载，已显示的内容和原始文本均保留。':'这一页暂时无法显示，原始内容保留。';onError(error);};
  try{for(const html of splitExtraDocuments(row.html))children.push({...mountDocument(document,panel,html,title,{formatBody,onError:failed}),page:row.id});}catch(error){failed(error);}
 }
 if(pages.length)select(pages[0].id);nav.hidden=pages.length<2;
 return {capture:()=>({active,documents:children.map(c=>({page:c.page,source:c.source,folds:c.capture()}))}),restore(state){if(!state)return;if(pages.some(p=>p.id===state.active))select(state.active);for(const child of children){const saved=state.documents?.find(d=>d.page===child.page&&d.source===child.source);if(saved)child.restore(saved.folds);}},refresh(value){paused=value;if(alive)for(const child of children)child.refresh(paused||child.page!==active);},dispose(){alive=false;children.forEach(c=>c.dispose());pages.forEach(p=>p.button.onclick=null);container.replaceChildren();}};
}
export const extraCSS='.extra-tabs{display:flex;gap:8px;overflow:auto;padding:2px 0 12px}.extra-tabs[hidden],.extra-page[hidden]{display:none!important}.extra-tabs button{white-space:nowrap;min-height:44px;border:1px solid #a6b98c66;border-radius:20px;padding:6px 14px;color:inherit;background:#103f3580;font:14px/1.6 TisyaReading,serif}.extra-tabs [aria-pressed=true]{color:#efd99a;background:#52796b55}.extra-page{min-width:0}.extra-page pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 monospace}';
