import {PREFERENCE_GROUPS,effectivePreferences,preferenceTextKey} from './preferences.mjs';
import {sourceAdoption,sourceIdentity} from './preference-sources.mjs';
import {previewPreferenceText} from './preference-editor.mjs';

const modes={constant:'原生常驻',keyword:'原生关键词／正则匹配',vector:'原生向量匹配',condition:'外部条件直激'};
const reasons={eligible:'条件满足；实际生成时才结算概率与次数',matched:'本机会已命中',unknown:'条件值未知',cooldown:'仍在冷却',limit:'次数已用尽',private:'读取权限未放行',not_matched:'条件未满足',expired:'条件已失效'};
export function renderPreferenceSources(document,body,{library,config,editor,changed,button,navigationButton=button,field,input,el,onPreferences,onWorldbook,onConditions,initialSource=null}){
 body.append(el('p','从世界书或基点书选取原文，明确采用为当前故事的文风或技法。原书继续保留；保存后只在所选偏好位置生效。'));
 const tools=el('div'),bookSelect=el('select'),items=el('div'),detail=el('div'),status=el('p');bookSelect.className='text_pole';bookSelect.setAttribute('aria-label','来源书');status.setAttribute('role','status');
 const option=(text,value)=>{const n=el('option',text);n.value=value;return n;};
 const search=input('',()=>filter());search.setAttribute('aria-label','搜索资料与文风');search.placeholder='名称或完整原文';
 let loaded=[],selected=null;
 function filter(){const q=search.value.trim().toLocaleLowerCase();for(const n of items.children)n.hidden=!!q&&!loaded[Number(n.dataset.index)]?.text.toLocaleLowerCase().includes(q)&&!n.textContent.toLocaleLowerCase().includes(q);}
 async function show(book,uid){selected=await library.preview(book,uid);drawDetail();}
 async function load(){loaded=await library.read(bookSelect.value);selected=null;detail.replaceChildren();items.replaceChildren();for(const [i,item]of loaded.entries()){const b=button(item.name+' · '+modes[item.mode]+(item.nativeDisabled?' · 原生停用':''),()=>show(item.book,item.uid));b.dataset.index=String(i);b.style.cssText='display:block;width:100%;text-align:left;margin:6px 0';items.append(b);}status.textContent='已读取 '+loaded.length+' 条原文';filter();}
 tools.append(button('读取书籍目录',async()=>{const names=await library.names(),before=bookSelect.value;bookSelect.replaceChildren(...names.map(n=>option(n,n)));if(names.includes(before))bookSelect.value=before;else if(names.includes(config.coreBook??'基点书'))bookSelect.value=config.coreBook??'基点书';status.textContent='已读取 '+names.length+' 本书；选择后读取条目。';}),button('读取所选书条目',load));
 if(onWorldbook)tools.append(navigationButton('打开世界书管理',onWorldbook));
 body.append(tools,field('来源书',bookSelect),field('搜索条目',search),status,items,detail);
 const linked=el('details');linked.open=true;linked.append(el('summary','当前故事已引用条目'));
 function drawLinked(){while(linked.children.length>1)linked.lastChild.remove();const rows=Object.values(editor.rows).filter(r=>r.source);if(!rows.length)linked.append(el('p','尚未引用。'));
  for(const row of rows){const group=PREFERENCE_GROUPS.find(g=>g.id===row.group),choice=effectivePreferences(config).choices[row.group],active=(Array.isArray(choice)?choice:[choice]).includes('custom:'+row.id);linked.append(button(row.name+' · '+(active&&row.enabled?'当前选用':'未选用')+' · '+group.label+' · '+row.source.book+' / '+row.source.uid,()=>show(row.source.book,row.source.uid)));}}
 drawLinked();body.append(linked);
 function drawDetail(){
  const item=selected;detail.replaceChildren(el('h3',item.name),el('p',item.book+' / '+item.uid+' · '+modes[item.mode]+(item.nativeDisabled?' · 原生扫描已停用':'')));
  const raw=input(item.text,()=>{},{multi:true,rows:10,readOnly:true});raw.setAttribute('aria-label','来源完整原文');detail.append(field('来源完整原文',raw));
  if(item.conditionPreview)detail.append(el('p','条件预览：'+(reasons[item.conditionPreview.reasonCode]??item.conditionPreview.reasonCode)+'。预览不抽签、不扣次数。'));
  if(item.conditionError){const warning=el('p','条件预览失败：'+item.conditionError.message+'。原文保留，修复规则前不能采用。');warning.setAttribute('role','alert');detail.append(warning);}
  const existing=Object.values(editor.rows).filter(r=>r.source&&sourceIdentity(r.source.book,r.source.uid)===sourceIdentity(item.book,item.uid));
  for(const row of existing){const changedSource=row.source.hash!==item.hash,group=PREFERENCE_GROUPS.find(g=>g.id===row.group);const block=el('fieldset');block.append(el('legend',group.label+' · '+(changedSource?'来源变化，待核对':row.text!==item.text?'本故事已覆盖':'已采用这份来源')));
   const text=input(row.text,v=>{row.text=v;changed();},{multi:true,rows:8});text.setAttribute('aria-label','本故事采用原文');block.append(field('本故事采用原文',text));
   if(changedSource){block.append(button('采用来源新版原文',()=>{row.text=item.text;row.source.hash=item.hash;changed();drawDetail();}),button('保留故事改写并确认来源新版',()=>{row.source.hash=item.hash;changed();drawDetail();}));}
   block.append(button('选择此项',()=>{const target=(config.story.play??={}).choices??={};const selection=JSON.parse(row.selection);target[row.group]=group.multiple?[...new Set([...(Array.isArray(effectivePreferences(config).choices[row.group])?effectivePreferences(config).choices[row.group]:[]),...selection])]:selection;row.enabled=true;changed();drawLinked();}),button('停止选用此项',()=>{const target=(config.story.play??={}).choices??={},choice=effectivePreferences(config).choices[row.group];target[row.group]=group.multiple?(Array.isArray(choice)?choice:[]).filter(v=>v!=='custom:'+row.id):null;changed();drawLinked();}));detail.append(block);
  }
  const groupSelect=el('select');groupSelect.className='text_pole';groupSelect.setAttribute('aria-label','采用用途');for(const group of PREFERENCE_GROUPS.filter(g=>['文风与凝视','技法与场合'].includes(g.section)))groupSelect.append(option(group.label,group.id));groupSelect.value=existing[0]?.group??'S05';
  const preview=el('pre');preview.style.cssText='white-space:pre-wrap;max-height:24rem;overflow:auto;font:inherit';preview.setAttribute('aria-label','来源采用预览');
  const candidate=()=>{const group=PREFERENCE_GROUPS.find(g=>g.id===groupSelect.value),row=sourceAdoption(item,group,editor.rows);if(existing.some(r=>r.group===group.id))throw Error('这项用途已经引用，请在上方查看或确认新版');return {group,row};};
  const project=()=>{const {group,row}=candidate(),rows={...editor.rows,[preferenceTextKey(row.group,row.selection,true)]:row},draft=structuredClone(config),target=(draft.story.play??={}).choices??={},old=effectivePreferences(draft).choices[group.id],selection=JSON.parse(row.selection);target[group.id]=group.multiple?[...new Set([...(Array.isArray(old)?old:[]),...selection])]:selection;return {group,row,rows,draft};};
  detail.append(field('采用用途',groupSelect),el('p',item.mode==='condition'?'采用方式：当前故事选择＋已有外部条件。实际生成时与世界书共用一次条件扫描；概率、冷却和次数由条件引擎结算。原生关键词、向量和原生延时不参与这个偏好位置。':'文风与技法采用方式：当前故事明确选择。原书的关键词、常驻和停用设置继续只控制原生扫描，不会因此改动。'));
  const showPreview=button('预览采用后的完整位置',async()=>{const {group,rows,draft}=project(),projected=editor.previewSources?await editor.previewSources(rows,draft):{rows,notes:[]},result=previewPreferenceText(editor.source,draft,editor.slots,projected.rows,group);preview.textContent=(result.enabled?'位置已启用：':'位置未启用：')+result.slot+'\n'+projected.notes.join('\n')+'\n\n'+result.text;});
  const adopt=button('加入当前故事草稿',()=>{const {row,rows,draft}=project();editor.rows=rows;config.story.play=draft.story.play;changed();status.textContent='已加入草稿；点击底部保存才会生效。';drawLinked();drawDetail();});
  if(item.conditionError)showPreview.disabled=adopt.disabled=true;detail.append(showPreview,adopt,preview);
  if(item.condition?.ruleRef&&onConditions)detail.append(navigationButton('编辑条件与机会规则',()=>onConditions(item.condition.ruleRef)));
  if(onPreferences)detail.append(navigationButton('前往游玩偏好继续编辑',onPreferences));
 }
 const ready=initialSource?(async()=>{bookSelect.replaceChildren(option(initialSource.book,initialSource.book));bookSelect.value=initialSource.book;await load();await show(initialSource.book,initialSource.uid);})():Promise.resolve();
 return {drawLinked,ready};
}
