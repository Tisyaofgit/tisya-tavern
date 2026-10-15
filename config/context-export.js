// Export only the selected in-memory snapshot. No network calls or configuration writes.
export function transportSummary(status){
 if(!status)return '当前记录没有抗截断状态';
 const name=['verify','verify-tools'].includes(status.mode)?'完整性检查':'抗截断';
 if(status.state==='bypassed')return `本次未启用${name}：${status.reason==='search'?'请求已开启搜索':status.label??status.reason??'请求不适用'}`;
 if(status.state==='tool-handoff'&&status.mode==='tool-text-tools')return '真实工具回合已交回宿主；最终正文仍须通过正文工具包装';
 if(status.state==='tool-handoff')return '工具／搜索兼容检查通过：工具调用响应完整，尚非最终正文；未进行正文包装';
 if(status.state==='media-complete')return '图片响应完整性检查已完成；交回宿主显示，不作为剧情正文归档';
 if(status.state==='off')return '本次未启用抗截断：已关闭';
 if(status.state==='complete')return ['tool-text','tool-text-tools'].includes(status.mode)&&status.restored===true?'正文抗截断已生效；'+status.label:['verify','verify-tools'].includes(status.mode)?'仅完整性检查已完成；'+status.label:status.label;
 if(status.mode==='tool-text-tools'&&status.state==='prepared')return '已准备正文工具包装；真实工具可先调用，最终正文须还原';
 if(status.mode==='tool-text-tools'&&status.state==='receiving')return '正在收取工具回合；正文包装与完整性尚未确认';
 if(status.state==='prepared')return '已准备'+name+'，尚无接收结果';
 if(status.state==='receiving')return '正在接收；'+name+'尚未完成';
 return (status.state==='error'?'本次处理失败：':'')+(status.label??status.state);
}

export function contextRecord(snapshot,{version='',exportedAt=new Date().toISOString()}={}){
 return {schema:'tisya.context-export/1',version,exportedAt,note:'当前选中请求的观察快照；含正文与提示词，不是最终发送回执。',transportSummary:transportSummary(snapshot.transport),snapshot:structuredClone(snapshot)};
}

export async function copyContextText(document,text){
 const clipboard=document.defaultView?.navigator?.clipboard;
 if(typeof clipboard?.writeText!=='function')throw Error('当前环境不支持自动复制');
 await clipboard.writeText(text);
}

export async function exportContextText(text,fileName,{load=()=>import('/scripts/file-export.js')}={}){
 const module=await load();
 if(typeof module.downloadBlobWithRuntime!=='function')throw Error('当前宿主缺少文件导出接口');
 const result=await module.downloadBlobWithRuntime(new Blob([text],{type:'application/json;charset=utf-8'}),fileName);
 if(!['mobile-native','android-document-picker','ios-native-share','browser'].includes(result?.mode))throw Error('宿主未确认导出，请检查文件保存结果');
 return result;
}
