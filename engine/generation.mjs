import configuration from './configuration.json' with {type:'json'};
import mapping from './native-settings.json' with {type:'json'};
import {clone,fail} from './common.mjs';
export const generationDefaults=Object.fromEntries(Object.entries(configuration['生成参数与输出设置']).filter(([,v])=>['number','boolean','string'].includes(typeof v)));
export function generationValues(ctx){return Object.fromEntries(Object.entries(generationDefaults).map(([k,v])=>[k,ctx.chatCompletionSettings?.[mapping.map[k]?.key]??v]));}
export function assertGeneration(ctx,values={}){
 const changes=Object.entries(values).flatMap(([name,expected])=>{const actual=ctx.chatCompletionSettings?.[mapping.map[name]?.key];return actual===expected?[]:[{name,expected,actual}];});
 if(Object.hasOwn(values,'tool_call_recurse_limit')&&ctx.ToolManager?.RECURSE_LIMIT!==values.tool_call_recurse_limit)changes.push({name:'tool_call_recurse_limit',target:'ToolManager.RECURSE_LIMIT',expected:values.tool_call_recurse_limit,actual:ctx.ToolManager?.RECURSE_LIMIT});
 if(changes.length)fail('GENERATION_OVERRIDDEN','生成设置被宿主或其他扩展改写，未按所填值生效：'+changes.map(({name,expected,actual})=>name+' '+JSON.stringify(expected)+' → '+(JSON.stringify(actual)??'缺失')).join('；')+'。请检查对应设置。',{changes});
}
export function applyGeneration(ctx,values={}){
 const entries=Object.entries(values);if(!entries.length)return ()=>{};const target=ctx.chatCompletionSettings;if(!target)fail('GENERATION_SETTINGS','宿主未提供原生生成参数');
 const updates=entries.map(([name,value])=>{const spec=mapping.map[name],base=generationDefaults[name];if(!spec||spec.connection||base===undefined)fail('GENERATION_PARAMETER','不支持的生成参数：'+name);if(typeof value!==typeof base||typeof value==='number'&&!Number.isFinite(value))fail('GENERATION_VALUE','生成参数类型无效：'+name);return [spec.key,value];});
 const tools=Object.hasOwn(values,'tool_call_recurse_limit')?ctx.ToolManager:null;
 if(Object.hasOwn(values,'tool_call_recurse_limit')&&(!tools||typeof tools.RECURSE_LIMIT!=='number'||!Number.isFinite(tools.RECURSE_LIMIT)))fail('GENERATION_TOOL_RUNTIME','宿主未提供工具调用次数的运行时设置，未保存本次生成参数');
 const before=updates.map(([k])=>[k,Object.hasOwn(target,k),clone(target[k])]),toolLimit=tools?.RECURSE_LIMIT;
 const undo=()=>{for(const [k,has,v]of before)if(has)target[k]=v;else delete target[k];if(tools)tools.RECURSE_LIMIT=toolLimit;};
 try{for(const [k,v]of updates)target[k]=v;if(tools)tools.RECURSE_LIMIT=values.tool_call_recurse_limit;}catch(error){undo();throw error;}
 return undo;
}
