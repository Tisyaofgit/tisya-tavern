import {decimal} from './common.mjs';
import {editReviewDocument} from './review-form-document.mjs';

export function mountReviewFormEditor(document,{service,onChange,onError}){
 const root=document.createElement('div');root.className='review-form-editor';
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const titles={cells:'本轮状态更新',archive:'本轮记忆归档'};
 const text=value=>value===undefined?'尚未填写':value===null?'明确无':typeof value==='object'?JSON.stringify(value):String(value);
 let ticket=0,job=Promise.resolve(),models=null,changes={},blocks={},errors=new Map();
 function render(readonly){
  root.replaceChildren();root.inert=false;
  for(const channel of ['cells','archive']){
   const section=el('section');section.className='review-form-channel';section.append(el('h3',titles[channel]));
   const model=models[channel];changes[channel]={};
   if(!model.groups.length)section.append(el('p',channel==='cells'?'本轮没有状态更新。':'本轮没有新增记忆。'));
   for(const group of model.groups){
    const card=el('fieldset');card.className='review-record';card.append(el('legend',group.title));
    for(const row of group.rows){
     if(row.hidden)continue;
     if(row.error){const warning=el('p',row.error);warning.className='review-field-warning';card.append(warning);continue;}
     const field=el('label'),name=el('strong',(row.recordName?row.recordName+' · ':'')+row.label),control=el(row.options?'select':row.type==='LONG_TEXT'||row.value.length>90?'textarea':'input');
     field.className='review-value-field';control.setAttribute('aria-label',titles[channel]+' · '+row.label);control.disabled=readonly;
     if(row.options){for(const value of [...new Set([row.value,...row.options])]){const opt=el('option',value);opt.value=value;control.append(opt);}}
     control.value=row.value;control.dataset.field=row.key;
     if(['NUMBER','INTEGER'].includes(row.type))control.inputMode='decimal';
     const saved=el('small','原值：'+(row.previousDisplay??text(row.previous))),effect=el('small');effect.className='review-field-effect';
     const updateEffect=()=>{
      const value=control.value,m=row.delta&&/^([+\-*/])\s*([+-]?\d+(?:\.\d+)?)$/.exec(value);
      if(m&&typeof row.previous==='number'){const n=Number(m[2]),old=row.previous,next=m[1]==='+'?decimal(old,n):m[1]==='-'?decimal(old,-n):m[1]==='*'?decimal(old,n,'*'):old/n;effect.textContent=Number.isFinite(next)?'本轮后：'+next:'请填写有效数值';}
      else effect.textContent='';effect.hidden=!effect.textContent;
     };updateEffect();
     const update=()=>{try{const value=editReviewDocument(model,changes[channel]);errors.delete(channel);blocks[channel]=value;onChange({...blocks});}catch(error){errors.set(channel,error);onError(error);}};
     control.addEventListener('input',()=>{changes[channel][row.start]=control.value;updateEffect();update();});
     field.append(name,saved,control,effect);if(row.help)field.append(el('small',row.help));
     if(channel==='archive'){
      const proof=el('input');proof.type='text';proof.value=row.evidence??'';proof.placeholder='P29';proof.disabled=readonly;proof.setAttribute('aria-label',titles[channel]+' · 正文段号依据');
      proof.addEventListener('input',()=>{changes[channel]['evidence:'+row.start]=proof.value;update();});
      field.append(el('small',row.evidence?'来源：正文第 '+row.evidence.replace(/P/g,'')+' 段':'正文段号依据（例如 P29）'),proof);
     }else if(row.evidence)field.append(el('small','来源：正文第 '+row.evidence.replace(/P/g,'')+' 段'));
     card.append(field);
    }
    section.append(card);
   }
   root.append(section);
  }
 }
 function load(input,{readonly=false}={}){
  const at=++ticket;errors.clear();blocks={cells:input.cells??'',archive:input.archive??''};root.replaceChildren(el('p','正在整理本轮表单…'));
  job=(async()=>{try{
   if(typeof service.describeTurnReview!=='function')throw Error('本轮字段预览服务尚未接入，请保留草稿。');
   const next=await service.describeTurnReview(input);if(at!==ticket)return;models=next;render(readonly);
  }catch(error){if(at!==ticket)return;errors.set('load',error);root.replaceChildren(el('p','本轮表单未能展开：'+error.message));onError(error);}})();return job;
 }
 return {root,load,rawChanged(){ticket++;root.inert=true;errors.set('raw',Error('原始文本已修改，请点“展开修改后的字段”核对后保存'));},async settled(){await job;if(errors.size)throw errors.values().next().value;},invalidate(){ticket++;errors.clear();root.replaceChildren();},};
}
