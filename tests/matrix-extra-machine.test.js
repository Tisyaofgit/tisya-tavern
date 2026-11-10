import test from 'node:test';
import assert from 'node:assert/strict';
import {envelope,parseReply,acceptReply} from '../engine/reply.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {runReplyDisplay} from '../reply-protocol.js';
import {configureTags} from '../engine/tags.mjs';
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
