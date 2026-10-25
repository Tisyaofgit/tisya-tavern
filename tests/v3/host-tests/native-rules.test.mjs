import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,sheet,wrap,newBody,xml} from './installer-harness.mjs';
import {resolveRuntimeConfiguration} from '../../../v3/configuration.mjs';
import {defaultWorld,emptyConfig} from '../../../config/core.js';

test('verified native rule text and hash provenance enter A once, separate from custom constraints',async()=>{
 const rules={text:'资源.energy由原卡规则决定。',sources:[{kind:'worldbook',book:'卡规则',uid:2,sha256:'actual-rule-source'}]};let reads=0;
 const f=await createInstallerHarness({readNativeRules:async()=>{reads++;return structuredClone(rules);}});
 try{f.config.preflightControls={preferenceConstraints:'只在雨天展开灯节准备。'};await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);const state=xml(f.requests[0].messages,'TISYA.DATA.STATE');assert.equal(state.nativeRules,rules.text);assert.deepEqual(state.nativeRuleSources,rules.sources);assert.equal(state.preferenceConstraints,'只在雨天展开灯节准备。');assert(reads>=2);}finally{f.api.dispose();}
});
test('editing verified native rules while A runs rejects the old result before B',async()=>{
 let revision=1;const f=await createInstallerHarness({readNativeRules:async()=>({text:'规则'+revision,sources:[{kind:'card',sha256:String(revision)}]}),provider:({stage,messages})=>{if(stage==='a'){revision=2;return sheet(messages);}return wrap(newBody);}});
 try{await f.intercept('normal');assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,4);assert.equal(f.errors[0]?.code,'V3_NATIVE_RULES_CHANGED');assert.equal(f.nativeMvu.counts().parses,0);}finally{f.api.dispose();}
});
test('ordinary HTML card with a global MVU runtime reaches both A and B without probing native variables',async()=>{
 const f=await createInstallerHarness({mvu:false}),opening='<div class="card">普通美化开场</div>';let reads=0;
 f.ctx.chat[0].mes=opening;f.ctx.characters=[{avatar:'ordinary.png',data:{first_mes:opening}}];f.ctx.characterId=0;
 f.target.Mvu={getMvuData(){reads++;throw Error('Unrelated global MVU');},parseMessage(){throw Error('No native proposal');},replaceMvuData(){throw Error('No native write');}};
 const world=defaultWorld(),data=emptyConfig();Object.assign(f.config,resolveRuntimeConfiguration({snapshot:{world,data,key:'ordinary',revision:0},context:f.ctx,target:f.target}));
 try{await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.requests.length,2);assert.equal(f.ctx.chat[0].mes,opening);assert.equal(f.ctx.chat.at(-1).mes,wrap(newBody));assert.equal(reads,0);}finally{f.api.dispose();}
});
