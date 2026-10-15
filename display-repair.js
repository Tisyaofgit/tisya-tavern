// Narrow read-only compatibility for a common generated closing-block typo.
// Never unescape prose, code, CDATA, variables or stored chat. Strict request
// verification and state settlement continue to consume the original bytes.
export function displayReplySource(source){
 if(typeof source!=='string')return source;
 const memoryEnd=source.lastIndexOf('</memory>');if(memoryEnd<0)return source;
 const tail=source.slice(memoryEnd+9);
 const match=/^(\s*(?:\\n\s*)?)<actions((?:\s+[a-z_]+=(?:\\"[^"<>\\]*\\"|"[^"<>]*"))+)\s*>/.exec(tail);
 if(!match||!match[2].includes('\\"'))return source;
 const attrs=match[2].replace(/\\"/g,'"');
 if(!/^\s*format="pipes"(?:\s+actions_min="\d+")?(?:\s+actions_max="\d+")?\s*$/.test(attrs))return source;
 if(!/<\/actions>\s*<\/reply>\s*$/.test(tail))return source;
 return source.slice(0,memoryEnd+9)+match[1].replace(/\\n/g,'\n')+'<actions'+attrs+'>'+tail.slice(match[0].length);
}
