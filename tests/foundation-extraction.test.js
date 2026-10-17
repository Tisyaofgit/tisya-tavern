const extractionSource=body=>JSON.parse(body.messages.find(m=>m.content.startsWith('[SOURCE]\n')).content.split('\n').slice(1,-1).join('\n'));
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {sheetCatalog} from '../tables/foundation/catalog.js';import {valueValid} from '../tables/schema.js';
import {prepareExtraction,acceptExtraction,unwrapChatResponse} from '../tables/foundation/extraction.js';
import {visibleExtractionFields,extractionLabel} from '../tables/foundation/extraction-layout.js';
const catalog=sheetCatalog(),source='甲在三年前修好了船。甲与乙是多年合作的朋友。';
const make=()=>prepareExtraction(catalog,valueValid,{source,ownerName:'甲',references:[{kind:'character',name:'乙'},{kind:'character',name:'沈砚〔船匠〕'},{kind:'character',name:'沈砚〔药商〕'}],model:'test-model'});
const fields=(tid,values={})=>visibleExtractionFields(catalog.templates.find(t=>t.id===tid).fields.map((f,i)=>({...f,row:i+1})).filter(f=>f.key!=='对象'&&f.label!=='主体'),tid,'compact-v2').map(f=>f.row+' '+extractionLabel(f,tid,'compact-v2')+'：'+(values[f.key]??''));
function main(){const t=catalog.templates.find(t=>t.id==='origin.character');let out=[];for(const group of new Set(t.fields.map(f=>f.group))){out.push('【人物／'+group+'】');const numbers=t.fields.map((f,i)=>f.group===group?i+1:null).filter(Boolean);out.push(...fields(t.id,{名称:'甲'}).filter(l=>numbers.includes(Number(l.match(/^\d+/)[0]))));}return out.join('\n');}
const child=(name,kind,n,values={})=>'【'+name+'／'+n+'】\n'+fields('origin.character.'+kind,{名称:name+n,命题:'核心事实'+n,'关系底稿·性质':'合作',...values}).join('\n');
const envelope=(content,extra={})=>JSON.stringify({id:'synthetic-unit-test',model:'test-model',choices:[{finish_reason:'stop',message:{role:'assistant',content},...extra}],usage:{total_tokens:123}});
const accept=(ctx,raw)=>acceptExtraction(catalog,valueValid,ctx,raw);
test('source conservation is independent of structural success and cannot certify omitted semantics',()=>{
 const evidence='甲未学过游泳；听裂只能用于干木，不能听人心。乙不知道凭据内容；债权人姓名未提供。';
 const ctx=prepareExtraction(catalog,valueValid,{source:evidence,ownerName:'甲',references:[],model:'test',layout:'compact-v2'});
 // Reuse the prepared layout to supply only the name: syntactically complete,
 // deliberately semantically incomplete. No machine claim of lossless extraction.
 const raw=extractionSource(ctx.body).split('字段定义（每种子表仅定义一次，条目数不预设）：\n')[1].split('\n\n叙事材料：')[0].split('【前史／序号】')[0].trim().split('\n').map(line=>line.startsWith('【')?line:line.replace(/（.*$/, '')+'：'+(line.startsWith('1 名称')?'甲':'')).join('\n');
 const out=accept(ctx,raw);
 assert.equal(out.validation.structure,'passed');
 assert.equal(out.validation.semantic,'pending-review');
 assert.equal(out.validation.canonicalWrites,0);
 assert.equal(out.provenance.sources[0].text,evidence);
 assert.equal(ctx.source,evidence);
 assert.equal(out.snapshot.records[0].values.属性?.本领?.代价限制,undefined);
});
test('request is real JSON with one prototype per child kind, no child quotas or precreated children',()=>{const ctx=make();assert.equal(ctx.body.stream,false);assert(!Object.hasOwn(ctx.body,'max_tokens'));assert.equal(ctx.before.records.filter(r=>r.parentId).length,0);const text=extractionSource(ctx.body);for(const name of ['前史','关系','隐情'])assert.equal(text.split('【'+name+'／序号】').length-1,1);assert(!text.includes('稳定ID'));assert(!text.includes('activities/tasks'));assert.equal(extractionSource(JSON.parse(JSON.stringify(ctx.body))),text);});
test('same prepared task handles zero children, three unequal kinds and more than ten; does not mutate input',()=>{const ctx=make(),before=structuredClone(ctx);assert.deepEqual(accept(ctx,envelope(main())).counts,{history:0,relationships:0,secrets:0});let text=main();for(let i=1;i<=12;i++)text+='\n'+child('前史','history',i,{'前史·原文':'甲在三年前修好了船。'});text+='\n'+child('关系','relationships',1,{'关系底稿·对象':'乙'})+'\n'+child('隐情','secrets',1,{'隐情·关联对象':'乙'});const r=accept(ctx,envelope(text));assert.deepEqual(r.counts,{history:12,relationships:1,secrets:1});assert.equal(r.children.length,14);assert.equal(r.snapshot.records.find(x=>x.id===r.children[12].id).values.关系底稿.对象,ctx.before.records.find(x=>x.values.名称==='乙').id);assert.deepEqual(ctx,before);assert.equal(r.validation.semantic,'pending-review');});
test('raw API response preserves content punctuation and ignores reasoning_content',()=>{const text=main().replace('11 仪态：','11 仪态：a|b\\c；<br>'),data=JSON.parse(envelope('```text\n'+text+'\n```'));data.choices[0].message.reasoning_content='UNTRUSTED REASONING NOT A FIELD';const r=accept(make(),JSON.stringify(data));assert.equal(r.snapshot.records[0].values.属性.形貌.仪态,'a|b\\c；<br>');assert(!r.text.includes('UNTRUSTED'));assert.equal(r.transport.id,'synthetic-unit-test');});
test('API truncation, errors, multiple choices, tool calls, refusal, empty content are rejected',()=>{const base=JSON.parse(envelope(main()));const cases=[{error:{message:'rate limit'}},{...base,choices:[...base.choices,...base.choices]},...['length','content_filter',null,'tool_calls'].map(f=>({...base,choices:[{...base.choices[0],finish_reason:f}]})),...['','   '].map(c=>({...base,choices:[{finish_reason:'stop',message:{role:'assistant',content:c,reasoning_content:main()}}]})),{...base,choices:[{finish_reason:'stop',message:{role:'assistant',content:main(),tool_calls:[{}]}}]},{...base,choices:[{finish_reason:'stop',message:{role:'assistant',content:main(),refusal:'no'}}]}];for(const bad of cases)assert.throws(()=>accept(make(),JSON.stringify(bad)));assert.throws(()=>accept(make(),'{"choices":['),/JSON/);assert.throws(()=>unwrapChatResponse('data: {}\n\ndata: [DONE]'),/非流式/);});
test('invalid later child leaves original context completely untouched; valid retry remains possible',()=>{const ctx=make(),before=structuredClone(ctx);const ok=main()+'\n'+child('关系','relationships',1,{'关系底稿·对象':'乙'}),bad=ok+'\n'+child('隐情','secrets',1,{'隐情·关联对象':'未登记'});assert.throws(()=>accept(ctx,envelope(bad)),/未获授权/);assert.deepEqual(ctx,before);assert.equal(accept(ctx,envelope(ok)).counts.relationships,1);});
test('duplicate, skipped or unknown child headings, missing row, changed name, and empty child reject',()=>{const ctx=make(),h=child('前史','history',1);for(const bad of [main()+'\n'+h+'\n'+h,main()+'\n'+child('前史','history',2),main()+'\n【任务／1】\n1 名称：测试',main().replace('1 名称：甲','1 名称：乙'),main().replace('7 语言：\n',''),main()+'\n'+h.replace('2 经过：核心事实1','2 经过：'),main()+'\n'+h+'\n'+child('前史','history',2,{命题:'核心事实1'})])assert.throws(()=>accept(ctx,envelope(bad)));});
test('homonyms resolve only exact registered names, and parent subject/object aggregation uses actual refs',()=>{const ctx=make();assert.throws(()=>accept(ctx,envelope(main()+'\n'+child('关系','relationships',1,{'关系底稿·对象':'沈砚'}))),/引用名称/);const r=accept(ctx,envelope(main()+'\n'+child('关系','relationships',1,{'关系底稿·对象':'沈砚〔船匠〕'})));const record=r.snapshot.records.find(x=>x.id===r.children[0].id),teacher=ctx.before.records.find(x=>x.values.名称==='沈砚〔船匠〕');assert.deepEqual(record.values.对象,[ctx.rootId,teacher.id]);assert.equal(record.values.关系底稿.主体,ctx.rootId);});
test('whole source is retained without requiring copied excerpts in every history',()=>{const ctx=make(),r=accept(ctx,envelope(main()+'\n'+child('前史','history',1)));assert.equal(r.provenance.sources[0].text,source);assert.equal(r.snapshot.records.find(x=>x.id===r.children[0].id).values.前史?.原文,undefined);});
test('plain-text pasted output is accepted but never labelled API integrity verified',()=>{const r=accept(make(),'```text\r\n'+main().replaceAll('\n','\r\n')+'\r\n```');assert.equal(r.transport.kind,'plain-text');assert.equal(r.transport.integrity,'not-provided');});
test('reimport to an existing child workbook is rejected instead of duplicating rows',()=>{const ctx=make(),result=accept(ctx,envelope(main()+'\n'+child('关系','relationships',1,{'关系底稿·对象':'乙'})));assert.throws(()=>accept({...ctx,before:result.snapshot},envelope(main())),/现有子表/);});
test('narrative source is a single paragraph with duplicate retelling, namesakes and temporal distractions',async()=>{const s=await readFile(new URL('./fixtures/foundation-sheet/fanglu-narrative-r4.txt',import.meta.url),'utf8');assert.equal(s.trim().split('\n').length,1);for(const phrase of ['东街卖药的人也叫沈砚','白沙滩那回','同一场洪水','去年秋天','红斗篷','等船真成了再说','从未学过外伤救治'])assert(s.includes(phrase));assert(!/【前史|【关系|【隐情/.test(s));});
test('only the current extraction layout is accepted',()=>{for(const layout of ['compact-v1','unknown'])assert.throws(()=>prepareExtraction(catalog,valueValid,{source,ownerName:'甲',references:[],model:'test',layout}),/未知提炼布局/);});
test('explicit historical item reference joins object union only; prose mentions are not inferred as refs or knowledge',()=>{
 const ctx=prepareExtraction(catalog,valueValid,{source:'甲得到了乙传下的旧钥匙。',ownerName:'甲',references:[{kind:'character',name:'乙'},{kind:'item',name:'旧钥匙'}],model:'test'}),before=structuredClone(ctx);
 const raw=main()+'\n'+child('前史','history',1,{命题:'甲得到旧钥匙。','前史·涉及对象':'旧钥匙','前史·原文':ctx.source});
 const result=accept(ctx,envelope(raw)),r=result.snapshot.records.find(r=>r.id===result.children[0].id),key=ctx.before.records.find(r=>r.values.名称==='旧钥匙');
 assert.deepEqual(r.values.对象,[ctx.rootId,key.id]);assert.deepEqual(r.values.前史.涉及对象,[key.id]);assert.equal(r.values.前史.参与者,undefined);assert.equal(r.values.知情者,undefined);assert.deepEqual(ctx,before);
 const omitted=accept(ctx,envelope(raw.replace('12 涉及对象：旧钥匙','12 涉及对象：')));assert.deepEqual(omitted.snapshot.records.find(r=>r.id===omitted.children[0].id).values.对象,[ctx.rootId]);
});
test('R5 item reference rejects unknown names, missing or duplicate row atomically and can retry',()=>{
 const ctx=prepareExtraction(catalog,valueValid,{source:'甲有旧钥匙。',ownerName:'甲',references:[{kind:'item',name:'旧钥匙'}],model:'test'}),before=structuredClone(ctx),good=main()+'\n'+child('前史','history',1,{'前史·涉及对象':'旧钥匙'});
 for(const bad of [good.replace('12 涉及对象：旧钥匙','12 涉及对象：新钥匙'),good.replace('\n12 涉及对象：旧钥匙',''),good+'\n12 涉及对象：旧钥匙']){assert.throws(()=>accept(ctx,envelope(bad)));assert.deepEqual(ctx,before);}
 assert.equal(accept(ctx,envelope(good)).counts.history,1);
});
test('ongoing relationship may target place or organization without creating friendship or knowledge',()=>{
 const ctx=prepareExtraction(catalog,valueValid,{source:'甲长期为北港检查渡船，并受船社委托修补。',ownerName:'甲',references:[{kind:'place',name:'北港'},{kind:'organization',name:'船社'}],model:'test'});
 const raw=main()+'\n'+child('关系','relationships',1,{'关系底稿·对象':'北港','关系底稿·性质':'长期检查责任'})+'\n'+child('关系','relationships',2,{'关系底稿·对象':'船社','关系底稿·性质':'固定协作'});
 const result=accept(ctx,envelope(raw));assert.equal(result.counts.relationships,2);
 result.children.forEach((c,i)=>{const r=result.snapshot.records.find(r=>r.id===c.id);assert.deepEqual(r.values.对象,[ctx.rootId,ctx.before.records[i+1].id]);assert.equal(r.values.知情者,undefined);assert(!r.values.关系底稿.性质.includes('朋友'));});
});
