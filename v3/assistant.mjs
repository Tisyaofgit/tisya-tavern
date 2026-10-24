import {createTableAssistant,configurationView,editablePaths} from '../tables/assistant.js';
import {historySignature} from '../config/history-context.js';
const copy=v=>structuredClone(v);
const check=(ok,m)=>{if(!ok)throw Error(m);};

/** Configuration has one authority: the existing configStore and interface store. */
export function createAssistantService({store,getContext,getBinding=()=>null,getChoices=()=>({}),interfaceConfig=null,requestConfig,companion=null,review,onSaved=()=>{},assertIdle=()=>{}}={}){
 check(store&&getContext,'Assistant needs the actual configuration store and host context');let busy=false,controller=null;
 const run=async fn=>{check(!busy,'助手正在处理上一项请求');busy=true;controller=new AbortController();try{return await fn(controller.signal);}finally{busy=false;controller=null;}};
 const assistant=createTableAssistant({store,getContext,getChoices,interfaceConfig,run,review:review??(async()=>({registry:{tables:[],types:[]},rows:[],history:[],chatStamp:historySignature(getContext()),storageReady:false,jobs:[]})),call:async(input,signal)=>{check(typeof requestConfig==='function','配置助手 API 尚未接入');const response=await requestConfig(input,{signal,binding:copy(getBinding())});signal?.throwIfAborted();return response;}});
 async function proposeConfig(question,conversation=[]){return assistant.ask(question,conversation);}
 async function applyConfig(draft){assertIdle();const result=await assistant.apply(draft);try{await onSaved();}catch{}return {changed:true,count:result};}
 async function chat(text,options={}){check(companion,'小缇聊天尚未接入');return companion.sendMessage(text,options);}
 const chatMethod=name=>(...args)=>{check(typeof companion?.[name]==='function','小缇聊天尚未接入');return companion[name](...args);};
 const lines=['嗯？你要干什么呀。','在呢。','嗯？这次想从哪里开始？','被你戳到了。'];let pokeIndex=0;
 return {proposeConfig,applyConfig,ask:proposeConfig,apply:applyConfig,chat,sendMessage:chat,getChatState:chatMethod('getChatState'),setChatMode:chatMethod('setChatMode'),queueWithStory:chatMethod('queueWithStory'),withdrawQueued:chatMethod('withdrawQueued'),retryMessage:chatMethod('retryMessage'),cancel:()=>{controller?.abort();companion?.cancel();},poke:()=>({answer:lines[pokeIndex++%lines.length],source:'local',mood:'好奇'}),readConfiguration(){const s={...store.read(),...(interfaceConfig?{interface:interfaceConfig.read()}:{})};return {configuration:configurationView(s),editablePaths:editablePaths(configurationView(s)),revision:s.revision,key:s.key};},availability:()=>({config:typeof requestConfig==='function',chat:!!companion,busy:busy||companion?.busy()===true}),subscribeChat:fn=>companion?.subscribe(fn)??(()=>{})};
}
