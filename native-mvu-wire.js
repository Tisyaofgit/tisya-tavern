// Read-only view of the original card's update block. Native MVU consumes the
// unchanged message. No operation is applied by this module.
export function nativeVarsJSON(text,parse){
 if(!text.trim().startsWith('<UpdateVariable>'))return text;
 const match=/^\s*<UpdateVariable>\s*<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>\s*<\/UpdateVariable>\s*$/.exec(text);
 if(!match)throw Object.assign(Error('TISYA_NATIVE_MVU_FORMAT'),{code:'TISYA_NATIVE_MVU_FORMAT'});
 const rows=parse(match[1]);
 if(!Array.isArray(rows)||rows.some(x=>!x||typeof x!=='object'||Array.isArray(x)||!['replace','delta','insert','remove','move'].includes(x.op)))throw Object.assign(Error('TISYA_NATIVE_MVU_FORMAT'),{code:'TISYA_NATIVE_MVU_FORMAT'});
 return JSON.stringify({protocol:'mvu-json-patch',operations:rows.map(row=>row.op==='move'&&row.to!==undefined?{...row,path:row.to}:row)});
}

// MVU appends its status marker after rendering a reply. It is a native display
// attachment, never a second reply or a state operation. Preserve it only as an
// extra component in the parsing view; reject arbitrary trailing text normally.
export function nativeStatusTail(source,xmlTokens){
 if(typeof source!=='string'||!/<StatusPlaceHolderImpl\s*\/>\s*$/.test(source))return source;
 let depth=0,end=-1,extra=null;
 for(const t of xmlTokens(source)){
  if(t.kind==='open'){
   if(depth===1&&t.name==='extra')extra={start:t.start,end:t.end,selfClose:t.selfClose};
   if(!t.selfClose)depth++;
  }else if(t.kind==='close'){
   if(depth===2&&t.name==='extra'&&extra)extra.close=t.start;
   depth--;if(depth===0&&t.name==='reply'){end=t.end;break;}
  }
 }
 if(end<0||!extra||!/^\s*<StatusPlaceHolderImpl\s*\/>\s*$/.test(source.slice(end)))return source;
 const head=source.slice(0,end);if(head.includes('<StatusPlaceHolderImpl/>'))return head;
 return extra.selfClose?head.slice(0,extra.start)+'<extra><StatusPlaceHolderImpl/></extra>'+head.slice(extra.end):head.slice(0,extra.close)+'<StatusPlaceHolderImpl/>'+head.slice(extra.close);
}
