import {CONDITION_PROVIDER} from './tables/condition-runtime.js';
const check=(ok,m)=>{if(!ok)throw Error(m);};
const key=e=>JSON.stringify([e.world,String(e.uid)]);
const condition=e=>e.extensions?.tisyaWorldbook?.condition;
// Hooks run on disposable scan copies only. Never edit native stored entries.
export function createWorldbookConditionGate({getContext,engine,onError=()=>{},timeoutMs=15000}){
 let active=null,epoch=0,failure=null,checks=[],decisions=new Map(),references=new Map();
 const scope=()=>{const c=getContext();return JSON.stringify([c.chatId,c.characterId,c.groupId]);};
 function end(){epoch++;active?.controller.abort(Error('条件扫描已取消'));active=null;checks=[];decisions=new Map();references=new Map();failure=null;}
 function begin(trigger='normal',options={}){end();if(options?.dryRun)return;active={id:'condition-scan:'+crypto.randomUUID(),trigger,scope:scope(),epoch,controller:new AbortController()};}
 async function entriesLoaded(data){
  const lists=['globalLore','characterLore','chatLore','personaLore'].map(k=>{check(Array.isArray(data[k]),'宿主缺少世界书来源集合：'+k);return data[k];});
  const all=lists.flat(),gated=all.filter(e=>condition(e)?.mode==='external');if(!gated.length)return;
  const run=active;
  // Host preload/token estimates have no authorized chance opportunity.
  if(!run){for(const list of lists)list.splice(0,list.length,...list.filter(e=>condition(e)?.mode!=='external'));return;}
  check(scope()===run.scope,'世界书条件作用域已变化');
  const refs=new Map();for(const e of gated){if(e.disable)continue;const c=condition(e),k=key(e),ref={bookRef:e.world,uid:e.uid,provider:c.provider,ruleRef:c.ruleRef,ruleVersion:c.ruleVersion,chance:e.useProbability?e.probability:100};
   check(c.provider===CONDITION_PROVIDER,'世界书条件提供者未连接');check(Number.isSafeInteger(c.ruleVersion),'世界书条件缺少规则版本');
   if(refs.has(k))check(JSON.stringify(refs.get(k))===JSON.stringify(ref),'同一世界书条目来源冲突');refs.set(k,ref);
  }
  try{
   let response;if(refs.size){let timer;try{response=await Promise.race([engine.evaluateConditionEntries({requestId:run.id,entryRefs:[...refs.values()],trigger:run.trigger,dryRun:false,signal:run.controller.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>{run.controller.abort(Error('世界书条件计算超时'));reject(run.controller.signal.reason);},timeoutMs);})]);}finally{clearTimeout(timer);}
    check(active===run&&epoch===run.epoch&&scope()===run.scope&&!run.controller.signal.aborted,'已丢弃迟到的条件结果');
    check(response.requestId===run.id&&typeof response.contextRevision==='string'&&typeof response.assertCurrent==='function'&&Array.isArray(response.results)&&response.results.length===refs.size,'世界书条件回执不完整');
    const found=new Set();for(const r of response.results){const k=JSON.stringify([r.bookRef,String(r.uid)]),ref=refs.get(k);check(ref&&!found.has(k)&&r.ruleRef===ref.ruleRef&&r.ruleVersion===ref.ruleVersion&&['matched','not_matched','unknown'].includes(r.state),'条件结果身份或版本不符');found.add(k);decisions.set(k,r.state);references.set(k,{provider:ref.provider,ruleRef:ref.ruleRef,ruleVersion:ref.ruleVersion});}
    // A later scan can persist another opportunity; only the newest full state stamp applies.
    checks=[response.assertCurrent];
   }
   for(const e of gated)if(e.disable)decisions.set(key(e),'disabled');
   for(const list of lists)list.splice(0,list.length,...list.flatMap(e=>{if(condition(e)?.mode!=='external')return [e];if(decisions.get(key(e))!=='matched')return [];return [{...e,constant:true,vectorized:false,useProbability:false,probability:100}];}));
  }catch(e){if(active===run)failure=e;for(const list of lists)list.splice(0,list.length,...list.filter(e=>condition(e)?.mode!=='external'));throw e;}
 }
 async function scanDone(args){
  const run=active;try{if(failure)throw failure;if(!active)return;check(scope()===active.scope,'世界书扫描期间切换会话');
   for(const assert of checks)await assert();check(active===run,'已丢弃迟到的世界书扫描');
   check(args.activated?.entries instanceof Map,'宿主激活集合无效');
   // A forged/external replacement is rejected as a whole request; do not try to
   // subtract secret content already used by recursive scanning or token budget.
   for(const e of args.activated.entries.values())if(condition(e)?.mode==='external'||decisions.has(key(e))){const ref=references.get(key(e)),actual=condition(e);check(decisions.get(key(e))==='matched'&&!e.disable&&actual?.mode==='external'&&ref&&['provider','ruleRef','ruleVersion'].every(k=>actual[k]===ref[k]),'世界书激活绕过条件门禁，已停止发送');}
  }catch(e){if(active===run){failure=e;onError(e);}throw e;}
 }
 async function assertReady(){if(failure)throw failure;if(active){check(scope()===active.scope,'世界书条件会话已变化');for(const assert of checks)await assert();}}
 return {begin,end,async entriesLoaded(data){const run=active;try{return await entriesLoaded(data)}catch(e){if(active===run&&run){failure=e;onError(e);}throw e;}},scanDone,assertReady,provider:CONDITION_PROVIDER,describeRules:()=>engine.describeConditionRules(),diagnostics:()=>[...decisions].map(([ref,state])=>({ref,state}))};
}
