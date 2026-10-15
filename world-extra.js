import {mountIsolatedCard} from './card-runtime.js';
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
 if(/<%/.test(html)||template.content.querySelector('script[src],iframe,object,embed,form,meta[http-equiv],base')||[...template.content.querySelectorAll('script')].some(n=>/\b(?:parent|top|TavernHelper|SillyTavern|tavo)\s*[.[]/.test(n.textContent)))fail('TISYA_EXTRA_RUNTIME_REQUIRED');
 for(const node of template.content.querySelectorAll('*'))for(const attr of node.attributes)if(/^(?:href|src|xlink:href)$/i.test(attr.name)&&/^\s*(?:javascript|vbscript):/i.test(attr.value))fail('TISYA_EXTRA_RUNTIME_REQUIRED');
 return template;
}
function mountDocument(document,container,html,label,{formatBody,onError}){
 const template=inspect(document,html);
 // A card may guard an unavailable host sender with typeof and silently do
 // nothing. Keep its display usable, but make that known limitation visible.
 if([...template.content.querySelectorAll('script')].some(n=>/\btriggerSlash\s*\(/.test(n.textContent))){const note=document.createElement('p');note.className='public-note card-capability-note';note.textContent='卡片可浏览，发送与直播控制按钮暂不可用。';container.append(note);}
 const interactive=!!template.content.querySelector('script,button,input,select,textarea,audio,video,link')||[...template.content.querySelectorAll('*')].some(n=>[...n.attributes].some(a=>/^on/i.test(a.name)));
 if(interactive){const box=document.createElement('div');container.append(box);const view=mountIsolatedCard({container:box,html,label,onError});view.ready.catch(onError);let paused=null;return {source:html,capture:()=>view.captureState().details,restore:folds=>view.restoreState({details:folds}),refresh(value){if(paused!==value){paused=value;view.setPaused(value);}},dispose(){view.dispose();box.remove();}};}
 const authored=!!template.content.querySelector('style,div,section,article,table,details,html');
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
 return {source:html,capture:()=>pending??folds().map(n=>n.open),restore,refresh(value){const changed=paused!==value;paused=value;if(ready)syncFonts();frame.contentDocument?.documentElement?.toggleAttribute('data-tisya-card-paused',paused);if(changed&&!paused)sizing?.refresh();},dispose(){alive=false;clearTimeout(timer);sizing?.dispose();frame.contentDocument?.removeEventListener('error',resourceError,true);for(const face of added)frame.contentDocument?.fonts?.delete(face);frame.onload=null;frame.remove();}};
}
export function mountWorldExtra(document,container,{source,structured,formatBody,display=null,displayError=null,lazy=false,onError=()=>{}}){
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 let alive=true,children=[],active=null,paused=false,shown=!lazy,savedDocuments=[];const pages=[],nav=make('nav',undefined,'extra-tabs');nav.setAttribute('aria-label','世界扩展页面');
 container.replaceChildren();
 let rows;try{rows=structured?(display?.extraPanels??readWorldExtra(source)):[];}catch(error){container.append(make('p','本条扩展未通过结构或公开权限校验，原消息仍保留。','public-note'));onError(error);return {hasContent:true,refresh(){},capture(){},restore(){},dispose(){alive=false;container.replaceChildren();}};}
 const native=rows.some(row=>row.ruleName);
 container.dataset.presentation=native?'native':'pages';
 if(displayError)container.append(make('p','角色卡正则暂未能完成显示，原始扩展内容保留。','public-note round-empty'));
 if(!rows.length)container.append(make('p','本条没有可展示的世界扩展。','public-note'));
 else if(!native)container.append(nav);
 function select(id){if(!alive)return;active=id;for(const row of pages){row.panel.hidden=!native&&row.id!==id;row.button.setAttribute('aria-pressed',String(row.id===id));}if(shown)pages.filter(p=>native||p.id===active).forEach(p=>p.mount());for(const child of children)child.refresh(paused||!shown||(!native&&child.page!==active));}
 for(const [index,row]of rows.entries()){
  const panel=make('section',undefined,'extra-page'),button=make('button');button.type='button';panel.dataset.sourceTag=row.tag??'';
  const template=document.createElement('template');template.innerHTML=row.html;
  if(row.nativeHosted){const note=make('p','世界面板','public-note native-host-note');panel.append(note);container.append(panel);continue;}
  const title=(row.label||template.content.querySelector('h1,h2,h3,title')?.textContent||row.ruleName||row.tag||'扩展 '+(index+1)).slice(0,100);button.textContent=title;button.onclick=()=>select(row.id);nav.append(button);container.append(panel);const page={id:row.id,panel,button,mounted:false};pages.push(page);
  const unformatted=native&&!row.ruleName&&!template.content.querySelector('style,script,div,section,article,table,details,h1,h2,h3');
  if(unformatted){const raw=make('details',undefined,'native-unformatted');raw.append(make('summary',title+' · 原始内容'),make('pre',row.html));panel.append(raw);page.mount=()=>{};page.raw=raw;continue;}
  const failed=error=>{if(!alive)return;let note=panel.querySelector('.extra-error');if(!note){note=make('p',undefined,'public-note extra-error');note.setAttribute('role','status');panel.append(note);const raw=make('details'),summary=make('summary','查看原始扩展文本'),pre=make('pre',row.html);raw.append(summary,pre);panel.append(raw);}note.textContent=error.message==='TISYA_EXTRA_RUNTIME_REQUIRED'?'这一页需要卡片脚本或交互运行时，尚未接入；原始内容保留。':error.message==='TISYA_EXTRA_RESOURCE_FAILED'?'这一页有图片未能加载，已显示的内容和原始文本均保留。':'这一页暂时无法显示，原始内容保留。';onError(error);};
  page.mount=()=>{if(page.mounted||!alive)return;page.mounted=true;try{for(const html of splitExtraDocuments(row.html)){const child={...mountDocument(document,panel,html,title,{formatBody,onError:failed}),page:row.id};children.push(child);const saved=savedDocuments.find(d=>d.page===child.page&&d.source===child.source);if(saved)child.restore(saved.folds);}}catch(error){failed(error);}};if(!lazy)page.mount();
 }
 if(pages.length)select(pages[0].id);nav.hidden=pages.length<2;
 return {hasContent:rows.length>0,presentation:native?'native':'pages',capture:()=>({active,raw:pages.filter(p=>p.raw).map(p=>({id:p.id,open:p.raw.open})),documents:[...savedDocuments.filter(d=>!children.some(c=>c.page===d.page&&c.source===d.source)),...children.map(c=>({page:c.page,source:c.source,folds:c.capture()}))]}),restore(state){if(!state)return;savedDocuments=state.documents??[];if(pages.some(p=>p.id===state.active))select(state.active);for(const page of pages)if(page.raw)page.raw.open=state.raw?.some(p=>p.id===page.id&&p.open)??false;for(const child of children){const saved=state.documents?.find(d=>d.page===child.page&&d.source===child.source);if(saved)child.restore(saved.folds);}},refresh(value,show=true){paused=value;shown=show;if(!alive)return;if(shown)pages.filter(p=>native||p.id===active).forEach(p=>p.mount());for(const child of children)child.refresh(paused||!shown||(!native&&child.page!==active));},dispose(){alive=false;children.forEach(c=>c.dispose());pages.forEach(p=>p.button.onclick=null);container.replaceChildren();}};
}
export const extraCSS='.native-card-stack,.native-card-content{display:block;min-width:0;width:100%;margin:0;padding:0;border:0;background:none;box-shadow:none}.native-card-content>.extra-page{margin:0;padding:0;max-width:100%}.native-unformatted{font:13px/1.6 TisyaReading,serif;color:#adc5b6;margin:8px 0}.native-unformatted summary{cursor:pointer;padding:8px 0;min-height:36px}.native-unformatted pre{margin:0 0 10px}.native-card-content .card-capability-note{font-size:12px}.extra-tabs{display:flex;gap:8px;overflow:auto;padding:2px 0 12px}.extra-tabs[hidden],.extra-page[hidden]{display:none!important}.extra-tabs button{white-space:nowrap;min-height:44px;border:1px solid #a6b98c66;border-radius:20px;padding:6px 14px;color:inherit;background:#103f3580;font:14px/1.6 TisyaReading,serif}.extra-tabs [aria-pressed=true]{color:#efd99a;background:#52796b55}.extra-page{min-width:0}.extra-page pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 monospace}';
