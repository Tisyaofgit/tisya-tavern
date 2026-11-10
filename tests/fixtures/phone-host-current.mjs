import {readFileSync} from 'node:fs';
import {createMatrixHost} from '../../engine/host.mjs';
import {Runtime} from '../../engine/runtime.mjs';
import {chatKey} from '../../engine/controller.mjs';
import {createPhoneDatabaseStorage,decodePhoneDatabase} from '../../engine/phone-database.mjs';
import {installPhoneClock,installPhoneIdentities} from './phone-current.mjs';

const catalog=JSON.parse(readFileSync(new URL('../../engine/catalog.json',import.meta.url),'utf8'));
export function matrixMemoryStorage({onWrite=async()=>{}}={}){
 const records=new Map();
 return {get:async id=>structuredClone(records.get(id)),set:async(id,value)=>{await onWrite();records.set(id,structuredClone(value));},commit:async(id,revision,value)=>{if((records.get(id)?.local_revision??0)!==revision)return false;await onWrite();records.set(id,structuredClone(value));return true;}};
}
export async function currentPhoneHost({context,getContext=()=>context,storage=matrixMemoryStorage(),profile,persistMetadata=async()=>true}={}){
 context.extensionSettings??={};context.chatMetadata??={};context.saveChat??=async()=>true;
 const host=createMatrixHost({getContext,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistMetadata,persistSettings:async()=>true});
 await host.ensureDatabase();
 if(profile){
  const before=await host.readDatabase(),rt=new Runtime(before.state),world=profile.world.id;
  if(!rt.data.tables.T_STATIC_WORLDS?.[world]){
   rt.newRecord('T_STATIC_WORLDS',{name:profile.world.name},world);installPhoneClock(rt,profile);
   // Normalized account person references are canonical entity IDs, including
   // NPCs. Register those identities without inventing names from handles.
   installPhoneIdentities(rt,profile);
   const changes=[];for(const [tableId,rows] of Object.entries(rt.data.tables))for(const [recordId,row] of Object.entries(rows))if(!before.state.tables?.[tableId]?.[recordId])changes.push({tableId,recordId,values:Object.fromEntries(Object.entries(row.values).filter(([key])=>key!=='row_uuid'))});
   await host.commitDatabase({contextKey:before.contextKey,expectedRevision:before.revision,operationId:'fixture-world:'+world,changes});
  }
 }
 const key=chatKey(context);
 return {host,storage,phoneStorage:createPhoneDatabaseStorage({database:host.createPhoneDatabaseBridge(),contextKey:key}),read:async()=>decodePhoneDatabase((await host.readDatabase()).state,{contextKey:key}),snapshot:()=>host.readDatabase()};
}
