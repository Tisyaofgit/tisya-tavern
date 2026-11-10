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
   if(depth===2&&extra&&!extra.selfClose&&extra.close===undefined&&t.name==='StatusPlaceHolderImpl'&&t.selfClose&&Object.keys(t.attrs).length===0)extra.marker=true;
   if(!t.selfClose)depth++;
  }else if(t.kind==='close'){
   if(depth===2&&t.name==='extra'&&extra)extra.close=t.start;
   depth--;if(depth===0&&t.name==='reply'){end=t.end;break;}
  }
 }
 if(end<0||!extra||!/^\s*<StatusPlaceHolderImpl\s*\/>\s*$/.test(source.slice(end)))return source;
 const head=source.slice(0,end);if(extra.marker)return head;
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

// Locate a machine/attachment block through XML tokens so a closing tag inside
// JSON or CDATA cannot terminate its surrounding protocol slot.
export function opaqueBlockEnd(source,start,xmlTokens){
 const prefix='<reply>',stack=[];
 for(const t of xmlTokens(prefix+source.slice(start),{literalAmpersands:true})){
  if(t.kind==='open'){if(!t.selfClose)stack.push(t.name);}
  else if(t.kind==='close'){
   if(stack.at(-1)?.toLowerCase()!==t.name.toLowerCase())return null;
   if(stack.length===2)return {index:start+t.start-prefix.length,end:start+t.end-prefix.length};
   stack.pop();
  }
 }
 return null;
}

// The current reply groups attachments and machine slots in extra. Existing
// consumers still receive their one canonical cells/vars slot in a read-only
// projection. Source bytes, receipts and the native writer are untouched.
export function groupedExtraSlots(source,xmlTokens,names={cells:'cells',vars:'vars'}){
 if(typeof source!=='string'||!/^\s*<reply\b/.test(source))return source;
 const machine=new Map([['cells','cells'],['vars','vars'],[names.cells,'cells'],[names.vars,'vars']]),stack=[],nested=[],outer=new Set();let extra=null,active=null;
 const bad=code=>{throw Object.assign(Error(code),{code});};
 for(const t of xmlTokens(source,{literalAmpersands:true})){
  if(t.kind==='open'){
   const key=machine.get(t.name);
   if(stack.length===1&&key)outer.add(key);
   if(stack.length===1&&t.name==='extra')extra={end:t.selfClose?t.end:null};
   if(stack[1]==='extra'&&key&&!active){
    if(stack.length!==2)bad('REPLY_MACHINE_NESTING');
    if(nested.some(n=>n.key===key))bad('REPLY_DUPLICATE_BLOCK');
    active={key,name:t.name,start:t.start,openEnd:t.end,selfClose:t.selfClose};nested.push(active);
    if(t.selfClose){active.end=t.end;active=null;}
   }
   if(!t.selfClose)stack.push(t.name);
  }else if(t.kind==='close'){
   if(stack.at(-1)!==t.name)bad('REPLY_BLOCK');
   if(active&&stack.length===3){active.close=t.start;active.end=t.end;active=null;}
   if(stack.length===2&&t.name==='extra'&&extra)extra.end=t.end;
   stack.pop();if(!stack.length)break;
  }
 }
 if(!nested.length)return source;
 if(!extra?.end||active||nested.some(n=>!n.end))bad('REPLY_BLOCK');
 if(nested.some(n=>outer.has(n.key)))bad('REPLY_DUPLICATE_BLOCK');
 const canonical=n=>source.slice(n.start,n.end).replace(new RegExp('^<'+n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=[\\s/>])'),'<'+n.key).replace(new RegExp('</'+n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*>$'),'</'+n.key+'>');
 const edits=[[extra.end,extra.end,nested.sort((a,b)=>a.key==='cells'?-1:b.key==='cells'?1:0).map(canonical).join('\n')],...nested.map(n=>[n.start,n.end,''])];
 for(const [a,b,value]of edits.sort((x,y)=>y[0]-x[0]))source=source.slice(0,a)+value+source.slice(b);
 return source;
}

// Native display attachments can precede or follow an update. Strip only
// recognized direct attachments from the reading copy, then validate the whole
// remaining update. JSON strings and nested CDATA data are never treated as UI.
function nativeDisplayParts(text,xmlTokens,parse){
 const prefix='<reply><vars>',wrap=value=>prefix+value+'</vars></reply>';
 let stack=[],edits=[];
 for(const t of xmlTokens(wrap(text),{literalAmpersands:true})){
  if(t.kind==='open'){if(!t.selfClose)stack.push(t.name);}
  else if(t.kind==='close')stack.pop();
  else if(t.kind==='text'&&t.cdata&&stack.length===2)edits.push([t.start-prefix.length,t.end-prefix.length,t.value]);
 }
 for(const [a,b,value]of edits.reverse())text=text.slice(0,a)+value+text.slice(b);
 const attachments=[];let active=null;stack=[];
 for(const t of xmlTokens(wrap(text),{literalAmpersands:true})){
  if(t.kind==='open'){
   if(stack.length===2&&Object.keys(t.attrs).length===0&&(t.name==='combat_driver'||t.name==='StatusPlaceHolderImpl'&&t.selfClose)){
    active={name:t.name,start:t.start-prefix.length};attachments.push(active);if(t.selfClose){active.end=t.end-prefix.length;active=null;}
   }
   if(!t.selfClose)stack.push(t.name);
  }else if(t.kind==='close'){
   if(stack.at(-1)!==t.name)throw Object.assign(Error('TISYA_NATIVE_MVU_FORMAT'),{code:'TISYA_NATIVE_MVU_FORMAT'});
   if(active&&stack.length===3){active.end=t.end-prefix.length;active=null;}
   stack.pop();
  }
 }
 const markers=attachments.filter(a=>a.name==='StatusPlaceHolderImpl');if(!markers.length)return null;
 if(markers.length!==1||attachments.some(a=>!a.end))throw Object.assign(Error('TISYA_NATIVE_MVU_FORMAT'),{code:'TISYA_NATIVE_MVU_FORMAT'});
 const display=attachments.map(a=>({name:a.name,raw:a.name==='StatusPlaceHolderImpl'?'<StatusPlaceHolderImpl/>':text.slice(a.start,a.end)}));let update=text;
 for(const a of [...attachments].reverse())update=update.slice(0,a.start)+update.slice(a.end);
 if(!update.trim().startsWith('<UpdateVariable>'))throw Object.assign(Error('TISYA_NATIVE_MVU_FORMAT'),{code:'TISYA_NATIVE_MVU_FORMAT'});
 nativeVarsJSON(update,parse);
 return {update,display};
}
export function nativeStatusInVars(source,xmlTokens,parse){
 if(typeof source!=='string'||!/^\s*<reply\b/.test(source)||!source.includes('StatusPlaceHolderImpl'))return source;
 const stack=[],slots=[];let slot=null,extra=null;
 for(const t of xmlTokens(source,{literalAmpersands:true})){
  if(t.kind==='open'){
   if(stack.length===1&&t.name==='vars'){slot={start:t.end,end:t.selfClose?t.end:null};slots.push(slot);if(t.selfClose)slot=null;}
   if(stack.length===1&&t.name==='extra')extra={start:t.start,end:t.end,selfClose:t.selfClose};
   if(extra&&stack.length===2&&stack[1]==='extra'&&t.name==='StatusPlaceHolderImpl'&&t.selfClose&&Object.keys(t.attrs).length===0)extra.marker=true;
   if(!t.selfClose)stack.push(t.name);
  }else if(t.kind==='close'){
   if(stack.length===2&&t.name==='extra'&&extra)extra.close=t.start;
   if(stack.length===2&&t.name==='vars'&&slot){slot.end=t.start;slot=null;}
   stack.pop();if(!stack.length)break;
  }
 }
 if(slots.length!==1||!extra||slots[0].end===null)return source;
 const current=slots[0],parts=nativeDisplayParts(source.slice(current.start,current.end),xmlTokens,parse);if(!parts)return source;
 const display=parts.display.filter(p=>p.name!=='StatusPlaceHolderImpl'||!extra.marker).map(p=>p.raw).join('\n');
 const edits=[[current.start,current.end,parts.update]];
 if(display)edits.push(extra.selfClose?[extra.start,extra.end,'<extra>\n'+display+'\n</extra>']:[extra.close,extra.close,'\n'+display+'\n']);
 for(const [a,b,value]of edits.sort((x,y)=>y[0]-x[0]))source=source.slice(0,a)+value+source.slice(b);
 return source;
}
