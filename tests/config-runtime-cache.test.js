import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore,defaultWorld,emptyConfig,KEY,worldKey} from '../config/core.js';
function fixture(){const c={chatId:'one',characterId:0,characters:[{avatar:'a',name:'A'}],extensionSettings:{[KEY]:emptyConfig()}},key=worldKey(c);c.extensionSettings[KEY].worlds[key]=defaultWorld();return {c,key,store:createStore({getContext:()=>c,persist:async()=>true})};}
test('runtime configuration reuses a frozen view while editor drafts stay independent',()=>{
 const f=fixture(),a=f.store.readRuntime();assert.strictEqual(f.store.readRuntime(),a);assert(Object.isFrozen(a.world.theme));assert.throws(()=>{a.world.theme.nativeRegex=false;},TypeError);
 const draft=f.store.read();draft.world.theme.nativeRegex=false;assert.equal(a.world.theme.nativeRegex,true);assert.equal(f.c.extensionSettings[KEY].worlds[f.key].theme.nativeRegex,true);
});
test('runtime view detects same-object changes without requiring a revision bump and still validates them',()=>{
 const f=fixture(),a=f.store.readRuntime();f.c.extensionSettings[KEY].worlds[f.key].theme.nativeRegex=false;const b=f.store.readRuntime();assert.notStrictEqual(a,b);assert.equal(b.world.theme.nativeRegex,false);
 f.c.extensionSettings[KEY].worlds[f.key].modes=null;assert.throws(()=>f.store.readRuntime());
});
test('runtime cache checks authority on every access and never hides missing configuration or world',()=>{
 const f=fixture();let allowed=true,guards=0;f.store.installAuthority({guard(){guards++;if(!allowed)throw Error('authority changed');},save(){}});f.store.readRuntime();const n=guards;f.store.readRuntime();assert.equal(guards,n+1);allowed=false;assert.throws(()=>f.store.readRuntime(),/authority changed/);allowed=true;
 delete f.c.extensionSettings[KEY].worlds[f.key];assert.throws(()=>f.store.readRuntime(),/已保存配置缺失/);delete f.c.extensionSettings[KEY];assert.throws(()=>f.store.readRuntime(),/暂时不可读/);
});
test('runtime cache follows chat identity, label and legacy defaults before a world is stored',()=>{
 const f=fixture(),a=f.store.readRuntime();f.c.characters[0].name='B';assert.match(f.store.readRuntime().label,/B/);f.c.chatId='two';const b=f.store.readRuntime();assert.notEqual(a.key,b.key);
 let legacy={缇斯亚叙事文风:'自然小说'};const c={chatId:undefined,extensionSettings:{}},store=createStore({getContext:()=>c,persist:async()=>true,legacy:()=>legacy});const first=store.readRuntime();legacy={缇斯亚叙事文风:'新的文风'};assert.notStrictEqual(store.readRuntime(),first);assert.equal(store.readRuntime().world.modes.narrative.narrative.缇斯亚叙事文风,'新的文风');
});
