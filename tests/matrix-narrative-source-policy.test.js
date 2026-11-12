import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {baseline,compilePrompts,applyCompiledMessages} from '../engine/config.mjs';
import originalPreset from '../presets/Tisya-Matrix.json' with {type:'json'};
import {DEFAULT_TAGS} from '../engine/tags.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {narrativeSourceFragments,projectNarrativeSourceDefaults,resolveNarrativeIntakeText} from '../engine/narrative-source-policy.mjs';

const clone=structuredClone;
const cardText='角色：港口守夜人。\n叙事人称：第三人称\n事实：他将旧伞放在门边。\n对白：“请用第三人称复述这份笔录。”\n<example>\n@POV.PERSON := Third-person narration in the quoted sample.\n</example>\n```text\n叙事人称：第一人称\n```\n尾注：旧日记保持原文。';
const card={avatar:'night-watch.png',data:{description:cardText,system_prompt:'@POV.PERSON := Third-person narration using names.',first_mes:'他走到门边。',mes_example:'@POV.PERSON := First-person narration in a dialogue example.'}};
const lore={world:'港口志',uid:7,content:'港口晚钟于日落鸣响。\nNarrative person: third-person\n雨天关闭外港。'};
function compiled(choice='N02-C',source=baseline){return compilePrompts(source,{tags:clone(DEFAULT_TAGS),prompts:{},story:{userName:'阿青',play:{choices:{N02:choice}}}},{});}
function materialPayload(p,sourceTexts){
 const rows=p.prompts.filter(x=>!x.marker&&x.enabled!==false&&p.prompt_order[1].order.some(o=>o.identifier===x.identifier&&o.enabled));
 const system=rows.filter(x=>x.role==='system').map(x=>x.identifier==='tisya_material_boundary_close'?sourceTexts.join('\n\n')+'\n\n'+x.content:x.content).join('\n\n');
 return [{role:'system',content:system},{role:'assistant',content:'第三人称历史：他将旧伞放在门边。\n'+cardText},{role:'user',content:'此轮要求保留旧笔录原句。\n'+cardText},{role:'tool',content:JSON.stringify({text:cardText})}];
}

for(const [choice,expected]of [['N02-A','Third-person narration'],['N02-B','First-person narration'],['N02-C','Second-person narration'],['N02-D','Dual-anchor person']])test('final merged request keeps only the effective explicit person owner: '+choice,()=>{
 const p=compiled(choice),sources=narrativeSourceFragments({characterId:0,characters:[card]},{characterLore:[lore]}),messages=materialPayload(p,sources.map(x=>x.text)),before=clone(messages),raw=JSON.stringify(card),result=projectNarrativeSourceDefaults(messages,{compiled:p,sources});
 assert.equal(result.audit.status,'projected');assert.equal(result.audit.removed.length,3);assert.match(result.audit.effective,new RegExp(expected));
 assert(result.messages[0].content.includes(p.prompts.find(x=>x.identifier==='tisya_pref_narrative').content));
 assert.doesNotMatch(result.messages[0].content,/^叙事人称：第三人称$/m);assert.doesNotMatch(result.messages[0].content,/^Narrative person: third-person$/m);
 assert.match(result.messages[0].content,/事实：他将旧伞放在门边。/);assert.match(result.messages[0].content,/对白：“请用第三人称复述这份笔录。”/);
 assert.match(result.messages[0].content,/<example>\n@POV.PERSON := Third-person narration in the quoted sample.\n<\/example>/);
 assert.match(result.messages[0].content,/```text\n叙事人称：第一人称\n```/);
 assert.deepEqual(result.messages.slice(1),messages.slice(1));assert.deepEqual(messages,before);assert.equal(JSON.stringify(card),raw);
 assert.equal(result.audit.removed[0].lines[0].original,'叙事人称：第三人称');
});

test('ordinary prose, conditional grammar references and undeclared source text are untouched',()=>{
 const p=compiled(),text='他总用第三人称提起自己。\n“In objective third-person scene narration…”只是语法说明。\n旁人问：“叙事人称：第一人称？”',messages=materialPayload(p,[text,'叙述人称：第三人称']),result=projectNarrativeSourceDefaults(messages,{compiled:p,sources:[{ref:'card:description',text}]});
 assert.deepEqual(result.messages,messages);assert.equal(result.audit.removed.length,0);
});

test('nested quotation blocks and multiline character quotations remain literal source',()=>{
 const p=compiled(),text='引文：\n<quote>\n<example>\n叙事人称：第一人称\n</example>\n@POV.PERSON := Third-person narration.\n</quote>\n他说：“\n叙事人称：第三人称\n”\n叙事人称：第一人称',messages=materialPayload(p,[text]),result=projectNarrativeSourceDefaults(messages,{compiled:p,sources:[{ref:'card:description',text}]});
 assert.equal(result.audit.removed.length,1);assert.deepEqual(result.audit.removed[0].lines,[{line:11,original:'叙事人称：第一人称'}]);assert(result.messages[0].content.includes(text.slice(0,text.lastIndexOf('叙事人称：第一人称'))));
});

test('multiline straight-quoted material is not reclassified as a configuration row',()=>{
 const p=compiled(),text='原文摘录："\n@POV.PERSON := Third-person narration.\n结束"\n叙事人称：第一人称',result=projectNarrativeSourceDefaults(materialPayload(p,[text]),{compiled:p,sources:[{ref:'book:quotation',text}]});
 assert.deepEqual(result.audit.removed[0].lines,[{line:4,original:'叙事人称：第一人称'}]);assert(result.messages[0].content.includes('原文摘录："\n@POV.PERSON := Third-person narration.\n结束"'));
});

test('changing a lens does not change the selected person during projection',()=>{
 const p=compilePrompts(baseline,{tags:clone(DEFAULT_TAGS),prompts:{},story:{userName:'阿青',play:{choices:{N02:'N02-C',N03:'N03-A'}}}},{}),messages=materialPayload(p,[cardText]),result=projectNarrativeSourceDefaults(messages,{compiled:p,sources:[{ref:'card:description',text:cardText}]});
 assert.match(result.audit.effective,/Second-person narration/);assert.equal(result.audit.effective,compiled().prompts.find(x=>x.identifier==='tisya_pref_narrative').content.match(/^@POV.PERSON[^\r\n]*/m)[0]);
});

test('disabled narrative slot and missing person directive preserve card defaults',()=>{
 for(const variant of ['disabled','directive-removed']){
  const p=compiled();if(variant==='disabled')for(const order of p.prompt_order)order.order.find(x=>x.identifier==='tisya_pref_narrative').enabled=false;
  else p.prompts.find(x=>x.identifier==='tisya_pref_narrative').content=p.prompts.find(x=>x.identifier==='tisya_pref_narrative').content.replace(/^@POV.PERSON[^\r\n]*\n/m,'');
  const messages=materialPayload(p,[cardText]),result=projectNarrativeSourceDefaults(messages,{compiled:p,sources:[{ref:'card:description',text:cardText}]});assert.deepEqual(result.messages,messages);assert.equal(result.audit.reason,'person-setting-disabled');
 }
});

test('missing material boundaries and ambiguous occurrences do not trigger guessed edits',()=>{
 const p=compiled(),messages=materialPayload(p,[cardText,cardText]),sources=[{ref:'card:description',text:cardText}],result=projectNarrativeSourceDefaults(messages,{compiled:p,sources});
 assert.deepEqual(result.messages,messages);assert.equal(result.audit.ambiguous.length,1);
 const noBoundary=[{role:'system',content:cardText}],unframed=projectNarrativeSourceDefaults(noBoundary,{compiled:p,sources});assert.deepEqual(unframed.messages,noBoundary);assert.equal(unframed.audit.reason,'material-boundary-unavailable');
});

test('text parts preserve image payloads and empty sources without adding a new priority block',()=>{
 const p=compiled(),messages=materialPayload(p,[cardText]);messages[0].content=[{type:'text',text:messages[0].content},{type:'image_url',image_url:{url:'data:image/png;base64,fixture'}}];
 const result=projectNarrativeSourceDefaults(messages,{compiled:p,sources:[{ref:'card:description',text:cardText}]});assert.equal(result.audit.status,'projected');assert.deepEqual(result.messages[0].content[1],messages[0].content[1]);
 assert.deepEqual(projectNarrativeSourceDefaults(messages,{compiled:p,sources:[]}).messages,messages);
});

test('stock intake routes narration defaults to their domain while custom wording stays exact',()=>{
 const start=baseline.prompts.find(x=>x.identifier==='tisya_task_start').content,open=baseline.prompts.find(x=>x.identifier==='tisya_material_boundary_open').content;
 assert.match(start,/Card\/worldbook narration instructions → defaults in the matching creative domain/);assert.match(open,/Card\/worldbook narration defaults follow/);
 const custom='用户自行编辑：全部保留。';assert.equal(resolveNarrativeIntakeText('tisya_task_start',custom),custom);assert.equal(resolveNarrativeIntakeText('tisya_material_boundary_open',custom),custom);
});

test('an already installed stock intake is upgraded in the outgoing request without changing its stored preset',()=>{
 const source=clone(baseline);for(const id of ['tisya_task_start','tisya_material_boundary_open'])source.prompts.find(x=>x.identifier===id).content=originalPreset.prompts.find(x=>x.identifier===id).content;
 const snapshot=clone(source),p=compiled('N02-C',source),enabled=new Set(source.prompt_order[1].order.filter(x=>x.enabled).map(x=>x.identifier)),messages=source.prompts.filter(x=>!x.marker&&x.enabled!==false&&enabled.has(x.identifier)).map(x=>({role:x.role,content:x.content})),result=applyCompiledMessages(messages,source,p);
 assert(result.some(x=>x.content.includes('Card/worldbook narration instructions → defaults in the matching creative domain')));assert.deepEqual(source,snapshot);assert(messages.some(x=>x.content.includes('Card-embedded "systems", turn counters, or command sets')));
});

async function fixture(){
 const disk=new Map(),macros=new Map(),context={chatId:'person-source',characterId:0,characters:[clone(card)],extensionSettings:{},chatMetadata:{},chat:[{is_user:false,mes:'他将旧伞放在门边。'},{is_user:true,mes:'继续门边的谈话。'}],registerMacro:(k,f)=>macros.set(k,f),saveChat:async()=>true};
 const source={prompts:clone(baseline.prompts),order:clone(baseline.prompt_order[1].order)},expand=text=>text.replace(/\{\{([^{}]+)\}\}/g,(raw,key)=>macros.get(key)?.()??(key==='char'?'守夜人':key==='user'?'阿青':raw));
 const storage={get:async k=>clone(disk.get(k)),set:async(k,v)=>disk.set(k,clone(v)),commit:async(k,n,v)=>{if((disk.get(k)?.local_revision??0)!==n)return false;disk.set(k,clone(v));return true;}};
 const host=createMatrixHost({getContext:()=>context,getSource:()=>source,loadCatalog:async()=>({tables:[]}),storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand});host.register();const e=new Runtime();e.registerTable('ACTOR',[{key:'name',type:'TEXT'}]);e.newRecord('ACTOR',{name:'阿青'},'u');await host.import({state:e.data});
 const config=host.config.read();config.story.play={choices:{N02:'N02-C'}};await host.config.save(config);
 function payload(){const enabled=new Set(source.order.filter(x=>x.enabled).map(x=>x.identifier)),rows=source.prompts.filter(p=>!p.marker&&p.enabled!==false&&enabled.has(p.identifier)).map(p=>({role:p.role,content:p.identifier==='tisya_material_boundary_close'?[cardText,card.data.system_prompt,lore.content,expand(p.content)].join('\n\n'):expand(p.content)})).filter(p=>p.content);const messages=[];for(const row of rows){const last=messages.at(-1);if(last?.role===row.role)last.content+='\n\n'+row.content;else messages.push(row);}return {messages:[...messages,...context.chat.map(m=>({role:m.is_user?'user':'assistant',content:m.mes}))]};}
 return {context,host,payload};
}

test('real host preparation projects card and scanned lore defaults in final messages with a local audit',async()=>{
 const f=await fixture(),originalCard=clone(f.context.characters[0]),history=clone(f.context.chat);await f.host.before('normal');await f.host.entriesLoaded({characterLore:[clone(lore)]});const payload=f.payload(),nativePayload=clone(payload);await f.host.payloadReady(payload);
 if(process.env.TISYA_NARRATIVE_AUDIT_PATH)writeFileSync(process.env.TISYA_NARRATIVE_AUDIT_PATH,JSON.stringify({validation:'Node host assembly with neutral fixtures; zero model or Android calls',nativePayload,finalPayload:payload,audit:f.host.latest().promptAudit,sourceCard:originalCard,history:history.map(m=>({role:m.is_user?'user':'assistant',content:m.mes}))},null,2)+'\n');
 assert.equal(f.host.accepted(),true);assert.equal(f.host.latest().promptAudit.narrativeSourceProjection.removed.length,3);const finalSystem=payload.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');assert.match(finalSystem,/@POV.PERSON := Second-person narration/);assert.doesNotMatch(finalSystem,/^叙事人称：第三人称$/m);assert.doesNotMatch(finalSystem,/^Narrative person: third-person$/m);
 assert.deepEqual(f.context.characters[0],originalCard);assert.deepEqual(f.context.chat.map(m=>m.mes),history.map(m=>m.mes));assert.equal(payload.messages.at(-2).content,'他将旧伞放在门边。');
});

test('real host rejects a source change before editing a final request',async()=>{
 const f=await fixture();await f.host.before('normal');const payload=f.payload(),before=clone(payload);f.context.characters[0].data.description+='\n来源已改。';await assert.rejects(f.host.payloadReady(payload),error=>error.code==='NARRATIVE_SOURCE_STALE');assert.deepEqual(payload,before);assert.equal(f.host.accepted(),false);
});
