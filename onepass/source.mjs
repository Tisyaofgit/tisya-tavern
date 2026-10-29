import {xmlTokens} from '../reader-core.js';
export const isOnePassRootId=id=>typeof id==='string'&&/^tisya-onepass-[1-9]\d{0,8}$/.test(id);

// Route by the same root/attribute grammar as the envelope parser. This is
// only protocol selection; the selected parser still validates the full reply.
export function isOnePassReply(source){
 if(typeof source!=='string'||source.length>2000000)return false;
 try{
  for(const token of xmlTokens(source)){
   if(token.kind==='comment'||token.kind==='text'&&!token.value.trim())continue;
   return token.kind==='open'&&token.name==='reply'&&isOnePassRootId(token.attrs.id);
  }
 }catch{}
 return false;
}
// Native card rendering may append its status marker after GENERATION_ENDED.
// The display suffix is not a narrative edit or a new selected candidate.
export function onePassStoryText(value){
 const text=String(value??'');if(!isOnePassReply(text))return text;
 const ending=/<\/reply>\s*(?:<StatusPlaceHolderImpl\s*\/>\s*)?$/.exec(text);
 return ending?text.slice(0,ending.index+8):text;
}
