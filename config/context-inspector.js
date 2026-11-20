import {contextRecord,copyContextText,exportContextText,transportSummary} from './context-export.js';

const ROLE={system:'系统',developer:'开发者',user:'用户',assistant:'角色',tool:'工具',function:'函数'};
const STAGE={
 'host-fetch':'已在宿主 fetch 发送入口读回；这不是供应商接收回执。',
 assembled:'缇斯亚已完成全部消息装配；尚未在宿主发送入口读回。',
};

export function contextSnapshotNote(snapshot){
 if(snapshot.dispatch?.stage==='host-fetch')return STAGE['host-fetch']+' 下方为入口实际读回的消息、工具与发送参数。';
 const observation=snapshot.dispatch?.observation==='unavailable'?'当前未接入宿主发送入口观察；只能确认装配快照。':'等待宿主发送入口读回；其他扩展仍可能继续处理。';
 return STAGE.assembled+observation;
}

export function mountContextInspector(document,node,{host,version='',onClose=()=>{},contextIO={},onError=()=>{}}={}){
 const root=document.createElement('div');root.className='tisya-context-inspector';const shadow=root.attachShadow({mode:'open'});node.append(root);
 let alive=true,selectedAt=null,selectedText='',manual=null,status=null;
 const el=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
 const pre=text=>el('pre',typeof text==='string'?text:JSON.stringify(text,null,2));
 const button=(label,fn)=>{const value=el('button',label);value.type='button';value.onclick=async()=>{try{await fn();}catch(error){status.textContent=error.message;onError(error);}};return value;};
 const detail=(summary,content,open=false)=>{const row=el('details');row.open=open;row.append(el('summary',summary),content);return row;};
 function messageView(message,index){
  const content=message.content,characters=typeof content==='string'?content.length:JSON.stringify(content??'').length;
  const body=el('div');body.className='tisya-context-message';
  if(typeof content==='string')body.append(pre(content));
  else if(Array.isArray(content))for(const [partIndex,part]of content.entries()){
   const text=part?.type==='text'?pre(part.text??''):pre(part??null);
   body.append(detail('内容片段 '+(partIndex+1)+' · '+String(part?.type??'unknown'),text,part?.type==='text'));
  }else body.append(pre(content??null));
  if(message.tool_calls)body.append(detail('工具调用',pre(message.tool_calls)));
  const extra=Object.fromEntries(Object.entries(message).filter(([key])=>!['role','content','tool_calls'].includes(key)));
  if(Object.keys(extra).length)body.append(detail('消息附属字段',pre(extra)));
  return detail('#'+(index+1)+' · '+(ROLE[message.role]??message.role??'未知角色')+' · '+characters+' 字符',body);
 }
 function refresh(){
  if(!alive)return;
  const history=host.snapshots?.()??[],latest=host.preview?.()??history.at(-1)??null;
  if(!history.length&&latest)history.push(latest);
  if(selectedAt&&!history.some(row=>row.at===selectedAt))selectedAt=null;
  selectedAt??=latest?.at??history.at(-1)?.at??null;
  const style=el('style');style.textContent=CSS;
  const main=el('main'),heading=el('div');heading.className='tisya-context-heading';
  heading.append(el('h2','当前会话 · 完整上下文'),button('返回',onClose),button('刷新',refresh));main.append(heading);
  status=el('p');status.setAttribute('role','status');status.className='tisya-context-status';
  if(!history.length){
   main.append(el('p','当前会话尚无 Matrix 主请求记录。完成一次生成准备后，这里会显示全部提示词、历史、角色与发送参数。'),status);
   shadow.replaceChildren(style,main);return;
  }
  const picker=el('select');picker.setAttribute('aria-label','选择当前会话请求快照');
  for(const row of history){const option=el('option',new Date(row.at).toLocaleString()+' · '+(row.dispatch?.stage==='host-fetch'?'宿主入口读回':'装配完成')+' · '+row.messages.length+' 条消息');option.value=row.at;picker.append(option);}
  picker.value=selectedAt;picker.onchange=()=>{selectedAt=picker.value;refresh();};
  const snapshot=history.find(row=>row.at===selectedAt)??history.at(-1),record=contextRecord(snapshot,{version});selectedText=JSON.stringify(record,null,2);
  const summary=el('p',contextSnapshotNote(snapshot));summary.className='tisya-context-stage';
  const counts=el('p',snapshot.messages.length+' 条消息 · '+snapshot.tools.length+' 项工具 · '+JSON.stringify(snapshot.messages).length+' 字符（消息 JSON）');
  main.append(picker,summary,counts);
  if(snapshot.transport)main.append(el('p','传输状态：'+transportSummary(snapshot.transport)));
  const actions=el('div');actions.className='tisya-context-actions';
  manual=el('textarea');manual.readOnly=true;manual.hidden=true;manual.rows=8;manual.setAttribute('aria-label','手动复制当前记录');
  actions.append(button('复制当前记录',async()=>{
   try{await (contextIO.copy??(value=>copyContextText(document,value)))(selectedText);manual.hidden=true;status.textContent='当前记录已复制，包含完整消息、工具和发送参数。';}
   catch{manual.value=selectedText;manual.hidden=false;manual.focus();manual.select();throw Error('自动复制失败，未确认写入剪贴板；请手动复制文本或导出文件。');}
  }),button('导出当前记录',async()=>{
   const name='缇斯亚__上下文__'+record.exportedAt.replace(/[:.]/g,'-')+'.json';
   const result=await (contextIO.export??exportContextText)(selectedText,name);
   if(!['mobile-native','android-document-picker','ios-native-share','browser'].includes(result?.mode))throw Error('导出未完成，请重试或使用复制。');
   status.textContent=result.mode==='browser'?'已交给浏览器下载，请检查下载列表。':result.mode==='ios-native-share'?'已交给系统分享，请完成保存。':'当前记录已导出。';
  }));
  main.append(actions,el('p','复制与导出含私人创作、角色卡和聊天原文；分享前请检查。敏感连接字段已隐藏。'),manual,status);
  const messages=el('section');messages.append(el('h3','逐消息角色与完整正文'));for(const [index,message]of snapshot.messages.entries())messages.append(messageView(message,index));main.append(messages);
  main.append(detail('工具定义 · '+snapshot.tools.length+' 项',pre(snapshot.tools)),detail('发送参数（不含消息与工具）',pre(snapshot.parameters??{})),detail('完整导出 JSON',pre(selectedText)));
  shadow.replaceChildren(style,main);
 }
 refresh();
 return {root,ready:Promise.resolve(),refresh,dispose(){alive=false;root.remove();}};
}

const CSS=`:host{display:block;color:#e5e4d8;font:14px/1.65 var(--tisya-global-font,TisyaReading),TisyaReading,serif}*{box-sizing:border-box}main{min-width:0;padding:4px 0 24px}h2{margin:0;color:#dec991;font-size:24px;font-weight:500}h3{margin:22px 0 10px;color:#cbb98a;font-size:17px;font-weight:500}p{overflow-wrap:anywhere}.tisya-context-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px}.tisya-context-heading h2{flex:1;min-width:220px}.tisya-context-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}button,select,textarea{font:inherit;color:inherit;background:#102b24;border:1px solid #b5a16d55;border-radius:9px;padding:9px 11px;min-height:42px}button{cursor:pointer;color:#dfca94}button:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid #c5ae6a;outline-offset:2px}select{width:100%;margin:6px 0}textarea{width:100%;resize:vertical;margin:8px 0}.tisya-context-stage{padding:12px;border-left:3px solid #b79c5e;background:#142b2380;border-radius:4px 10px 10px 4px}.tisya-context-status{min-height:1.5em;color:#d7c895}details{min-width:0;margin:9px 0;border:1px solid #b5a16d35;border-radius:10px;background:#061c1766;padding:10px}summary{cursor:pointer;color:#cbbb8b;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;margin:10px 0 2px;padding:12px;max-width:100%;background:#0007;border-radius:8px;color:#e5e4d8;font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;user-select:text}.tisya-context-message>details{margin:8px 0}[hidden]{display:none!important}@media(max-width:480px){main{padding-bottom:18px}.tisya-context-heading h2{min-width:100%;font-size:22px}.tisya-context-actions button{flex:1}details{padding:8px}pre{padding:9px;font-size:11px}}`;
