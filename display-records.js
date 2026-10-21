// A card's public display does not consume narrative records. Validate every
// permission row independently, while leaving malformed event/state records to
// the journey reader, which still reports their original errors. This is a
// parsing view only: regexes and native state writers retain the original text.
const labels=new Set(['关联','权限','未完','倒计时','条件','失效','事件','场景','原文','结果','影响','伏笔','认知','心理','变动','变因','标签']);
const fail=code=>{throw Object.assign(Error(code),{code});};
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function displayRecordSource(source,xmlTokens,records){
 const stack=[],slots=[];let current=null;
 for(const t of xmlTokens(source)){
  if(t.kind==='comment'&&/填写|占位/.test(t.value))fail('TISHA_OUTPUT_PLACEHOLDER');
  if(t.kind==='open'){
   if(current)fail('TISHA_OUTPUT_NESTED_BLOCK_'+current.name.toUpperCase());
   if(stack.length===1&&['status','memory'].includes(t.name)&&!t.selfClose){current={name:t.name,attrs:t.attrs,start:t.end,text:''};slots.push(current);}
   if(!t.selfClose)stack.push(t.name);
  }else if(t.kind==='close'){
   if(stack.at(-1)!==t.name)fail('TISHA_OUTPUT_XML_CLOSE');
   if(current&&stack.length===2){current.end=t.start;current=null;}
   stack.pop();
  }else if(current&&t.kind==='text')current.text+=t.value;
 }
 if(stack.length)fail('TISHA_OUTPUT_INCOMPLETE');
 const memory=slots.filter(s=>s.name==='memory');
 if(memory.length!==1||memory[0].attrs.format!=='pipes')return source;
 const kept=[];let event=false;
 for(const line of memory[0].text.split(/\r?\n/).filter(x=>x.trim())){
  const [row]=records(line);
  if(!labels.has(row.name))fail('TISYA_DISPLAY_MEMORY_LABEL');
  if(row.name==='事件')event=true;
  if(row.name==='权限'){
   // A misplaced or malformed permission is not silently upgraded to a grant.
   if(event)fail('TISYA_DISPLAY_ACL_ORDER');
   kept.push(line);
  }
 }
 for(const slot of slots.reverse()){
  if(slot.name==='status'&&!['pipes',undefined].includes(slot.attrs.format))continue;
  const text=slot.name==='memory'?escape(kept.join('\n')):'';
  source=source.slice(0,slot.start)+text+source.slice(slot.end);
 }
 return source;
}
