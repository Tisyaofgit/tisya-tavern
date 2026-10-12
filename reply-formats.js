import {strictJSON} from './reader-core.js';

let yamlReader=null;
const fail=(block,reason)=>{const code=`TISYA_READER_${block.toUpperCase()}_${reason}`;throw Object.assign(Error(code),{code});};

// The host owns the YAML dependency. This adapter is a read-only display
// boundary; it never changes messages, protocol generations, or stored state.
export function configureReplyFormats({yaml}){
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
