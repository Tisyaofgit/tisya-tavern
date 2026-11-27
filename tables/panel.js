import {mountHistoryBatch} from './history-batch-ui.js';
import {downloadJson} from '../engine/browser-download.mjs';
import {worldFrameworkEditor} from './world-framework-editor.js';
import {conditionEditor} from './condition-editor.js';
import {mountArchiveAtlas} from './atlas-ui.js';
import {createAtlasMediaProjection} from '../media-atlas.js';
import {MEMORY_STATUS_LABELS} from '../engine/memory-status.mjs';
import {ATLAS_STYLE} from './atlas-style.js';
import {formUI} from './form-ui.js';
import {styleRules,BUILTIN_STYLE_RULES} from './style-rules.js';
import {tableSettings,copy,check} from './schema.js';
export function mountTablePanel(document,container,{service,store,onIdentity,onAssistant,onMediaManage=null,initialPage='',initialGoal='',initialAtlasTarget=null,standaloneAtlas=false,onAtlasExit=null,onPageChange=()=>{},onSaved:notifySaved=()=>{}}){
 let alive=true,busy=false,dirty=false,draft=null,page='history',pending=Promise.resolve();const assistantConversation=[],pageDrafts=new Map();const ui=formUI(document,{changed:()=>{dirty=true;}});const root=document.createElement('section');root.className='tisya-tables';container.append(root);
 const initialConfig=store.read();let notifiedRevision=initialConfig.revision;
 function onSaved(){if(!alive)return;const now=store.read();if(now.key!==initialConfig.key)return;notifiedRevision=now.revision;notifySaved();}
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const notice=el('p','表单推进与历史消息范围独立。未发送的聊天输入和本页草稿不会自动入档；切页会保留草稿，保存后才生效。');notice.setAttribute('role','status');root.append(notice);
 const nav=el('nav'),main=el('div'),navLabel=el('label'),pageSelect=el('select');navLabel.append(el('strong','表单功能'),pageSelect);pageSelect.setAttribute('aria-label','表单功能');nav.append(navLabel);root.append(nav,main);
 function assertActive(){check(alive,'表单页面已关闭');check(store.read().key===initialConfig.key,'当前会话已切换，请重新打开表单推进');}
 function updateDraftIndicator(){if(!alive)return;const names=[...pageDrafts.keys(),...(dirty||draft?[page]:[])].map(id=>pages.find(x=>x[0]===id)?.[1]??id);draftNote.hidden=(standaloneAtlas&&page==='atlas')||!names.length;draftNote.textContent=names.length?'保留中的草稿：'+names.join('、')+'。请到对应页面保存或放弃。':'';}
 function syncPage(){const atlas=standaloneAtlas&&page==='atlas';root.dataset.page=page;nav.hidden=atlas;notice.hidden=atlas;const discard=root.querySelector('.tisya-discard-draft');if(discard)discard.hidden=atlas;updateDraftIndicator();onPageChange(page);}
 function beginPage(next){
  assertActive();
  if(next!==page){
   if(dirty||draft){const fragment=document.createDocumentFragment();fragment.append(...main.childNodes);pageDrafts.set(page,{fragment,dirty,draft});}
   page=next;dirty=false;draft=null;
   const saved=pageDrafts.get(next);if(saved){pageDrafts.delete(next);main.replaceChildren(saved.fragment);dirty=saved.dirty;draft=saved.draft;pageSelect.value=page;notice.textContent='已恢复本页草稿；若其他页面已保存数据，保存时会核对版本。';syncPage();return true;}
  }
  main.replaceChildren();pageSelect.value=page;syncPage();return false;
 }
 const draftNote=el('p');draftNote.className='tisya-draft-note';draftNote.hidden=true;root.insertBefore(draftNote,main);root.addEventListener('input',()=>queueMicrotask(updateDraftIndicator));
 function field(parent,label,value,{type='text',change=()=>{},choices,track=true}={}){const l=el('label'),input=el(choices?'select':type==='textarea'?'textarea':'input');l.append(el('strong',label),input);parent.append(l);if(choices){for(const [v,n]of choices){const o=el('option',n);o.value=v;input.append(o);}input.value=value;}else{if(input.tagName==='INPUT'){input.type=type;if(type==='number'){input.inputMode='numeric';input.step='1';}}if(type==='checkbox')input.checked=!!value;else input.value=value??'';}input.setAttribute('aria-label',label);input.oninput=()=>{if(track)dirty=true;change(type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value);};return input;}
 const run=fn=>{if(busy)return pending;busy=true;pageSelect.disabled=true;root.setAttribute('aria-busy','true');notice.setAttribute('role','status');notice.textContent='正在处理…';pending=(async()=>{let progressText='正在处理…';const ticker=setInterval(()=>{const state=service.state(),job=state.jobs.at(-1);if(alive&&state.busy&&job){progressText=job.task+' · '+job.status+' '+job.detail;notice.textContent=progressText;}},500);try{assertActive();await fn();if(alive&&notice.textContent===progressText)notice.textContent='已就绪';}catch(e){if(alive){notice.textContent=e.message;notice.setAttribute('role','alert');}}finally{clearInterval(ticker);busy=false;pageSelect.disabled=false;root.setAttribute('aria-busy','false');updateDraftIndicator();if(alive){try{const now=store.read();if(now.key===initialConfig.key&&now.revision!==notifiedRevision)onSaved();}catch(e){notice.textContent=e.message;notice.setAttribute('role','alert');}}}})();return pending;};
 function button(parent,label,fn){const b=el('button',label);b.type='button';b.onclick=()=>run(fn);parent.append(b);return b;}
 function section(title,parent=main){const g=el('fieldset');g.append(el('legend',title));parent.append(g);return g;}
 function download(name,data){downloadJson(document,name,data);}
 function table(parent,headers,rows){const wrap=el('div'),t=el('table'),thead=el('thead'),head=el('tr'),body=el('tbody');wrap.className='tisya-table-wrap';if(headers.length>2)t.className='tisya-wide-table';for(const h of headers){const th=el('th',h);th.scope='col';head.append(th);}thead.append(head);t.append(thead,body);for(const row of rows){const tr=el('tr');for(const [index,value]of row.entries()){const td=el('td',typeof value==='string'?value:JSON.stringify(value));td.dataset.label=headers[index]??'';tr.append(td);}body.append(tr);}wrap.append(t);parent.append(wrap);return t;}
 async function matrixHistory(mode='history',range=null){
  if(beginPage(mode==='narrative'?'foundation':'history'))return;const api=service.matrixFoundation,state=await api.inspect();assertActive();
  main.append(el('p','原文先提炼成当前规范表单的简表草稿。核对后才写入正式档案；已有值保持，历史事件不会再次扣费、发奖或推进时间。'));
  if(mode!=='narrative'){
   const memory=section('当前记忆归档'),replies=state.history.filter(r=>r.role==='assistant'),count=status=>replies.filter(r=>r.archiveStatus===status).length;
   memory.append(el('p','正式归档 '+count('formal')+' · 已补录 '+count('imported')+' · 近期暂存 '+count('staged')+' · 待修 '+(count('blocked')+count('rejected')+count('changed'))+' · 待提炼 '+count('unarchived')));
   memory.append(el('p','最近两条已接纳回复保留在暂存层，较早的合法归档自动入表。原文已保存不等于记忆已入档；补录会跳过正式记录和近期暂存。'));
   const preview=el('details');preview.append(el('summary','查看当前记忆文本投影'),el('p','这是当前表单的文本内容；下一次请求按启用的资料槽装入，近期原文仍遵循聊天历史条数。'));
   for(const [key,label]of [['archive','事件与记忆'],['summary','阶段摘要'],['knowledge','人物认知']])preview.append(el('h4',label),el('pre',state.memory?.[key]||'暂无正式记录'));
   memory.append(preview);button(memory,'刷新归档状态',()=>{check(!draft&&!dirty,'请先保存或关闭当前草稿');return matrixHistory(mode,range);});
  }
  const resultArea=el('div');main.append(resultArea);
  function show(value){
   resultArea.replaceChildren();if(value.already){notice.textContent='这份来源已经入档，未重复导入';return;}
   draft={kind:'matrix-intake',id:value.id};dirty=true;const box=section(value.label+' · '+({ready:'待核对',invalid:'填写待修',failed:'请求未完成',stale:'来源待重读',committed:'已入档'}[value.phase]??'草稿'),resultArea);
   if(value.source.sourceKind==='card'){const books=value.source.raw.books??[],entries=books.flatMap(b=>b.entries);box.append(el('p','来源：当前角色卡、人设与 '+books.length+' 本世界书；启用 '+entries.filter(e=>e.enabled).length+' 条，停用 '+entries.filter(e=>!e.enabled).length+' 条。世界书：'+(books.map(b=>b.book).join('、')||'无')));}
   const original=el('details');original.append(el('summary','原始来源与模型原答'),el('pre',JSON.stringify(value.source.raw,null,2)),el('pre',String(value.rawResponse??'')));box.append(original);
   if(value.error)box.append(el('p',value.error));if(value.phase==='committed'){dirty=false;draft=null;box.append(el('p','此来源已确认入档。'));return;}
   const cellsOnly=typeof value.cells==='string'&&value.cells.length>0,initial=cellsOnly?value.cells:String(value.rawResponse??''),answer=field(box,cellsOnly?'极简填写内容（可修订）':'完整原答（待修订）',initial,{type:'textarea'});answer.rows=12;
   if(value.diff?.length)table(box,['表格与记录','字段','原值','填写值'],value.diff.map(d=>[(d.tableLabel??d.tableId)+'／'+(d.recordName??d.recordId),d.label,d.before===undefined?'未提供':(d.beforeDisplay??d.before),d.afterDisplay??d.after]));
   const reviewed=field(box,'已核对原文、语义、遗漏与隐情归属',false,{type:'checkbox',track:false});
   button(box,'检查修订并重新预览',async()=>{try{show(await api.preview(value.id,cellsOnly?{cells:answer.value}:answer.value));notice.textContent='结构与引用已检查；请核对具体语义后确认';}catch(error){if(error.draft)show(error.draft);throw error;}});
   button(box,'确认保存规范表单',async()=>{check(value.phase==='ready','请先修正原答并重新预览');check(answer.value===initial,'填写内容已改变，请先重新预览');await api.commit(value.id,{reviewed:reviewed.checked});draft=null;dirty=false;onSaved();await matrixHistory(mode,range);notice.textContent='已写入当前规范表单；没有重放历史动作或成本';});
   button(box,'关闭这份草稿',()=>{api.discard(value.id);draft=null;dirty=false;resultArea.replaceChildren();notice.textContent='页面草稿已关闭，原答仍保留在填写请求记录中';});
  }
  const generate=async input=>{check(!draft,'请先保存或关闭当前提炼草稿');try{const value=await api.generate(input);show(value);if(!value.already)notice.textContent='原答与草稿已保留，正式档案尚未修改';}catch(error){if(error.draft)show(error.draft);throw error;}};
  if(mode!=='narrative'){
   const init=section('角色卡与世界书 → 初始化简表');init.append(el('p','自动读取当前角色卡、人设和绑定世界书的已启用条目；示例和备选开场不会自动成为已经发生的历史。已有角色和进度不会被初值覆盖。'));button(init,'生成初始化简表草稿',()=>generate({kind:'initialization',sourceKind:'card',label:'角色卡初始化'}));
   const history=section('选择已确认会话楼层'),pending=state.history.filter(r=>r.role==='assistant'&&!r.latest&&r.canImport);let from=range?.from??pending[0]?.floor??1,to=range?.to??pending.at(-1)?.floor??state.history.at(-1)?.floor??1,includeLatest=false;
   field(history,'起始楼层',from,{type:'number',track:false,change:v=>from=v});field(history,'结束楼层',to,{type:'number',track:false,change:v=>to=v});field(history,'本次明确保留最新回复',false,{type:'checkbox',track:false,change:v=>includeLatest=v});
   button(history,'生成所选历史简表草稿',()=>generate({kind:'history',sourceKind:'chat',from,to,includeLatest,label:'会话历史 '+from+'—'+to}));const stop=el('button','停止当前提炼');stop.type='button';stop.onclick=()=>service.clear?.({reason:'用户停止规范提炼'});history.append(stop);
   if(api.batch){const batch=section('自动分批补录与总结');await mountHistoryBatch({api,parent:batch,el,field,button,table,range:()=>({from,to,includeLatest}),showDraft:value=>{check(!draft,'请先保存或关闭当前草稿');show(value);},onSaved,notice});assertActive();}
   if(service.openReviewWorkflow){const advanced=el('details');advanced.append(el('summary','高级：逐层选择表与字段'));history.append(advanced);button(advanced,'打开逐层补录与确认',()=>service.openReviewWorkflow());}
   const list=el('details');list.append(el('summary','查看原始楼层与入档状态'));history.append(list);table(list,['楼层','角色','状态与待办','原文预览'],state.history.map(r=>[r.floor,r.role,[MEMORY_STATUS_LABELS[r.archiveStatus]??'待提炼',...(r.pending??[]).map(p=>p.reason)].join('；'),r.preview]));
  }
  const manual=section(mode==='narrative'?'从叙事提炼标准人物资料':'手写历史与旧日志');let text='',label=mode==='narrative'?'人物资料':'手写历史',worldTime='';field(manual,'来源名称',label,{change:v=>label=v});if(mode!=='narrative')field(manual,'已知剧情时间（未知留空）','',{change:v=>worldTime=v});const area=field(manual,mode==='narrative'?'作者人物原文':'历史原文或手写摘要','',{type:'textarea',change:v=>text=v});area.rows=10;
  const file=el('input');file.type='file';file.accept='.txt,.md,.jsonl,.json';file.setAttribute('aria-label','导入原始资料');file.onchange=()=>run(async()=>{if(!file.files?.length)return;text=await file.files[0].text();area.value=text;dirty=true;notice.textContent='原文已载入，尚未提炼或入档';});manual.append(file);button(manual,'生成原文简表草稿',()=>generate({kind:mode==='narrative'?'narrative':'history',sourceKind:'text',text,label,worldTime:worldTime||null}));
  const saved=section('已保留的填写草稿');for(const item of state.drafts)button(saved,item.label+' · '+item.phase,async()=>{check(!draft,'请先保存或关闭当前草稿');show(await api.read(item.id));});
 }
 async function history(range=null){return matrixHistory('history',range);}
 async function genesis(prefill=''){check(onAssistant,'当前创作统一由缇斯亚助手承载');return onAssistant('genesis',prefill||initialGoal);}
 async function style(){if(beginPage('style'))return;const snap=store.read(),settings=tableSettings(snap.world),g=section('禁词与防套话规则');let rules=styleRules(settings);g.append(el('p','内置规则按原预设 F.09–F.11 整理。开启的规则作为硬约束注入；匹配检查用于发现遗漏，不会静默删改正文。'));field(g,'启用禁词与防套话约束',settings.styleEnabled??true,{type:'checkbox',change:v=>settings.styleEnabled=v});const hard=ui.value(g,'其他明确要求',{type:'texts',required:true},settings.hardRules),host=el('div');g.append(host);let editors=[];
  function draw(){host.replaceChildren();editors=[];for(const rule of rules){const d=el('details');d.append(el('summary',rule.name));host.append(d);const fields={};for(const [key,label]of [['name','规则名称'],['pattern','词句或正则'],['flags','正则标记'],['instruction','替代表达要求']])fields[key]=ui.input(d,label,rule[key]??'',{type:key==='instruction'?'textarea':'text'});fields.kind=ui.input(d,'匹配方式',rule.kind,{choices:[['literal','词句'],['regex','正则表达式'],['instruction','写作要求']]});fields.enabled=ui.input(d,'启用此项',rule.enabled,{type:'checkbox'});editors.push(()=>({...rule,...Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,k==='enabled'?n.checked:n.value]))}));button(d,'删除此规则',()=>{rules=editors.map(f=>f()).filter(r=>r.id!==rule.id);dirty=true;draw();});}}
  draw();button(g,'新增规则',()=>{rules=editors.map(f=>f());rules.push({id:'custom-'+crypto.randomUUID(),name:'新规则',kind:'literal',pattern:'',flags:'',enabled:true,instruction:'',source:'用户自定'});dirty=true;draw();});button(g,'恢复原预设规则',()=>{rules=copy(BUILTIN_STYLE_RULES);dirty=true;draw();});button(g,'保存规则',async()=>{settings.hardRules=hard();settings.styleRules=editors.map(f=>f());styleRules(settings);const next=copy(snap.data);next.worlds[snap.key].tables=settings;await store.save(next,snap.revision,snap.key);dirty=false;onSaved();await style();notice.textContent='规则已保存，下次生成生效';});const audit=service.state().styleAudit,last=section('最近一轮正文核对');if(audit){check(Array.isArray(audit.hits),'最近文风检查回执不完整');last.append(el('p',!audit.enabled?'该轮文风约束已关闭':audit.hits.length?'发现 '+audit.hits.length+' 处命中':'未命中该轮已启用的词句／正则；语义规则仍需核对'));if(audit.at)last.append(el('small','检查时间：'+audit.at));table(last,['规则','命中','位置'],audit.hits.map(x=>[x.name,x.text,String(x.offset)]));}else last.append(el('p','尚无本轮正文检查回执；没有回执不代表已经通过检查。'));const checker=section('检查一段正文');let text='';field(checker,'待检查正文','',{type:'textarea',track:false,change:v=>text=v});button(checker,'检查当前已保存规则',()=>{const found=service.checkStyle(text);table(checker,['规则','命中','位置'],found.map(x=>[x.name,x.text,String(x.offset)]));notice.textContent=found.length?'发现 '+found.length+' 处，请按语境检查':'未命中已登记词句／正则；语义套话仍需人工核对';});
 }
 async function preview(){
  if(beginPage('preview'))return;const catalog=service.assistant.catalog(),data=await service.review(),g=section('辅 API 预设全文');
  g.append(el('p','以下由当前模式的同一编译器生成，逐项显示身份、任务提示词与补充指令。无需建档即可阅读。使用自选预设时须保留本任务完整协议；不兼容预设会明确拒发。所有文本任务的完整预设在“模型与预设 → 任务连接分配”查看，实际发送内容可在“请求检查”核对。'));
  const snap=store.read(),settings=tableSettings(snap.world);settings.taskInstructions??={};
  for(const task of catalog.tasks){const d=el('details');d.append(el('summary',task.name));g.append(d);d.append(el('p','API：'+task.route.connection+'；模型：'+(task.route.model||'继承连接')+'；预设：'+task.route.preset));for(const [id,text]of Object.entries(task.entries)){const sub=el('details');sub.append(el('summary',id),el('pre',text));d.append(sub);}if(task.selected.text){const sub=el('details');sub.append(el('summary','本任务已选附加资源'),el('pre',task.selected.text));d.append(sub);}field(d,task.name+' · 补充要求',task.supplement,{type:'textarea',change:v=>settings.taskInstructions[task.id]=v});}
  button(g,'保存所有辅助模式补充要求',async()=>{const next=copy(snap.data);next.worlds[snap.key].tables=settings;await store.save(next,snap.revision,snap.key);dirty=false;onSaved();await preview();notice.textContent='辅助模式补充要求已保存；正文模式保持原配置';});
  const t=section('完整 Matrix 表单定义');t.append(el('p',data.storageReady?'当前权威 Matrix bundle 的实际模板。':'尚未读到有效 Matrix 存档：'+data.storageError));
  for(const [kind,title]of [['tables','表'],['types','类型']])for(const row of data.registry[kind]){const d=el('details');d.append(el('summary',title+' · '+row.name+' · '+row.id));t.append(d);d.append(el('p','分区：'+(row.partition??'未标注')+'；工作表：'+(row.sheet??'未标注')+(row.purpose?'；职责：'+row.purpose:'')));table(d,['字段','类型','必填／约束'],Object.entries(row.fields).map(([name,f])=>[name,f.type,JSON.stringify(f)]));}
  const r=section('当前已填记录');r.append(el('p',data.storageReady?data.rows.length+' 条实际记录':'存档未就绪，不能判断记录数量。'));for(const row of data.rows){const d=el('details'),name=row.values.name??row.values.title??row.values.label??row.values.instance_name??row.id;d.append(el('summary',name+' · '+row.table),el('pre',JSON.stringify(row,null,2)));r.append(d);}button(main,'导出预设与表单完整内容',()=>download('Tisya-presets-and-forms.json',{tasks:catalog.tasks,registry:data.registry,rows:data.rows,storageReady:data.storageReady,storageError:data.storageError}));notice.textContent='预设和 Matrix 表单内容已展开为可查看条目';
 }
 async function assistant(){
  if(beginPage('assistant'))return;const g=section('缇斯亚 · 配置助手');g.append(el('p','直接说你想要的效果。缇斯亚读取当前配置、表单和补录状态，列出改前改后；点一次即可应用全部设置。缺少的新配置会带着需求转给创世。API 默认继承主聊天连接，可在“预设与 API”单独指定。'));
  let question='';const input=field(g,'想让缇斯亚帮你做什么','',{type:'textarea',change:v=>question=v}),shortcuts=el('div'),answer=el('div');g.append(shortcuts,answer);
  for(const text of ['帮我检查现在的配置，说明哪里需要调整','帮我安排旧会话楼层补录','说明当前每个辅 API 的预设和表单职责'])button(shortcuts,text,()=>{question=text;input.value=text;dirty=true;notice.textContent='需求已填入，点击“让缇斯亚处理”发送';});
  function showSuggestion(result,savedCount=0){
   draft=result.diff.length||result.backfill||result.genesisGoal?result:null;dirty=false;answer.replaceChildren(el('p',result.answer));
   if(savedCount)answer.append(el('p','已保存 '+savedCount+' 项配置修改。可继续下面的操作。'));
   if(result.diff.length){table(answer,['配置项','修改前','修改后','理由'],result.diff.map(c=>[c.label??c.path,JSON.stringify(c.before),JSON.stringify(c.value),c.reason]));button(answer,'应用全部更改',async()=>{const saved=await service.assistant.applyAndContinue(result);onSaved();showSuggestion(saved.next,saved.count);notice.textContent='全部配置更改已保存；补录与创世建议仍可继续';});}
   if(result.backfill){answer.append(el('p','建议补录第 '+result.backfill.from+'—'+result.backfill.to+' 层，本批最多 '+result.backfill.limit+' 条 AI 回复。已归档层自动跳过，最新 AI 层保留。'));button(answer,'按建议开始楼层补录',async()=>{check(!result.diff.length,'请先应用配置修改，再开始建议的补录');service.assistant.guard(result);draft=null;dirty=false;await history(result.backfill);notice.textContent='已带入建议楼层；生成简表并核对后再保存';});}
   if(result.genesisGoal){answer.append(el('p','交给创世：'+result.genesisGoal));button(answer,'带着需求交给创世',async()=>{check(!result.diff.length,'请先应用配置修改，再交给创世');service.assistant.guard(result);draft=null;dirty=false;await genesis(result.genesisGoal);notice.textContent='需求已交给创世，可直接生成蓝图';});}
   if(draft)button(answer,'放弃剩余建议',()=>{draft=null;dirty=false;answer.replaceChildren(el('p',savedCount?'剩余建议已放弃，已保存设置保留。':'建议已放弃，设置未改动。'));});
  }
  button(g,'让缇斯亚处理',async()=>{const result=await service.assistant.ask(question,assistantConversation.slice(-10));assistantConversation.push({role:'user',content:question},{role:'assistant',content:result.answer});if(assistantConversation.length>12)assistantConversation.splice(0,assistantConversation.length-12);showSuggestion(result);notice.textContent='缇斯亚已答复；待应用的修改仍未保存';});
  const stop=el('button','停止助手请求');stop.type='button';stop.onclick=()=>{service.clear();notice.textContent='已请求停止；未应用的建议不改设置';};g.append(stop);notice.textContent='配置助手已就绪';
 }
 async function foundation(){return matrixHistory('narrative');}
 async function atlasPage(){
  if(beginPage('atlas'))return;
  if(!standaloneAtlas){const controls=el('div');main.append(controls);button(controls,'刷新最新版',atlasPage);if(onMediaManage)button(controls,'管理影像绑定',()=>onMediaManage());}
  let mediaWarning='';if(service.mediaAtlas)try{await service.mediaAtlas.request();assertActive();}catch(error){mediaWarning='；影像绑定暂未刷新：'+error.message;}
  const snapshot=await service.readAtlasSnapshot();assertActive();
  const host=el('div'),shadow=host.attachShadow({mode:'open'}),style=el('style'),app=el('div');style.textContent=ATLAS_STYLE+'\n:host{display:block;font-family:inherit}#app{min-height:'+(standaloneAtlas?'100dvh':'500px')+'}.shell{min-height:'+(standaloneAtlas?'calc(100dvh - 132px)':'400px')+'}.preview-note{padding-bottom:16px}.content{overflow-wrap:anywhere}.detail-tabs{flex-wrap:wrap}.scopebar select{max-width:100%}';app.id='app';shadow.append(style,app);main.append(host);
  mountArchiveAtlas(app,snapshot.data,{initialSelected:initialAtlasTarget,media:service.mediaAtlas?createAtlasMediaProjection(()=>service.mediaAtlas.view()):null,onMediaManage:onMediaManage?()=>onMediaManage():null,onExit:standaloneAtlas?()=>onAtlasExit?.():null,onIdentity:onIdentity?record=>{check(!busy&&!dirty&&!draft&&!pageDrafts.size,'请先保存或放弃表单草稿');onIdentity({book:snapshot.data.originBook,id:record.id,rev:record.rev});}:null,beforeRead:async()=>{assertActive();await snapshot.verify();},onFault:error=>{app.replaceChildren(el('p',error.message+(standaloneAtlas?'；请返回表单后重新进入图鉴。':'；请刷新最新版。')));if(standaloneAtlas&&onAtlasExit){const back=el('button','返回表单');back.type='button';back.onclick=()=>onAtlasExit();app.append(back);}notice.textContent=error.message;notice.setAttribute('role','alert');}});
  notice.textContent='已载入当前存档修订 '+snapshot.data.revision+(snapshot.data.matrix?'；查看正式档案、事件、影像与正文来源。':'；可切换原点，查看关联与修改路径。')+mediaWarning;
 }
 async function framework(worldId,selection={}){
  if(beginPage('framework'))return;check(service.readWorldFramework,'当前存档尚未接入世界框架');
  const data=await service.readWorldFramework(worldId);assertActive();worldFrameworkEditor({data,selection,el,field,button,section,check,isDirty:()=>dirty,changed:()=>dirty=true,saved:()=>dirty=false,reload:framework,save:service.saveWorldFrameworkRecord,importSeeds:service.importWorldUnitSeeds});notice.textContent='公共定义与各处引用共用同一存档';
 }
 async function conditions(editId=null){
  if(beginPage('conditions'))return;
  const data=await service.listConditionRules();
  if(data.format==='tisya.condition-form/1'){conditionEditor({data,editId,el,field,button,section,check,changed:()=>dirty=true,saved:()=>dirty=false,isDirty:()=>dirty,reload:conditions,save:service.saveConditionRule});notice.textContent='条件与世界书共用当前规范表单';return;}
 }

 const unsubscribeArchive=service.subscribeArchive?.(()=>{if(alive&&page==='atlas'&&!busy)void run(atlasPage);});
 const pages=[['atlas','图鉴 · 最新存档',atlasPage],...(service.readWorldFramework?[['framework','世界总框架',framework]]:[]),['foundation','档案提炼',foundation],['conditions','条件运行',conditions],['history','初始化与历史',history],['genesis','创世与模板',genesis],['style','禁词与文风',style],['preview','预设与表单全文',preview],['assistant','缇斯亚助手',assistant]];for(const [id,name]of pages){const option=el('option',name);option.value=id;pageSelect.append(option);}pageSelect.value=page;pageSelect.onchange=()=>{const next=pageSelect.value;pageSelect.value=page;if(next==='genesis'&&onAssistant){if(busy||dirty||draft){notice.textContent='请先保存或放弃当前修改，再进入创世';return;}genesis();return;}return run(async()=>{await pages.find(p=>p[0]===next)[2]();});};
 const discardDraft=button(root,'放弃当前未保存修改',async()=>{draft=null;dirty=false;await pages.find(p=>p[0]===page)[2]();notice.textContent='未保存修改已放弃；已保留的提炼请求仍可从草稿清单重读';});discardDraft.classList.add('tisya-discard-draft');const ready=run(async()=>{if(!initialPage||initialPage==='settings')return history();const target=pages.find(p=>p[0]===initialPage);check(target,'未知功能页');return initialPage==='genesis'?genesis(initialGoal):target[2]();});return {root,ready,navigate:(id,prefill='')=>run(async()=>{const target=pages.find(p=>p[0]===id);check(target,'未知功能页');await (id==='genesis'?genesis(prefill):target[2]());}),kind:'tables',keepAlive:true,settled:()=>pending,resume:()=>{if(busy)return pending;if(dirty||draft){notice.textContent='草稿已保留，保存时将核对存档版本';return Promise.resolve();}return run(pages.find(p=>p[0]===page)[2]);},requestLeave:({preserve=false}={})=>{const hasDraft=!!(dirty||draft||pageDrafts.size);return {allowed:preserve||(!busy&&!hasDraft),reason:busy&&!preserve?'表单任务正在处理，请等待或停止任务':hasDraft&&!preserve?'表单草稿尚未保存；可保留草稿后切换':'',dirty:hasDraft};},dispose(){alive=false;unsubscribeArchive?.();pageDrafts.clear();root.remove();}};
}
