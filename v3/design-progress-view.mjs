const names={extract:'初始化',opening:'开局建立',history:'历史补录',genesis:'设定创作'};
const phases={sources:'正在读取资料',preparing:'正在整理请求',prepared:'请求已准备',waiting:'等待模型回应',buffered:'等待接口返回完整结果',connected:'已连接，等待内容',thinking:'模型正在处理',receiving:'正在接收生成内容',received:'内容已接收',validating:'正在核对草案',saving:'正在保存并核对',complete:'已完成'};
const time=value=>typeof value==='number'?value:Date.parse(value);
export function designProgressPresentation(progress,now=Date.now()){
 if(!progress?.id)return null;
 const p=progress,running=p.status==='running',name=names[p.kind]??'设定任务',elapsed=Math.max(0,Math.floor(((running?now:time(p.updatedAt)) - time(p.startedAt))/1000))||0;
 const duration=elapsed<60?`${elapsed} 秒`:`${Math.floor(elapsed/60)} 分 ${elapsed%60} 秒`;
 const phase=p.status==='awaiting-review'?'草案已生成，等待你校对':p.status==='saved'?'已保存':p.status==='failed'?'本次未完成':p.status==='cancelled'?'请求已停止':phases[p.phase]??'正在处理';
 const parts=[phase];if(Number.isFinite(p.total)&&p.total>0)parts.push(`已处理 ${Math.min(p.completed??0,p.total)} / ${p.total} 楼`);if(p.floor!==undefined&&running)parts.push(`当前第 ${p.floor} 楼`);if(p.characters>0)parts.push(`已接收 ${p.characters} 字符`);parts.push(`已用 ${duration}`);
 const stalled=running&&now-time(p.updatedAt)>60000;
 const hint=p.error?.message??(typeof p.error==='string'?p.error:null)??(stalled?'暂未收到新内容；可以收起等待，或停止请求。':running?'可以收起，进度会显示在小缇身旁。':p.status==='awaiting-review'?'校对并确认后才会保存。':p.status==='cancelled'?'资料未自动保存，可返回后重新发起。':'');
 const complete=['awaiting-review','saved'].includes(p.status),fraction=complete?{value:1,max:1}:Number.isFinite(p.total)&&p.total>0?{value:Math.min(p.completed??0,p.total),max:p.total}:null;
 return {name,title:`${name} · ${phase}`,detail:parts.slice(1).join(' · '),hint,running,status:p.status,route:p.kind,fraction};
}
export function updateDesignProgressMeter(meter,model){
 meter.hidden=!model||!model.running&&!model.fraction;
 meter.setAttribute('aria-label',model?.title??'任务进度');
 if(model?.fraction){meter.max=model.fraction.max;meter.value=model.fraction.value;}else{meter.max=1;meter.removeAttribute('value');}
}
