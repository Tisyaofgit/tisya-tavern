import {MEDIA_USE_LABELS,MEDIA_SCOPE_LABELS,mediaAspectFrame} from './media-atlas.js';
import {MEDIA_CALL_TABLE} from './media-contract.js';

const CSS=`
.tisya-media-atlas{display:grid;gap:12px;margin:0 0 18px}.tisya-media-atlas *{box-sizing:border-box}.tisya-media-atlas [hidden]{display:none!important}.tisya-media-atlas-form{display:grid;gap:4px;padding:12px;border:1px solid #b9a66d55;border-radius:10px;background:#041d1866}.tisya-media-atlas-form label{display:grid;gap:6px;margin:4px 0}.tisya-media-atlas-form input,.tisya-media-atlas-form select{max-width:100%;min-width:0;min-height:44px}.tisya-media-atlas-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}.tisya-media-card{display:grid;align-content:start;gap:8px;min-width:0;padding:10px;border:1px solid #b9a66d44;border-radius:10px;background:#041d1888;overflow:hidden}.tisya-media-frame{display:grid;place-items:center;width:100%;max-height:240px;aspect-ratio:var(--tisya-media-ratio,auto);overflow:hidden;border:1px solid #b9a66d33;border-radius:8px;background:#001b1744}.tisya-media-frame img{display:block;width:100%;height:100%;max-height:240px;object-fit:contain}.tisya-media-card p{margin:0;font-size:13px;line-height:1.55;overflow-wrap:anywhere}.tisya-media-card button{min-height:40px}.tisya-media-atlas-note{margin:0;font-size:13px;line-height:1.65;color:#d7d4b8}.tisya-media-calls{border-collapse:collapse;width:100%;font-size:13px}.tisya-media-calls th,.tisya-media-calls td{padding:7px;text-align:left;border-bottom:1px solid #b9a66d33}.tisya-media-atlas [role=alert]{color:#edbd9d}@media(max-width:420px){.tisya-media-atlas-list{grid-template-columns:repeat(2,minmax(0,1fr))}.tisya-media-frame,.tisya-media-frame img{max-height:190px}}
`;

async function imageSize(file,document){
 const win=document.defaultView??globalThis;
 if(win.createImageBitmap){const bitmap=await win.createImageBitmap(file);try{return {width:bitmap.width,height:bitmap.height};}finally{bitmap.close?.();}}
 const url=win.URL.createObjectURL(file);try{const image=new win.Image();image.src=url;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};}finally{win.URL.revokeObjectURL(url);}
}

export function renderMediaAtlas(document,body,{atlas,button,field,input,el}){
 const section=el('section',null,'tisya-media-atlas'),style=el('style');style.textContent=CSS;section.append(style);
 section.append(el('h3','本地图鉴 · 全部对象'),el('p','绑定到稳定对象实体，支持生命阶段立绘、同阶段差分、条件CG与通用表情。范围优先级：本聊天 → 角色卡 → 全局；同名对象不会互相借图。图片与跨聊天绑定保存在此浏览器，不写入角色卡或存档 JSON，请保留原文件。','tisya-media-atlas-note'));
 const calls=el('details'),callSummary=el('summary','多媒体调用简表'),callTable=el('table');callTable.className='tisya-media-calls';const head=el('tr');head.append(el('th','位置'),el('th','可用填写内容'));callTable.append(head);for(const row of MEDIA_CALL_TABLE){const line=el('tr');line.append(el('td',row.位置),el('td',row.可用填写内容));callTable.append(line);}calls.append(callSummary,callTable);section.append(calls);
 const form=el('div',null,'tisya-media-atlas-form'),list=el('div',null,'tisya-media-atlas-list'),status=el('p',null,'tisya-media-atlas-note');status.setAttribute('role','status');
 let alive=true,file=null,dimensions=null,use='avatar',scope='chat',variant='',lifeStage='',sceneDescription='',triggerCondition='',armed=null,readToken=0,reading=Promise.resolve();
 const fileControl=el('input');fileControl.type='file';fileControl.accept='image/png,image/jpeg,image/webp,image/gif,image/avif';fileControl.setAttribute('aria-label','选择图鉴图片');
 const targetControl=el('select');targetControl.className='text_pole';targetControl.setAttribute('aria-label','绑定对象');
 const scopeControl=el('select');scopeControl.className='text_pole';scopeControl.setAttribute('aria-label','绑定范围');for(const [value,label]of Object.entries(MEDIA_SCOPE_LABELS)){const option=el('option',label);option.value=value;scopeControl.append(option);}
 const cardControl=el('select');cardControl.className='text_pole';cardControl.setAttribute('aria-label','绑定角色卡');const cardRow=field('角色卡（跨该卡的聊天使用）',cardControl);cardRow.hidden=true;const targetRow=field('绑定到',targetControl);
 const useControl=el('select');useControl.className='text_pole';useControl.setAttribute('aria-label','图片用途');for(const [value,label]of Object.entries(MEDIA_USE_LABELS)){const option=el('option',label);option.value=value;useControl.append(option);}
 const variantControl=input('',value=>variant=value);variantControl.setAttribute('aria-label','情绪或媒体名称');variantControl.placeholder='例如：平静、开心、冷漠';
 const variantRow=field('差分情绪／表情名／CG名称',variantControl);variantRow.hidden=true;
 const lifeStageControl=input('',value=>lifeStage=value);lifeStageControl.setAttribute('aria-label','生命线阶段');lifeStageControl.placeholder='与档案当前生命阶段逐字一致；留空为全阶段';const lifeStageRow=field('生命线阶段（可空）',lifeStageControl);lifeStageRow.hidden=true;
 const sceneControl=input('',value=>sceneDescription=value);sceneControl.setAttribute('aria-label','CG场景描述');const sceneRow=field('CG场景描述',sceneControl);sceneRow.hidden=true;
 const conditionControl=input('',value=>triggerCondition=value);conditionControl.setAttribute('aria-label','CG规范条件组ID');conditionControl.placeholder='M_CONDITIONS 中已登记的条件组ID';const conditionRow=field('CG规范条件组ID',conditionControl);conditionRow.hidden=true;
 fileControl.onchange=()=>{const token=++readToken;status.textContent='';status.setAttribute('role','status');dimensions=null;file=fileControl.files?.[0]??null;reading=(async()=>{if(!file)return;try{const size=await imageSize(file,document);if(!alive||token!==readToken)return;dimensions=size;status.textContent='已读取图片：'+size.width+' × '+size.height+' · '+mediaAspectFrame(size.width,size.height).ratio+' 框体';}catch(error){if(!alive||token!==readToken)return;file=null;fileControl.value='';status.setAttribute('role','alert');status.textContent='图片无法解码：'+error.message;}})();};
 useControl.onchange=()=>{use=useControl.value;variantRow.hidden=use==='avatar';lifeStageRow.hidden=!['portrait','expression'].includes(use);sceneRow.hidden=use!=='cg';conditionRow.hidden=use!=='cg';targetRow.hidden=use==='sticker';};
 scopeControl.onchange=()=>{scope=scopeControl.value;drawCards();};
 function drawCards(){
  const cards=atlas.view().cards??[],selected=cardControl.value,cardOption=[...scopeControl.options].find(option=>option.value==='card');if(cardOption)cardOption.disabled=!cards.length;
  if(scope==='card'&&!cards.length){scope='chat';scopeControl.value='chat';}
  cardControl.replaceChildren();const empty=el('option','请选择角色卡');empty.value='';cardControl.append(empty);for(const card of cards){const option=el('option',card.name+' · '+card.id);option.value=card.id;cardControl.append(option);}
  cardControl.value=cards.some(card=>card.id===selected)?selected:cards.length===1?cards[0].id:'';cardControl.tisyaRefresh?.();cardRow.hidden=scope!=='card';
 }
 form.append(field('图片文件（最大 20 MiB）',fileControl),targetRow,field('绑定范围',scopeControl),cardRow,field('用途',useControl),variantRow,lifeStageRow,sceneRow,conditionRow);
 const submit=button('上传并绑定',async()=>{
  await reading;const view=atlas.view(),target=view.targets.find(row=>row.entity===targetControl.value),card=(view.cards??[]).find(row=>row.id===cardControl.value);if(!file)throw Error('请先选择图片文件');
  await atlas.importImage({file,target,use,scope,card,variant,lifeStage,sceneDescription,triggerCondition,width:dimensions?.width,height:dimensions?.height});file=null;dimensions=null;fileControl.value='';variantControl.value='';lifeStageControl.value='';sceneControl.value='';conditionControl.value='';variant='';lifeStage='';sceneDescription='';triggerCondition='';draw();status.setAttribute('role','status');status.textContent='图片已保存到「'+MEDIA_SCOPE_LABELS[scope]+'」，媒体绑定与条件状态已刷新。';
 });
 form.append(submit);section.append(form,status,list);body.append(section);
 function draw(){
  if(!alive)return;const view=atlas.view(),selected=targetControl.value;targetControl.replaceChildren();const empty=el('option','通用表情无需选择对象');empty.value='';targetControl.append(empty);
  for(const group of [...new Set(view.targets.map(row=>row.group))]){const rows=view.targets.filter(x=>x.group===group);if(!rows.length)continue;const optgroup=el('optgroup');optgroup.label=group;for(const row of rows){const option=el('option',row.label+' · '+row.entity);option.value=row.entity;optgroup.append(option);}targetControl.append(optgroup);}
  targetControl.value=view.targets.some(x=>x.entity===selected)?selected:'';targetControl.tisyaRefresh?.();drawCards();list.replaceChildren();
  if(!view.rows.length){list.append(el('p','当前范围还没有本地媒体绑定。','tisya-media-atlas-note'));return;}
  for(const row of view.rows){const card=el('article',null,'tisya-media-card');if(row.url){const frame=mediaAspectFrame(Number(row.width),Number(row.height)),frameNode=el('div',null,'tisya-media-frame');frameNode.style.setProperty('--tisya-media-ratio',frame.aspectRatio);frameNode.dataset.ratio=frame.ratio;const image=el('img');image.src=row.url;image.alt=(row.target?.label??row.entity_ref??'通用表情')+' · '+(row.purpose??row.kind);image.loading='lazy';frameNode.append(image);card.append(frameNode);}else card.append(el('p','图片原件未找到或尚未载入。'));
   const info=el('div'),scopeText=row.binding_scope_label??MEDIA_SCOPE_LABELS.chat,condition=view.conditions?.[row.id];
   const details=[row.target?.label??row.entity_ref??'通用表情',scopeText,row.card_name,row.purpose??row.kind,row.display_variant,row.life_stage];
   if(condition)details.push(condition.state==='matched'?'条件已通过':'条件未通过');
   if(row.applicable===false)details.push('当前聊天无对应稳定档案');
   info.append(el('p',details.filter(Boolean).join(' · ')));
   const remove=button(armed===row.id?'再次点击确认移除':'解除绑定',async()=>{if(armed!==row.id){armed=row.id;draw();return;}await atlas.remove(row.id);armed=null;draw();});info.append(remove);card.append(info);list.append(card);
  }
 }
 draw();atlas.request().then(draw).catch(error=>{if(alive){status.setAttribute('role','alert');status.textContent=error.message;}});
 return {dispose(){alive=false;}};
}
