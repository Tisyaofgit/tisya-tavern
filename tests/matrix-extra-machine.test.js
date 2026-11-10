import test from 'node:test';
import assert from 'node:assert/strict';
import {envelope,parseReply,acceptReply} from '../engine/reply.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {runReplyDisplay} from '../reply-protocol.js';
import {configureTags,isMatrixReply} from '../engine/tags.mjs';
import {baseline} from '../engine/config.mjs';

const marker='<StatusPlaceHolderImpl/>';
const operations=[{op:'replace',path:'/count',value:0},{op:'replace',path:'/enabled',value:false},{op:'add',path:'/note',value:'literal </vars> <cells/> <StatusPlaceHolderImpl/> & </JSONPatch>'}];
const update='<UpdateVariable><Analysis>PRIVATE_UPDATE_NOTE</Analysis><JSONPatch>'+JSON.stringify(operations)+'</JSONPatch></UpdateVariable>';
const source=extra=>'<reply><task/><anchor phase="before"/><title>登记|午后|驿站|验证</title><body>1 登记人核对了物品。</body><anchor phase="after"/><extra>'+extra+'</extra><archive/><actions>观察|查看登记册。|核对。</actions></reply>';
const rule={id:'native',name:'原卡状态栏',enabled:true,placements:['char'],timing:'display',findRegex:'<StatusPlaceHolderImpl\\s*/>',replaceString:'<section>原卡状态面板</section>',trimStrings:[],substitution:'none'};
const render=raw=>runReplyDisplay({source:raw,groups:[{id:'native',entries:[rule]}]});

test('extra groups machine children without exposing them or changing the saved source',()=>{
 const raw=source(marker+'<cells format="form"/><vars>'+update+'</vars>'),before=raw;
 const e=envelope(raw),p=parseReply(raw,'grouped'),display=render(raw);
 assert.equal(e.blocks.vars,update);assert.equal(p.native_vars,update);assert.equal(p.cells_format,'form');assert.equal(p.reply_raw,raw);
 assert.equal(display.rules[0].matches,1);assert.match(display.extra,/原卡状态面板/);assert.doesNotMatch(display.extra,/PRIVATE_UPDATE_NOTE|JSONPatch|UpdateVariable|cells|literal/);assert.equal(raw,before);
});
test('the reported marker-before-update layout recovers its original native panel once',()=>{
 const raw=source('').replace('<archive/>','<cells/><vars><combat_driver>无</combat_driver>'+marker+update+'</vars><archive/>');
 const original=parseReply(raw,'reported').native_vars,display=render(raw);
 assert.equal(display.rules[0].matches,1);assert.match(display.extra,/原卡状态面板/);assert.equal(display.extraPanels.filter(p=>p.ruleName==='原卡状态栏').length,1);
 assert.doesNotMatch(display.extra,/PRIVATE_UPDATE_NOTE|UpdateVariable|JSONPatch|literal/);assert.equal(parseReply(raw,'reported').native_vars,original);
});
test('grouped cells settle once through the existing form writer and display never settles again',()=>{
 const e=new Runtime();e.registerTable('PEOPLE',[{key:'name',label:'姓名',type:'TEXT',required:true},{key:'count',label:'数量',type:'NUMBER'},{key:'enabled',label:'启用',type:'BOOLEAN'}],'人物');
 const raw=source(marker+'<cells format="form">【人物／1】\n1 姓名：阿青 | P1\n2 数量：0 | P1\n3 启用：否 | P1</cells><vars>'+update+'</vars>');
 const result=acceptReply(e,raw,'one-write');assert.equal(result.result.operations[0].status,'COMMITTED');
 assert.deepEqual(Object.values(e.rows('PEOPLE')).map(r=>({name:r.values.name,count:r.values.count,enabled:r.values.enabled})),[{name:'阿青',count:0,enabled:false}]);
 const saved=structuredClone(e.data);render(raw);render(raw);assert.equal(acceptReply(e,raw,'one-write').status,'REPLAY');assert.deepEqual(e.data,saved);
});
test('duplicate placements and hidden machine nesting fail instead of merging or rendering commands',()=>{
 for(const raw of [source('<cells/><cells/><vars/>'),source('<cells/><vars/>').replace('<archive/>','<vars/><archive/>'),source('<panel><vars>'+update+'</vars></panel>'),source('<cells/><vars>'+update+update+marker+'</vars>')])assert.throws(()=>render(raw));
});
test('custom protocol names apply to machine children inside extra without changing native JSON literals',()=>{
 configureTags({reply:'scene.',extra:'attachments',cells:'ledger.',vars:'updates'});
 try{const raw=source(marker+'<cells/><vars>'+update+'</vars>').replace('<reply>','<scene.>').replace('</reply>','</scene.>').replace('<extra>','<attachments>').replace('</extra>','</attachments>').replace('<cells/>','<ledger./>').replace('<vars>','<updates>').replace(/<\/vars>(?=<\/attachments>)/,'</updates>');
  assert.equal(envelope(raw).blocks.vars,update);assert.equal(render(raw).rules[0].matches,1);
 }finally{configureTags();}
});
test('the shipped Matrix skeleton nests the unique cells and vars blocks inside extra',()=>{
 const registry=baseline.prompts.find(p=>p.identifier==='tisya_registry').content;
 const start=registry.indexOf('\n<extra>'),end=registry.indexOf('\n</extra>',start),cells=registry.indexOf('\n<cells ',start),vars=registry.indexOf('\n<vars>',start);
 assert(start>=0&&cells>start&&vars>cells&&end>vars);assert.doesNotMatch(baseline.prompts.find(p=>p.identifier==='tisya_task_start').content,/otherwise emit `<extra\/>`/);
});

test('grouped raw JSON owns its quoted closing tags and retains all original payload bytes',()=>{
 const literals=['literal </extra>','literal </vars>','literal <not-tag>','literal <cells/> <vars/> <StatusPlaceHolderImpl/>','literal <UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>','literal <![CDATA[</extra>]]> & &quot;','literal &quot; </vars> </extra> <cells/>'];
 for(const value of literals){
  const payload=JSON.stringify({protocol:'mvu-json-patch',operations:[{op:'replace',path:'/note',value}],zero:0,enabled:false,empty:''}),raw=source(marker+'<cells/><vars>'+payload+'</vars>');
  const parsed=parseReply(raw,'quoted'),display=render(raw);
  assert.equal(parsed.native_vars,payload);assert.equal(parsed.reply_raw,raw);assert.equal(display.rules[0].matches,1);assert.doesNotMatch(display.extra,/literal|mvu-json-patch|operations/);
 }
});

test('mixed-case grouped machine wrappers are private and remain available to the existing form writer',()=>{
 for(const [cells,vars]of [['CELLS','VARS'],['Cells','Vars']]){
  const payload=JSON.stringify({note:'PRIVATE_GROUPED_JSON',zero:0,enabled:false});
  const raw=source(marker+'<'+cells+' format="form">【人物／1】\n1 姓名：阿青 | P1\n2 数量：0 | P1\n3 启用：否 | P1</'+cells.toLowerCase()+'><'+vars+'>'+payload+'</'+vars.toLowerCase()+'>');
  const p=parseReply(raw,'case');assert.equal(p.native_vars,payload);assert.equal(p.cells_format,'form');assert.match(p.cells_raw,/姓名：阿青/);
  const display=render(raw);assert.equal(display.rules[0].matches,1);assert.doesNotMatch(display.extra,/PRIVATE_GROUPED_JSON|姓名|CELLS|Cells|VARS|Vars/);
  const e=new Runtime();e.registerTable('PEOPLE',[{key:'name',label:'姓名',type:'TEXT',required:true},{key:'count',label:'数量',type:'NUMBER'},{key:'enabled',label:'启用',type:'BOOLEAN'}],'人物');
  assert.equal(acceptReply(e,raw,'case').result.operations[0].status,'COMMITTED');assert.deepEqual(Object.values(e.rows('PEOPLE')).map(r=>({name:r.values.name,count:r.values.count,enabled:r.values.enabled})),[{name:'阿青',count:0,enabled:false}]);
 }
});

test('machine nesting and duplicate case variants fail before cells can be accepted',()=>{
 const nesting=[
  source('<cells/><vars><cells>hidden form</cells>'+update+'</vars>'),
  source('<cells format="form"><vars>'+update+'</vars></cells><vars/>'),
  source('<cells/><vars><vars>'+update+'</vars></vars>'),
  source('<panel><VARS>'+update+'</VARS></panel>'),
  source('').replace('<archive/>','<cells><vars/></cells><vars/><archive/>'),
 ];
 for(const raw of nesting)assert.throws(()=>envelope(raw),{code:'REPLY_MACHINE_NESTING'});
 for(const raw of [source('<CELLS/><cells/><vars/>'),source('<cells/><vars/><VARS/>'),source('<cells/><VARS/>').replace('<archive/>','<vars/><archive/>')])assert.throws(()=>envelope(raw),{code:'REPLY_DUPLICATE_BLOCK'});
});

test('custom aliases keep Unicode attachments and quoted JSON separate at known slot boundaries',()=>{
 configureTags({reply:'scene.',extra:'attachments',cells:'ledger.',vars:'updates'});
 try{
  const payload=JSON.stringify({note:'PRIVATE_ALIAS_JSON </attachments> </UPDATES> <LEDGER./>',zero:0,enabled:false});
  const raw='<scene.><anchor phase="before"/><body>1 登记员核对记录。</body><anchor phase="after"/><attachments><状态栏>公开状态</状态栏>'+marker+'<LEDGER. format="form"/><UPDATES>'+payload+'</updates></attachments></scene.>';
  const p=parseReply(raw,'alias');assert.equal(p.native_vars,payload);assert.equal(p.cells_format,'form');assert.equal(p.reply_raw,raw);
  const display=render(raw);assert.match(display.extra,/公开状态/);assert.equal(display.rules[0].matches,1);assert.doesNotMatch(display.extra,/PRIVATE_ALIAS_JSON|zero|enabled|UPDATES|LEDGER/);
  const legacy='<scene.><anchor phase="before"/><body>1 登记员核对记录。</body><anchor phase="after"/><attachments><状态栏>公开状态</状态栏>'+marker+'</attachments><LEDGER./><UPDATES>'+payload+'</updates></scene.>';
  assert.equal(parseReply(legacy,'legacy-alias').native_vars,payload);assert.match(render(legacy).extra,/公开状态/);
  assert.throws(()=>envelope(raw.replace('</updates>','</vars>')),{code:'REPLY_BLOCK'});
 }finally{configureTags();}
});

test('aliases may use another canonical machine name without swapping normalized outer slots',()=>{
 configureTags({reply:'scene.',extra:'attachments',cells:'ledger.',vars:'cells'});
 try{
  const payload=JSON.stringify({note:'PRIVATE_COLLISION </extra> <vars/>'});
  const raw='<scene.><anchor phase="before"/><body>1 登记员核对记录。</body><anchor phase="after"/><attachments>'+marker+'<ledger. format="form"/><cells>'+payload+'</cells></attachments></scene.>';
  const p=parseReply(raw,'alias-collision');assert.equal(p.native_vars,payload);assert.equal(p.cells_format,'form');assert.equal(p.cells_raw,'');assert.doesNotMatch(render(raw).extra,/PRIVATE_COLLISION|vars/);
 }finally{configureTags();}
});

test('a sparse grouped cells alias selects Matrix without exposing the whole source as prose',()=>{
 configureTags({reply:'scene',extra:'attachments',cells:'ledger',vars:'updates'});
 try{
  const raw='<scene><body>1 中性正文。</body><attachments><ledger/><updates>{"note":"PRIVATE_SPARSE_ALIAS"}</updates></attachments></scene>';
  assert.equal(isMatrixReply(raw),true);const display=render(raw);assert.match(display.body,/中性正文/);assert.doesNotMatch(display.body+display.extra,/PRIVATE_SPARSE_ALIAS|updates|ledger/);
  const quoted='<scene><body>1 中性正文。</body><attachments/><updates>{"note":"literal <ledger/>"}</updates></scene>';
  assert.equal(isMatrixReply(quoted),false);
 }finally{configureTags();}
});

test('repeated native update blocks fail even when their display marker is already outside vars',()=>{
 for(const raw of [source(marker+'<cells/><vars>'+update+update+'</vars>'),source(marker).replace('<archive/>','<cells/><vars>'+update+update+'</vars><archive/>')])assert.throws(()=>render(raw),{code:'TISYA_NATIVE_MVU_FORMAT'});
 const value='<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>',single='<UpdateVariable><JSONPatch>'+JSON.stringify([{op:'replace',path:'/note',value}])+'</JSONPatch></UpdateVariable>';
 assert.equal(parseReply(source(marker+'<cells/><vars>'+single+'</vars>'),'quoted-update').native_vars,single);
 const opaque='<StateChange><set path="note">unknown native format</set></StateChange>';
 const raw=source(marker+'<cells/><vars><![CDATA['+opaque+']]></vars>');assert.equal(parseReply(raw,'opaque').native_vars,'<![CDATA['+opaque+']]>');assert.doesNotMatch(render(raw).extra,/StateChange|unknown native/);
 const fields='<StateChange><cells>native field</cells><vars>native nested field</vars></StateChange>',nested=source(marker+'<cells/><vars>'+fields+'</vars>');
 assert.equal(parseReply(nested,'opaque-fields').native_vars,fields);assert.equal(parseReply(nested,'opaque-fields').cells_raw,'');assert.doesNotMatch(render(nested).extra,/native field|native nested field/);
});
