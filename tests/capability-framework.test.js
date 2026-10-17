import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapabilityRegistry} from '../services/capabilities.js';
import {createTaskRegistry,taskRegistry} from '../tables/task-registry.js';
import {createPreviewStore} from '../tables/preview-store.js';
import {settingsCapabilities,settingsCommand,executeSettingsCommand} from '../settings-navigation.js';

const context=(key='world',chat='branch')=>({key,chat,guard(){}});
const loaded=(origin='o1',session='s1')=>({origin:{stamp:origin},session:{stamp:session}});
const previews=limit=>createPreviewStore({prefix:'test',limit,missing:'missing',stale:'stale',full:'full'});

test('capability registration copies metadata, rejects duplicates and has no unknown fallback',()=>{
 const original={id:'a',names:['一级'],execute:()=>7};
 const registry=createCapabilityRegistry([original]);original.names.push('二级');
 assert.deepEqual(registry.get('a').names,['一级']);assert.equal(registry.get('a').execute(),7);
 assert.throws(()=>registry.get('b'),/未登记/);assert.throws(()=>registry.get('toString'),/未登记/);
 assert.throws(()=>registry.get('a').names.push('改'),TypeError);
 assert.throws(()=>createCapabilityRegistry([{id:'a'},{id:'a'}]),/重复/);
});

test('a newly registered model capability supplies entry and execution without another dispatcher',()=>{
 let accepted;
 const definition={task:'new-kind',kind:'specialized',surface:'form',rulePolicy:true,name:'新能力',instructions:'只填字段',mode:{id:'new-kind'},prepare(input){accepted=input;return {payload:input,parse:answer=>({answer,precision:input.policy.precision})};}};
 const registry=createTaskRegistry([definition]),input={policy:{precision:3}};
 const plan=registry.prepare('new-kind',input);input.policy.precision=8;
 assert.equal(accepted.policy.precision,3);assert.deepEqual(plan.parse('原句'),{answer:'原句',precision:3});
 assert.throws(()=>registry.prepare('unknown',input),/未登记/);
 assert.throws(()=>createTaskRegistry([{...definition,prepare:null}]),/执行适配/);
 assert.throws(()=>createTaskRegistry([{...definition,task:'b'},definition]),/模式重复/);
 assert.throws(()=>createTaskRegistry([{...definition,surface:'structured'}]),/专属授权/);
 assert.equal(taskRegistry.definitions.length,11);
 assert.equal(taskRegistry.get('ruleReview').rulePolicy,false);
 assert.equal(taskRegistry.get('nativeFill').rulePolicy,true);
});

test('preview tickets isolate supplied and returned data and bind both chat and book revisions',()=>{
 const bank=previews(3),c=context(),l=loaded(),data={cost:{value:2}};
 const token=bank.create(c,l,data);data.cost.value=0;
 const first=bank.read(token,c,l);first.cost.value=99;
 assert.equal(bank.read(token,c,l).cost.value,2);
 assert.throws(()=>bank.read(token,context('other'),l),/missing/);
 assert.throws(()=>bank.read(token,context('world','other'),l),/missing/);
 assert.throws(()=>bank.read(token,c,loaded('o2')),/stale/);
 assert.throws(()=>bank.read(token,c,loaded('o1','s2')),/stale/);
 assert.equal(bank.discard(token),true);assert.throws(()=>bank.read(token,c,l),/missing/);
});

test('preview replacement is scoped and failed staging does not discard prior evidence',()=>{
 const bank=previews(2),c=context(),l=loaded();
 const a=bank.create(c,l,{id:'same'}),b=bank.create(context('other'),l,{id:'same'});
 assert.throws(()=>bank.create(c,l,{id:'third'}),/full/);
 assert.throws(()=>bank.create(c,l,{id:'same',invalid(){ }},{replace:()=>true}),/clone/);
 assert.equal(bank.read(a,c,l).id,'same');
 const fresh=bank.create(c,l,{id:'same',value:3},{replace:d=>d.id==='same'});
 assert.throws(()=>bank.read(a,c,l),/missing/);assert.equal(bank.read(b,context('other'),l).id,'same');
 assert.equal(bank.read(fresh,c,l).value,3);
 assert.throws(()=>bank.create({...c,guard(){throw Error('cancelled');}},l,{}),/cancelled/);
});

test('all settings destinations dispatch their registered arguments and missing specialized hosts fail visibly',async()=>{
 for(const definition of settingsCapabilities.definitions){
  const [action,id]=definition.action.split(':'),command=settingsCommand(action,id),calls=[];
  assert.equal(command,definition);
  const host={[definition.route.method]:(...args)=>{calls.push(args);return 'called';}};
  assert.equal(await executeSettingsCommand(command,host),'called');
  assert.deepEqual(calls,[definition.route.args]);
  assert.throws(()=>executeSettingsCommand(command,{}),/尚未接入/);
 }
 const extra=settingsCommand('drawer','third-party');let target;
 executeSettingsCommand(extra,{drawer:id=>target=id});assert.equal(target,'third-party');
 assert.equal(settingsCommand('not-registered'),null);
 assert.equal(settingsCommand('pet-toggle').leave,false);
 assert.equal(settingsCommand('user-identity').leave,true);
});
