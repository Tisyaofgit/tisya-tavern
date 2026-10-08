'use strict';

// A reply-local reader view. Never use this result as the live state store, a
// generation input, or an ACL-bearing copy of the memory protocol.
const {parseDisplayEnvelope}=require('./xml-envelope.cjs');
const {parse}=require('./world/strict-json.cjs');
const ACL=require('./permission-wire.cjs');
const memoryPermissions=require('./memory-permissions.cjs');
const {parseStatus}=require('./status-wire.cjs');
const paragraphs=require('./numbered-paragraphs.cjs');
const {visibleText}=require('./body-count.cjs');

const own=(x,k)=>Object.hasOwn(x,k);
const clone=x=>structuredClone(x);
const reader={mode:'emit',audience:'读者'};
const allows=(permission,path)=>ACL.allows(permission,{...reader,path});
const fail=code=>{throw Object.assign(Error('TISYA_JOURNEY_'+code),{code:'TISYA_JOURNEY_'+code});};

function publicPolicy(permission){
  // A native JSON field is atomic. Do not expose private nested members by
  // testing only its default policy or by removing keys from business values.
  return Array.isArray(permission)?allows(permission,''):
    allows(permission.默认,'')&&Object.values(permission.字段).every(p=>allows(p,''));
}

function eventScene(event){
  const a=path=>allows(event.权限,path);
  return {
    title:a('/场景/0/0')?event.标题:null,
    time:a('/场景/0/1')?{start:event.时间.起,end:event.时间.止}:null,
    places:a('/场景/0/2')?clone(event.地点):null,
    world:a('/场景/0/3')?event.世界:null
  };
}

function childAllows(event,label,index,row,column){
  return allows(event.权限,`/${label}/${index}/${column}`)&&allows(row.权限,'/'+column);
}

function publicBodyParagraphs(body){
  // The schema has no no-spoiler/future-plan flag. Psychology is therefore only
  // an optional echo of COMPLETE content + evidence already in this reply's
  // public prose, never a new disclosure or a keyword-based redaction.
  // Arbitrary CSS can hide HTML text. Fail closed on HTML-bearing paragraphs;
  // visibleText also removes Markdown metadata, reference URLs and image alt.
  return paragraphs.read(body,{required:true})
    .filter(p=>!/<(?:\/?[A-Za-z][\w:-]*\b|!--|![A-Za-z])/.test(p.raw))
    .map(p=>visibleText(p.raw));
}

function changeValues(row,oldAllowed){
  const hasOldValue=own(row,'旧值')&&oldAllowed;
  const hasNewValue=own(row,'新值');
  return {
    hasOldValue,...(hasOldValue?{oldValue:clone(row.旧值)}:{}),
    hasNewValue,...(hasNewValue?{newValue:clone(row.新值)}:{}),
    deleted:row.删除===true
  };
}

function statusChanges(status,sidecars){
  const changes=[];
  const nativePolicies=new Map(sidecars.filter(x=>x.区块==='status')
    .map(x=>[JSON.stringify(x.定位),x.权限]));
  for(const [type,objects]of Object.entries(status))for(const [object,fields]of Object.entries(objects)){
    for(const [field,row]of Object.entries(fields)){
      if(type==='叙事状态'){
        // Latest/new value authorization is required. A hidden new value must
        // never make an old value look current, including hidden deletions.
        if(![0,2,4].every(c=>allows(row.权限,'/'+c)))continue;
        changes.push({kind:'status',object,field,...changeValues(row,allows(row.权限,'/3'))});
      }else{
        const permission=nativePolicies.get(JSON.stringify([type,object,field]));
        if(!permission||!publicPolicy(permission))continue;
        changes.push({kind:'status',type,object,field,hasOldValue:false,
          hasNewValue:true,newValue:clone(row),deleted:false});
      }
    }
  }
  return changes;
}

function unique(rows){
  const seen=new Set();
  return rows.filter(row=>{const key=JSON.stringify(row);if(seen.has(key))return false;seen.add(key);return true;});
}

/**
 * Public memory/5 fields from one original reply, with no writes or inference.
 * Unsupported legacy data throws TISYA_JOURNEY_MEMORY_UNSUPPORTED. Callers may
 * keep the original legacy narrative; they must not invent its missing ACLs.
 * playerName is an already-resolved exact name. This module does not bind cards,
 * infer aliases, query history, execute timers, or create task/inventory data.
 */
function projectJourney(source,{showPsychology=false,playerName=null}={}){
  const envelope=parseDisplayEnvelope(source);
  if(!envelope.blocks.memory?.trim())fail('MEMORY_UNSUPPORTED');
  const memory=parse(envelope.blocks.memory);
  if(memory?.protocol!=='tisya.lab.memory/5')fail('MEMORY_UNSUPPORTED');
  memoryPermissions.validate(memory,{body:envelope.blocks.body});
  const status=parseStatus(envelope.blocks.status);
  memoryPermissions.validateLocators(memory,envelope.blocks);

  const associations=memory.关联权限&&allows(memory.关联权限,'/0')?clone(memory.关联):[];
  const changes=[];
  const memories=[];
  const characters=new Map();
  const boundPlayer=typeof playerName==='string'&&playerName?playerName:null;
  const publicProse=showPsychology===true?publicBodyParagraphs(envelope.blocks.body):[];
  const echoed=text=>publicProse.some(p=>p.includes(text));
  const character=name=>{
    if(name===boundPlayer)return null;
    if(!characters.has(name))characters.set(name,{name,cognition:[],psychology:[]});
    return characters.get(name);
  };

  for(const event of memory.事件){
    const a=path=>allows(event.权限,path);
    const scene=eventScene(event);
    const participants=a('/0')?clone(event.参与者):[];
    const summary=a('/2')?event.梗概:null;
    const quote=a('/原文/0/0')&&event.段落!==null?
      {reference:event.段落,text:event.原文}:null;
    const results=event.结果.filter((_,i)=>a(`/结果/${i}/0`));
    const impact=a('/影响/0/0')?event.影响:null;
    const cognition=[];
    const psychology=[];
    const setting=[];

    event.认知.forEach((row,i)=>{
      const allowed=c=>childAllows(event,'认知',i,row,c);
      if(![0,1,4,5].every(allowed))return;
      const value={kind:row.类别,content:row.内容,source:row.来源};
      // '误信' and '确认' reveal a truth assessment. They do not affect whether
      // the independently-authorized understanding itself may be displayed.
      if(allowed(2)&&['听闻','推测'].includes(row.确信))value.certainty=row.确信;
      cognition.push({name:row.主体,value});
    });
    if(showPsychology===true)event.角色心理.forEach((row,i)=>{
      if(![0,2,3].every(c=>childAllows(event,'心理',i,row,c))||
        !echoed(row.内容)||!echoed(row.依据))return;
      psychology.push({name:row.主体,value:{content:row.内容,evidence:row.依据}});
    });
    event.设定变动.forEach((row,i)=>{
      const allowed=c=>childAllows(event,'变动',i,row,c);
      if(![0,1,3].every(allowed))return;
      setting.push({kind:'setting',object:row.对象,field:row.字段,
        ...changeValues(row,allowed(2)),
        ...(a('/变因/0/0')&&event.设定原因!==null?{reason:event.设定原因}:{})});
    });

    const hasCard=summary!==null||quote!==null||results.length>0||impact!==null;
    if(!hasCard&&!cognition.length&&!psychology.length&&!setting.length)continue;
    participants.forEach(character);
    cognition.forEach(({name,value})=>character(name)?.cognition.push(value));
    psychology.forEach(({name,value})=>character(name)?.psychology.push(value));
    changes.push(...setting);
    if(!hasCard)continue; // No title/participant/tag-only or hidden-count shells.

    // No semantic/keyword guess about a free tag. Only already-authorized exact
    // object/person/place/world names can become neutral browse labels.
    const neutralNames=new Set([...associations,...participants,...(scene.places??[]),
      ...(scene.world===null?[]:[scene.world]),...setting.map(x=>x.object)]);
    const tags=a('/标签/0/0')?event.标签.filter(x=>neutralNames.has(x)):[];
    memories.push({scene,participants,summary,quote,results,impact,tags});
  }

  changes.push(...statusChanges(status,memory.权限));
  return {
    scene:memories.length?clone(memories[0].scene):null,
    associations,memories,
    characters:[...characters.values()].map(c=>({...c,
      cognition:unique(c.cognition),psychology:unique(c.psychology)})),
    // Historical setting changes and this reply's status changes are distinct
    // kinds. Deduplication never merges the two or compares hidden fields.
    changes:unique(changes)
  };
}

module.exports={projectJourney};
