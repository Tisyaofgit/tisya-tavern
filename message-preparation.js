import {messageCacheOwner} from './message-cache.js';
import {prepareReaderMessage,readerCacheGeneration} from './reader.js';

// Generation progress belongs to the live reply, not the identity of completed
// messages. A history view can read its cache while another reply is streaming.
export function createMessagePreparation({getScope,getDisplay,getPlayerName,prepare=prepareReaderMessage,getGeneration=readerCacheGeneration,stringify=JSON.stringify}){
 // Long reply sources are immutable cache evidence, not something to serialize on
 // every scroll/variable notification. Rebuild a message workspace only when its
 // authoritative identity, source or scope actually changes.
 const workspaces=new WeakMap();
 function workspace(message){
  const scope=getScope(),owner=messageCacheOwner(message),source=message.mes;
  let row=workspaces.get(message);
  if(!row||row.scope!==scope||row.owner!==owner||row.source!==source){
   row={scope,owner,source,stateKey:stringify([scope,owner,source]),cacheKey:null,showPsychology:null,playerName:null,generation:null};
   workspaces.set(message,row);
  }
  return row;
 }
 return {
  getCacheKey(message){
   const row=workspace(message),showPsychology=getDisplay().显示角色心理===true,playerName=getPlayerName(),generation=getGeneration();
   if(row.cacheKey===null||row.showPsychology!==showPsychology||row.playerName!==playerName||row.generation!==generation){
    row.cacheKey=stringify([row.stateKey,showPsychology,playerName,generation]);row.showPsychology=showPsychology;row.playerName=playerName;row.generation=generation;
   }
   return row.cacheKey;
  },
  getStateKey:message=>workspace(message).stateKey,
  prepareMessage(message){const row=workspace(message);return row.scope===null?null:prepare({scope:row.scope,owner:row.owner,source:row.source},{showPsychology:getDisplay().显示角色心理===true,playerName:getPlayerName()});},
 };
}
