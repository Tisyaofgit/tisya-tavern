import {messageCacheOwner} from './message-cache.js';
import {prepareReaderMessage,readerCacheGeneration} from './reader.js';

// Generation progress belongs to the live reply, not the identity of completed
// messages. A history view can read its cache while another reply is streaming.
export function createMessagePreparation({getScope,getDisplay,getPlayerName,prepare=prepareReaderMessage,getGeneration=readerCacheGeneration}){
 const identity=message=>({scope:getScope(),owner:messageCacheOwner(message),source:message.mes});
 return {
  getCacheKey:message=>JSON.stringify([getScope(),messageCacheOwner(message),message.mes,getDisplay().显示角色心理===true,getPlayerName(),getGeneration()]),
  getStateKey:message=>JSON.stringify([getScope(),messageCacheOwner(message),message.mes]),
  prepareMessage:message=>getScope()==null?null:prepare(identity(message),{showPsychology:getDisplay().显示角色心理===true,playerName:getPlayerName()}),
 };
}
