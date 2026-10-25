import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRuntimeConfiguration,readVerifiedNativeRules} from '../../../v3/configuration.mjs';
import {defaultWorld,emptyConfig,worldKey} from '../../../config/core.js';
import {configurationView,editablePaths} from '../../../tables/assistant.js';
import {createHost,PRIVATE_TISYA_MARKERS,isPrivateTisyaEntry} from '../../../config/host.js';
import {compileFullPreflight,compileFullNarrative,fullDefaultConfiguration} from '../../../v3/preset.mjs';
import fs from 'node:fs';

function setup(){
 const world=defaultWorld(),data=emptyConfig();
 const context={chatId:'config-audit',characterId:0,characters:[{avatar:'card.png',name:'卡'}],chatMetadata:{},extensionSettings:{},chat:[]};
 const key=worldKey(context);data.worlds[key]=world;const snapshot={data,world,key,revision:'r1'};
 return {world,data,context,snapshot};
}
test('one MVU mode decides both execution and checkpoints; off wins over retired duplicate fields',()=>{
 const f=setup();f.world.tables={nativeBridge:true};f.world.modes.narrative.narrative.缇斯亚MVU兼容=true;f.world.modes.narrative.nativeMvu='off';
 const before=JSON.stringify(f.snapshot),off=resolveRuntimeConfiguration({snapshot:f.snapshot,target:{Mvu:{}},context:f.context,playerId:'p'});assert.equal(off.nativeBridge,false);assert.equal(off.nativeMode,'off');assert.equal(JSON.stringify(f.snapshot),before);
 f.world.modes.narrative.nativeMvu='auto';assert.equal(resolveRuntimeConfiguration({snapshot:f.snapshot,target:{Mvu:{}},context:f.context}).nativeBridge,false);assert.equal(resolveRuntimeConfiguration({snapshot:f.snapshot,target:{},context:f.context}).nativeBridge,false);
 const paths=editablePaths(configurationView(f.snapshot));assert.ok(paths.includes('/world/modes/narrative/nativeMvu'));assert.ok(!paths.includes('/world/tables/nativeBridge'));assert.ok(!paths.some(path=>path.endsWith('/缇斯亚MVU兼容')));
});
test('automatic MVU follows this chat active-swipe variables rather than a global runtime',()=>{
 const f=setup();let reads=0;const target={Mvu:{getMvuData(){reads++;throw Error('Unrelated runtime must not be probed');}}};
 assert.equal(resolveRuntimeConfiguration({snapshot:f.snapshot,target,context:f.context}).nativeBridge,false);
 f.context.chat=[{mes:'<div>普通美化开场</div>',swipe_id:1,variables:[{stat_data:{score:1}},{}]}];
 assert.equal(resolveRuntimeConfiguration({snapshot:f.snapshot,target,context:f.context}).nativeBridge,false,'Inactive swipe is not current native state');
 f.context.chat[0].swipe_id=0;
 assert.equal(resolveRuntimeConfiguration({snapshot:f.snapshot,target:{},context:f.context}).nativeBridge,true,'Persisted native state remains authoritative when the dependency is missing');
 f.context.chat[0].variables[0].stat_data=null;
 assert.equal(resolveRuntimeConfiguration({snapshot:f.snapshot,target:{},context:f.context}).nativeBridge,true,'Damaged existing native state must still reach validation');
 f.world.modes.narrative.nativeMvu='off';
 assert.equal(resolveRuntimeConfiguration({snapshot:f.snapshot,target,context:f.context}).nativeBridge,false);assert.equal(reads,0);
});
test('world controls and the two distinct focus reference types are projected without guessing or overwriting',()=>{
 const f=setup();f.world.focus=['card:someone.png'];f.world.tables={archive:false,plot:false,offstage:false,preferences:false,focusObjects:['row:actor'],playerObjects:['row:player'],focusText:'关注正在进行的修桥工作',hardRules:['保留自然对白']};
 const r=resolveRuntimeConfiguration({snapshot:f.snapshot,target:{}});for(const key of ['archiveEnabled','plotEnabled','offstageEnabled','preferencesEnabled','worldEnabled'])assert.equal(r[key],false,key);assert.deepEqual(r.focusObjects,['row:actor']);assert.deepEqual(r.playerObjects,['row:player']);assert.equal(r.nativeRules,'');assert.deepEqual(r.preflightControls.preferenceConstraints,['保留自然对白']);assert.deepEqual(f.world.focus,['card:someone.png']);
});
test('verified native rules come only from enabled current-card entries with exact source hashes',async()=>{
 const f=setup();f.context.characters[0].data={extensions:{tavern_helper:{scripts:[{type:'script',enabled:true,content:"import 'https://example.invalid/MagVarUpdate/master/bundle.js'"}]}},character_book:{entries:[{uid:1,comment:'[mvu_update]规则',content:'仅按实际收支调整库存。',enabled:true},{uid:2,comment:'[mvu_update]关闭规则',content:'NO_DISABLED',enabled:false},{uid:3,comment:'普通条目',content:'NO_ORDINARY',enabled:true}]}};
 const rules=await readVerifiedNativeRules({snapshot:f.snapshot,context:f.context});assert.equal(rules.text,'仅按实际收支调整库存。');assert.equal(rules.sources[0].uid,1);assert.match(rules.sources[0].sha256,/^[a-f0-9]{64}$/);
 const projected=resolveRuntimeConfiguration({snapshot:f.snapshot,target:{},context:f.context,verifiedNativeRules:rules});assert.equal(projected.nativeBridge,true);assert.equal(projected.nativeRules,rules.text);f.world.modes.narrative.nativeMvu='off';assert.deepEqual(await readVerifiedNativeRules({snapshot:f.snapshot,context:f.context}),{text:'',sources:[]});
});
test('preflight consumes actual controls and writer receives preference constraints in their proper home',()=>{
 const c=fullDefaultConfiguration();c.world.tables={hardRules:['HARD_WRITING_CONSTRAINT']};
 const registry=JSON.parse(fs.readFileSync(new URL('../../../v3/runtime-source/config/registry.json',import.meta.url)));
 const a=compileFullPreflight({configurationSnapshot:c,input:{requestKey:'control',view:{registry,rows:[]},archiveSources:[],archiveEnabled:false,plotEnabled:false,preferenceConstraints:['HARD_WRITING_CONSTRAINT'],nativeRules:'VERIFIED_NATIVE',nativeRuleSources:[{uid:1}]}}).map(m=>m.content).join('\n');
 assert.ok(a.includes('"archiveEnabled": false'));assert.ok(a.includes('"plotEnabled": false'));assert.ok(a.includes('"preferenceConstraints"'));assert.ok(a.includes('"nativeRuleSources"'));
 const b=compileFullNarrative({configurationSnapshot:c,currentUser:'继续',snapshot:{rows:[],scope:{},creativeBrief:{}}}).map(m=>m.content).join('\n');assert.equal(b.split('HARD_WRITING_CONSTRAINT').length,2);
});
test('ordinary material APIs exclude every exact private marker while retaining ordinary disabled entries',async()=>{
 const f=setup(),entries={0:{uid:0,disable:true,comment:'普通手选条目',content:'ORDINARY_SELECTED'}};
 PRIVATE_TISYA_MARKERS.forEach((key,i)=>entries[i+1]={uid:i+1,disable:false,comment:'private '+key,content:'PRIVATE_'+key,extensions:{[key]:{}}});
 f.context.loadWorldInfo=async()=>({entries});f.world.context.books=['混合书'];f.world.context.entries=[{book:'混合书',uid:0}];
 const host=createHost({getContext:()=>f.context,getSource:()=>({prompts:[]}),store:{read:()=>f.snapshot}});
 const listed=await host.entries('混合书');assert.equal(listed.length,1);assert.equal(listed[0].disabled,true);const material=await host.selectedMaterialsFor('main');assert.ok(JSON.stringify(material).includes('ORDINARY_SELECTED'));assert.ok(!JSON.stringify(material).includes('PRIVATE_'));
 for(let uid=1;uid<=PRIVATE_TISYA_MARKERS.length;uid++){f.world.context.entries=[{book:'混合书',uid}];await assert.rejects(host.selectedMaterialsFor('main'),/失效/);assert.equal(isPrivateTisyaEntry(entries[uid]),true);}
 f.world.context.entries=[];f.data.resources=[{id:'private-source',name:'private',kind:'requirement',content:'PRIVATE_tisyaOriginal',source:{book:'混合书',uid:3}}];f.world.modes.narrative.selected=['private-source'];await assert.rejects(host.selectedMaterialsFor('main'),/来源失效/);
 f.data.resources[0].source={book:'混合书',uid:0,type:'original',entryId:'hidden-original'};await assert.rejects(host.selectedMaterialsFor('main'),/授权档案查询/);
 // Text deliberately copied by a user without source metadata is user-owned material, not a traceable private reference.
 delete f.data.resources[0].source;assert.ok(JSON.stringify(await host.selectedMaterialsFor('main')).includes('PRIVATE_tisyaOriginal'));
});
