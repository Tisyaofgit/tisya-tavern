import test from 'node:test';
import assert from 'node:assert/strict';
import {limitNativeHistory,selectedHistory,historySignature} from '../config/history-context.js';

const call=(id='a')=>({mes:'查询中',tool_calls:[{id,name:'lookup',parameters:'{}',signature:'opaque',extra_content:{google:{thought_signature:'opaque-native'}}}]});
const result=(id='a')=>({role:'tool',is_system:true,tool_call_id:id,mes:'资料'});
const indexed=rows=>rows.map((row,index)=>({...row,index}));
const projection=(groups)=>chat=>groups.map(indices=>indices.length===1?{type:'message',sourceIndex:indices[0],message:chat[indices[0]]}:{type:'tool-turn',sourceIndices:indices});

test('native cut includes the entire nonadjacent tool group without changing original records',()=>{
 const chat=indexed([{mes:'old'},call(),{is_user:true,mes:'current'},result()]);
 const original=structuredClone(chat),refs=[...chat];let observed;
 const parse=(rows,strip)=>{observed=strip;return projection([[0],[1,3],[2]])(rows);};
 const report=limitNativeHistory(chat,0,'normal',parse);
 assert.equal(observed,false);assert.deepEqual(chat,original.slice(1));assert.equal(chat[0],refs[1]);assert.equal(chat[2],refs[3]);assert.equal(report.retained,1);assert.equal(report.toolTurns,1);
 assert.equal(chat[0].tool_calls[0].extra_content.google.thought_signature,'opaque-native');
});
test('native cut removes a completed older group as a whole and counts only dialogue rows',()=>{
 const chat=indexed([{mes:'old'},call(),result(),{mes:'answer'},{is_user:true,mes:'current'}]);
 const report=limitNativeHistory(chat,1,'normal',projection([[0],[1,2],[3],[4]]));
 assert.deepEqual(chat.map(m=>m.mes),['answer','current']);assert.equal(report.totalBefore,3);assert.equal(report.toolTurns,0);
});
test('legacy group and extension records crossing a cut stay together in physical order',()=>{
 const legacy={is_system:true,is_user:false,mes:'',extra:{tool_invocations:[{id:'a',name:'lookup',parameters:{q:'x'},result:'资料'}]}};
 const chat=indexed([{mes:'old'},{is_user:true,mes:'current'},call(),legacy]);delete chat[3].index;
 const db={is_system:true,mes:'extension'};chat.unshift(db);
 const report=limitNativeHistory(chat,0,'normal',projection([[0],[1],[2],[3,4]]));
 assert.equal(report.toolTurns,1);assert.equal(chat[0],db);assert.deepEqual(chat.slice(1).map(m=>m.mes),['current','查询中','']);
});
test('missing native parser or malformed/incomplete projection cannot partially mutate the send copy',()=>{
 for(const parse of [undefined,()=>{throw Error('unresolved call');},()=>[],()=>[{type:'tool-turn',sourceIndices:[0,0]}],()=>[{type:'tool-turn',sourceIndices:[0,99]}],()=>[{type:'unknown',sourceIndex:0}]]){
  const chat=indexed([call(),result()]),before=structuredClone(chat);
  assert.throws(()=>limitNativeHistory(chat,0,'normal',parse));assert.deepEqual(chat,before);
 }
});
test('managed text compiler refuses selected canonical, legacy or result-only tool records',()=>{
 const world={context:{history:10}};
 for(const chat of [[call(),result()],[{mes:'legacy owner'},{is_user:false,is_system:true,extra:{tool_invocations:[{id:'a'}]}}],[{role:'tool',mes:'result'}]])assert.throws(()=>selectedHistory({chat},world,'normal'),/所选历史包含工具调用/);
 const chat=[call(),result(),{mes:'final prose'},{is_user:true,mes:'current'}];world.context.history=1;
 assert.deepEqual(selectedHistory({chat},world,'normal').map(m=>m.mes),['final prose','current']);
});
test('tool-only changes invalidate history stamps including IDs, result status and opaque signatures',()=>{
 const chat=[call(),result()],stamp=historySignature({chat});
 for(const change of [rows=>rows[0].tool_calls[0].parameters='{"q":1}',rows=>rows[0].tool_calls[0].signature='new',rows=>rows[0].tool_calls[0].extra_content.google.thought_signature='new',rows=>rows[1].tool_call_id='b',rows=>rows[1].error=true,rows=>rows[1].extra={tool_invocations:[]}]){
  const copy=structuredClone(chat);change(copy);assert.notEqual(historySignature({chat:copy}),stamp);
 }
});

test('native ignore marker is excluded from turn counts and participates in the request guard',()=>{
 const ignored={mes:'hidden',extra:{[Symbol.for('ignore')]:true}},chat=indexed([{is_user:true,mes:'current'},ignored]);
 const stamp=historySignature({chat}),report=limitNativeHistory(chat,0);
 assert.equal(report.retained,1);assert.equal(report.currentInput,true);assert.equal(chat.length,2);
 assert.deepEqual(selectedHistory({chat},{context:{history:0}}).map(m=>m.mes),['current']);
 chat[1].extra[Symbol.for('ignore')]=false;assert.notEqual(historySignature({chat}),stamp);
});
