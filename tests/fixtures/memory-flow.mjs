import catalog from '../../engine/catalog.json' with {type:'json'};
import {createMatrixHost} from '../../engine/host.mjs';
import {baseline} from '../../engine/config.mjs';
import {createFoundationService} from '../../tables/foundation-service.js';
import {initializeState} from '../../engine/materials.mjs';
import {prepareMatrixSheets} from '../../tables/foundation/engine.js';

const copy=structuredClone;
export function memoryForm(tableId,values,{evidence=true}={}){
 const state=initializeState(catalog),sheets=prepareMatrixSheets({state},{kind:'rows',mode:'revise',task:'main',operationId:'memory-fixture',tableIds:[tableId]});
 const template=sheets.catalog.templates.find(t=>t.id===tableId);
 return '【'+template.label+'／1】\n'+Object.entries(values).map(([key,value])=>{
  const index=template.fields.findIndex(f=>f.key===key);if(index<0)throw Error('Fixture field missing: '+key);
  return (index+1)+' '+template.fields[index].label+'：'+value+(evidence?' | P1':'');
 }).join('\n');
}
export const memoryReply=(n,archive=memoryForm('T_DYN_EVENTS',{short_code:'e'+n,title:'渡口事件'+n,spine_digest:'第'+n+'次在渡口交信。'}))=>'<reply><task>内部规划不得当成经历</task><anchor phase="before"/><title>渡口'+n+'</title><body>1 第'+n+'次在渡口交信。</body><anchor phase="after"/><extra/><cells/><vars/>'+(archive===null?'':archive?'<archive format="form">'+archive+'</archive>':'<archive/>')+'<actions/></reply>';
export const intakeReply=cells=>'<reply><task/><anchor phase="before"/><title>历史提炼</title><body>1 已整理原文。</body><anchor phase="after"/><extra/><cells>'+cells+'</cells><vars/><archive/><actions/></reply>';

export async function memoryFlow({storage=null,context=null}={}){
 const records=new Map();storage??={get:async id=>copy(records.get(id)),set:async(id,v)=>{records.set(id,copy(v));},commit:async(id,revision,v)=>{if((records.get(id)?.local_revision??0)!==revision)return false;records.set(id,copy(v));return true;}};
 const macros=new Map(),ctx={...(context??{chatId:'memory-flow-isolated',characterId:0,chat:[],chatMetadata:{},extensionSettings:{}}),saveChat:async()=>true,registerMacro:(key,fn)=>macros.set(key,fn)};
 const source={prompts:copy(baseline.prompts),order:copy(baseline.prompt_order[1].order)},expand=text=>text.replace(/\{\{([^{}]+)\}\}/g,(s,k)=>macros.get(k)?.()??(k==='user'?'user':k==='char'?'char':s));
 const options={getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistMetadata:async()=>true,persistSettings:async()=>true,expand};
 let host=createMatrixHost(options),answer=intakeReply(memoryForm('T_DYN_EVENTS',{title:'补录的交信',spine_digest:'在渡口交付了信。'},{evidence:false}));const requests=[];
 host.register();await host.ensureDatabase();
 const database={read:()=>host.readDatabase(),commit:(...args)=>host.commitDatabase(...args)};
 const foundation=createFoundationService({database,getContext:()=>ctx,ensureDatabase:()=>host.ensureDatabase(),run:fn=>fn(),books:{},request:async(task,input)=>{requests.push({task,input:JSON.parse(input)});return answer;}}).matrixFoundation;
 async function prepare(){ctx.chat.push({is_user:true,mes:'继续'});await host.before('normal');const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier));const payload={messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))};await host.payloadReady(payload);return payload;}
 async function accept(raw){await prepare();ctx.chat.push({is_user:false,mes:raw});await host.event('GENERATION_ENDED');return host.export();}
 return {ctx,source,storage,database,foundation,requests,prepare,accept,get host(){return host;},respond:raw=>answer=raw,async reopen(){host=createMatrixHost(options);host.register();await host.sync();return host;}};
}
