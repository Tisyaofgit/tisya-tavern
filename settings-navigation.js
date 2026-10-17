import {createCapabilityRegistry} from './services/capabilities.js';

export const settingsCapabilities=createCapabilityRegistry([
 ["assistant","缇斯亚助手","设计人物、世界与基点，提炼档案、调整配置","assistant","sparkles","assistant",[],true],
 ["user-identity","用户身份","原点档案、角色和会话绑定","identity","user","identity",[],true],
 ["role-library","角色卡","资料、会话与导入导出","world","user","characters",[],true],
 ["drawer:ai-config-button","预设","生成参数与预设管理","model","sliders","drawer",["ai-config-button"],true],
 ["drawer:WI-SP-button","世界书","条目、角色绑定与批量操作","world","book","drawer",["WI-SP-button"],true],
 ["group-library","群聊","成员、规则与会话管理","world","group","characters",["group"],true],
 ["settings-app","游玩偏好","节奏、篇幅，以及由你决定的选择","play","sliders","settings",[],true],
 ["display-settings","阅读外观","字体、正文与各区块的显示","reading","book","display",[],true],
 ["drawer:sys-settings-button","连接与模型","选择当前使用的连接和模型","model","link","drawer",["sys-settings-button"],true],
 ["notes","故事记录","手记与已经发生的事","world","book","notebook",["notes"],true],
 ["display-cache","显示与加载","首批消息数量、清理显示缓存","data","refresh","cache",[],true],
 ["input-tools","快捷操作","让输入、消息和长按更顺手","play","tools","input",[],true],
 ["drawer:backgrounds-button","聊天背景","更换背景与适配方式","reading","image","drawer",["backgrounds-button"],true],
 ["emotion-atlas","表情图鉴","看看小缇的表情","reading","book","atlas",[],true],
 ["pet-toggle","桌宠","显示或隐藏陪伴","reading","user","pet",[],false],
 ["motion-toggle","动态效果","深水、微泡与眨眼","reading","sparkles","motion",[],false],
 ["fullscreen","沉浸全屏","专心留在故事里","reading","fullscreen","fullscreen",[],true],
 ["continue-settings","继续方式","继续时是否附加一条用户消息","play","continue","continue",[],false],
 ["settings-tab:mode","叙事编排","授权细项、心声与工作流","play","sliders","settings",["mode"],true],
 ["settings-tab:world","世界与文风","主控、关注对象与世界规则","world","book","settings",["world"],true],
 ["settings-tab:api","任务连接分配","为不同任务选择 API 与预设引用","model","link","settings",["api"],true],
 ["drawer:advanced-formatting-button","输出格式","上下文与指令模板、停止字符串","model","tools","drawer",["advanced-formatting-button"],true],
 ["settings-tab:data","上下文与备份","资料范围、导入与导出配置","data","book","settings",["data"],true],
 ["context-overview","请求检查","查看实际装配的上下文","data","search","settings",["mode","overview"],true],
 ["settings-tab:tables","世界维护","表单、创世、补录与时间线","world","sliders","settings",["tables"],true],
 ["drawer:extensions-settings-button","扩展与自动化","原生扩展、Agent 与工具","native","tools","drawer",["extensions-settings-button"],true],
 ["drawer:user-settings-button","酒馆与系统","语言、原生设置与数据整理","native","settings","drawer",["user-settings-button"],true],
 ["font-retry","字体状态与重试","检查阅读字体的加载状态","data","refresh","font",[],false],
 ["disable","返回原生界面","保留数据，关闭缇斯亚界面","native","left","disable",[],true],
] .map(([action,label,description,group,icon,method,args,leave])=>({action,label,description,group,icon,route:{method,args},leave})),{key:'action',label:'设置入口',validate(definition){
 if(!definition.route?.method||!Array.isArray(definition.route.args)||typeof definition.leave!=='boolean')throw Error('设置入口缺少执行契约');
}});
export const SETTINGS_DESTINATIONS=Object.freeze(settingsCapabilities.definitions.map(({route,leave,...entry})=>Object.freeze(entry)));
export function settingsCommand(action,id){
 const address=id===undefined?action:action+':'+id;
 if(settingsCapabilities.has(address))return settingsCapabilities.get(address);
 // Installed drawers retain their native owner and availability checks.
 if(action==='drawer'&&id)return {action:address,leave:true,route:{method:'drawer',args:[id]}};
 return null;
}
export function executeSettingsCommand(command,host){
 if(!command?.route)throw Error('设置入口未登记');
 const {method,args}=command.route;
 if(!Object.hasOwn(host,method)||typeof host[method]!=='function')throw Error('设置能力尚未接入：'+method);
 return host[method](...args);
}
export const KNOWN_DRAWERS=Object.freeze(['ai-config-button','sys-settings-button','advanced-formatting-button','WI-SP-button','persona-management-button','rightNavHolder','extensions-settings-button','user-settings-button','backgrounds-button']);
export function settingsDestinations({fullscreen=false,fullscreenLabel='沉浸全屏',pet=true,motion=true,extra=[]}={}){
 const rows=SETTINGS_DESTINATIONS.filter(r=>r.action!=='fullscreen'||fullscreen).map(r=>({...r,label:r.action==='pet-toggle'?(pet?'隐藏桌宠':'显示桌宠'):r.action==='motion-toggle'?(motion?'暂停动态效果':'开启动态效果'):r.action==='fullscreen'?fullscreenLabel:r.label}));
 const seen=new Set(rows.map(r=>r.action));for(const item of extra){if(KNOWN_DRAWERS.includes(item.key))continue;const action='drawer:'+item.key;if(seen.has(action))continue;seen.add(action);rows.push({action,label:item.label,description:'已安装扩展提供的设置',group:'native',icon:'tools'});}
 return rows;
}
export function filterSettingsDestinations(rows,query){const words=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);return rows.filter(r=>words.every(w=>(r.label+' '+r.description+' '+r.action).toLocaleLowerCase().includes(w)));}
