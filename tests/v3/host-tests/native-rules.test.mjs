import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,sheet,wrap,newBody,xml} from './installer-harness.mjs';

test('verified native rule text and hash provenance enter A once, separate from custom constraints',async()=>{
 const rules={text:'资源.energy由原卡规则决定。',sources:[{kind:'worldbook',book:'卡规则',uid:2,sha256:'actual-rule-source'}]};let reads=0;
 const f=await createInstallerHarness({readNativeRules:async()=>{reads++;return structuredClone(rules);}});
 try{f.config.preflightControls={preferenceConstraints:'只在雨天展开灯节准备。'};await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);const state=xml(f.requests[0].messages,'TISYA.DATA.STATE');assert.equal(state.nativeRules,rules.text);assert.deepEqual(state.nativeRuleSources,rules.sources);assert.equal(state.preferenceConstraints,'只在雨天展开灯节准备。');assert(reads>=2);}finally{f.api.dispose();}
});
test('editing verified native rules while A runs rejects the old result before B',async()=>{
 let revision=1;const f=await createInstallerHarness({readNativeRules:async()=>({text:'规则'+revision,sources:[{kind:'card',sha256:String(revision)}]}),provider:({stage,messages})=>{if(stage==='a'){revision=2;return sheet(messages);}return wrap(newBody);}});
 try{await f.intercept('normal');assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,4);assert.equal(f.errors[0]?.code,'V3_NATIVE_RULES_CHANGED');assert.equal(f.nativeMvu.counts().parses,0);}finally{f.api.dispose();}
});
