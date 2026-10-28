import {safeDiagnostic} from '../config/stream-response.js';
const scrub=value=>typeof value==='string'?safeDiagnostic(value):Array.isArray(value)?value.map(scrub):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,scrub(v)])):value;
export function runDiagnostic(s){return scrub({title:'缇斯亚运行记录',at:new Date().toISOString(),busy:s.busy,stage:s.progress?.stage,characters:s.progress?.characters,response:s.progress?{...(s.progress.responseDiagnostic??{}),text:s.progress.text??'',accepted:false,note:'仅为收到的输出；任务完成不等于档案保存成功，以保存回执为准。'}:null,jobs:s.jobs??[]});}
export function mountRunView(document,parent,{service,onMinimize=()=>{}}){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const root=el('details');root.className='tisya-run-view';root.setAttribute('aria-label','辅助任务进度');
 const summary=el('summary','尚无运行中的任务'),help=el('small','可收起返回聊天；重新打开缇斯亚助手即可查看结果。切换会话会停止旧任务，关闭应用不能继续运行。'),actions=el('div'),stop=el('button','停止当前任务'),minimize=el('button','收起并返回聊天');
 summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');actions.className='tisya-run-actions';stop.type=minimize.type='button';actions.append(stop,minimize);root.append(summary,help);
 const track=el('div'),stageLabels=el('div');track.className='tisya-stage-track';track.setAttribute('role','progressbar');track.setAttribute('aria-label','任务阶段（不是模型完成百分比）');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','5');stageLabels.className='tisya-stage-labels';
 for(const name of ['准备材料','完整请求','生成档案','核对格式','审阅保存']){track.append(el('span'));stageLabels.append(el('span',name));}root.append(track,stageLabels,actions);
 const output=el('details'),preview=el('pre'),outputHeading=el('summary','查看正在生成的内容（尚未保存）');output.append(outputHeading,preview);root.append(output);
 const logs=el('details'),heading=el('summary','运行记录与报错'),list=el('pre'),copy=el('button','复制运行记录'),manual=el('textarea');copy.type='button';manual.readOnly=true;manual.hidden=true;manual.setAttribute('aria-label','可手动复制的运行记录');logs.append(heading,list,copy,manual);root.append(logs);parent.append(root);const save=el('button','导出脱敏诊断');save.type='button';logs.append(save);save.onclick=()=>{const url=URL.createObjectURL(new Blob([text()],{type:'application/json'})),link=el('a');link.href=url;link.download='缇斯亚-运行诊断.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 let lastError='',lastSignature='',lastOutput='',lastBusy=false;
 stop.onclick=()=>{service.clear({reason:'你已停止当前任务；已保存的表单保留，未完成的输出不会入档'});tick();};minimize.onclick=onMinimize;
 const text=()=>JSON.stringify(runDiagnostic(service.state()),null,2);
 copy.onclick=async()=>{const value=text();try{if(!document.defaultView?.navigator?.clipboard?.writeText)throw Error('当前环境不能自动复制');await document.defaultView.navigator.clipboard.writeText(value);copy.textContent='已复制';}catch(e){manual.value=value;manual.hidden=false;manual.select();copy.textContent='请长按下方记录复制';}};
 function tick(){const s=service.state(),p=s.progress,jobs=s.jobs??[],latest=jobs.at(-1),labels={preparing:'准备资料',waiting:'等待 API 返回',buffered:'读取完整返回',thinking:'API 正在生成',receiving:'正在接收内容',received:'接收完成',validating:'检查表单',complete:'本步骤完成',error:'任务失败',stopped:'已停止',connected:'已连接'};
  root.hidden=!s.busy&&!jobs.length&&!p;if(s.busy!==lastBusy){root.open=s.busy||p?.stage==='error';lastBusy=s.busy;}
  const stage={preparing:0,prepared:1,waiting:2,connected:2,thinking:2,receiving:2,buffered:2,received:3,validating:3,complete:4}[p?.stage];
  if(stage!==undefined){track.setAttribute('aria-valuenow',String(stage));track.setAttribute('aria-valuetext',stageLabels.children[stage].textContent+'；生成耗时未知');[...track.children].forEach((node,i)=>node.className=i<stage?'done':i===stage?'current':'');}else track.removeAttribute('aria-valuenow');
  stop.disabled=!s.busy;actions.hidden=help.hidden=!s.busy;const seconds=p?Math.max(0,Math.floor(((p.finishedAt??Date.now())-p.startedAt)/1000)):0;
  summary.textContent=s.busy&&p?[(p.task??latest?.task??'表单任务'),labels[p.stage]??p.stage,seconds+' 秒',p.characters?'已收到 '+p.characters+' 字符':'等待结果'].join(' · '):(latest?[latest.task,latest.status,latest.detail].filter(Boolean).join(' · '):'尚无运行中的任务');
  if(s.busy&&p?.updatedAt&&Date.now()-p.updatedAt>30000)summary.textContent+=' · 暂无新数据，可继续等待或停止';
  preview.textContent=safeDiagnostic(p?.text)||'收到结果文字后会在这里逐段显示；模型推理过程不作为表单内容。';output.hidden=!s.busy&&!p?.text&&!p?.responseDiagnostic;outputHeading.textContent=s.busy?'查看正在生成的内容（尚未保存）':p?.stage==='error'||p?.stage==='stopped'?'查看失败时收到的内容（诊断用，不代表已保存）':'查看上次收到的内容';if(!p?.text&&p?.responseDiagnostic)preview.textContent='没有提取到可用正文。响应诊断：\n'+JSON.stringify(scrub(p.responseDiagnostic),null,2);
  if(preview.textContent!==lastOutput){lastOutput=preview.textContent;preview.scrollTop=preview.scrollHeight;}
  const signature=JSON.stringify(jobs);if(signature!==lastSignature){lastSignature=signature;list.textContent=jobs.length?jobs.map(j=>'['+j.at+'] '+j.task+' · '+j.status+(j.detail?'\n'+safeDiagnostic(j.detail):'')+(j.code?'\n错误类型：'+j.code:'')+(j.cause?'\n原因：'+safeDiagnostic(j.cause):'')+(j.stack?'\n'+safeDiagnostic(j.stack):'')+(j.response?'\n未接纳的返回内容与响应诊断：\n'+JSON.stringify(scrub(j.response),null,2):'')).join('\n\n'):'还没有任务记录。';heading.textContent='运行记录与报错（'+jobs.length+'）';}
  const error=jobs.findLast(j=>j.status==='失败'||j.status==='未通过');if(error&&error.at!==lastError){lastError=error.at;root.open=logs.open=true;if(p?.stage==='error'||p?.stage==='stopped')output.open=true;}
 }
 tick();return {root,tick,report(error){service.reportError?.(error);tick();root.hidden=false;root.open=logs.open=true;},text};
}
