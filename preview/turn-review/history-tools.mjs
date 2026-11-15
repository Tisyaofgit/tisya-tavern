import {Model as M} from './model.mjs';
import {projectHistoryLayers,sourceVersion,historyBody} from '../../engine/history-layers.mjs';
import {prepareBackfill,fillBackfillFloor,confirmBackfillFloor} from '../../engine/history-backfill.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scope='world-demo-dukou';
const reply=(body,extra='旁栏：当前天气与选项')=>'<reply><task>合成演示任务</task><body>'+body+'</body><extra>'+extra+'</extra><archive>合成机器归档区块</archive><actions>查看渡口</actions></reply>';
const msg=(id,floor,role,text)=>({id,floor,role,text,scope,revision:1});
export const demoHistoryMessages=[
 msg('u35',35,'user','旧用户原文：我想知道码头有什么。'),msg('a36',36,'assistant',reply('1 你离开城门，体力为86。\n\n2 老周与你约好天明前在渡口见面。')),
 msg('u37',37,'user','旧用户原文：沿着河岸走。'),msg('a38',38,'assistant',reply('1 你走到河岸，体力为82。\n\n2 雨沿着蓑衣往下淌。')),
 msg('u39',39,'user','旧用户原文：去渡口看看。'),msg('a40',40,'assistant',reply('1 你抵达渡口外，体力为78。\n\n2 你与沈青初次碰面。')),
 msg('u41',41,'user','我把信递给她，问今晚的渡船还在不在。'),msg('a42',42,'assistant',reply('1 沈青接过信，尚未拆开。\n\n2 你从渡口外走进茶棚，体力为72。\n\n3 她答应陪你询问船夫：“只到对岸。”','旁栏：夜雨初歇；船费尚未知。')),
 msg('u43',43,'user','去问船夫愿不愿意开船；先不要替我付钱。')
];
const bodyFor=id=>historyBody(demoHistoryMessages.find(m=>m.id===id).text);
function coverage(id,quote){const source=demoHistoryMessages.find(m=>m.id===id);return [{reviewed:true,messageId:id,version:sourceVersion(source),block:'body',quote}];}
const initialArchives=[
 {id:'archive-appointment',factId:'appointment-old-zhou',scope,status:'confirmed',text:'老周与你约好天明前在渡口见面。',source:{messageId:'a36',version:sourceVersion(demoHistoryMessages[1])},coverage:coverage('a36','老周与你约好天明前在渡口见面。')},
 {id:'archive-arrival',factId:'arrival-dukou',scope,status:'confirmed',text:'你抵达渡口外，体力为78。',source:{messageId:'a40',version:sourceVersion(demoHistoryMessages[5])},coverage:coverage('a40','你抵达渡口外，体力为78。')},
 {id:'archive-knowledge',factId:'knowledge-letter-sealed',scope,status:'confirmed',text:'已核对的人物认知：沈青不知道信件内容。',source:{messageId:'a40',version:sourceVersion(demoHistoryMessages[5])},coverage:[]}
];
export function seedHistoryTools(){return {historyCount:6,policy:{[M.GAUGE]:{cells:['value'],archive:[]},[M.EVENT]:{cells:[],archive:['full_process']}},receipts:[],batch:null};}
function fixtureValues(floor){
 const body=bodyFor(floor.id),energy={a36:86,a38:82,a40:78,a42:72}[floor.id],place={a36:'城门',a38:'河岸',a40:'渡口外',a42:'茶棚'}[floor.id];
 return floor.selection.map(item=>{const base={...item,state:'not_involved',value:null,recordId:null,recordName:'',evidence:'',response:'本层未涉及',covered:false};
  if(item.table===M.GAUGE&&item.key==='value')return {...base,state:'known',value:energy,recordId:'energy',recordName:'你的体力',evidence:'体力为'+energy,response:'从本层正文补入当时值',covered:true};
  if(item.table===M.SCENE&&item.key==='place_ref')return {...base,state:'known',value:place,recordId:'scene',recordName:'当前场景',evidence:place,response:'从本层正文补入当时值',covered:true};
  if(item.table===M.EVENT&&item.key==='full_process')return {...base,state:'known',value:body,recordId:'event-'+floor.id,recordName:'第'+floor.floor+'层事件',evidence:body,response:'保留本层完整正文事件',covered:true};
  return base;
 });
}
export function archivedUnits(tools){return [...initialArchives,...tools.receipts.filter(r=>r.channel==='archive'&&r.state==='known').map(r=>({id:r.key,factId:[r.table,r.recordId,r.fieldKey,r.messageId,r.version].join('|'),scope:r.scope,status:'confirmed',text:r.label+'：'+String(typeof r.value==='object'?JSON.stringify(r.value):r.value),source:r.source,sourceFaithful:r.value===r.evidence,coverage:r.covered?coverage(r.messageId,r.evidence):[]}))];}
export function mountHistoryTools({catalog,getState,save}){
 const $=id=>document.getElementById(id), world=()=>getState().world;
 let selectedTable=M.EVENT,policy=null,batch=null,floorId=null,dirty=false;
 const tools=()=>getState().historyTools??seedHistoryTools();
 const persist=(patch,message)=>{const next=M.clone(getState());next.historyTools={...M.clone(tools()),...patch};const ok=save(next,message);if(!ok){$('backfill-feedback').textContent='保存失败，当前修改没有提交；请保留窗口，解决本地存储问题后重试。';$('context-summary').textContent='范围保存失败，仍使用上次已保存的设置。';}return ok;};
 const error=e=>$('backfill-feedback').textContent=e.message??String(e);
 const fieldList=()=>M.fields(catalog,world(),selectedTable);
 function renderPicker(){
  const fields=fieldList(),query=$('backfill-field-search').value.trim().toLowerCase();
  $('backfill-fields').innerHTML=fields.filter(f=>!query||(f.label+' '+f.key).toLowerCase().includes(query)).map(f=>'<div class="backfill-pick"><span>'+esc(f.label)+'<small>'+esc(f.key)+(f.readonly?' · 程序维护':'')+'</small></span>'+['cells','archive'].map(ch=>'<label><input type="checkbox" data-bf-channel="'+ch+'" data-bf-key="'+esc(f.key)+'" aria-label="补录'+esc(f.label)+(ch==='archive'?'归档':'cells')+'" '+((policy[selectedTable]?.[ch]??[]).includes(f.key)?'checked ':'')+(f.readonly?'disabled':'')+'> '+(ch==='archive'?'归档':'cells')+'</label>').join('')+'</div>').join('');
  for(const ch of ['cells','archive']){const editable=fields.filter(f=>!f.readonly),n=editable.filter(f=>(policy[selectedTable]?.[ch]??[]).includes(f.key)).length,el=$('backfill-all-'+ch);el.checked=n===editable.length&&n>0;el.indeterminate=n>0&&n<editable.length;el.disabled=!editable.length;}
  $('backfill-fields').querySelectorAll('[data-bf-channel]').forEach(el=>el.onchange=()=>{const holder={policy};M.policy(holder,selectedTable,el.dataset.bfChannel,el.dataset.bfKey,el.checked);policy=holder.policy;persist({policy},'补录勾选已保存；不改变每轮常驻规则。');renderPicker();});
  const n=Object.values(policy).reduce((n,p)=>n+(p.cells?.length??0)+(p.archive?.length??0),0);$('backfill-selection-count').textContent='已选 '+n+' 项；本次补录与每轮常驻勾选分别保存。';
 }
 function renderBatch(){
  const saved=tools();batch=M.clone(saved.batch);const floors=batch?.floors??[];
  $('backfill-batch').hidden=!batch;$('backfill-config').open=!batch;
  $('backfill-count').textContent=batch?floors.length+' 层 · 已确认 '+floors.filter(f=>f.status==='confirmed').length+' · 已覆盖 '+floors.filter(f=>f.status==='skipped').length+' · 待核对 '+floors.filter(f=>f.status==='ready').length+' · 待修 '+floors.filter(f=>f.status==='blocked').length:'尚未生成候选；正式历史未改动。';
  if(!batch){$('backfill-save').disabled=true;$('backfill-confirm').disabled=true;return;}if(!floors.some(f=>f.id===floorId))floorId=floors.find(f=>f.status==='ready')?.id??floors[0]?.id;
  $('backfill-floor').innerHTML=floors.map(f=>'<option value="'+esc(f.id)+'">第 '+f.floor+' 层 · '+({ready:'待核对',confirmed:'已确认',skipped:'已覆盖',blocked:'来源待修',pending:'待生成'})[f.status]+'</option>').join('');$('backfill-floor').value=floorId;renderFloor();
 }
 function renderFloor(){
  const floor=batch?.floors.find(f=>f.id===floorId);if(!floor)return;dirty=false;
  $('backfill-source').textContent=floor.source.text;
  $('backfill-reviewed').checked=floor.reviewed===true;$('backfill-reviewed').disabled=floor.status!=='ready';
  $('backfill-values').innerHTML=floor.status==='blocked'?'<p class="note">正文无法可靠读取：'+esc(floor.error)+'。原文保留，未生成虚构候选。</p>':floor.status==='skipped'?'<p class="note">所选字段已确认补录，不重复提交。</p>':floor.values.map((v,i)=>'<section class="field-card"><div class="field-title">'+esc(v.label)+' <span class="custom-tag">'+(v.channel==='archive'?'归档':'cells')+'</span></div><div class="field-key">'+esc(catalog.find(t=>t.id===v.table)?.label??v.table)+'</div><div class="backfill-value-controls"><label>填写状态<select data-bf-state="'+i+'" '+(floor.status!=='ready'?'disabled':'')+'>'+[['known','已有内容'],['unknown','仍未知'],['none','明确无'],['not_involved','本层未涉及']].map(([k,l])=>'<option value="'+k+'" '+(v.state===k?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label>所属记录<input data-bf-record="'+i+'" value="'+esc(v.recordName)+'" '+(floor.status!=='ready'?'disabled':'')+'></label></div><label>候选内容<textarea data-bf-value="'+i+'" '+(floor.status!=='ready'||v.state!=='known'?'disabled':'')+'>'+esc(v.state==='known'?(typeof v.value==='object'?JSON.stringify(v.value,null,2):v.value):'')+'</textarea></label><label>本层原文依据<textarea data-bf-evidence="'+i+'" '+(floor.status!=='ready'||v.state!=='known'?'disabled':'')+'>'+esc(v.evidence)+'</textarea></label>'+(v.channel==='archive'?'<label class="inline-label"><input type="checkbox" data-bf-covered="'+i+'" '+(v.covered?'checked ':'')+(floor.status!=='ready'?'disabled':'')+'> 正文已完整承载此信息点</label>':'')+'</section>').join('');
  $('backfill-save').disabled=floor.status!=='ready';$('backfill-confirm').disabled=floor.status!=='ready';
  const changed=()=>{dirty=true;floor.reviewed=false;$('backfill-reviewed').checked=false;$('backfill-feedback').textContent='编辑尚未保存；请保存草稿并重新核对。';};
  $('backfill-values').querySelectorAll('[data-bf-state]').forEach(el=>el.onchange=()=>{const v=floor.values[Number(el.dataset.bfState)];v.state=el.value;v.value=null;v.response=({known:'人工修订并核对',unknown:'本层仍未知',none:'本层明确无',not_involved:'本层未涉及'})[v.state];v.covered=false;changed();const keep=dirty;renderFloor();dirty=keep;});
  for(const [attribute,key]of [['value','value'],['evidence','evidence'],['record','recordName']])$('backfill-values').querySelectorAll('[data-bf-'+attribute+']').forEach(el=>el.oninput=()=>{const v=floor.values[Number(el.dataset['bf'+attribute[0].toUpperCase()+attribute.slice(1)])];v[key]=el.value;if(key==='recordName'&&!v.recordId)v.recordId='manual:'+v.table+':'+el.value;if(key==='value'){v.covered=false;const control=$('backfill-values').querySelector('[data-bf-covered="'+floor.values.indexOf(v)+'"]');if(control)control.checked=false;}changed();});
  $('backfill-values').querySelectorAll('[data-bf-covered]').forEach(el=>el.onchange=()=>{floor.values[Number(el.dataset.bfCovered)].covered=el.checked;changed();});
 }
 function saveDraft(){if(!batch)return false;const ok=persist({batch},'历史补录草稿已保存，尚未确认的内容不进入历史纪录。');if(ok){dirty=false;$('backfill-feedback').textContent='草稿已保存，确认前不会入档。';}return ok;}
 function openBackfill(){policy=M.clone(tools().policy);$('backfill-table').innerHTML=catalog.filter(t=>!t.program).map(t=>'<option value="'+esc(t.id)+'">'+esc(t.label)+'</option>').join('');$('backfill-table').value=selectedTable;renderPicker();renderBatch();$('backfill-feedback').textContent='';$('backfill-dialog').showModal();}
 function openContext(){const t=tools(),r=projectHistoryLayers({messages:demoHistoryMessages,archives:archivedUnits(t),scope,historyCount:t.historyCount});$('context-count').value=t.historyCount;
  for(const [id,key]of [['archive','historyRecord'],['body','recentBody'],['situation','recentSituation']])$('context-'+id).textContent=r.layers[key];
  $('context-summary').textContent='归档 '+r.archiveUnits.length+' 个独立信息点 · 近期正文 '+r.recentBodies.length+' 条 · 最近情况 '+[r.recentSituation.previousUser,r.recentSituation.assistant,r.recentSituation.currentUser].filter(Boolean).length+' 条消息';
  $('context-audit').innerHTML=r.audit.map(a=>'<div class="audit-row"><code>'+esc(a.id)+'</code><span>'+esc(({history_record:'历史纪录',recent_body:'近期正文',recent_situation:'最近情况',excluded:'不注入'})[a.layer])+'</span><p>'+esc(a.reason)+'</p></div>').join('');if(!$('context-dialog').open)$('context-dialog').showModal();
 }
 $('backfill-open').onclick=openBackfill;$('context-open').onclick=openContext;
 $('backfill-table').onchange=()=>{selectedTable=$('backfill-table').value;$('backfill-field-search').value='';renderPicker();};$('backfill-field-search').oninput=renderPicker;
 for(const ch of ['cells','archive'])$('backfill-all-'+ch).onchange=()=>{const holder={policy};for(const f of fieldList().filter(f=>!f.readonly))M.policy(holder,selectedTable,ch,f.key,$('backfill-all-'+ch).checked);policy=holder.policy;persist({policy},'补录勾选已保存。');renderPicker();};
 $('backfill-use-world').onclick=()=>{policy=M.clone(getState().pending?.world.policy??world().policy);persist({policy},'已复制当前每轮勾选，可继续单独调整补录范围。');renderPicker();};
 $('backfill-all-history').onclick=()=>{$('backfill-from').value=35;$('backfill-to').value=42;};
 $('backfill-generate').onclick=()=>{try{if(dirty)throw Error('先保存当前修改。');if(tools().batch?.floors.some(f=>f.status==='ready')&&!$('backfill-replace').checked)throw Error('已有待核对草稿。若要重新生成，请明确勾选替换未确认候选。');
  let next=prepareBackfill({messages:demoHistoryMessages,scope,catalog,world:world(),policy,from:Number($('backfill-from').value),to:Number($('backfill-to').value),receipts:tools().receipts});
  for(const f of next.floors.filter(f=>f.status==='pending'))next=fillBackfillFloor(next,f.id,fixtureValues(f));
  if(persist({batch:next},'合成历史候选已生成，等待逐层核对。')){floorId=null;renderBatch();$('backfill-feedback').textContent='已生成覆盖全部所选楼层的合成候选；没有调用模型，没有自动入档。';$('backfill-replace').checked=false;}
 }catch(e){error(e);}};
 $('backfill-floor').onchange=()=>{if(dirty){$('backfill-floor').value=floorId;error('先保存本层修改再切换。');return;}floorId=$('backfill-floor').value;renderFloor();};
 $('backfill-save').onclick=saveDraft;$('backfill-reviewed').onchange=()=>{const f=batch?.floors.find(f=>f.id===floorId);if(f){f.reviewed=$('backfill-reviewed').checked;dirty=true;}};
 $('backfill-confirm').onclick=()=>{try{const result=confirmBackfillFloor({batch,id:floorId,messages:demoHistoryMessages,receipts:tools().receipts,catalog,world:world(),validateValue:M.parse});if(persist({batch:result.batch,receipts:result.receipts},'本层历史已确认补录；当前状态未重放。')){dirty=false;renderBatch();$('backfill-feedback').textContent='第'+batch.floors.find(f=>f.id===floorId).floor+'层已补录 '+result.added+' 项；当前体力、资产和时间未被历史动作改写。';}}catch(e){error(e);}};
 $('backfill-close').onclick=()=>{if(dirty){error('编辑尚未保存，请先保存草稿。');return;}$('backfill-dialog').close();};$('backfill-dialog').addEventListener('cancel',e=>{if(dirty){e.preventDefault();error('编辑尚未保存，请先保存草稿。');}});
 $('context-close').onclick=()=>$('context-dialog').close();$('context-count').onchange=()=>{const count=Number($('context-count').value);if(!Number.isSafeInteger(count)||count<0){$('context-summary').textContent='历史条数须为非负整数。';return;}if(persist({historyCount:count},'三层预览范围已保存。'))openContext();};
}
