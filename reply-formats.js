import {displayReplySource} from './display-repair.js';
import {createDisplayCache} from './display-cache.js';
import {strictJSON,parseDisplayEnvelope,xmlTokens,replyRegion} from './reader-core.js';

let yamlReader=null,revision=0;
const publicCache=createDisplayCache(),memoryCache=createDisplayCache();
export const replyFormatRevision=()=>revision;
const fail=(block,reason)=>{const code=`TISYA_READER_${block.toUpperCase()}_${reason}`;throw Object.assign(Error(code),{code});};

// Private record schema errors must not prevent public UI blocks from being
// read. Omit record contents in an ephemeral parsing view, using the original
// XML tokenizer and complete reply boundary checks. Never return these omitted
// records as valid empty state, and never change the stored source.
function withoutRecords(source,names){
 const region=replyRegion(displayReplySource(source)).source,stack=[],cuts=[];let current=null;
 const malformed=code=>{throw Object.assign(Error('TISHA_OUTPUT_'+code),{code:'TISHA_OUTPUT_'+code});};
 for(const token of xmlTokens(region)){
  if(token.kind==='comment'&&/填写|占位/.test(token.value))malformed('PLACEHOLDER');
  if(token.kind==='open'){
   if(stack.length>1&&names.has(stack[1]))malformed('NESTED_BLOCK_'+stack[1].toUpperCase());
   if(stack.length===1&&names.has(token.name)&&!token.selfClose)current={name:token.name,start:token.end};
   if(!token.selfClose){stack.push(token.name);if(stack.length>64)malformed('XML_DEPTH');}
  }else if(token.kind==='close'){
   if(stack.at(-1)!==token.name)malformed('XML_CLOSE');
   if(stack.length===2&&current?.name===token.name){cuts.push([current.start,token.start]);current=null;}
   stack.pop();
  }
 }
 if(stack.length)malformed('INCOMPLETE');
 let view=region;for(const [start,end]of cuts.reverse())view=view.slice(0,start)+view.slice(end);
 return view;
}

export function readPublicReplyEnvelope(source){return publicCache.read(source,()=>publicEnvelope(source));}
function publicEnvelope(source){
 const e=parseDisplayEnvelope(withoutRecords(source,new Set(['status','memory'])));
 const publicNames=new Set(['task','title','body','next','actions']);
 return {id:e.id,blocks:Object.fromEntries(Object.entries(e.blocks).filter(([name])=>publicNames.has(name))),attrs:Object.fromEntries(Object.entries(e.attrs).filter(([name])=>publicNames.has(name))),...(e.wire?{wire:{version:e.wire.version}}:{}),projection:'public-ui'};
}

export function readReplyMemory(source){return memoryCache.read(source,()=>replyMemory(source));}
function replyMemory(source){
 const e=parseDisplayEnvelope(withoutRecords(source,new Set(['status'])));
 if(e.wire?.version===6)return null;
 return e.blocks.memory.trim()?strictJSON(e.blocks.memory):null;
}

// The host owns the YAML dependency. This adapter is a read-only display
// boundary; it never changes messages, protocol generations, or stored state.
export function configureReplyFormats({yaml}){
 revision++;publicCache.clear();memoryCache.clear();
 yamlReader=['parseDocument','isAlias','isMap','isSeq','isScalar'].every(key=>typeof yaml?.[key]==='function')?yaml:null;
}

function readYaml(text,block){
 if(!yamlReader)fail(block,'YAML_UNAVAILABLE');
 let doc;
 try{doc=yamlReader.parseDocument(text,{version:'1.2',schema:'core',strict:true,uniqueKeys:true,stringKeys:true,merge:false,customTags:[]});}
 catch{fail(block,'YAML_SYNTAX');}
 if(doc.errors.length||doc.warnings.length)fail(block,'YAML_SYNTAX');
 if(doc.directives?.yaml?.explicit||Object.keys(doc.directives?.tags??{}).some(k=>k!=='!!'))fail(block,'YAML_FEATURE');
 let count=0;
 const visit=(node,depth=0)=>{
  if(node===null||node===undefined)return;
  if(depth>64||++count>100000)fail(block,'YAML_LIMIT');
  if(node.anchor||node.tag||yamlReader.isAlias(node))fail(block,'YAML_FEATURE');
  if(yamlReader.isMap(node))for(const pair of node.items){
   if(!yamlReader.isScalar(pair.key)||typeof pair.key.value!=='string')fail(block,'YAML_KEY');
   visit(pair.key,depth+1);visit(pair.value,depth+1);
  }
  else if(yamlReader.isSeq(node))for(const item of node.items)visit(item,depth+1);
  else if(yamlReader.isScalar(node)){
   const value=node.value;
   if(value!==null&&!['string','number','boolean'].includes(typeof value))fail(block,'YAML_VALUE');
   if(typeof value==='number'&&!Number.isFinite(value))fail(block,'YAML_VALUE');
  }else fail(block,'YAML_FEATURE');
 };
 visit(doc.contents);
 let value;
 try{value=doc.toJS({mapAsMap:false,maxAliasCount:0});}
 catch{fail(block,'YAML_VALUE');}
 // Rebuild a null-prototype, JSON-compatible value without changing 0, false,
 // null, empty containers, block scalars, or quoted literal strings.
 return strictJSON(JSON.stringify(value));
}

export function readReplyBlock(envelope,block){
 if(!['task','title','next'].includes(block)||typeof envelope?.blocks?.[block]!=='string')fail(block,'MISSING');
 const format=envelope.attrs?.[block]?.format??'json',text=envelope.blocks[block];
 let value;
 if(format==='yaml')value=readYaml(text,block);
 else if(format==='json'){
  try{value=strictJSON(text);}catch{fail(block,'JSON_SYNTAX');}
 }else fail(block,'FORMAT');
 if(!value||typeof value!=='object'||Array.isArray(value))fail(block,'OBJECT');
 return value;
}
