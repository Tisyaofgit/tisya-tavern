// Explicit local preparation/replay for externally filled foundation sheets; no model or canonical store access.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {sheetCatalog} from '../tables/foundation/catalog.js';import {createSheetEngine} from '../tables/foundation/engine.js';import {valueValid} from '../tables/schema.js';
const hash=s=>createHash('sha256').update(s).digest('hex'),catalog=sheetCatalog();
const engineHash=hash(await readFile(new URL('../tables/foundation/engine.js',import.meta.url))),schemaHash=hash(await readFile(new URL('../tables/schema.js',import.meta.url))),catalogHash=hash(JSON.stringify(catalog));
const save=async(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const [mode,...args]=process.argv.slice(2);
if(mode==='prepare'){
 assert.equal(args.length,1,'prepare OUT');const out=resolve(args[0]);await mkdir(out,{recursive:true});const e=createSheetEngine(catalog,valueValid),root=e.create('origin.character');
 const children=['history','history','relationships','relationships','secrets'].map(k=>e.createChild(root.id,k)),named={};
 for(const [kind,name]of [['character','沈砚〔船匠〕'],['character','沈砚〔药商〕'],['character','阿禾'],['place','青溪渡'],['place','白沙滩'],['place','北峡'],['item','旧铜铃'],['rule','听木辨裂']]){const r=e.create('origin.'+kind);e.edit(r.id,'名称',name);named[name]=r.id;}
 const draft=e.snapshot();draft.records.find(r=>r.id===root.id).title='方鹿';e.restore(draft);
 const source=await readFile(new URL('../tests/fixtures/foundation-sheet/fanglu-source.txt',import.meta.url),'utf8');
 const options={source,recordIds:[root.id,...children.map(x=>x.id)],referenceIds:e.references().map(r=>r.值),rules:{table:'只返回一个text代码块，代码块内只放填写后的档案，不重复资料和要求。所有子表属于方鹿；主体与对象汇总由程序补齐。每条子表的命题简短概括核心事实，不照抄整段原文；前史原文完整复制对应材料段落。不得增加无依据的信息。'}};
 const before=e.snapshot(),task=e.requestDossier(root.id,options),context={format:'tisya.external-sheet-roundtrip/1',engineHash,schemaHash,catalogHash,rootId:root.id,children:children.map(x=>x.id),named,before,options,requestSha256:hash(task.modelInput)};
 await writeFile(resolve(out,'request.txt'),task.modelInput);await save(resolve(out,'request-context.json'),context);
 console.log(JSON.stringify({request:resolve(out,'request.txt'),sha256:context.requestSha256,fields:task.modelInput.split('\n\n待填写：\n')[1].split('\n').filter(l=>/^\d+ /.test(l)).length}));
}else if(mode==='replay'){
 assert.equal(args.length,3,'replay CONTEXT RESPONSE OUT');const [contextPath,responsePath,outPath]=args.map(x=>resolve(x)),context=JSON.parse(await readFile(contextPath,'utf8'));
 assert.equal(context.format,'tisya.external-sheet-roundtrip/1');assert.equal(context.engineHash,engineHash,'engine changed');assert.equal(context.schemaHash,schemaHash,'schema changed');assert.equal(context.catalogHash,catalogHash,'catalog changed');
 const e=createSheetEngine(catalog,valueValid);e.restore(context.before);const task=e.requestDossier(context.rootId,context.options);assert.equal(hash(task.modelInput),context.requestSha256,'request changed');const raw=await readFile(responsePath,'utf8');await mkdir(outPath,{recursive:true});
 await writeFile(resolve(outPath,'response.raw.txt'),raw);await writeFile(resolve(outPath,'request.txt'),task.modelInput);
 try{e.accept(task.token,raw);}catch(error){await save(resolve(outPath,'failure.json'),{message:error.message,responseSha256:hash(raw),unchanged:JSON.stringify(e.snapshot().records)===JSON.stringify(context.before.records)});throw error;}
 const result=e.snapshot(),get=(r,path)=>path.reduce((v,k)=>v?.[k],r.values);let filled=0;
 for(const id of context.options.recordIds){const old=context.before.records.find(r=>r.id===id),next=result.records.find(r=>r.id===id);for(const f of e.template(next.template).fields)if(get(old,f.path)===undefined&&get(next,f.path)!==undefined)filled++;}
 const summary={responseSha256:hash(raw),requestSha256:context.requestSha256,responseRows:raw.split('\n').filter(l=>/^\d+ /.test(l)).length,newlyFilledFields:filled,targetRecords:context.options.recordIds.length,unknownSpecies:e.get(context.rootId,'身份细目·物种')===undefined,unknownBirth:e.get(context.rootId,'身份细目·出生时期')===undefined,secretRelated:e.get(context.children[4],'隐情·关联对象'),secretUnion:e.get(context.children[4],'对象'),historyUnions:context.children.slice(0,2).map(id=>e.get(id,'对象')),canonicalWrites:0,modelCalls:0,source:'user-pasted external model output; no edits to raw response'};
 await save(resolve(outPath,'result.json'),result);await save(resolve(outPath,'validation.json'),summary);console.log(JSON.stringify(summary));
}else throw Error('Expected prepare or replay');
