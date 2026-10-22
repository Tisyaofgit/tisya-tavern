import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createRequire} from 'node:module';
import {sevenFixture} from './fixtures/reply-seven.js';
import {fixture,richFixture,SECRET} from './fixtures/journey-r4.cjs';
import {parseDisplayEnvelope,projectJourney,projectJourneyEnvelope,runDisplay} from '../reader-core.js';
import {readReplyBlock,readPublicReplyEnvelope,readReplyMemory} from '../reply-formats.js';
import {readReplyDetails} from '../reply-details.js';
import {readJourney} from '../reply-records.js';
import {inspectMessage,formJourneyText} from '../reader.js';
import {readWorldExtra,mountWorldExtra} from '../world-extra.js';
import {mountMessageVisual} from '../message-ui.js';
import {FORM_REPLY_ORDER,FORM_REFERENCE_KEYS} from '../reply-form-wire.js';

test('seven-block neutral full payload reproduces the old failure and consumes each declared block',()=>{
 const source=sevenFixture(),before=source;
 const frozen=createRequire(import.meta.url)('../vendor/foundation/xml-envelope.cjs');
 assert.throws(()=>frozen.parseDisplayEnvelope(source),{code:'TISHA_OUTPUT_BLOCK_ORDER'});
 const e=parseDisplayEnvelope(source),task=JSON.parse(e.blocks.task),next=JSON.parse(e.blocks.next);
 assert.equal(e.wire.version,6);assert.deepEqual(e.wire.order,FORM_REPLY_ORDER);
 for(const name of ['status','memory','archive'])assert.equal(Object.hasOwn(e.blocks,name),false);
 for(const [kind,key]of Object.entries(FORM_REFERENCE_KEYS))assert.deepEqual(task.refs[key],['PRIVATE_'+kind]);
 assert.equal(task.unlocks[0][0],'PRIVATE_SECRET_NAME');assert.equal(task.pending[0],'PRIVATE_BINDING_GAP');assert.equal(task.characters[0].intent,null);
 assert.deepEqual(e.wire.titlePlaces,['渡口、北岸','门前']);assert.match(e.blocks.body,/船铃/);
 assert.equal(task.audit.length,7);assert.equal(task.audit.at(-1).status,'待确认');assert.equal(next.tasks.length,3);assert.equal(next.actions.length,4);
 assert.equal(next.candidates[0],'PRIVATE_UNADOPTED');assert.equal(next.delivered[0],'门前现场');
 assert.equal(e.blocks.vars,'');assert.match(e.blocks.extra,/公开面板/);assert.equal(source,before);
 const publicEnvelope=readPublicReplyEnvelope(source);assert.equal(publicEnvelope.wire.version,6);assert.equal(readReplyBlock(publicEnvelope,'next').actions[0].type,'交流');
 assert.equal(readReplyMemory(source),null);
 for(const view of [readJourney(source),projectJourney(source),projectJourneyEnvelope(e)]){
  assert.equal(view.recordSource,'forms');assert.deepEqual(view.memories,[]);assert.equal(Object.hasOwn(view,'memory'),false);
 }
 const details=readReplyDetails(source);assert.equal(details.rounds.pendingError,false);assert.equal(details.rounds.pending.length,3);assert.equal(details.rounds.tasks.length,1);assert.equal(details.taskHeart.items.length,3);assert.equal(details.nextHeart.items.length,3);assert.doesNotMatch(JSON.stringify(details),/PRIVATE_/);
});

test('seven-block optional silence and disabled actions need no invented rows or old record blocks',()=>{
 const source=sevenFixture({actions:false,hearts:false,extra:''});
 const e=parseDisplayEnvelope(source),data=inspectMessage(source);
 assert.deepEqual(JSON.parse(e.blocks.next).actions,[]);assert.equal(e.attrs.next.actions_max,'0');
 assert.deepEqual(data.actions.value,[]);assert.equal(data.details.value.taskHeart.status,'沉默');assert.equal(data.details.value.nextHeart.items.length,0);assert.equal(data.journey.error,undefined);
 assert.equal(Object.hasOwn(e.blocks,'memory'),false);assert.equal(readWorldExtra(source).length,0);
});

test('seven-block text escapes preserve literals and resource names without a complex JSON wire',()=>{
 const source=sevenFixture().replace('描写抵达渡口后的可见现场',String.raw`保留\|管线\n下一行\\原样&amp;&lt;tag&gt;`).replace('PRIVATE_世界观',String.raw`甲\|乙`);
 const e=parseDisplayEnvelope(source),task=JSON.parse(e.blocks.task);
 assert.equal(task.tasks[0].plan,'保留|管线\n下一行\\原样&<tag>');assert.deepEqual(task.refs.world,['甲|乙']);
 assert.throws(()=>parseDisplayEnvelope(source.replace(String.raw`甲\|乙`,String.raw`甲\q乙`)),/ESCAPE/);
});

test('seven-block invalid boundaries, rows, enums, types and count metadata remain explicit failures',()=>{
 const s=sevenFixture();
 const bad=[
  s.replace('<extra>', '<status/><extra>'),
  s.replace(/<vars>[\s\S]*?<\/vars>/,''),
  s.replace('<vars>', '<vars/><vars>'),
  s.replace('<vars></vars>','<archive/><memory/>'),
  s.replace('资料：世界观','资料：未登记类别'),
  s.replace('待定：PRIVATE_BINDING_GAP','引用：PRIVATE_BINDING_GAP'),
  s.replace('人物：待确认','人物：通过'),
  s.replace('心声：有内容|输入评价|好奇','心声：有内容|未登记方向|好奇'),
  s.replace('心声：有内容|输入评价|好奇','心声：有内容|输入评价|未登记表情'),
  s.replace('心声：有内容|回应用户评价','心声：有内容|输入评价'),
  s.replace('审计：符合|身份与授权','审计：完成|身份与授权'),
  s.replace(/^审计：符合\|身份与授权[^\n]*\n/m,''),
  s.replace('审计：符合|资料与知情','审计：符合|身份与授权'),
  s.replace('待办：系统任务','待办：未知任务'),
  s.replace('行动：休整','行动：未知类别'),
  s.replace('actions_min="4"','actions_min="5"'),
  s.replace('actions_max="6"','actions_max="3"'),
  s.replace('unit="字"','unit="未知"'),
  s.replace('min="1"','min="NaN"'),
  s.replace('audit_count="7"','audit_count="6"'),
  s.replace('format="pipes" text="escaped"','format="json" text="escaped"'),
  s.replace('2\n你停','3\n你停'),
  s.replace('待定：PRIVATE_BINDING_GAP','待定：甲|乙'),
  s.replace('PRIVATE_CHARACTER_BASIS','<nested>内容</nested>'),
 ];
 for(const source of bad)assert.throws(()=>parseDisplayEnvelope(source),error=>/^TIS(?:YA|HA)_/.test(error.code??''));
});

test('seven-block safe extra remains visible; old denying ACL still hides its own extra',async()=>{
 const s=sevenFixture(),display=runDisplay({source:s,groups:[]});assert.match(display.extra,/渡口公开面板/);assert.equal(readWorldExtra(s).length,1);
 const old=fixture({extra:'<面板><秘密>PRIVATE_EXTRA</秘密></面板>',memory:'权限：extra|["面板","秘密"]|'+JSON.stringify(SECRET)});
 assert.equal(parseDisplayEnvelope(old).wire.version,5);assert.equal(runDisplay({source:old,groups:[]}).extra,'');assert.deepEqual(readWorldExtra(old),[]);
 assert.match(runDisplay({source:fixture({extra:'<p>原本公开</p>'}),groups:[]}).extra,/原本公开/);
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document,root=d.createElement('div');d.body.append(root);
 // An unrelated backend object is deliberately not a renderer data source.
 const backend={memory:{秘密:'PRIVATE_BACKEND'},status:{角色:{暗号:'PRIVATE_STATE'}}};
 const view=mountWorldExtra(d,root,{source:s,structured:true,formatBody:x=>x,backend});
 assert.doesNotMatch(root.innerHTML,/PRIVATE_/);assert.deepEqual(backend,{memory:{秘密:'PRIVATE_BACKEND'},status:{角色:{暗号:'PRIVATE_STATE'}}});
 assert.equal(root.querySelector('script'),null);view.dispose();await w.happyDOM.abort();
});

test('seven-block frontend components retain script isolation and visible capability failures',async()=>{
 const source=sevenFixture({extra:'<card><![CDATA[<script>parent.PRIVATE_CANARY=1</script><p>原卡交互</p>]]></card>'});
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document,root=d.createElement('div');d.body.append(root);const errors=[];
 const view=mountWorldExtra(d,root,{source,structured:true,formatBody:x=>x,onError:error=>errors.push(error.code??error.message)});
 assert.equal(root.querySelector('script'),null);assert.equal(root.querySelectorAll('iframe').length,0);
 assert.deepEqual(errors,['TISYA_EXTRA_RUNTIME_REQUIRED']);assert.match(root.textContent,/交互运行时/);assert.equal(w.PRIVATE_CANARY,undefined);
 view.dispose();
 const local=sevenFixture({extra:'<card><![CDATA[<button onclick="this.textContent=\'已展开\'">展开</button>]]></card>'});
 const allowed=mountWorldExtra(d,root,{source:local,structured:true,formatBody:x=>x});
 const frame=root.querySelector('iframe');assert.equal(frame.getAttribute('sandbox'),'allow-scripts');assert.equal(root.querySelector('button[onclick]'),null);
 assert.match(frame.srcdoc,/connect-src 'none'/);assert.equal(w.PRIVATE_CANARY,undefined);
 allowed.dispose();await w.happyDOM.abort();
});

test('seven-block native variables use the existing read-only native adapter and do not become form records',()=>{
 const vars='<UpdateVariable><JSONPatch>[{"op":"replace","path":"/计数","value":0}]</JSONPatch></UpdateVariable>';
 const source=sevenFixture({vars}),before=source,e=parseDisplayEnvelope(source);
 assert.equal(JSON.parse(e.blocks.vars).operations[0].value,0);assert.equal(source,before);assert.equal(readJourney(source).recordSource,'forms');
 assert.throws(()=>parseDisplayEnvelope(sevenFixture({vars:vars.replace('"replace"','"execute"')})),{code:'TISYA_NATIVE_MVU_FORMAT'});
 const opaque=parseDisplayEnvelope(sevenFixture({vars:'<OtherUpdate>native source</OtherUpdate>'}));
 assert.equal(JSON.parse(opaque.blocks.vars).opaque,true);assert.equal(Object.hasOwn(opaque.blocks,'memory'),false);
});

test('seven-block message UI displays title, body, public tasks, audits, actions and form record location',async()=>{
 const w=new Window(),d=w.document,node=d.createElement('div');d.body.append(node);w.IntersectionObserver=class{observe(){}disconnect(){}};
 const source=sevenFixture({hearts:false}),view=mountMessageVisual(d,node,{source,name:'阅读测试',formatBody:x=>x,onChooseAction(){},getMotion:()=>false}),r=view.host.shadowRoot;
 assert.match(r.querySelector('.scene-heading').textContent,/渡灯/);assert.match(r.querySelector('.story').textContent,/船铃/);
 assert.equal(r.querySelectorAll('#next-content .audit-bead').length,7);assert.equal(r.querySelectorAll('#next-content .todo-ledger .ledger-entry').length,3);
 assert.equal(view.data.actions.value.length,4);assert.doesNotMatch(r.innerHTML,/PRIVATE_/);assert.match(r.textContent,new RegExp(formJourneyText));
 assert.doesNotMatch(r.textContent,/本条记忆格式不受支持|待办记录未通过公开权限校验/);
 view.dispose();await w.happyDOM.abort();
});

test('legacy ten-block state/history and legacy two reference kinds still retain their contract',()=>{
 const e=parseDisplayEnvelope(richFixture()),view=readJourney(richFixture());
 assert.equal(e.wire.version,5);assert.equal(JSON.parse(e.blocks.memory).protocol,'tisya.lab.memory/5');assert.ok(view.memories.length);assert.equal(view.recordSource,undefined);
 assert.throws(()=>parseDisplayEnvelope(fixture({taskExtra:'资料：世界观|新种类不混入旧协议'})),{code:'TISYA_PIPES_REF'});
});
