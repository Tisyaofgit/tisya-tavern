import {LONG_PRESS_TOOLS,longPressSlots} from '../paragraph-actions.js';
import {ACTION_MODES} from '../actions.js';
import {check,copy,object} from './schema.js';
import {APPEARANCE_OWNERS,appearanceFields,appearanceValues,appearanceOverrides} from '../appearance-settings.js';
import {shortcutPreferences} from '../input-shortcuts.js';
const messageTools=['regen','next','msg-read','msg-edit','msg-rollback','msg-delete','msg-branch','msg-copy','msg-revision','more'];
export function interfaceSnapshot(source){
 check(object(source)&&object(source.联系人分组),'界面配置损坏，停止助手改写');
 const display=Object.fromEntries(Object.keys(APPEARANCE_OWNERS).map(owner=>[owner,Object.fromEntries(Object.keys(appearanceFields(owner)).map(k=>[k,appearanceOverrides(source,owner)[k]??'__inherit__']))]));
 return {source:copy(source),stamp:JSON.stringify(source),value:{继续用户消息:source.继续用户消息??'',动态效果:source.动态效果??true,显示桌宠:source.显示桌宠??true,行动建议:{写入方式:source.行动建议?.写入方式??'续接输入框'},消息快捷栏:source.消息快捷栏??['regen','next','more'],长按菜单:longPressSlots(source),输入快捷栏:shortcutPreferences(source),联系人分组:copy(source.联系人分组),显示区块:display,...(source.外观方案?{外观方案:copy(source.外观方案)}:{})},choices:{appearance:Object.fromEntries(Object.keys(APPEARANCE_OWNERS).map(owner=>[owner,{name:APPEARANCE_OWNERS[owner],fields:appearanceFields(owner),effective:appearanceValues(source,owner)}])),inherit:'__inherit__ 表示移除外观覆盖并继承',messageTools,longPressTools:LONG_PRESS_TOOLS,inputSlots:'7 个位置；null 表示收起；更多由界面保留',actionModes:ACTION_MODES.map(x=>x.label)}};
}
export function validateInterfaceSettings(value){
 check(object(value)&&object(value.联系人分组)&&Object.values(value.联系人分组).every(v=>typeof v==='string'),'联系人分组配置无效');
 for(const k of ['动态效果','显示桌宠'])if(value[k]!==undefined)check(typeof value[k]==='boolean','界面开关无效：'+k);
 if(value.继续用户消息!==undefined)check(typeof value.继续用户消息==='string','继续消息必须为文本');
 if(value.行动建议!==undefined)check(object(value.行动建议)&&ACTION_MODES.some(x=>x.label===value.行动建议.写入方式),'行动写入方式无效');
 if(value.消息快捷栏!==undefined)check(Array.isArray(value.消息快捷栏)&&value.消息快捷栏.includes('more')&&value.消息快捷栏.every(x=>(messageTools.includes(x)||x==='msg-native'))&&new Set(value.消息快捷栏).size===value.消息快捷栏.length,'消息快捷栏需要保留更多且不能重复');
 longPressSlots(value);shortcutPreferences(value);for(const owner of Object.keys(APPEARANCE_OWNERS))appearanceOverrides(value,owner);
 if(value.外观方案!==undefined){const bank=value.外观方案;check(object(bank)&&bank.version===1&&typeof bank.revision==='string'&&Array.isArray(bank.rows)&&bank.rows.length<=100,'外观方案格式无效');for(const r of bank.rows){check(object(r)&&typeof r.id==='string'&&typeof r.name==='string'&&APPEARANCE_OWNERS[r.owner],'外观方案字段无效');appearanceOverrides({显示区块:{[r.owner]:r.value}},r.owner);}}
 return value;
}
