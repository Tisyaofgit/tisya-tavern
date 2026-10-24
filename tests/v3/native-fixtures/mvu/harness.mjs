import vm from 'node:vm';
import {extract} from './extract.mjs';

const clone=value=>structuredClone(value);
const quoted=value=>JSON.stringify(JSON.stringify(value));

/** Actual pinned MVU parser; event bus and message persistence remain explicit fixtures. */
export function createActualMvuHarness({initialByFloor={},callback}={}) {
  const extracted=extract(), {manifest,lodashSource,json5Source,utilitiesSource,parserSource}=extracted;
  const context=vm.createContext(Object.create(null),{name:'actual-mvu-parser-isolated-fixture',codeGeneration:{strings:false,wasm:false}});
  const execute=code=>vm.runInContext(code,context,{timeout:2000});
  const seed=initialByFloor instanceof Map?Object.fromEntries(initialByFloor):initialByFloor;
  const bootstrap=`
  globalThis.self=globalThis;
  const logs=[],blockedCalls=[],trace=[];
  const console=Object.fromEntries(['log','info','warn','error','debug'].map(k=>[k,(...a)=>logs.push([k,...a.map(String)])]));
  const blocked=name=>(...args)=>{blockedCalls.push(name);throw Error('Blocked external dependency: '+name)};
  const lodashModule={exports:{}}, bundleRequire=blocked('module loading');
  bundleRequire.nmd=m=>m;bundleRequire.g=globalThis;
  (${lodashSource})(lodashModule,lodashModule.exports,bundleRequire);
  const _=lodashModule.exports;
  const JSON5=(()=>{const module={exports:{}},exports=module.exports;${json5Source};return module.exports})();
  const yt={klona:x=>_.cloneDeep(x)},zt={default:JSON5};
  const YAML={parse:blocked('YAML'),parseDocument:blocked('YAML'),stringify:blocked('YAML')},tt=blocked('jsonrepair');
  const Dt={create:blocked('mathjs'),all:{}},qt={},$t={},Ht=new Set();let Yt;
  const xt={tr:(k,a)=>k+(a?JSON.stringify(a):'')},Nt={D:()=>({settings:{通知:{变量更新出错:false}},runtimes:{is_during_extra_analysis:false}})};
  const toastr={warning:blocked('notification'),error:blocked('notification')};
  const utilityModule={exports:{}};
  const utilityRequire=id=>{if(id===7339)return xt;if(id===1431)return {compare:blocked('compareVersions')};if(id===4143)return zt;throw Error('Unsupported utility import '+id)};
  utilityRequire.d=(target,defs)=>{for(const [k,get]of Object.entries(defs))Object.defineProperty(target,k,{enumerable:true,get})};
  (${utilitiesSource})(utilityModule,utilityModule.exports,utilityRequire);
  const Bt=utilityModule.exports;
  const substitudeMacros=x=>x,pn=blocked('initvar lifecycle');
  const floors=JSON.parse(${quoted(seed)}),counts={reads:0,writes:0,parses:0,events:0};
  const floor=o=>{if(o?.type!=='message')throw Error('Fixture supports message data only');const keys=Object.keys(floors).map(Number).sort((a,b)=>a-b);const n=o.message_id;if(n===undefined||n==='latest'||n===-1)return keys.at(-1);if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid floor');return n};
  function getVariables(o){counts.reads++;return _.cloneDeep(floors[floor(o)])}
  async function replaceVariables(data,o){counts.writes++;floors[floor(o)]=_.cloneDeep(data)}
  const getCurrentMessageId=()=>Object.keys(floors).map(Number).sort((a,b)=>a-b).at(-1);
  const objects=new Map(),ids=new WeakMap();let nextId=1;
  function encode(root){const nodes={};function value(v){if(v===undefined)return{undefined:true};if(v===null||typeof v!=='object'){if(typeof v==='function')return{unsupported:'function'};return{value:v}}let id=ids.get(v);if(!id){id='v'+nextId++;ids.set(v,id);objects.set(id,v)}if(!nodes[id]){nodes[id]={array:Array.isArray(v),entries:{}};for(const[k,x]of Object.entries(v))nodes[id].entries[k]=value(x)}return{ref:id}}return JSON.stringify({root:value(root),nodes})}
  function decode(graph){const d=typeof graph==='string'?JSON.parse(graph):graph;for(const[id,n]of Object.entries(d.nodes)){if(!objects.has(id)){const v=n.array?[]:{};objects.set(id,v);ids.set(v,id)}}const value=v=>v.ref?objects.get(v.ref):v.undefined||v.unsupported?undefined:v.value;for(const[id,n]of Object.entries(d.nodes)){const o=objects.get(id);for(const k of Object.keys(o))delete o[k];if(Array.isArray(o))o.length=0;for(const[k,v]of Object.entries(n.entries))o[k]=value(v)}return value(d.root)}
  const queue=[],waiting=new Map();let eventId=1,job=null;
  async function eventEmit(name,...args){trace.push(name);counts.events++;return new Promise((resolve,reject)=>{const id=eventId++;waiting.set(id,{resolve,reject});queue.push({id,name,args:encode(args)})})}
  function start(message,before){counts.parses++;job={status:'running'};Mvu.parseMessage(message,before).then(result=>job={status:'done',result:encode(result)},error=>job={status:'error',error:String(error?.stack??error)})}
  function poll(){return JSON.stringify(queue.length?{event:queue.shift()}:job)}
  function resume(id,graph,error){const pending=waiting.get(id);waiting.delete(id);if(error)pending.reject(Error(error));else{decode(graph);pending.resolve()}}
  ${parserSource}
  const Mvu=Pr();
  `;
  execute(bootstrap);
  const events=JSON.parse(execute('JSON.stringify(Mvu.events)'));
  const handlers=new Map(),hostObjects=new Map(),hostIds=new WeakMap();let hostNext=1,tail=Promise.resolve();
  const decode=wire=>{
    const data=typeof wire==='string'?JSON.parse(wire):wire;
    for(const[id,node]of Object.entries(data.nodes))if(!hostObjects.has(id)){const value=node.array?[]:{};hostObjects.set(id,value);hostIds.set(value,id)}
    const value=v=>v.ref?hostObjects.get(v.ref):v.undefined||v.unsupported?undefined:v.value;
    for(const[id,node]of Object.entries(data.nodes)){const object=hostObjects.get(id);for(const key of Object.keys(object))delete object[key];if(Array.isArray(object))object.length=0;for(const[key,item]of Object.entries(node.entries))object[key]=value(item)}
    return value(data.root);
  };
  const encode=root=>{
    const nodes={};const value=v=>{if(v===undefined)return{undefined:true};if(v===null||typeof v!=='object'){if(typeof v==='function')throw Error('Callbacks cannot inject functions into parser data');return{value:v}}let id=hostIds.get(v);if(!id){id='h'+hostNext++;hostIds.set(v,id);hostObjects.set(id,v)}if(!nodes[id]){nodes[id]={array:Array.isArray(v),entries:{}};for(const[key,item]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(key))throw Error('Unsafe fixture key');nodes[id].entries[key]=value(item)}}return{ref:id}};return JSON.stringify({root:value(root),nodes});
  };
  const eventSource={
    on(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);return ()=>eventSource.removeListener(name,fn)},
    makeFirst(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).unshift(fn)},
    removeListener(name,fn){if(handlers.has(name))handlers.set(name,handlers.get(name).filter(item=>item!==fn))},
  };
  const runtime={
    events,
    getMvuData(options){const wire=execute(`encode(Mvu.getMvuData(JSON.parse(${quoted(options)})))`);return decode(wire)},
    async replaceMvuData(data,options){await execute(`Mvu.replaceMvuData(JSON.parse(${quoted(data)}),JSON.parse(${quoted(options)}))`)},
    parseMessage(message,before){
      const run=async()=>{
        execute(`start(JSON.parse(${quoted(message)}),JSON.parse(${quoted(before)}))`);
        for(let step=0;step<10000;step++){
          await Promise.resolve();
          const state=JSON.parse(execute('poll()'));
          if(state?.event){const event=state.event,args=decode(event.args);let error=null;try{for(const fn of [...(handlers.get(event.name)??[])])await fn(...args)}catch(cause){error=String(cause?.message??cause)}execute(`resume(${event.id},${JSON.stringify(encode(args))},${JSON.stringify(error)})`)}
          else if(state?.status==='done'){const result=decode(state.result);const blocked=JSON.parse(execute('JSON.stringify(blockedCalls)'));if(blocked.length)throw Error('Parser entered unavailable dependency: '+blocked.join(','));return result}
          else if(state?.status==='error')throw Error(state.error);
        }
        throw Error('MVU fixture exceeded event pump limit');
      };
      const result=tail.then(run);tail=result.catch(()=>{});return result;
    },
  };
  if(callback)eventSource.on(events.VARIABLE_UPDATE_ENDED,(after,before)=>callback(after,before,runtime));
  return {
    runtime,eventSource,manifest,
    counts:()=>JSON.parse(execute('JSON.stringify(counts)')),
    trace:()=>JSON.parse(execute('JSON.stringify(trace)')),
    blockedCalls:()=>JSON.parse(execute('JSON.stringify(blockedCalls)')),
    snapshot:()=>JSON.parse(execute('JSON.stringify(floors)')),
    capabilities:()=>JSON.parse(execute("JSON.stringify({process:typeof process,require:typeof require,fetch:typeof fetch,document:typeof document,hostFunctions:0,lodash:_.VERSION})")),
  };
}
