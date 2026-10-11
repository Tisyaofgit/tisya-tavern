'use strict';
const {FoundationData:D}=require('./foundation-data.cjs');
const {BODY_FIELDS,BODY_DEFAULTS}=require('./body-typography-options.cjs');
const {CHAT_FIELDS,CHAT_DEFAULTS}=require('./chat-effects-options.cjs');
const {JOURNEY_FIELDS,JOURNEY_DEFAULTS}=require('./journey-options.cjs');
const DISPLAY_FIELDS=Object.freeze({装饰程度:['简洁','标准','丰富'],动画效果:[true,false],重复词条:['全部匹配','仅首次出现','关闭自动匹配'],词条上限:{min:0,max:200}});
const BASE_DISPLAY=Object.freeze({装饰程度:'标准',动画效果:true,重复词条:'全部匹配',词条上限:30});
function validateDisplay(value,fields=DISPLAY_FIELDS){if(!value||typeof value!=='object'||Array.isArray(value))D.fail('VALIDATION');for(const [k,v] of Object.entries(value)){const rule=fields[k];if(!rule||(Array.isArray(rule)?!rule.includes(v):!Number.isInteger(v)||v<rule.min||v>rule.max))D.fail('VALIDATION');}return D.copy(value);}
function createComponentRegistry(){
 const rows=new Map();
 function register(def){def=D.copy(def);if(!/^[a-z][a-z0-9-]{0,40}$/.test(def.id)||rows.has(def.id))D.fail('REGISTRATION');D.text(def.name);def.fields=def.fields??{};for(const [key,rule] of Object.entries(def.fields)){D.text(key);if(Object.hasOwn(DISPLAY_FIELDS,key)||!Array.isArray(rule)||!rule.length||rule.some(v=>!['string','number','boolean'].includes(typeof v)))D.fail('REGISTRATION');}validateDisplay(def.defaults,{...DISPLAY_FIELDS,...def.fields});if(!Array.isArray(def.slots))D.fail('REGISTRATION');const seen=new Set();for(const s of def.slots){D.text(s.field);D.text(s.role);if(seen.has(s.field)||!['image','audio','video','text'].includes(s.kind)||!Array.isArray(s.types)||!s.types.length)D.fail('REGISTRATION');s.types.forEach(t=>D.text(t));seen.add(s.field);}rows.set(def.id,def);return def.id;}
 function get(id){if(!rows.has(id))D.fail('COMPONENT_MISSING');return D.copy(rows.get(id));}
 function resolve(id,custom,general){const def=get(id);const fields={...DISPLAY_FIELDS,...def.fields};validateDisplay(custom,fields);validateDisplay(general);const values={},sources={};for(const k of Object.keys(fields)){if(Object.hasOwn(custom,k)){values[k]=custom[k];sources[k]='自定义';}else if(Object.hasOwn(def.defaults,k)){values[k]=def.defaults[k];sources[k]='区块默认';}else if(Object.hasOwn(general,k)){values[k]=general[k];sources[k]='通用设置';}else D.fail('CONFIG_INCOMPLETE');}return {values,sources};}
 return Object.freeze({register,get,resolve,list:()=>[...rows.values()].map(D.copy)});
}
function builtInComponents(){const r=createComponentRegistry();
 for(const [id,name,defaults,slots,fields] of [
 ['title','场景题签',{装饰程度:'丰富'},[{field:'place',types:['地点'],role:'背景',kind:'image'}]],
 ['task','本轮任务',{},[]],
 ['heart','缇斯亚心声',{},[{field:'speaker',types:['人物'],role:'头像',kind:'image'}]],
 ['body','正文',{装饰程度:'简洁',...BODY_DEFAULTS},[{field:'object',types:['人物','地点','物品','组织','事件','资料'],role:'摘要',kind:'text'}],BODY_FIELDS],
 ['extra','世界扩展',{},[{field:'object',types:['物品','资料'],role:'展示',kind:'image'}]],
 ['next','行动栏',{行动写入方式:'续接输入框'},[],{行动写入方式:['替换输入框','续接输入框','直接发送']}],['records','本轮记录',{},[]],['extensions','旅程与聊天外观',{...CHAT_DEFAULTS,...JOURNEY_DEFAULTS},[],{...CHAT_FIELDS,...JOURNEY_FIELDS}]])r.register({id,name,defaults,slots,fields:fields??{}});return r;
}
module.exports={DISPLAY_FIELDS,BASE_DISPLAY,validateDisplay,createComponentRegistry,builtInComponents};
