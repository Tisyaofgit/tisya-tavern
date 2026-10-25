import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceChain,HOST_META} from '../../../v3/host-sources.mjs';
import {createInitialState,tableRegistry,sha256Utf16} from '../../../v3/host-runtime.mjs';

const copy=structuredClone;
function fixture({runtime=null,defer=false}={}){
 let context={chat:[{is_user:true,mes:'继续。'},{is_user:false,mes:'旧正文',swipe_id:0,swipes:['旧正文'],extra:{}}],chatMetadata:{}},disk=copy(context),failSave=false;
 const writes=[],rollbacks=[],identity=floor=>({chatId:'chat',branchId:'branch',messageId:'m'+floor});
 const system={identities:{sync:async()=>({chatId:'chat',branchId:'branch',order:context.chat.map((_,i)=>'m'+i)}),resolve:async floor=>identity(floor)},originals:{entryIdFor:async id=>'original:'+id.messageId,listMetadata:async()=>[],metadata:async()=>{throw Object.assign(Error('missing'),{code:'SOURCE_NOT_FOUND'});}},storage:{read:async()=>createInitialState({registry:tableRegistry})}};
 const chain=createSourceChain({getContext:()=>context,system,getNative:()=>runtime,configuration:()=>({}),guard:()=>{},deferMetadata:rollback=>{if(!defer)return false;rollbacks.push(rollback);return true;},persist:async({nativeMessagesChanged=false}={})=>{writes.push({nativeMessagesChanged,context:copy(context)});if(failSave)throw Error('native persistence failed');disk={...disk,chatMetadata:copy(context.chatMetadata),...(nativeMessagesChanged?{chat:copy(context.chat)}:{})};}});
 return {chain,writes,rollbacks,identity,get context(){return context;},get disk(){return disk;},failSave(value){failSave=value;},switchContext(){context={chat:[],chatMetadata:{foreign:true}};}};
}

test('changed source indexes commit metadata only, unchanged refresh is a no-op, and failure can retry',async()=>{
 const f=fixture();await f.chain.refresh();assert.deepEqual(f.writes.map(row=>row.nativeMessagesChanged),[false]);const before=copy(f.context.chatMetadata);
 await f.chain.refresh();assert.equal(f.writes.length,1);f.context.chat[0].mes='宿主尚未另行保存的改稿';f.failSave(true);await assert.rejects(f.chain.refresh(),/native persistence failed/);assert.deepEqual(f.context.chatMetadata,before);
 f.failSave(false);await f.chain.refresh();assert.deepEqual(f.writes.map(row=>row.nativeMessagesChanged),[false,false,false]);assert.equal(f.disk.chat[0].mes,'继续。');assert.deepEqual(f.disk.chatMetadata,f.context.chatMetadata);
});

test('build records pending historical diagnostics through metadata only',async()=>{
 const f=fixture();f.context.chat[1].mes='</think><body>旧控制片段</body>';
 const input=await f.chain.build({requestKey:'diagnostic',standalone:true});assert.equal(input.archiveSources.length,0);assert.equal(f.writes.length,1);assert.equal(f.writes[0].nativeMessagesChanged,false);assert.equal(f.disk.chatMetadata[HOST_META].sourceDiagnostics[0].status,'pending');assert.equal(f.disk.chat[1].mes,'旧正文');
});

test('output plus deferred source refresh commits complete native content and metadata together once',async()=>{
 const f=fixture({defer:true});f.context.chat[1]={...f.context.chat[1],mes:'新正文',swipe_id:1,swipes:['旧正文','新正文'],extra:{variables:{value:7}}};
 await f.chain.recordOutput({floor:1,requestKey:'writer',beforePersist:()=>f.chain.refresh()});
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].nativeMessagesChanged,true);assert.deepEqual(f.disk.chat,f.context.chat);assert.deepEqual(f.disk.chatMetadata,f.context.chatMetadata);
 assert(Object.values(f.disk.chatMetadata[HOST_META].outputs).some(row=>row.requestKey==='writer'));assert(f.disk.chatMetadata[HOST_META].active.includes('request:writer'));assert.equal(f.rollbacks.length,1);
});

for(const phase of ['callback','persist'])test('failed output '+phase+' restores its prior output entry and propagates failure',async()=>{
 const f=fixture({defer:true}),hash=await sha256Utf16(f.context.chat[1].mes),key='m1:'+hash;
 f.context.chatMetadata[HOST_META]={schema:'tisya.host-sources/1',outputs:{[key]:{requestKey:'prior'},unrelated:{requestKey:'keep'}},active:[]};const before=copy(f.context.chatMetadata[HOST_META]);
 f.failSave(phase==='persist');await assert.rejects(f.chain.recordOutput({floor:1,requestKey:'new',beforePersist:async()=>{await f.chain.refresh();if(phase==='callback')throw Error('callback failed');}}),phase==='callback'?/callback failed/:/native persistence failed/);
 for(const rollback of f.rollbacks.reverse())rollback();assert.deepEqual(f.context.chatMetadata[HOST_META],before);assert.equal(f.writes.length,phase==='callback'?0:1);assert.equal(f.disk.chat[1].mes,'旧正文');
});

test('output rollback never changes another entry or a newly opened chat',async()=>{
 const f=fixture();await assert.rejects(f.chain.recordOutput({floor:1,requestKey:'new',beforePersist:()=>{const outputs=f.context.chatMetadata[HOST_META].outputs;outputs.unrelated={requestKey:'other'};throw Error('stop');}}),/stop/);assert.deepEqual(f.context.chatMetadata[HOST_META].outputs,{unrelated:{requestKey:'other'}});
 await assert.rejects(f.chain.recordOutput({floor:1,requestKey:'new',beforePersist:()=>{f.switchContext();throw Error('switch');}}),/switch/);assert.deepEqual(f.context.chatMetadata,{foreign:true});
});

test('MVU message restoration bypasses deferred metadata and requires native content persistence',async()=>{
 let f;const snapshots=new Map([[0,{stat_data:{energy:4}}],[1,{stat_data:{energy:2}}]]),runtime={getMvuData:({message_id})=>copy(snapshots.get(message_id)),replaceMvuData:async(value,{message_id})=>{snapshots.set(message_id,copy(value));f.context.chat[message_id].extra.variables=copy(value.stat_data);}};
 f=fixture({runtime,defer:true});await f.chain.invalidate({reason:'edit',identity:f.identity(1),fromFloor:1,id:'edit'});
 assert.equal(f.rollbacks.length,0);assert.equal(f.writes.length,1);assert.equal(f.writes[0].nativeMessagesChanged,true);assert.deepEqual(f.disk.chat[1].extra.variables,{energy:4});
});
