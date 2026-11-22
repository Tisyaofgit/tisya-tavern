export const MEDIA_TABLE='T_SYS_MEDIA_ASSETS';
export const MEDIA_USE_LABELS=Object.freeze({avatar:'头像',portrait:'立绘',expression:'表情',cg:'条件CG',sticker:'通用表情'});
export const MEDIA_SCOPE_LABELS=Object.freeze({chat:'本聊天',card:'角色卡',global:'全局'});
export const MEDIA_CALL_TABLE=Object.freeze([
 Object.freeze({位置:'角色立绘',可用填写内容:'角色名：情绪名称'}),
 Object.freeze({位置:'条件CG',可用填写内容:'CG名称：场景描述'}),
 Object.freeze({位置:'通用表情',可用填写内容:'通用表情：表情名'}),
 Object.freeze({位置:'缇斯亚心声',可用填写内容:'缇斯亚心声＋n个可选表情名称'})
]);
export const MEDIA_PROMPT_CONTRACT='[MEDIA.CALLS]\n'+MEDIA_CALL_TABLE.map(row=>row.位置+'｜'+row.可用填写内容).join('\n')+'\n只调用当前已绑定且获准的媒体；CG必须已由条件服务判定通过，描述不能替代条件。\n[/MEDIA.CALLS]';

export function mediaUse(value){
 const text=String(value?.purpose??value?.kind??'');
 if(text==='CG'||text.includes('条件CG'))return 'cg';
 if(text.includes('通用表情'))return 'sticker';
 if(text.includes('头像'))return 'avatar';
 if(text.includes('表情')||value?.display_variant&&!text.includes('立绘'))return 'expression';
 return 'portrait';
}

const ratios=[['1:1',1],['4:3',4/3],['3:4',3/4],['16:9',16/9],['9:16',9/16],['3:2',3/2],['2:3',2/3],['21:9',21/9]];
export function mediaAspectFrame(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return Object.freeze({ratio:'auto',aspectRatio:'auto',width:null,height:null});
 const actual=width/height,[ratio]=ratios.reduce((best,row)=>Math.abs(Math.log(row[1]/actual))<Math.abs(Math.log(best[1]/actual))?row:best,ratios[0]);
 return Object.freeze({ratio,aspectRatio:String(width)+' / '+String(height),width,height});
}

const scopeRank={global:1,card:2,chat:3};
const text=value=>String(value??'').trim();
export function mediaTargetCandidates(targets,name,table=''){
 return (targets??[]).filter(target=>(!table||target.table===table)&&(text(target.label)===text(name)||(target.aliases??[]).some(alias=>text(alias)===text(name))));
}
export function resolveMediaTarget(targets,name,table=''){
 const matches=mediaTargetCandidates(targets,name,table);return matches.length===1?matches[0]:null;
}

// One selector for stage portraits, variants, stickers and gated CG. It never
// borrows by display name and never treats a scene description as a condition.
export function selectBoundMedia(view,{entity='',use='portrait',variant='',lifeStage='',description=''}={}){
 const rows=(view?.rows??[]).filter(row=>row.applicable!==false&&(!entity||String(row.entity_ref??row.target?.entity??'')===String(entity))&&mediaUse(row)===use);
 const wantedVariant=text(variant),wantedStage=text(lifeStage),wantedDescription=text(description);
 let candidates=rows.filter(row=>{
  if(['expression','sticker','cg'].includes(use)&&text(row.display_variant)!==wantedVariant)return false;
  if(use==='portrait'&&wantedVariant&&text(row.display_variant)!==wantedVariant)return false;
  if(use==='cg'){
   if(view?.conditions?.[row.id]?.state!=='matched')return false;
   if(wantedDescription&&text(row.scene_description)!==wantedDescription)return false;
  }
  const stage=text(row.life_stage);return !wantedStage||!stage||stage===wantedStage;
 });
 if(use==='portrait'&&wantedVariant&&!candidates.length)candidates=rows.filter(row=>!text(row.display_variant)&&(!wantedStage||!text(row.life_stage)||text(row.life_stage)===wantedStage));
 const rank=row=>{
  const stage=text(row.life_stage),stageRank=wantedStage&&stage===wantedStage?2:stage?0:1,variantRank=wantedVariant&&text(row.display_variant)===wantedVariant?2:text(row.display_variant)?0:1;
  return [stageRank,variantRank,scopeRank[row.binding_scope]??0,Number(row.priority??0)];
 };
 return candidates.sort((a,b)=>{const left=rank(a),right=rank(b);for(let i=0;i<left.length;i++)if(left[i]!==right[i])return right[i]-left[i];return String(a.id).localeCompare(String(b.id));})[0]??null;
}
