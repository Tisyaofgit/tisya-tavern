import {xmlTokens} from './reader-core.js';

const fail=()=>{throw Object.assign(Error('TISYA_DISPLAY_START_BOUNDARY'),{code:'TISYA_DISPLAY_START_BOUNDARY'});};
// Historical responses sometimes contain the card's empty opening trigger
// immediately before a complete reply. This adapter is exclusively for reading:
// strict settlement, native MVU and the stored message keep the original bytes.
// Never search arbitrary prose for a reply or silently discard unknown suffixes.
export function displayStartReplySource(source){
 if(typeof source!=='string'||source.length>2000000)return source;
 const prefix=/^\s*<start>\s*<\/start>\s*(?=<reply\b)/.exec(source);
 if(!prefix)return source;
 const reading=source.slice(prefix[0].length),stack=[];let opened=false,closed=false;
 try{
  for(const token of xmlTokens(reading)){
   if(token.kind==='open'){
    if(closed||!stack.length&&(opened||token.name!=='reply'||token.selfClose)||stack.length&&token.name==='reply')fail();
    opened=true;if(!token.selfClose)stack.push(token.name);
   }else if(token.kind==='close'){
    if(stack.pop()!==token.name)fail();if(!stack.length)closed=true;
   }else if(!stack.length&&(token.kind!=='text'||token.cdata||token.value.trim()))fail();
  }
 }catch{fail();}
 if(!opened||!closed||stack.length)fail();
 return reading;
}
