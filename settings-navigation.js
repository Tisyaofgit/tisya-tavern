export const SETTINGS_GROUP=Object.freeze({
'user-identity':'identity','role-library':'world','group-library':'world','drawer:WI-SP-button':'world','notes':'world','settings-tab:tables':'world','settings-tab:world':'world',
'settings-app':'play','settings-tab:mode':'play','continue-settings':'play','input-tools':'play',
'display-settings':'reading','drawer:backgrounds-button':'reading','emotion-atlas':'reading','pet-toggle':'reading','motion-toggle':'reading','fullscreen':'reading',
'drawer:ai-config-button':'model','drawer:sys-settings-button':'model','settings-tab:api':'model','drawer:advanced-formatting-button':'model',
'display-cache':'data','settings-tab:data':'data','context-overview':'data','font-retry':'data',
'drawer:extensions-settings-button':'native','drawer:user-settings-button':'native','disable':'native'});
// One canonical destination per item. Presentation never writes story settings.
export const SETTINGS_DESTINATIONS=Object.freeze([
 ['assistant','缇斯亚助手','设计人物、世界与基点，提炼档案、调整配置','assistant','sparkles'],
 ['user-identity','用户身份','原点档案、角色和会话绑定','library','user'],
 ['role-library','角色卡','资料、会话与导入导出','library','user'],
 ['drawer:ai-config-button','预设','生成参数与预设管理','library','sliders'],
 ['drawer:WI-SP-button','世界书','条目、角色绑定与批量操作','library','book'],
 ['group-library','群聊','成员、规则与会话管理','library','group'],
 ['settings-app','游玩偏好','节奏、篇幅，以及由你决定的选择','play','sliders'],
 ['display-settings','阅读外观','字体、正文与各区块的显示','play','book'],
 ['drawer:sys-settings-button','连接与模型','选择当前使用的连接和模型','play','link'],
 ['notes','故事记录','手记与已经发生的事','play','book'],
 ['display-cache','显示与加载','首批消息数量、清理显示缓存','play','refresh'],
 ['input-tools','快捷操作','让输入、消息和长按更顺手','play','tools'],
 ['drawer:backgrounds-button','聊天背景','更换背景与适配方式','comfort','image'],
 ['emotion-atlas','表情图鉴','看看小缇的表情','comfort','book'],
 ['pet-toggle','桌宠','显示或隐藏陪伴','comfort','user'],
 ['motion-toggle','动态效果','深水、微泡与眨眼','comfort','sparkles'],
 ['fullscreen','沉浸全屏','专心留在故事里','comfort','fullscreen'],
 ['continue-settings','继续方式','继续时是否附加一条用户消息','comfort','continue'],
 ['settings-tab:mode','叙事编排','授权细项、心声与工作流','tisya','sliders'],
 ['settings-tab:world','世界与文风','主控、关注对象与世界规则','tisya','book'],
 ['settings-tab:api','任务连接分配','为不同任务选择 API 与预设引用','tisya','link'],
 ['drawer:advanced-formatting-button','输出格式','上下文与指令模板、停止字符串','advanced','tools'],
 ['settings-tab:data','上下文与备份','资料范围、导入与导出配置','tisya','book'],
 ['context-overview','请求检查','查看实际装配的上下文','tisya','search'],
 ['settings-tab:tables','世界维护','表单、创世、补录与时间线','tisya','sliders'],
 ['drawer:extensions-settings-button','扩展与自动化','原生扩展、Agent 与工具','advanced','tools'],
 ['drawer:user-settings-button','酒馆与系统','语言、原生设置与数据整理','advanced','settings'],
 ['font-retry','字体状态与重试','检查阅读字体的加载状态','advanced','refresh'],
 ['disable','返回原生界面','保留数据，关闭缇斯亚界面','advanced','left'],
].map(([action,label,description,group,icon])=>Object.freeze({action,label,description,group:SETTINGS_GROUP[action]??group,icon})));
export const KNOWN_DRAWERS=Object.freeze(['ai-config-button','sys-settings-button','advanced-formatting-button','WI-SP-button','persona-management-button','rightNavHolder','extensions-settings-button','user-settings-button','backgrounds-button']);
export function settingsDestinations({fullscreen=false,fullscreenLabel='沉浸全屏',pet=true,motion=true,extra=[]}={}){
 const rows=SETTINGS_DESTINATIONS.filter(r=>r.action!=='fullscreen'||fullscreen).map(r=>({...r,label:r.action==='pet-toggle'?(pet?'隐藏桌宠':'显示桌宠'):r.action==='motion-toggle'?(motion?'暂停动态效果':'开启动态效果'):r.action==='fullscreen'?fullscreenLabel:r.label}));
 const seen=new Set(rows.map(r=>r.action));for(const item of extra){if(KNOWN_DRAWERS.includes(item.key))continue;const action='drawer:'+item.key;if(seen.has(action))continue;seen.add(action);rows.push({action,label:item.label,description:'已安装扩展提供的设置',group:'native',icon:'tools'});}
 return rows;
}
export function filterSettingsDestinations(rows,query){const words=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);return rows.filter(r=>words.every(w=>(r.label+' '+r.description+' '+r.action).toLocaleLowerCase().includes(w)));}
