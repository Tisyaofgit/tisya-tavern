// Scope identities are exact host IDs. Labels and partial string matches never
// activate a preference in a different persona, card, world or chat.
export function preferenceMatches(row,{context={},world={},persona=null,binding=null}={}){
 const scope=row?.values?.作用域;if(!scope)return true;
 const identities={用户角色:[persona?.id,...(binding?.state==='bound'&&binding.personaId===persona?.id?[binding.objectId]:[])],角色卡:[context.characters?.[context.characterId]?.avatar],世界:[world.key],会话:[context.chatId]};
 for(const [key,values]of Object.entries(identities)){const required=scope[key];if(required!==undefined&&(!Array.isArray(required)||required.length&&!required.some(id=>typeof id==='string'&&id&&values.includes(id))))return false;}
 return true;
}
