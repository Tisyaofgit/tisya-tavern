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

// Some native templates append their display marker to the update component,
// including inside CDATA. Move only that exact terminal marker in the reading
// copy. Validate the complete update first; JSON string literals, arbitrary
// tails, duplicate updates and malformed payloads are never repaired here.
export function nativeStatusInVars(source,xmlTokens,parse){
 if(typeof source!=='string'||!/^\s*<reply\b/.test(source)||!source.includes('StatusPlaceHolderImpl'))return source;
 const stack=[],slots=[];let slot=null,extra=null;
 for(const t of xmlTokens(source)){
  if(t.kind==='open'){
   if(stack.length===1&&t.name==='vars'){slot={text:'',marker:null};slots.push(slot);}
   else if(slot){
    const raw=source.slice(t.start,t.end),offset=slot.text.length;slot.text+=raw;
    if(stack.length===2&&t.name==='StatusPlaceHolderImpl'&&t.selfClose&&Object.keys(t.attrs).length===0)slot.marker={start:t.start,end:t.end,offset};
   }
   if(stack.length===1&&t.name==='extra')extra={start:t.start,end:t.end,selfClose:t.selfClose};
   if(!t.selfClose)stack.push(t.name);else if(stack.length===1&&t.name==='vars')slot=null;
  }else if(t.kind==='close'){
   if(stack.length===2&&t.name==='extra'&&extra)extra.close=t.start;
   if(stack.length===2&&t.name==='vars')slot=null;
   else if(slot)slot.text+=source.slice(t.start,t.end);
   stack.pop();
  }else if(slot){
   const offset=slot.text.length;slot.text+=t.kind==='text'?t.value:source.slice(t.start,t.end);
   if(t.kind==='text'&&t.cdata&&stack.length===2){
    const m=/<StatusPlaceHolderImpl\s*\/>\s*$/.exec(t.value);
    if(m)slot.marker={start:t.start+9+m.index,end:t.start+9+m.index+m[0].trimEnd().length,offset:offset+m.index};
   }
  }
 }
 if(slots.length!==1||!extra||!slots[0].marker)return source;
 const {text,marker}=slots[0];
 if(!/^<StatusPlaceHolderImpl\s*\/>\s*$/.test(text.slice(marker.offset)))return source;
 const update=text.slice(0,marker.offset);
 if(!update.trim().startsWith('<UpdateVariable>'))return source;
 nativeVarsJSON(update,parse);
 const replacement=extra.selfClose?'<extra><StatusPlaceHolderImpl/></extra>':'<StatusPlaceHolderImpl/>';
 const edits=[[marker.start,marker.end,''],[extra.selfClose?extra.start:extra.close,extra.selfClose?extra.end:extra.close,replacement]];
 for(const [start,end,value]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+value+source.slice(end);
 return source;
}
