import test from 'node:test';
import assert from 'node:assert/strict';
import {installV3Host} from '../../../v3/host.mjs';

async function fixture({binding={pointer:null,binding:null},bindingError=null,managedSources=false,localPointer=false,noDelete=false,failSave=false}={}){
 const context={chat:[{is_user:false,mes:'原卡开场'},{is_user:true,mes:'删除这一条'},{is_user:false,mes:'保留回复'}],chatMetadata:managedSources?{tisya_v3_host:{schema:'tisya.host-sources/1',outputs:{},active:['original:known:1']}}:{},eventTypes:{},eventSource:{on(){},removeListener(){}}};
 if(localPointer)context.chatMetadata.tisya_v3_books={archiveId:'unsaved-local-binding'};
 let saved={chat:structuredClone(context.chat),metadata:structuredClone(context.chatMetadata)},deletions=0,configReads=0;
 context.saveChat=async()=>{if(failSave&&context.chat.length===2)throw Error('native save failed');saved={chat:structuredClone(context.chat),metadata:structuredClone(context.chatMetadata)};};
 const handle=()=>({stableId:async()=> 'native-chat',metadata:{get:async()=>structuredClone(saved.metadata)}});
 const target={__TAURITAVERN__:{api:{chat:{current:{handle}}}}};
 const configError=()=>{configReads++;throw Object.assign(Error('请先选择全局基点并载入配置'),{code:'CONFIGURATION_NOT_READY'});};
 const api=await installV3Host({target,getContext:()=>context,bookManager:{binding:async()=>{if(bindingError)throw Object.assign(Error('binding damaged'),{code:bindingError});return structuredClone(binding);},readRuntime:async()=>assert.fail('Unbound native deletion must not load the model/archive runtime')},readConfiguration:configError,getConfigurationSnapshot:configError,resolveConnection:async()=>assert.fail('No connection is needed'),selectedMaterials:async()=>[],onError:()=>{},native:{script:{saveReply:async()=>{},swipe:async()=>{},deleteMessage:async floor=>{deletions++;if(!noDelete)context.chat.splice(floor,1);},deleteSwipe:async()=>{},hydrateChatMessageSwipes:async()=>{},isGenerating:()=>false},bookmarks:{branchChat:async()=>{}}}});
 return {api,context,saved:()=>saved,deletions:()=>deletions,configReads:()=>configReads};
}

test('unmanaged native deletion works without global configuration and confirms its saved identity',async()=>{
 const f=await fixture();try{
  const result=await f.api.deleteFloor({floor:1});assert.equal(result.managed,false);assert.equal(f.configReads(),0);assert.equal(f.deletions(),1);
  assert.deepEqual(f.context.chat.map(m=>m.mes),['原卡开场','保留回复']);assert.deepEqual(f.saved().chat.map(m=>m.mes),['原卡开场','保留回复']);
  assert(f.saved().metadata.tisya_w24.tombstones[result.identity.messageId]);assert.equal(f.api.busy(),false);
 }finally{f.api.dispose();}
});

test('known or damaged managed bindings never fall back to untracked native deletion',async()=>{
 for(const options of [{binding:{pointer:{archiveId:'known'},binding:{revision:1}}},{bindingError:'BINDING_INCOMPLETE'},{managedSources:true},{localPointer:true}]){
  const f=await fixture(options);try{await assert.rejects(f.api.deleteFloor({floor:1}),error=>['CONFIGURATION_NOT_READY','BINDING_INCOMPLETE'].includes(error.code));assert.equal(f.deletions(),0);assert.equal(f.context.chat.length,3);assert.equal(f.api.busy(),false);}finally{f.api.dispose();}
 }
});

test('unmanaged deletion still rejects missing native effects and failed persistence',async()=>{
 const absent=await fixture({noDelete:true});try{await assert.rejects(absent.api.deleteFloor({floor:1}),{code:'DELETE_READBACK'});assert.equal(absent.context.chat.length,3);}finally{absent.api.dispose();}
 const failed=await fixture({failSave:true});try{await assert.rejects(failed.api.deleteFloor({floor:1}),/native save failed/);assert.equal(failed.context.chat.length,2);assert.equal(failed.saved().chat.length,3);assert.equal(failed.api.busy(),false);}finally{failed.api.dispose();}
});
