import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFullNarrative,fullDefaultConfiguration} from '../../../v3/preset.mjs';

const build=card=>compileFullNarrative({snapshot:{rows:[{id:'world-fact',table:'facts',values:{世界设定:'WORLD_DATA'},access:{readers:['reader'],knowers:[]}}],scope:{},creativeBrief:{}},configurationSnapshot:fullDefaultConfiguration(),currentUser:'CURRENT_USER',history:[{kind:'summary',text:'SUMMARY_ONE'},{kind:'summary',text:'SUMMARY_TWO'}],card});
const pos=(messages,text)=>messages.findIndex(message=>message.content.includes(text));
test('native WI uses distinct story, example and role-preserving conversation-depth anchors',()=>{
 const messages=build({nativeWorldInfo:{before:['WI_BEFORE'],after:['WI_AFTER'],examples:[{position:'before',content:'EXAMPLE_BEFORE'},{position:'after',content:'EXAMPLE_AFTER'}],depth:[{depth:0,role:'assistant',entries:['DEPTH_ZERO']},{depth:1,role:'user',entries:['DEPTH_ONE']},{depth:99,role:'system',entries:['DEPTH_OVERFLOW']}]},dialogueExamples:[{role:'user',content:'ACTUAL_EXAMPLE'}]});
 for(const [a,b]of [['WI_BEFORE','WORLD_DATA'],['WORLD_DATA','WI_AFTER'],['EXAMPLE_BEFORE','ACTUAL_EXAMPLE'],['ACTUAL_EXAMPLE','EXAMPLE_AFTER'],['EXAMPLE_AFTER','DEPTH_OVERFLOW'],['DEPTH_OVERFLOW','SUMMARY_ONE'],['SUMMARY_TWO','DEPTH_ONE'],['DEPTH_ONE','CURRENT_USER'],['CURRENT_USER','DEPTH_ZERO']])assert.ok(pos(messages,a)<pos(messages,b),a+' < '+b);
 assert.equal(messages[pos(messages,'DEPTH_ONE')].role,'user');assert.equal(messages[pos(messages,'DEPTH_ZERO')].role,'assistant');
});
test('native AN uses its actual position and world-info surround once',()=>{
 for(const position of [-1,0,1,2]){
  const messages=build({nativeWorldInfo:{before:['WI_BEFORE'],after:['WI_AFTER'],anBefore:['AN_BEFORE'],anAfter:['AN_AFTER']},authorNote:{position,depth:1,role:'assistant',content:'ACTUAL_NOTE'}});
  if(position===-1){for(const needle of ['AN_BEFORE','AN_AFTER','ACTUAL_NOTE'])assert.equal(pos(messages,needle),-1);continue;}
  assert.ok(pos(messages,'AN_BEFORE')<pos(messages,'ACTUAL_NOTE'));assert.ok(pos(messages,'ACTUAL_NOTE')<pos(messages,'AN_AFTER'));for(const needle of ['AN_BEFORE','ACTUAL_NOTE','AN_AFTER'])assert.equal(messages[pos(messages,needle)].role,'assistant');
  if(position===2)assert.ok(pos(messages,'AN_AFTER')<pos(messages,'WI_BEFORE'));
  if(position===0)assert.ok(pos(messages,'WI_AFTER')<pos(messages,'AN_BEFORE'));
  if(position===1){assert.ok(pos(messages,'SUMMARY_TWO')<pos(messages,'AN_BEFORE'));assert.ok(pos(messages,'AN_AFTER')<pos(messages,'CURRENT_USER'));}
 }
 const disabled=build({nativeWorldInfo:{anBefore:['DISABLED_AN_BEFORE'],anAfter:['DISABLED_AN_AFTER']},authorNote:{position:1,depth:1,role:'system',content:'DISABLED_NOTE',enabled:false}});assert.equal(pos(disabled,'DISABLED_'),-1);
 assert.throws(()=>build({nativeWorldInfo:{anBefore:['MISSING_NOTE']}}),/position anchor/);
});
test('outlets require explicit named slots and never use lore as a fallback',()=>{
 const card={nativeWorldInfo:{outlets:{selected:['OUTLET_SELECTED'],unbound:['OUTLET_SECRET']}},outletBindings:{selected:{slot:'depth',depth:1,role:'user'}}};const messages=build(card);
 assert.ok(pos(messages,'OUTLET_SELECTED')>=0);assert.equal(pos(messages,'OUTLET_SECRET'),-1);assert.equal(messages[pos(messages,'OUTLET_SELECTED')].role,'user');assert.ok(pos(messages,'OUTLET_SELECTED')<pos(messages,'CURRENT_USER'));
 card.outletBindings.selected='invented';assert.throws(()=>build(card),/Unknown explicit outlet slot/);
});
