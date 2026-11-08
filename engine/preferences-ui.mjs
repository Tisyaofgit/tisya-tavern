import {PREFERENCE_GROUPS,effectivePreferences} from './preferences.mjs';
import {storyAvatar} from './identity.mjs';
import {renderingResources,RESOURCE_SLOTS} from '../rendering-resources.js';

export function renderPreferences(document,body,{config,changed,save,button,field,input,el,onIdentity,historyLimit}){
 const option=(label,value)=>{const n=document.createElement('option');n.textContent=label;n.value=value;return n;};
 let scope='story';
 const intro=el('p','选择叙事、文风、情节和人物表现。沿用预设会保留当前完整原文；明确选择后，下轮请求只在对应位置写入所选效果。');
 const scopes=el('select');scopes.className='text_pole';scopes.style.cssText='width:100%;min-width:0;max-width:100%';scopes.setAttribute('aria-label','偏好范围');
 for(const [id,label]of [['story','当前故事'],['global','所有故事默认']])scopes.append(option(label,id));
 const area=el('div');body.append(intro,field('偏好范围',scopes),area);
 const owner=()=>scope==='global'?(config.playDefaults??={choices:{},parameters:{}}):(config.story.play??={choices:{},parameters:{}});
 const chosen=()=>scope==='global'?config.playDefaults??{}:effectivePreferences(config);
 const set=(id,value)=>{const target=owner();target.choices??={};target.choices[id]=value;changed();};
 function draw(){
  area.replaceChildren();const value=chosen(),sections=new Map(),avatar=storyAvatar(config),binding=avatar.binding;const summary=el('fieldset');summary.dataset.avatarSummary='';summary.append(el('legend','主控化身绑定'),el('p',binding?'当前角色：'+(config.story.userName||'')+' · '+binding.book+' / '+binding.uid:avatar.mode==='bound'?'尚未选择角色档案':avatar.mode==='ensemble'?'无主控纯群像 / 场外导演模式':avatar.mode==='generic'?'通用':'不绑定角色'),button('前往用户身份选择档案',onIdentity));area.append(summary);
  for(const group of PREFERENCE_GROUPS){
   if(['W','N01'].includes(group.id))continue;
   let section=sections.get(group.section);
   if(!section){section=el('details');section.open=sections.size===0;section.append(el('summary',group.section));sections.set(group.section,section);area.append(section);}
   const box=el('fieldset');box.style.minWidth='0';box.dataset.preferenceGroup=group.id;box.append(el('legend',group.label));
   const selected=value.choices?.[group.id];
   if(!group.multiple){
    const select=el('select');select.className='text_pole';select.style.cssText='width:100%;min-width:0;max-width:100%';select.setAttribute('aria-label',group.label);select.append(option('沿用完整预设',''));
    for(const choice of group.options)select.append(option(choice.label,choice.id));
    select.value=selected??'';select.onchange=()=>set(group.id,select.value||null);box.append(select);
   }else{
    const note=el('small',selected==null?'当前沿用完整预设；勾选后采用本组勾选结果。':'当前采用本组勾选结果。');box.append(note);
    const checks=[];
    for(const option of group.options){const check=el('input');check.type='checkbox';check.value=option.id;check.checked=Array.isArray(selected)&&selected.includes(option.id);check.setAttribute('aria-label',option.label);checks.push(check);check.onchange=()=>{set(group.id,checks.filter(i=>i.checked).map(i=>i.value));note.textContent='当前采用本组勾选结果。';};box.append(field(option.label,check));}
    box.append(button('沿用本组预设',()=>{set(group.id,null);draw();}),button('关闭本组',()=>{set(group.id,[]);draw();}));
   }
   if(scope==='story'&&Object.hasOwn(config.story.play?.choices??{},group.id))box.append(button('恢复默认继承',()=>{delete config.story.play.choices[group.id];changed();draw();}));
   section.append(box);
  }
  const params=el('details');params.append(el('summary','语言与篇幅'));
  for(const [id,label,type,fallback]of [['main_language','主语言','text','中文'],['min_length','正文最少字数','number',2000],['max_length','正文最多字数','number',5000]]){
   const control=input(value.parameters?.[id]??'',v=>{const target=owner();target.parameters??={};if(v==='')delete target.parameters[id];else target.parameters[id]=type==='number'?Number(v):v;changed();},{type});control.placeholder=String(fallback);control.setAttribute('aria-label',label);params.append(field(label,control));
  }

  const history=el('fieldset');history.append(el('legend','历史可见记忆条数'));const limit=input(value.parameters?.history_messages??historyLimit?.()??50,v=>{const target=owner();target.parameters??={};if(v==='')delete target.parameters.history_messages;else target.parameters.history_messages=Number(v);changed();},{type:'number'});limit.min='0';limit.step='1';limit.setAttribute('aria-label','历史聊天条数（当前输入始终保留）');history.append(field('历史聊天条数（当前输入始终保留）',limit));area.append(history);
  area.append(params,button('保存游玩偏好',save));
 }
 scopes.onchange=()=>{scope=scopes.value;draw();};draw();
}

export function renderResources(document,body,{config,changed,save,button,field,input,el}){
 body.append(el('p','在这里登记资源。全部资源自动汇入同一段多媒体提示词，AI 用 @rendering{ID} 引用。'));
 const list=el('div');body.append(list);
 function draw(){list.replaceChildren();for(const resource of renderingResources(config.resources??[])){const row=el('p',resource.id+' · '+resource.name+' · '+resource.kind+' · '+RESOURCE_SLOTS[resource.slot]);list.append(row);}}
 draw();const draft={id:'',name:'',kind:'image',slot:'body',url:''};
 for(const [key,label]of [['id','参数 ID'],['name','资源含义'],['url','资源地址']]){const control=input('',v=>draft[key]=v);control.setAttribute('aria-label',label);body.append(field(label,control));}
 body.append(field('资源类型',input(draft.kind,v=>draft.kind=v,{options:['image','audio','video','emotion']})),field('对应位置',input(draft.slot,v=>draft.slot=v,{options:Object.keys(RESOURCE_SLOTS)})));
 body.append(button('登记并保存资源',async()=>{const resources=[...(config.resources??[]),{...draft}];renderingResources(resources);config.resources=resources;changed();await save();draw();}));
}
