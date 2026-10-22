import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveSourceView,restoreArchiveSource} from '../tables/archive-source-view.js';
import {archivalText,historyEvidence,prepareCommit} from '../tables/ledger.js';
import {defaultRegistry} from '../tables/schema.js';
import {emptyConfig,defaultWorld} from '../config/core.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {parseSimpleSheet,renderModelMaterial} from '../tables/simple-sheet.js';

const configuration={data:emptyConfig(),world:defaultWorld()};
const text='唯一正文哨兵：门仍关闭，{{user}} 把信放回袖中。'+('雨沿石阶落下，守门人没有离开原处。'.repeat(160))+'末尾🙂𠮷。';
const prefix='\r\n<reply><title>场景：北门 | 2026-10-22 11:20 | 雨\r\n标题辅助哨兵</title><body>\r\n  ';
const suffix='  \r\n</body><memory>仅摘要说门已经打开。</memory><extra>面板辅助哨兵 {{user}}</extra><unknown>未知块必须保留</unknown><vars>变量辅助哨兵</vars></reply>\r\n';
const raw=prefix+text+suffix;
const makeSource=body=>({key:'raw-source-hash',parent:'raw-parent-hash',index:3,floor:6,role:'assistant',name:'岚',candidate:2,text:body});
const own=(value,key)=>Object.hasOwn(value,key);
function readSlot(messages,name){
 const body=messages.find(row=>row.content.startsWith('[TISYA.DATA.'+name.toUpperCase()+']\n'))?.content;
 assert(body,name+' is present');return parseSimpleSheet(body.split('\n').slice(2,-1).join('\n'));
}
function materialMessages(task,input,nativeBridge){
 return taskMessages({preset:pairedPreset({task,configuration,nativeBridge}),task,input,substitute:value=>value.replaceAll('{{user}}','EXPANDED_SOURCE_IS_A_BUG')});
}

test('same-source projection preserves exact raw layout, source metadata and UTF-16 offsets without mutating input',()=>{
 const source=makeSource(raw),before=structuredClone(source),value=archiveSourceView(source),history=value.sourceHistory[0];
 assert.equal(value.archiveSource.text,text);assert.equal(value.archiveSource.time,'2026-10-22 11:20');
 for(const key of ['key','parent','index','floor','role','name'])assert.equal(value.archiveSource[key],before[key]);
 for(const key of ['key','parent','index','floor','role','name','candidate'])assert.equal(history[key],before[key]);
 assert.equal(history.format,'tisya.same-source-history/1');assert.equal(history.projection,'source-reference');assert.equal(own(history,'text'),false);
 assert.deepEqual(history.parts,[
  {start:0,end:prefix.length,text:prefix,evidence:false},
  {start:prefix.length,end:prefix.length+text.length,sourceKey:'raw-source-hash',sourcePath:'archiveSource.text'},
  {start:prefix.length+text.length,end:raw.length,text:suffix,evidence:false},
 ]);
 assert.equal(restoreArchiveSource(history,value.archiveSource),raw);assert.deepEqual(source,before);
 const original={key:source.key,parent:source.parent,index:source.index,floor:source.floor,role:source.role,name:source.name,text:raw,candidate:source.candidate};
 assert(renderModelMaterial([history]).length<renderModelMaterial([original]).length,'projection must save actual sheet characters');
});

test('actual paired archive messages transmit prose once, preserve auxiliary text and keep literal source macros',()=>{
 for(const task of ['tableArchive','historyImport','objectArchive'])for(const native of task==='objectArchive'?[false]:[false,true]){
  const source=makeSource(raw),projection=archiveSourceView(source),input={...projection,registry:defaultRegistry(),currentRows:[],userSource:{role:'user',text:'用户明确设定：岚识得北门守卫。',sources:[{key:'user-source',floor:5,index:2,role:'user',text:'用户明确设定：岚识得北门守卫。'}]},...(native?{nativeBridge:{enabled:true,writer:'native-mvu',nativeOwned:false,archiveAlready:false}}:{})};
  const before=structuredClone(input),messages=materialMessages(task,input,input.nativeBridge),sent=messages.map(row=>row.content).join('\n');
  for(const marker of ['唯一正文哨兵','标题辅助哨兵','面板辅助哨兵','未知块必须保留','变量辅助哨兵'])assert.equal(sent.split(marker).length-1,1,task+'/'+native+'/'+marker);
  assert.doesNotMatch(sent,/EXPANDED_SOURCE_IS_A_BUG/);
  const sentSource=readSlot(messages,'source'),sentHistory=readSlot(messages,'history');
  assert.equal(sentSource.archiveSource.text,text);assert.equal(sentSource.archiveSource.key,'raw-source-hash');assert.equal(sentHistory[0].candidate,2);
  assert.equal(restoreArchiveSource(sentHistory[0],sentSource.archiveSource),raw);
  assert.equal(sentSource.userSource.sources[0].text,'用户明确设定：岚识得北门守卫。');assert.deepEqual(input,before);
  const uncompressed={...input,sourceHistory:[makeSource(raw)]};
  const oldMessages=materialMessages(task,uncompressed,input.nativeBridge);
  assert(sent.length<oldMessages.map(row=>row.content).join('\n').length,'final request must shrink');
 }
});

test('plain prose can be referenced without empty text parts and all unsafe or uneconomic cases retain explicit raw fallback',()=>{
 const only=archiveSourceView(makeSource(text)),history=only.sourceHistory[0];
 assert.equal(history.projection,'source-reference');assert.equal(history.parts.length,1);assert.equal(restoreArchiveSource(history,only.archiveSource),text);
 const cases=[
  ['<body>短。</body>','not-smaller','短。'],
  ['<body><memory>摘要不能当正文</memory></body>','empty-prose',''],
  ['<body>左段<memory>辅助原文</memory>右段</body>','noncontiguous-prose','左段右段'],
  ['<body>'+text+'</body><memory>'+text+'</memory>','ambiguous-prose',text],
 ];
 for(const [original,reason,eligible] of cases){
  const source=makeSource(original),before=structuredClone(source),value=archiveSourceView(source),view=value.sourceHistory[0];
  assert.equal(value.archiveSource.text,eligible);assert.equal(view.projection,'raw-fallback');assert.equal(view.reason,reason);assert.equal(view.text,original);assert.equal(own(view,'parts'),false);assert.equal(restoreArchiveSource(view,value.archiveSource),original);assert.deepEqual(source,before);
 }
});

test('restoring a reference refuses another source key, wrong source path, discontinuous offsets or changed prose length',()=>{
 const value=archiveSourceView(makeSource(raw)),view=value.sourceHistory[0];
 assert.throws(()=>restoreArchiveSource(view,{...value.archiveSource,key:'other-source'}));
 const badPath=structuredClone(view);badPath.parts[1].sourcePath='unprovided.text';assert.throws(()=>restoreArchiveSource(badPath,value.archiveSource));
 const badOffset=structuredClone(view);badOffset.parts[1].start++;assert.throws(()=>restoreArchiveSource(badOffset,value.archiveSource));
 assert.throws(()=>restoreArchiveSource(view,{...value.archiveSource,text:text+'changed'}));
});

test('auxiliary preservation does not grant quotation evidence while eligible original prose still commits',()=>{
 const value=archiveSourceView(makeSource(raw));assert.equal(value.archiveSource.text,archivalText(raw));
 const access={readers:['读者'],knowers:[]},view={registry:defaultRegistry(),rows:[],last:null};
 const proposal=quote=>({changes:[{id:'new:event',table:'events',expected:0,values:{名称:'门的状态',经过:quote},access,evidence:quote}]});
 const options={source:'raw-source-hash',evidence:value.archiveSource.text,allowedTables:['events']};
 assert.equal(prepareCommit(view,proposal('门仍关闭'),options).rows[0].values.经过,'门仍关闭');
 assert.throws(()=>prepareCommit(view,proposal('门已经打开'),options),/连续原文证据/);
 assert.equal(restoreArchiveSource(value.sourceHistory[0],value.archiveSource).includes('门已经打开'),true);
});

test('manual multi-reply import and template initialization retain their untouched complete-history contract',()=>{
 const handwritten='用户定义甲\n<reply><body>第一次抵达。</body><memory>旧汇总保留</memory></reply>\n用户定义乙\n<reply><body>随后归还钥匙。</body><vars>旧命令保留</vars></reply>';
 const manual={historyText:historyEvidence(handwritten),sourceHistory:{text:handwritten,label:'手写历史',worldTime:null},label:'手写历史',worldTime:null,registry:defaultRegistry(),currentRows:[]};
 const sent=materialMessages('historyImport',manual),history=readSlot(sent,'history'),source=readSlot(sent,'source');
 assert.equal(history.text,handwritten);assert.equal(own(history,'projection'),false);
 for(const part of ['用户定义甲','第一次抵达。','用户定义乙','随后归还钥匙。'])assert(source.text.includes(part));
 assert.doesNotMatch(source.text,/旧汇总保留|旧命令保留/);
 const initialization={sourceHistory:[{floor:1,role:'user',text:'开局原始定义'},{floor:2,role:'assistant',text:raw}],registry:defaultRegistry(),currentRows:[]};
 assert.deepEqual(readSlot(materialMessages('templateInit',initialization),'history'),initialization.sourceHistory);
});
