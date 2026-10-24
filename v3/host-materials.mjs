import {extractNumberedBody,parseNumberedBody} from './host-runtime.mjs';
const text=value=>typeof value==='string'&&value.trim()?value:undefined;
/** Native opener is quoted card setup; it is never silently renumbered as archived prose. */
export function openingMaterial(context){
 const first=context.chat?.[0];if(!first||first.is_user||first.is_system)return null;
 try{parseNumberedBody(extractNumberedBody(first.mes));return null;}catch(error){if(!['REPLY_FORMAT','UNNUMBERED_BODY','UNNUMBERED_PREFIX','NUMBER_SEQUENCE','EMPTY_BODY','EMPTY_PARAGRAPH','UNNUMBERED_PARAGRAPH','INVALID_NUMBER','UNCLOSED_FENCE'].includes(error.code))throw error;}
 return {kind:'native-character-opening',floor:0,text:String(first.mes??'')};
}
/** Current native character/persona fields are supplied as reference data, not generated facts. */
export function nativeCardMaterial(context){
 const character=context.characters?.[context.characterId],data=character?.data??character??{},profile={kind:'native-character-card'};
 for(const key of ['name','description','personality','scenario','mes_example','system_prompt','post_history_instructions']){const value=text(data[key]??character?.[key]);if(value!==undefined)profile[key]=value;}
 const persona=text(context.powerUserSettings?.persona_description),opening=openingMaterial(context);
 return [Object.keys(profile).length>1?profile:null,persona?{kind:'native-player-persona',name:context.name1??null,description:persona}:null,opening].filter(Boolean);
}
