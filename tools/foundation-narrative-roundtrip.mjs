// Offline preparation and replay of an API request/response; no model/network/store calls.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {sheetCatalog} from '../tables/foundation/catalog.js';import {valueValid} from '../tables/schema.js';
import {prepareExtraction,acceptExtraction,unwrapChatResponse} from '../tables/foundation/extraction.js';
import {levelStatePreset,projectStateVocabulary} from '../tables/state-registry.js';
const hash=x=>createHash('sha256').update(x).digest('hex'),catalog=sheetCatalog();
const files=['../tables/foundation/extraction.js','../tables/foundation/semantic-contract.js','../tables/foundation/engine.js','../tables/schema.js','../tables/condition-rules.js','../tables/foundation/extraction-layout.js','../tables/state-registry.js'];
const fingerprints=Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(new URL(f,import.meta.url)))])));fingerprints.catalog=hash(JSON.stringify(catalog));
const save=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const [mode,...args]=process.argv.slice(2);
async function newOut(path){try{await stat(path);throw Error('输出目录已存在；保留旧证据，请使用新目录');}catch(error){if(error.code!=='ENOENT')throw error;}await mkdir(path,{recursive:true});}
if(mode==='prepare'){
 assert(args.length===1||args.length===2,'prepare OUT [MODEL]');const out=resolve(args[0]);await newOut(out);
 const source=await readFile(new URL('../tests/fixtures/foundation-sheet/fanglu-narrative-r4.txt',import.meta.url),'utf8');
 const references=[['character','沈砚〔船匠〕'],['character','沈砚〔药商〕'],['character','阿禾'],['character','顾槐'],['place','青溪渡'],['place','白沙滩'],['place','北峡'],['item','旧铜铃'],['rule','听木辨裂']].map(([kind,name])=>({kind,name}));
 const conditionVocabulary=JSON.parse(await readFile(new URL('../tests/fixtures/foundation-sheet/fanglu-conditions-r7.json',import.meta.url),'utf8'));
 {
  const registry=levelStatePreset('fanglu-test-world'),instances=[{kind:'injury',id:'fanglu-right-wrist-old-injury',name:'右腕旧伤'}];
  conditionVocabulary.fields.push(...projectStateVocabulary(registry,instances).fields);
  await save(resolve(out,'state-registry.json'),{registry,instances,currentValuesInitialized:0});
 }
 // Every primitive uses the same advertised shorthand.
 for(const field of conditionVocabulary.fields)field.compact=true;
 const spec={source,conditionVocabulary,layout:'compact-v2',ownerName:'方鹿',references,model:args[1]??'deepseek-flash'},task=prepareExtraction(catalog,valueValid,spec),request=JSON.stringify(task.body,null,2)+'\n';
 const context={...task,spec,fingerprints,requestSha256:hash(request)};
 await writeFile(resolve(out,'request-body.json'),request);await save(resolve(out,'request-context.json'),context);
 await save(resolve(out,'preflight.json'),{validJson:true,requestSha256:hash(request),model:task.body.model,stream:task.body.stream,customTokenLimit:false,precreatedChildren:task.before.records.filter(r=>r.parentId).length,definitionInstances:Object.fromEntries(['前史','关系','隐情'].map(k=>[k,task.body.messages[1].content.split('【'+k+'／序号】').length-1])),sourceCharacters:source.trim().length,sourceParagraphs:source.trim().split(/\n\s*\n/).length,modelCalls:0});
 console.log(JSON.stringify({request:resolve(out,'request-body.json'),sha256:hash(request),precreatedChildren:0,modelCalls:0}));
}else if(mode==='replay'){
 assert.equal(args.length,3,'replay CONTEXT RAW_RESPONSE NEW_OUT');const [contextPath,responsePath,out]=args.map(x=>resolve(x));await newOut(out);
 const bytes=await readFile(responsePath);await writeFile(resolve(out,'response.raw.txt'),bytes);const raw=bytes.toString('utf8');const context=JSON.parse(await readFile(contextPath,'utf8'));
 try{
  assert.deepEqual(context.fingerprints,fingerprints,'解析器/schema已变化，必须使用同一任务版本');
  assert.equal(hash(JSON.stringify(context.body,null,2)+'\n'),context.requestSha256,'请求体散列不符');
  const regenerated=prepareExtraction(catalog,valueValid,context.spec);assert.deepEqual(regenerated.body,context.body,'请求重建不一致');assert.deepEqual(regenerated.before,context.before,'任务草稿重建不一致');
  const extracted=unwrapChatResponse(raw);await writeFile(resolve(out,'response.content.txt'),extracted.text);
  const result=acceptExtraction(catalog,valueValid,context,raw);await save(resolve(out,'result.json'),result);
  const validation={...result.validation,counts:result.counts,transport:result.transport,rawResponseSha256:hash(bytes),requestSha256:context.requestSha256,parserCalledExternalModel:false,source:'Supplied response bytes; provider origin not independently verified'};await save(resolve(out,'validation.json'),validation);console.log(JSON.stringify(validation));
 }catch(error){await save(resolve(out,'failure.json'),{message:error.message,responseSha256:hash(bytes),canonicalWrites:0,originalContextModified:false});throw error;}
}else throw Error('Expected prepare or replay');
