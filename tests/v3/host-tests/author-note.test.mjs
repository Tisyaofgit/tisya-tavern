import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {prepareNativeAuthorNote} from '../../../v3/host-network.mjs';
import {createInstallerHarness,wrap,newBody,sheet} from './installer-harness.mjs';

const source=await fs.readFile(new URL('../native-fixtures/extracted/scripts/authors-note.js',import.meta.url),'utf8');
const start=source.indexOf('export function setFloatingPrompt()');
const actual=source.slice(start,source.indexOf('\nfunction onANMenuItemClick',start)).replace('export function','function');
function fixture({interval=1,users=1,position=1,depth=4,role=2,note='当夜先写修桥。',characterNote=null}={}){
 const ctx={characterId:0,chat:Array.from({length:users},()=>({is_user:true})),extensionPrompts:{},setExtensionPrompt(key,value,position,depth,scan,role){ctx.extensionPrompts[key]={value,position,depth,scan,role};}};
 const realm=vm.createContext({console:{debug(){}},getContext:()=>ctx,chat_metadata:{note_interval:interval,note_position:position,note_depth:depth,note_role:role},metadata_keys:{interval:'note_interval',position:'note_position',depth:'note_depth',role:'note_role'},shouldWIAddPrompt:false,extension_prompt_types:{NONE:-1},MAX_INJECTION_DEPTH:1000,MODULE_NAME:'2_floating_prompt',extension_settings:{note:{allowWIScan:true,chara:characterNote?[characterNote]:[]}},getCharaFilename:()=> 'card',chara_note_position:{before:1,after:2},$:()=>({val:()=>note,text(){}})});
 vm.runInContext(actual+'\nthis.setFloatingPrompt=setFloatingPrompt;',realm);
 const authorsNote={NOTE_MODULE_NAME:'2_floating_prompt',setFloatingPrompt:()=>realm.setFloatingPrompt(),get shouldWIAddPrompt(){return realm.shouldWIAddPrompt;}};
 return {ctx,native:{authorsNote},read:()=>prepareNativeAuthorNote({native:{authorsNote},getContext:()=>ctx,guard(){}})};
}
test('actual 2.4.0 author-note function preserves enabled native role, depth and position',async()=>{
 for(const position of [0,1,2]){const f=fixture({position});assert.deepEqual(await f.read(),{content:'当夜先写修桥。',role:'assistant',depth:4,position,enabled:true});}
});
test('actual interval and character-note composition are used, not inferred from metadata',async()=>{
 const disabled=fixture({interval:3,users:1});assert.deepEqual(await disabled.read(),{content:'',role:'system',depth:4,position:-1,enabled:false});
 const f=fixture({characterNote:{name:'card',useChara:true,position:1,prompt:'先听桥工的意见。'}});assert.equal((await f.read()).content,'先听桥工的意见。\n当夜先写修桥。');
});
test('missing or invalid enabled native author-note binding blocks rather than inventing an anchor',async()=>{
 await assert.rejects(prepareNativeAuthorNote({native:{},getContext:()=>({}),guard(){}}),e=>e.code==='V3_AUTHOR_NOTE_UNAVAILABLE');
 const f=fixture({role:99});await assert.rejects(f.read(),e=>e.code==='V3_AUTHOR_NOTE_INVALID');
});
test('host forwards native WI structural positions to the real full narrative compiler',async()=>{
 const f=await createInstallerHarness({mvu:false,provider:({stage,messages})=>stage==='a'?sheet(messages):wrap(newBody)});
 try{f.api.setBeforeWriter(async()=>({lore:[],supplements:[],nativeWorldInfo:{before:['扫描的前部资料'],after:[],examples:[],depth:[{depth:0,role:'assistant',entries:['深度零资料']}],anBefore:['备注前材料'],anAfter:['备注后材料'],outlets:{unused:['未绑定出口机密']}},authorNote:{content:'实际作者备注',role:'user',depth:1,position:1,enabled:true},outletBindings:{},output:{}}));await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);const messages=f.requests[1].messages;assert(messages.some(m=>m.role==='assistant'&&m.content.includes('深度零资料')));assert(messages.some(m=>m.role==='user'&&m.content.includes('实际作者备注')));assert(messages.some(m=>m.content.includes('备注前材料')));assert(!JSON.stringify(messages).includes('未绑定出口机密'));}finally{f.api.dispose();}
});
