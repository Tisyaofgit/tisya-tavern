// Seven-block narrative replies. Tables own state and history; this adapter
// creates a read-only view, never replacement memory or persistence receipts.
export const FORM_REPLY_ORDER=Object.freeze(['task','title','body','next','extra','vars','actions']);
export const FORM_REFERENCE_KEYS=Object.freeze({文风:'style',世界观:'world',环境:'environment',玩法:'gameplay',世界书:'worldbook',人物:'cast',历史:'history',工具:'tools'});
const AUDIT=['身份与授权','资料与知情','人物与关系','行动与因果','数值与机制','文风与表现','成稿与交付'];
const VERDICTS=['符合','已修正','待确认','不适用','不符合'];
const DIRECTIONS=['输入评价','回应用户评价','剧情吐槽'];
const MOODS=['困倦','好奇','开心','怀疑','惊讶','闹别扭','促狭','憋笑','装无辜','小得意'];
const TASK_TYPES=['剧情待处理任务','系统任务','下轮基础任务'];
const ACTION_TYPES=['交流','调查','移动','操作','战斗','休整','其他'];
const fail=code=>{throw Object.assign(Error('TISYA_FORM_REPLY_'+code),{code:'TISYA_FORM_REPLY_'+code});};
const shape=(attrs,keys,name)=>{if(!attrs||Object.keys(attrs).length!==keys.length||keys.some(k=>!Object.hasOwn(attrs,k)))fail('ATTR_'+name.toUpperCase());};
const integer=(value,name)=>{if(!/^(?:0|[1-9]\d*)$/.test(value??'')||!Number.isSafeInteger(+value))fail(name);return +value;};
function checkHeart(heart){
 if(!heart)return {status:'沉默',items:[]}; // Omitted optional directions carry no invented aside.
 if(heart.items.length>3||new Set(heart.items.map(x=>x.type)).size!==heart.items.length)fail('HEART_COUNT');
 for(const row of heart.items)if(!DIRECTIONS.includes(row.type)||!MOODS.includes(row.mood))fail('HEART_ENUM');
 return heart;
}
export function projectFormEnvelope(envelope,{decode,records,readParagraphs,toInternal}){
 const {blocks,attrs}=envelope;
 if(Object.keys(blocks).join()!==FORM_REPLY_ORDER.join())fail('ORDER');
 for(const [name,keys]of Object.entries({task:['format'],title:['format'],body:['min','max','unit'],next:['format','audit_count'],extra:[]}))shape(attrs[name],keys,name);
 for(const name of ['task','title','next'])if(attrs[name].format!=='pipes')fail('FORMAT_'+name.toUpperCase());
 if(attrs.next.audit_count!=='7')fail('AUDIT_COUNT');
 if(!['字','词'].includes(attrs.body.unit)||integer(attrs.body.min,'BODY_RANGE')>integer(attrs.body.max,'BODY_RANGE'))fail('BODY_RANGE');
 // The envelope does not grant a writer. Native content remains opaque here;
 // the existing native adapter reads it without executing any operation.
 const varsKeys=Object.keys(attrs.vars);
 if(varsKeys.length&&!(varsKeys.length===1&&varsKeys[0]==='format'&&['xml','json'].includes(attrs.vars.format)))fail('VARS_FORMAT');
 for(const name of ['task','next']){
  const allowed=name==='task'?['任务','解锁','资料','待定','人物','心声']:['审计','待办','心声','已交付','候选'];
  if(records(blocks[name]).some(row=>!allowed.includes(row.name)))fail('FIELD_'+name.toUpperCase());
 }
 const title=decode('title',blocks.title),task=decode('task',blocks.task,{forms:true}),next=decode('next',blocks.next,{forms:true});
 task.heart=checkHeart(task.heart);next.heart=checkHeart(next.heart);
 if(task.characters.some(row=>!['符合','待确认'].includes(row.status)))fail('CHARACTER_STATUS');
 if(next.audit.length!==AUDIT.length||next.audit.some((row,i)=>row.kind!==AUDIT[i]||!VERDICTS.includes(row.status)))fail('AUDIT');
 if(next.tasks.some(row=>!TASK_TYPES.includes(row.type)))fail('TODO_TYPE');
 let actions,actionAttrs;
 if(!Object.keys(attrs.actions).length){
  if(blocks.actions.trim())fail('ACTIONS_FORMAT');
  actions={actions:[]};actionAttrs={format:'json',actions_min:'0',actions_max:'0'};
 }else{
  shape(attrs.actions,['format','actions_min','actions_max'],'actions');
  if(attrs.actions.format!=='pipes')fail('ACTIONS_FORMAT');
  actions=decode('actions',blocks.actions);
  const min=integer(attrs.actions.actions_min,'ACTIONS_RANGE'),max=integer(attrs.actions.actions_max,'ACTIONS_RANGE');
  if(min>max||actions.actions.length<min||actions.actions.length>max)fail('ACTIONS_RANGE');
  if(actions.actions.some(row=>!ACTION_TYPES.includes(row.type)))fail('ACTION_TYPE');
  actionAttrs={...attrs.actions,format:'json'};
 }
 readParagraphs(blocks.body,{required:true});
 const publicTitle={...title};delete publicTitle.places;
 const wire={version:6,order:[...FORM_REPLY_ORDER],attrs:structuredClone(attrs),titlePlaces:title.places};
 // Unlocks are public disclosure notes in edition 6, not host permissions.
 // Keep them in task; do not feed them to ACL or any state writer.
 const result={...envelope,blocks:{...blocks,task:JSON.stringify(task),title:JSON.stringify(publicTitle),next:JSON.stringify(next),actions:JSON.stringify(actions)},attrs:{...attrs,task:{format:'json'},title:{format:'json'},next:{format:'json',audit_count:'7'},actions:actionAttrs},wire};
 delete result.layout;
 return toInternal(result);
}

export function formJourneyView(){
 return {recordSource:'forms',scene:null,associations:[],memories:[],characters:[],changes:[],player:null};
}
