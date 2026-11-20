(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const scopes=['world_ref','session_ref','branch_ref'];
  const useLabels={attachment:'内容附件',portrait:'立绘',avatar:'头像',expression:'表情',background:'背景',voice:'台词语音',music:'背景音乐',video:'视频',reference:'关联档案',tts:'TTS音色'};
  function key(t){return JSON.stringify([t.entity,t.field||'']);}
  function fits(b,t,s,variant=''){
    return b.enabled!==false && key(b.target)===key(t) && scopes.every(k=>!b.scope?.[k]||b.scope[k]===s?.[k]) && (!b.variant||b.variant===variant);
  }
  function links(media,target,scope,variant=''){
    return Object.entries(media||{}).flatMap(([id,m])=>(m['内容绑定']||[]).filter(b=>fits(b,target,scope,variant)).map(b=>({id,media:m,binding:b})))
      .sort((a,b)=>Number(!!b.binding.variant)-Number(!!a.binding.variant)||Number(!!b.binding.scope?.session_ref)-Number(!!a.binding.scope?.session_ref)||(a.binding.order||0)-(b.binding.order||0)||(b.binding.updatedAt||0)-(a.binding.updatedAt||0)||a.id.localeCompare(b.id));
  }
  function validateBinding(b){
    if(!b.target?.entity||typeof b.target.entity!=='string')throw Error('请选择要绑定的图鉴内容');
    if(!useLabels[b.use])throw Error('请选择用途');
    if(!b.scope?.world_ref)throw Error('当前内容缺少世界归属，不能保存绑定');
    return clone(b);
  }
  function attach(media,id,b){
    if(!media[id])throw Error('所选素材不存在');
    b=validateBinding(b);
    const type=assetType(media[id]);
    const allowed={portrait:['image','video','sequence'],avatar:['image'],expression:['image','video'],background:['image','map','effect'],voice:['audio'],music:['audio'],video:['video'],tts:['tts'],reference:['reference']};
    if(allowed[b.use]&&!allowed[b.use].includes(type))throw Error('所选素材类型不适合“'+useLabels[b.use]+'”，请修改用途或选择其他素材');
    const m=clone(media[id]);
    m['内容绑定']=(m['内容绑定']||[]).filter(x=>!(key(x.target)===key(b.target)&&x.use===b.use&&JSON.stringify(x.scope)===JSON.stringify(b.scope)&&x.variant===b.variant));
    m['内容绑定'].push(b);return m;
  }
  function detach(media,id,b){
    if(!media[id])throw Error('所选素材不存在');
    const m=clone(media[id]);m['内容绑定']=(m['内容绑定']||[]).filter(x=>JSON.stringify(x)!==JSON.stringify(b));return m;
  }
  function targets(s){
    const names={fate:'命途',persona:'心性',skills:'秘技',somatic:'躯体',echoes:'岁月',nexus:'命线',media:'声物'};
    const fields={outer_mask:'外显',inner_core:'心底',helix:'欲望',likes:'偏爱',dislikes:'厌恶',taboos:'禁忌',agenda:'计划',speech_style:'声口',stimuli:'触发反应',runes:'天赋与战技',proficiencies:'生活专长',weakness:'弱点',anatomy:'身体构造',estrous_title:'周期',estrous_sub:'周期说明',temp_delta:'体温变化',symptoms:'身体状态',reliefs:'缓解方式',anchors:'历史锚点',k_ledger:'认知记录',relations:'人物关系',secrets:'秘密',voices:'语音',emotions:'表情',holdings:'持有物',relics:'随身信物'};
    const result=[{entity:s.actor,field:'',label:(s.values['姓名']||s.actor)+' · 人物',group:'人物'}];
    for(const [field,value] of Object.entries(s.values||{})){
      if(field==='分卷档案')continue;
      result.push({entity:s.actor,field:'values/'+field,label:field,group:'命途字段'});
    }
    for(const [p,vol] of Object.entries(s.volumes||{})){
      result.push({entity:s.actor,field:'volumes/'+p,label:names[p]||p,group:'七卷内容'});
      for(const field of Object.keys(vol||{}))result.push({entity:s.actor,field:'volumes/'+p+'/'+field,label:(names[p]||p)+' / '+(fields[field]||field),group:'分卷栏目'});
    }
    for(const item of root.TisyaSkillsModel?.normalize(s.volumes?.skills||{},s.actor)||[])if(item.registered)result.push({entity:s.actor,field:'entries/skills/'+item.id,label:item.name,group:root.TisyaSkillsModel.kinds[item.kind]||'技能'});
    for(const [entity,a] of Object.entries(s.sub_archives||{}))result.push({entity,field:'',label:a.title||a.name||entity,group:'关联档案'});
    for(const [entity,label] of Object.entries(s.places||{}))if(!result.some(t=>t.entity===entity&&!t.field))result.push({entity,field:'',label,group:'地点'});
    return result;
  }
  function assetType(m){return m['载体类型']||'image';}
  function resolve(media,target,scope,use,variant=''){return links(media,target,scope,variant).find(x=>x.binding.use===use)||null;}
  const compositionLabels={auto:'自动 · 按图片比例',avatar:'头像',bust:'胸像',half:'半身像',figure:'全身立绘'};
  const backgroundLabels={auto:'自动识别透明底',transparent:'透明底 · 独立半框',opaque:'有背景 · 完整边框'};
  function presentation(value={}){
    return {composition:Object.hasOwn(compositionLabels,value.composition)?value.composition:'auto',background:Object.hasOwn(backgroundLabels,value.background)?value.background:'auto',focusY:Number.isFinite(Number(value.focusY))?Math.max(0,Math.min(100,Number(value.focusY))):20};
  }
  function imagePresentation(media={},binding={},info=media['媒体配置']?.imageInfo){
    const p=presentation(binding.presentation),ratio=info?.contentAspect||info?.width/info?.height;
    return {...p,layout:p.composition==='auto'?(ratio>=.92?'avatar':ratio>=.66?'bust':ratio>=.43?'half':ratio>0?'figure':'bust'):p.composition,
      frame:(p.background==='auto'?info?.background:p.background)==='transparent'?'cutout':'framed',aspect:Number.isFinite(ratio)&&ratio>0?ratio:'',known:info?.background==='opaque'||info?.background==='transparent'};
  }
  // Only image pixels determine transparency; extension and dimensions are not evidence of alpha.
  function analyseImageData({data,width,height},naturalWidth=width,naturalHeight=height){
    let clear=0,edge=0,edgeClear=0,left=width,top=height,right=-1,bottom=-1;
    const band=Math.max(1,Math.floor(Math.min(width,height)*.07));
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const alpha=data[(y*width+x)*4+3],border=x<band||y<band||x>=width-band||y>=height-band;
      if(alpha<240)clear++;if(border){edge++;if(alpha<240)edgeClear++;}
      if(alpha>24){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    }
    const visible=right>=left&&bottom>=top;
    return {width:naturalWidth,height:naturalHeight,background:!visible?'unknown':clear/(width*height)>.015&&edgeClear/edge>.12?'transparent':'opaque',
      contentAspect:visible?((right-left+1)/width*naturalWidth)/((bottom-top+1)/height*naturalHeight):naturalWidth/naturalHeight,
      bounds:visible?{left:left/width,top:top/height,right:(right+1)/width,bottom:(bottom+1)/height}:null};
  }
  const imageFacts=new Map();
  function inspectImage(url){
    if(imageFacts.has(url))return imageFacts.get(url);
    if(!url||!root.Image||!root.document)return Promise.resolve({background:'unknown',status:'unavailable'});
    const task=new Promise(resolve=>{
      const image=new root.Image();let done=false;
      const finish=value=>{if(done)return;done=true;clearTimeout(timer);image.onload=image.onerror=null;resolve(value);};
      const timer=setTimeout(()=>finish({background:'unknown',status:'unavailable'}),8000);
      image.onload=()=>{try{
        const canvas=root.document.createElement('canvas'),scale=Math.min(1,96/Math.max(image.naturalWidth,image.naturalHeight));
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
        finish({...analyseImageData(ctx.getImageData(0,0,canvas.width,canvas.height),image.naturalWidth,image.naturalHeight),status:'ready'});
      }catch(e){finish({width:image.naturalWidth,height:image.naturalHeight,background:'unknown',status:'unavailable'});}};
      image.onerror=()=>finish({background:'unknown',status:'unavailable'});
      if(/^https?:/i.test(url))image.crossOrigin='anonymous';image.src=url;
    });
    imageFacts.set(url,task);if(imageFacts.size>64)imageFacts.delete(imageFacts.keys().next().value);
    return task;
  }
  const api={clone,key,links,attach,detach,targets,resolve,assetType,useLabels,validateBinding,presentation,imagePresentation,analyseImageData,inspectImage,compositionLabels,backgroundLabels};
  root.TisyaMediaBindings=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
