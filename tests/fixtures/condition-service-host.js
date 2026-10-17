import {simpleTaskAnswer} from '../helpers/simple-answers.js';
import {preprocessTask} from '../../tables/slots.js';
import {Window} from 'happy-dom';
import {mountTablePanel} from '../../tables/panel.js';
import {defaultRegistry} from '../../tables/schema.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../../config/core.js';
import {createTableService} from '../../tables/service.js';
import {createBookGateway} from '../../tables/books.js';
import {projectStateVocabulary} from '../../tables/state-registry.js';
import {compileConditionRule,evaluateConditionRule} from '../../tables/condition-rules.js';
const clone=structuredClone,header='项目｜是否开启｜等级｜额外效果';
export async function fixture(){
 const data=emptyConfig(),context={chatId:'state-test',characterId:0,characters:[{avatar:'test.png',name:'测试'}],chat:[{is_user:false,mes:'已确认开场'}],extensionSettings:{[KEY]:data}};data.worlds[worldKey(context)]=defaultWorld();data.worlds[worldKey(context)].tables={injection:'direct'};
 const store=createStore({getContext:()=>context,persist:async()=>true}),saved=new Map();let uid=1,writes=0,beforeWrite=null,afterWrite=null,failRead=false,responder=null;
 const binding={primary:'',additional:[]};
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async name=>{if(failRead)throw Error('模拟读取失败');assert(saved.has(name));return clone(saved.get(name));},createWorldbook:async(name,entries)=>{saved.set(name,entries.map(e=>({...clone(e),uid:uid++})));return true;},updateWorldbookWith:async(name,fn)=>{await beforeWrite?.(name);const updated=fn(clone(saved.get(name)));saved.set(name,updated);writes++;await afterWrite?.(name);return clone(updated);},getCharWorldbookNames:async()=>clone(binding),rebindCharWorldbooks:async(_,next)=>Object.assign(binding,clone(next))};
 const books=createBookGateway(()=>helper,()=>context),make=()=>createTableService({store,getContext:()=>context,books,request:async(task,text)=>{if(task==='ruleReview')return {issues:[]};if(responder)return simpleTaskAnswer(task,JSON.parse(text),await responder(task,JSON.parse(text)));throw Error('此测试不应调用模型');}});const service=make();await service.initialize();
 await service.edit({changes:['方鹿','阿禾'].map((name,i)=>({id:'new:person-'+i,table:'objects',expected:0,values:{名称:name,类型:'character'},access:{readers:['读者'],knowers:[]},evidence:'用户手动修改表单'}))});
 const persons=(await service.inspect()).rows.filter(r=>r.table==='objects'),owner=persons.find(r=>r.values.名称==='方鹿').id,other=persons.find(r=>r.values.名称==='阿禾').id;
 const setup=async()=>{const old=await service.stateCatalog();return service.saveStateCatalog({preset:true,items:'技能：修船\n技能：游泳\n伤病：右腕旧伤'},old.originRevision);};
 return {service,make,setup,respond:f=>responder=f,context,store,books,saved,owner,other,writes:()=>writes,before:f=>beforeWrite=f,after:f=>afterWrite=f,failRead:v=>failRead=v};
}