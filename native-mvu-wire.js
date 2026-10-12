// Read-only view of the original card's update block. Native MVU consumes the
// unchanged message. No operation is applied by this module.
export function nativeVarsJSON(text,parse){
 if(!text.trim().startsWith('<UpdateVariable>'))return text;
 const match=/^\s*<UpdateVariable>\s*(?:<Analysis>[\s\S]*?<\/Analysis>\s*)?<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>\s*<\/UpdateVariable>\s*$/.exec(text);
 if(!match)throw Object.assign(Error('TISYA_NATIVE_MVU_FORMAT'),{code:'TISYA_NATIVE_MVU_FORMAT'});
 const rows=parse(match[1]);
 if(!Array.isArray(rows)||rows.some(x=>!x||typeof x!=='object'||Array.isArray(x)||!['replace','delta','insert','add','remove','move'].includes(x.op)))throw Object.assign(Error('TISYA_NATIVE_MVU_FORMAT'),{code:'TISYA_NATIVE_MVU_FORMAT'});
 return JSON.stringify({protocol:'mvu-json-patch',operations:rows.map(row=>row.op==='move'&&row.to!==undefined?{...row,path:row.to}:row)});
}

// Historical native cards put one update after </reply>. Read it through the
// empty vars slot only; never modify mes, merge two updates, or apply a patch.
export function nativeUpdateTail(source,xmlTokens,parse){
 if(typeof source!=='string'||!/^\s*<reply\b/.test(source)||!source.includes('<UpdateVariable>'))return source;
 let depth=0,end=-1,vars=null;
 for(const t of xmlTokens(source)){
  if(t.kind==='open'){
   if(depth===1&&t.name==='vars')vars={start:t.start,openEnd:t.end,end:t.selfClose?t.end:null,empty:t.selfClose};
   if(!t.selfClose)depth++;
  }else if(t.kind==='close'){
   if(depth===2&&t.name==='vars'&&vars){vars.end=t.end;vars.empty=!source.slice(vars.openEnd,t.start).trim();}
   depth--;if(depth===0&&t.name==='reply'){end=t.end;break;}
  }
 }
 if(end<0||!vars?.empty||vars.end===null)return source;
 const tail=source.slice(end),marker=/<StatusPlaceHolderImpl\s*\/>\s*$/.exec(tail),update=(marker?tail.slice(0,marker.index):tail).trim();
 if(!update.startsWith('<UpdateVariable>'))return source;
 nativeVarsJSON(update,parse); // A malformed, duplicate or unknown payload fails visibly.
 return source.slice(0,vars.start)+'<vars format="xml">'+update+'</vars>'+source.slice(vars.end,end)+(marker?'\n'+marker[0]:'');
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

// Unknown native protocols stay opaque: retain source for its own writer,
// report the boundary, and never fabricate operations or execute code.
export function sourceVarsJSON(text,parse){
 const value=text.trim();if(!value)return text;
 if(/^<UpdateVariable>/.test(value)&&/<JSONPatch>/.test(value))return nativeVarsJSON(value,parse);
 if(value.startsWith('<')||/^_\.[a-zA-Z]+\(/.test(value))return JSON.stringify({protocol:'external-native',opaque:true,source:value});
 return text;
}
