"use strict";
// Ten-block model wire; adapt once to the existing stored-data schema.
// This is a compatibility view, not a second editable task/audit source.
const bad=c=>{throw Object.assign(Error('TISYA_HANDOFF_'+c),{code:'TISYA_HANDOFF_'+c});};
function toInternal(e){
 const read=n=>{try{return require('./strict-json.cjs').strictJSON(e.blocks[n]);}catch(_){bad('JSON_'+n);}};
 const task=read('task'),next=read('next'),actions=read('actions');
 if((task.audit!==undefined&&(!Array.isArray(task.audit)||task.audit.length))||(next.actions!==undefined&&(!Array.isArray(next.actions)||next.actions.length))||!Array.isArray(next.audit)||!Array.isArray(actions.actions)||Object.keys(actions).join()!=='actions')bad('OWNERSHIP');
 const shape=(name,keys)=>{const a=e.attrs[name];if(!a||Object.keys(a).length!==keys.length||keys.some(k=>!Object.hasOwn(a,k)))bad('ATTR_'+name);};
 shape('task',['format']);shape('next',['format','audit_count']);shape('actions',['format','actions_min','actions_max']);
 if(e.attrs.task.format!=='json'||e.attrs.next.format!=='json'||e.attrs.actions.format!=='json'||e.attrs.next.audit_count!=='7')bad('ATTR_VALUE');
 task.audit=next.audit;delete next.audit;next.actions=actions.actions;
 e.blocks.task=JSON.stringify(task);e.blocks.next=JSON.stringify(next);delete e.blocks.actions;
 e.attrs.task={format:'json',audit_count:'7'};e.attrs.next={format:'json',actions_min:e.attrs.actions.actions_min,actions_max:e.attrs.actions.actions_max};delete e.attrs.actions;
 return e;
}
module.exports={toInternal};
