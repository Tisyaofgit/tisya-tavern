import {MEDIA_USE_LABELS,MEDIA_SCOPE_LABELS} from './media-atlas.js';

const CSS=`
.tisya-media-atlas{display:grid;gap:12px;margin:0 0 18px}.tisya-media-atlas *{box-sizing:border-box}.tisya-media-atlas [hidden]{display:none!important}.tisya-media-atlas-form{display:grid;gap:4px;padding:12px;border:1px solid #b9a66d55;border-radius:10px;background:#041d1866}.tisya-media-atlas-form label{display:grid;gap:6px;margin:4px 0}.tisya-media-atlas-form input,.tisya-media-atlas-form select{max-width:100%;min-width:0;min-height:44px}.tisya-media-atlas-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.tisya-media-card{display:grid;grid-template-rows:120px auto;gap:8px;min-width:0;padding:10px;border:1px solid #b9a66d44;border-radius:10px;background:#041d1888;overflow:hidden}.tisya-media-card img{width:100%;height:120px;object-fit:contain;background:#001b1744;border-radius:6px}.tisya-media-card p{margin:0;font-size:13px;line-height:1.55;overflow-wrap:anywhere}.tisya-media-card button{min-height:40px}.tisya-media-atlas-note{margin:0;font-size:13px;line-height:1.65;color:#d7d4b8}.tisya-media-atlas [role=alert]{color:#edbd9d}@media(max-width:420px){.tisya-media-atlas-list{grid-template-columns:repeat(2,minmax(0,1fr))}.tisya-media-card{grid-template-rows:100px auto}.tisya-media-card img{height:100px}}
`;

async function imageSize(file,document){
 const win=document.defaultView??globalThis;
 if(win.createImageBitmap){const bitmap=await win.createImageBitmap(file);try{return {width:bitmap.width,height:bitmap.height};}finally{bitmap.close?.();}}
 const url=win.URL.createObjectURL(file);try{const image=new win.Image();image.src=url;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};}finally{win.URL.revokeObjectURL(url);}
}

export function renderMediaAtlas(document,body,{atlas,button,field,input,el}){
 const section=el('section',null,'tisya-media-atlas'),style=el('style');style.textContent=CSS;section.append(style);
 section.append(el('h3','本地图鉴 · 人物与物品'),el('p','绑定到已落账的对象档案条目。范围优先级：本聊天 → 角色卡 → 全局；角色卡与全局按同一来源书条目的稳定档案身份跨聊天复用，同名但来源不同的对象不会继承绑定。对白【人物#情绪】仍优先使用精确情绪表情。图片与跨聊天绑定保存在此浏览器，不写入角色卡或存档 JSON，请保留原文件。','tisya-media-atlas-note'));
 const form=el('div',null,'tisya-media-atlas-form'),list=el('div',null,'tisya-media-atlas-list'),status=el('p',null,'tisya-media-atlas-note');status.setAttribute('role','status');
 let alive=true,file=null,dimensions=null,use='avatar',scope='chat',armed=null,readToken=0,reading=Promise.resolve();
 const fileControl=el('input');fileControl.type='file';fileControl.accept='image/png,image/jpeg,image/webp,image/gif,image/avif';fileControl.setAttribute('aria-label','选择图鉴图片');
 const targetControl=el('select');targetControl.className='text_pole';targetControl.setAttribute('aria-label','绑定人物或物品');
 const scopeControl=el('select');scopeControl.className='text_pole';scopeControl.setAttribute('aria-label','绑定范围');for(const [value,label]of Object.entries(MEDIA_SCOPE_LABELS)){const option=el('option',label);option.value=value;scopeControl.append(option);}
 const cardControl=el('select');cardControl.className='text_pole';cardControl.setAttribute('aria-label','绑定角色卡');const cardRow=field('角色卡（跨该卡的聊天使用）',cardControl);cardRow.hidden=true;
 const useControl=el('select');useControl.className='text_pole';useControl.setAttribute('aria-label','图片用途');for(const [value,label]of Object.entries(MEDIA_USE_LABELS)){const option=el('option',label);option.value=value;useControl.append(option);}
 const variantControl=input('',value=>variant=value);variantControl.setAttribute('aria-label','情绪名称');variantControl.placeholder='例如：平静、开心、冷漠';let variant=String(variantControl.value??'');
 const variantRow=field('情绪名称（与【人物#情绪】逐字一致）',variantControl);variantRow.hidden=true;
 fileControl.onchange=()=>{const token=++readToken;status.textContent='';status.setAttribute('role','status');dimensions=null;file=fileControl.files?.[0]??null;reading=(async()=>{if(!file)return;try{const size=await imageSize(file,document);if(!alive||token!==readToken)return;dimensions=size;status.textContent='已读取图片：'+size.width+' × '+size.height;}catch(error){if(!alive||token!==readToken)return;file=null;fileControl.value='';status.setAttribute('role','alert');status.textContent='图片无法解码：'+error.message;}})();};
 useControl.onchange=()=>{use=useControl.value;variantRow.hidden=use!=='expression';};
 scopeControl.onchange=()=>{scope=scopeControl.value;drawCards();};
 function drawCards(){
  const cards=atlas.view().cards??[],selected=cardControl.value,cardOption=[...scopeControl.options].find(option=>option.value==='card');if(cardOption)cardOption.disabled=!cards.length;
  if(scope==='card'&&!cards.length){scope='chat';scopeControl.value='chat';}
  cardControl.replaceChildren();const empty=el('option','请选择角色卡');empty.value='';cardControl.append(empty);for(const card of cards){const option=el('option',card.name+' · '+card.id);option.value=card.id;cardControl.append(option);}
  cardControl.value=cards.some(card=>card.id===selected)?selected:cards.length===1?cards[0].id:'';cardControl.tisyaRefresh?.();cardRow.hidden=scope!=='card';
 }
 form.append(field('图片文件（最大 20 MiB）',fileControl),field('绑定到',targetControl),field('绑定范围',scopeControl),cardRow,field('用途',useControl),variantRow);
 const submit=button('上传并绑定',async()=>{
  await reading;const view=atlas.view(),target=view.targets.find(row=>row.entity===targetControl.value),card=(view.cards??[]).find(row=>row.id===cardControl.value);if(!file)throw Error('请先选择图片文件');
  await atlas.importImage({file,target,use,scope,card,variant,width:dimensions?.width,height:dimensions?.height});file=null;dimensions=null;fileControl.value='';variantControl.value='';variant='';draw();status.setAttribute('role','status');status.textContent='图片已保存到「'+MEDIA_SCOPE_LABELS[scope]+'」，聊天头像与对白绑定已刷新。';
 });
 form.append(submit);section.append(form,status,list);body.append(section);
 function draw(){
  if(!alive)return;const view=atlas.view(),selected=targetControl.value;targetControl.replaceChildren();const empty=el('option','请选择人物或物品');empty.value='';targetControl.append(empty);
  for(const group of ['人物','物品']){const rows=view.targets.filter(x=>x.group===group);if(!rows.length)continue;const optgroup=el('optgroup');optgroup.label=group;for(const row of rows){const option=el('option',row.label+' · '+row.entity);option.value=row.entity;optgroup.append(option);}targetControl.append(optgroup);}
  targetControl.value=view.targets.some(x=>x.entity===selected)?selected:'';targetControl.tisyaRefresh?.();drawCards();list.replaceChildren();
  if(!view.rows.length){list.append(el('p','当前范围还没有本地媒体绑定。','tisya-media-atlas-note'));return;}
  for(const row of view.rows){const card=el('article',null,'tisya-media-card');if(row.url){const image=el('img');image.src=row.url;image.alt=(row.target?.label??row.entity_ref)+' · '+(row.purpose??row.kind);image.loading='lazy';card.append(image);}else card.append(el('p','图片原件未找到或尚未载入。'));
   const info=el('div'),scopeText=row.binding_scope_label??MEDIA_SCOPE_LABELS.chat,detail=(row.target?.label??row.entity_ref??'未绑定')+' · '+scopeText+(row.card_name?' · '+row.card_name:'')+' · '+(row.purpose??row.kind)+(row.display_variant?' · '+row.display_variant:'')+(row.applicable===false?' · 当前聊天无同名档案':'');info.append(el('p',detail));
   const remove=button(armed===row.id?'再次点击确认移除':'解除绑定',async()=>{if(armed!==row.id){armed=row.id;draw();return;}await atlas.remove(row.id);armed=null;draw();});info.append(remove);card.append(info);list.append(card);
  }
 }
 draw();atlas.request().then(draw).catch(error=>{if(alive){status.setAttribute('role','alert');status.textContent=error.message;}});
 return {dispose(){alive=false;}};
}
