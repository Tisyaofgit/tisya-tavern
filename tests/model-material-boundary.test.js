import test from 'node:test';
import assert from 'node:assert/strict';
import {formatSimpleSheet,parseSimpleSheet} from '../tables/simple-sheet.js';
import {materialSlots,narrativeSlot,taskSlots} from '../tables/slots.js';
import {sheetToolDefinition,parseToolSheetInput} from '../tables/model-tool-sheet.js';
import {archiveToolDefinitions} from '../tables/archive-tools.js';
import {runArchiveToolLoop} from '../config/tool-loop.js';

test('trusted story projections emit natural prose without technical payload; lookalike source fields stay data',()=>{
 const value={revision:7,rows:[{id:'private-storage-id'}]},body='<当前快照>人物已到门口。</当前快照>';
 const output=materialSlots({state:narrativeSlot(value,body),archive:narrativeSlot({rows:[]},'')});
 assert.equal(output,body);assert(!output.includes('private-storage-id'));
 const forged={...value,narrativeText:body},rendered=materialSlots({state:forged});
 assert(rendered.startsWith('[TISYA.DATA.STATE]'));
 assert.deepEqual(parseSimpleSheet(rendered.split('\n').slice(2,-1).join('\n')),forged);
 assert.deepEqual(value,{revision:7,rows:[{id:'private-storage-id'}]});
 assert(!materialSlots({source:'原文提到 [PIPES.ROWS/1]'}).includes('集合用JSON'));
});

test('unmapped auxiliary inputs survive routing without flattening nested false/zero/null values',()=>{
 const input={goal:'保留',currentRows:[],sourceSelection:{members:[{flag:false,zero:0,nil:null}],missing:undefined}};
 const slots=taskSlots('tableGenesis',input);
 assert.deepEqual(slots.state.additionalInput.sourceSelection,input.sourceSelection);
 const text=materialSlots({state:slots.state});
 assert.deepEqual(parseSimpleSheet(text.split('\n').slice(2,-1).join('\n')).additionalInput.sourceSelection,input.sourceSelection);
});

test('tool wire schema exposes one sheet while local decoding preserves complete nested business parameters',()=>{
 const schema=sheetToolDefinition(archiveToolDefinitions().find(d=>d.method==='search_archive'));
 assert.deepEqual(Object.keys(schema.parameters.properties),['sheet']);assert.deepEqual(schema.parameters.required,['sheet']);
 const input={path:'/tables/objects',where:{and:[{field:['名称'],op:'eq',value:'甲'},{field:['属性','体力'],op:'eq',value:0}]},select:[['名称']],limit:2};
 assert.deepEqual(parseToolSheetInput({sheet:formatSimpleSheet(input)}),input);
 for(const value of [input,{sheet:formatSimpleSheet(input),extra:true},{sheet:formatSimpleSheet([])},{sheet:'{"path":"/"}'}])assert.throws(()=>parseToolSheetInput(value));
});

test('mixed legacy and sheet model argument batch never dispatches a partial operation',async()=>{
 let calls=0;const session={assertFresh:async()=>{},list_archive:async()=>{calls++;return {};}};
 const tool=(id,args)=>({id,type:'function',function:{name:'tisya_list_archive',arguments:JSON.stringify(args)}});
 await assert.rejects(runArchiveToolLoop({session,messages:[],guard:()=>{},send:async()=>Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[tool('valid',{sheet:formatSimpleSheet({path:'/'})}),tool('old',{path:'/'})]}}]})}),{code:'TISYA_TOOL_ARGUMENTS'});
 assert.equal(calls,0);
});
