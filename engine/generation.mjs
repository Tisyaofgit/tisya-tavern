import configuration from './configuration.json' with {type:'json'};
import mapping from './native-settings.json' with {type:'json'};
import {clone,fail} from './common.mjs';
export const generationDefaults=Object.fromEntries(Object.entries(configuration['生成参数与输出设置']).filter(([,v])=>['number','boolean','string'].includes(typeof v)));
export function generationValues(ctx){return Object.fromEntries(Object.entries(generationDefaults).map(([k,v])=>[k,ctx.chatCompletionSettings?.[mapping.map[k]?.key]??v]));}
export function applyGeneration(ctx,values={}){
 const entries=Object.entries(values);if(!entries.length)return ()=>{};const target=ctx.chatCompletionSettings;if(!target)fail('GENERATION_SETTINGS','宿主未提供原生生成参数');
 const updates=entries.map(([name,value])=>{const spec=mapping.map[name],base=generationDefaults[name];if(!spec||spec.connection||base===undefined)fail('GENERATION_PARAMETER','不支持的生成参数：'+name);if(typeof value!==typeof base||typeof value==='number'&&!Number.isFinite(value))fail('GENERATION_VALUE','生成参数类型无效：'+name);return [spec.key,value];});
 const before=updates.map(([k])=>[k,Object.hasOwn(target,k),clone(target[k])]);for(const [k,v]of updates)target[k]=v;
 return ()=>{for(const [k,has,v]of before)if(has)target[k]=v;else delete target[k];};
}
