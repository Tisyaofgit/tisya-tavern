import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeSourcePlacement} from '../engine/native-source-placement.mjs';
import {wrapNativeSource} from '../engine/native-source-layers.mjs';
const compiled={layerPlan:{entries:[{identifier:'tisya_material_boundary_open',enabled:true,role:'system',content:'[Dream Rules]\n资料起'},{identifier:'tisya_material_boundary_close',enabled:true,role:'system',content:'[/Dream Rules]'}]}};
const msg=(content,role='system')=>({role,content});
test('owned source order crosses boundary and multipart history without moving quotations or media',()=>{
 const p=createNativeSourcePlacement(),a=wrapNativeSource('A','card'),b=wrapNativeSource('B','book');
 const image={type:'image_url',image_url:{url:'data:image/png;base64,fixture'}};
 const input=[msg(p.mark(a)),msg('[Dream Rules]\n资料起\n[/Dream Rules]'),msg([{type:'text',text:'用户原文\n'+b+p.mark(b)},image],'user')],before=structuredClone(input);
 const {messages,audit}=p.relocate(input,compiled);assert.deepEqual(input,before);
 assert.deepEqual(messages[1],msg('<NativeDreamSources>\n'+a+'\n'+b+'\n</NativeDreamSources>','assistant'));assert.equal(messages[0].role,'system');
 assert.deepEqual(messages.at(-1),msg([{type:'text',text:'用户原文\n'+b},image],'user'));assert.equal(audit.moved,2);
});
test('missing destination and truncated owned source block instead of leaving it at old position',()=>{
 const p=createNativeSourcePlacement(),text=p.mark(wrapNativeSource('A','card'));
 assert.throws(()=>p.relocate([msg(text)],compiled),/边界/);
 assert.throws(()=>p.relocate([msg(text.slice(0,-4))],compiled),/边界/);
});
