import catalog from '../../engine/catalog.json' with {type:'json'};
import {createMatrixHost} from '../../engine/host.mjs';
import {createStoryIdentity} from '../../engine/identity.mjs';
import {mountMatrixIdentity} from '../../engine/identity-ui.mjs';
import {baseline} from '../../engine/config.mjs';
const copy=structuredClone;
export async function proseFixture({saved=null,persist=()=>{}}={}){
 const text='  原文旅人住在山下。\r\n她有自己的目标，也会拒绝不合理的要求。\n原文末尾空格  ';
 const data=saved??{books:{'基点书':[{uid:0,name:'【角色】原文旅人',content:text,enabled:false,vendor:{keep:'yes'}},{uid:1,name:'【角色】未选人物',content:'不得注入的其他人物',enabled:true}]},disk:{},extensionSettings:{},chatMetadata:{}};
 const macros=new Map(),ctx={chatId:'prose-chat',characterId:0,characters:[{avatar:'world.png'}],chat:[],extensionSettings:data.extensionSettings,chatMetadata:data.chatMetadata,registerMacro:(k,f)=>macros.set(k,f),saveChat:async()=>true};
 let failSave=false,readHook=null,host,view;
 const helper={getWorldbookNames:async()=>Object.keys(data.books),getWorldbook:async name=>{await readHook?.();return copy(data.books[name]);},createWorldbook:async(name,rows)=>{data.books[name]=copy(rows);return true;},updateWorldbookWith:async(name,fn)=>{data.books[name]=copy(fn(copy(data.books[name])));}};
 ctx.loadWorldInfo=async name=>{await readHook?.();const rows=data.books[name];return rows?{entries:Object.fromEntries(rows.map(e=>[e.uid,{...copy(e),comment:e.name}]))}:null;};
 const source={prompts:copy(baseline.prompts),order:copy(baseline.prompt_order[1].order)},expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(s,k)=>macros.get(k)?.()??(k==='user'?'user':k==='char'?'char':s));
 const save=async()=>{if(failSave)return false;data.extensionSettings=ctx.extensionSettings;data.chatMetadata=ctx.chatMetadata;await persist(copy(data));return true;};
 const storage={get:async id=>copy(data.disk[id]),set:async(id,value)=>{data.disk[id]=copy(value);},commit:async(id,rev,value)=>{if((data.disk[id]?.local_revision??0)!==rev)return false;data.disk[id]=copy(value);return true;}};
 function makeHost(){host=createMatrixHost({getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:save,persistMetadata:save,expand});host.register();return host;}
 makeHost();await host.ensureDatabase();
 const roles=()=>createStoryIdentity({config:host.config,getContext:()=>ctx,getHelper:()=>helper,database:{read:()=>host.readDatabase(),commit:input=>host.commitDatabase(input)}});
 async function mount(document,root){view?.dispose();view=mountMatrixIdentity(document,root,{config:host.config,roles:roles(),resourcesOnly:true});await view.ready;return view;}
 const payload=()=>({messages:source.prompts.filter(p=>!p.marker&&p.enabled!==false&&source.order.some(o=>o.identifier===p.identifier&&o.enabled)&&expand(p.content??'').trim()).map(p=>({role:p.role,content:expand(p.content)}))});
 return {data,ctx,helper,roles,text,mount,payload,makeHost,get host(){return host;},get view(){return view;},failSave:v=>failSave=v,readHook:v=>readHook=v};
}
