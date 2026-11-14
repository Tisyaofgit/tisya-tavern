import {renderUserPreferences} from './user-preferences-ui.mjs';
import {renderPreferencePackages} from './preference-package-ui.mjs';
import {renderPreferenceText} from './preference-text-ui.mjs';
import {PREFERENCE_GROUPS,effectivePreferences,preferenceOptions,preferenceTextKey} from './preferences.mjs';
import {storyAvatar} from './identity.mjs';
import {selectControl} from './form-controls.mjs';
import {renderingResources,RESOURCE_SLOTS} from '../rendering-resources.js';

export function renderPreferences(document,body,{config,changed,button,navigationButton=button,field,input,el,onIdentity,historyLimit,editor,download,assistant}){
 const option=(label,value)=>{const n=document.createElement('option');n.textContent=label;n.value=value;return n;};
 let scope='story';
 const intro=el('p','选择叙事、文风、情节和人物表现。沿用预设会保留当前完整原文；明确选择后，下轮请求只在对应位置写入所选效果。');
 const scopes=el('select');scopes.className='text_pole';scopes.style.cssText='width:100%;min-width:0;max-width:100%';scopes.setAttribute('aria-label','偏好范围');
 for(const [id,label]of [['story','当前故事'],['global','所有故事默认']])scopes.append(option(label,id));
 const area=el('div'),search=input('',()=>filter());search.setAttribute('aria-label','搜索偏好');search.placeholder='搜索名称或原文';body.append(intro,field('偏好范围',scopes),field('搜索偏好',search),area);
 function filter(){const q=search.value.trim().toLocaleLowerCase();for(const box of area.querySelectorAll('[data-preference-group]')){box.hidden=!!q&&!(box.dataset.preferenceKeywords??'').includes(q)&&!box.textContent.toLocaleLowerCase().includes(q)&&![...box.querySelectorAll('textarea')].some(n=>n.value.toLocaleLowerCase().includes(q));if(q&&!box.hidden)box.parentElement.open=true;}}
 const owner=()=>scope==='global'?(config.playDefaults??={choices:{},parameters:{}}):(config.story.play??={choices:{},parameters:{}});
 const chosen=()=>scope==='global'?config.playDefaults??{}:effectivePreferences(config);
 const set=(id,value)=>{const target=owner();target.choices??={};target.choices[id]=value;changed();};
 function addCustom(group,name=group.label+' · 自定义',text=''){const id=crypto.randomUUID(),selection=group.multiple?['custom:'+id]:'custom:'+id;const records=scope==='story'?editor.rows:((config.playDefaults??={}).textOverrides??={});records[preferenceTextKey(group.id,selection)]={id,group:group.id,selection:JSON.stringify(selection),kind:'custom',name,text,enabled:true};set(group.id,selection);draw();}
 function draw(){
  area.replaceChildren();const value=chosen(),sections=new Map(),avatar=storyAvatar(config),binding=avatar.binding;const summary=el('fieldset');summary.dataset.avatarSummary='';summary.append(el('legend','主控化身绑定'),el('p',binding?'当前角色：'+(config.story.userName||'')+' · '+(binding.database?'当前表单 / '+binding.dossierId:binding.book+' / '+binding.uid):avatar.mode==='bound'?'尚未选择角色档案':avatar.mode==='ensemble'?'无主控纯群像 / 场外导演模式':avatar.mode==='generic'?'通用':'不绑定角色'),navigationButton('前往用户身份选择档案',onIdentity));area.append(summary);
  for(const group of PREFERENCE_GROUPS){
   if(['W','N01'].includes(group.id))continue;
   const category=['文风与凝视','技法与场合'].includes(group.section)?'文风与技法':'游玩规则';
   let section=sections.get(category);
   if(!section){section=el('details');section.open=sections.size===0;section.append(el('summary',category));sections.set(category,section);area.append(section);}
   if(group.id==='S08-Dial')section.append(el('h3','描写占比'),el('p','对白、外貌与心理可分别选择侧重；强度表示行文重点。第一人称心声可单独设置，主控内心仍遵循“主控心理与生理边界”。'));
   const box=el('fieldset');box.style.minWidth='0';box.dataset.preferenceGroup=group.id;if(['S08-Dial','S08-Look','S08-Mind','S08-MindVoice'].includes(group.id))box.dataset.preferenceKeywords='描写占比';box.append(el('legend',group.label));
   const selected=value.choices?.[group.id];
   if(!group.multiple){
    const select=el('select');select.className='text_pole';select.style.cssText='width:100%;min-width:0;max-width:100%';select.setAttribute('aria-label',group.label);select.append(option('沿用完整预设',''));
    for(const choice of preferenceOptions(group,config,scope==='story'?editor?.rows:{}))select.append(option(choice.label,choice.id));
    select.value=selected??'';select.onchange=()=>{set(group.id,select.value||null);draw();};box.append(selectControl(document,select));
   }else{
    const note=el('small',selected==null?'当前沿用完整预设；勾选后采用本组勾选结果。':'当前采用本组勾选结果。');box.append(note);
    const checks=[];
    for(const option of preferenceOptions(group,config,scope==='story'?editor?.rows:{})){const check=el('input');check.type='checkbox';check.value=option.id;check.checked=Array.isArray(selected)&&selected.includes(option.id);check.setAttribute('aria-label',option.label);checks.push(check);check.onchange=()=>{set(group.id,checks.filter(i=>i.checked).map(i=>i.value));note.textContent='当前采用本组勾选结果。';draw();};const row=field(option.label,check);row.classList.add('tisya-check-row');row.style.display='flex';row.style.alignItems='center';row.style.justifyContent='space-between';box.append(row);}
    box.append(button('沿用本组预设',()=>{set(group.id,null);draw();}),button('关闭本组',()=>{set(group.id,[]);draw();}));
   }
   if(scope==='story'&&Object.hasOwn(config.story.play?.choices??{},group.id))box.append(button('恢复默认继承',()=>{delete config.story.play.choices[group.id];changed();draw();}));
   if(editor)try{renderPreferenceText(document,box,{group,scope,config,editor,changed,button,input,field,el,onCopy:addCustom,assistant});}catch(error){const warning=el('p',error.message+'；本组原文编辑暂不可用，请重新选择或载入完整预设。');warning.setAttribute('role','alert');box.append(warning);}
   if(editor)box.append(button('新建自定义项',()=>addCustom(group)));
   section.append(box);
  }
  const params=el('details');params.append(el('summary','语言与篇幅'));
  for(const [id,label,type,fallback]of [['main_language','主语言','text','中文'],['min_length','正文最少字数','number',2000],['max_length','正文最多字数','number',5000]]){
   const control=input(value.parameters?.[id]??'',v=>{const target=owner();target.parameters??={};if(v==='')delete target.parameters[id];else target.parameters[id]=type==='number'?Number(v):v;changed();},{type});control.placeholder=String(fallback);control.setAttribute('aria-label',label);params.append(field(label,control));
  }

  const history=el('fieldset');history.append(el('legend','历史可见记忆条数'));const limit=input(value.parameters?.history_messages??historyLimit?.()??50,v=>{const target=owner();target.parameters??={};if(v==='')delete target.parameters.history_messages;else target.parameters.history_messages=Number(v);changed();},{type:'number'});limit.min='0';limit.step='1';limit.setAttribute('aria-label','历史聊天条数（当前输入始终保留）');history.append(field('历史聊天条数（当前输入始终保留）',limit));area.append(history);
  area.append(params);if(editor)renderUserPreferences(document,area,{scope,config,editor,changed,draw,button,input,field,el,assistant});if(editor&&download)try{renderPreferencePackages(document,area,{scope,config,editor,changed,draw,button,input,field,el,download});}catch(error){const warning=el('p','偏好包暂不可用：'+error.message+'；请重新载入完整预设后再导出。');warning.setAttribute('role','alert');area.append(warning);}filter();
 }
 scopes.onchange=()=>{scope=scopes.value;draw();};draw();
}

export function renderResources(document,body,{config,changed,button,field,input,el}){
 body.append(el('p','在这里登记资源。全部资源自动汇入同一段多媒体提示词，AI 用 @rendering{ID} 引用。'));
 const list=el('div');body.append(list);
 function draw(){list.replaceChildren();for(const resource of renderingResources(config.resources??[])){const row=el('p',resource.id+' · '+resource.name+' · '+resource.kind+' · '+RESOURCE_SLOTS[resource.slot]);list.append(row);}}
 draw();const initial={id:'',name:'',kind:'image',slot:'body',url:''},draft={...initial},controls={};
 const isDirty=()=>Object.keys(initial).some(key=>draft[key]!==initial[key]);
 const nextResources=()=>{const resources=[...(config.resources??[]),{...draft}];renderingResources(resources);return resources;};
 for(const [key,label]of [['id','参数 ID'],['name','资源含义'],['url','资源地址']]){const control=input('',value=>draft[key]=value);control.setAttribute('aria-label',label);controls[key]=control;body.append(field(label,control));}
 for(const [key,label,options]of [['kind','资源类型',['image','audio','video','emotion']],['slot','对应位置',Object.keys(RESOURCE_SLOTS)]]){const control=input(draft[key],value=>draft[key]=value,{options});control.setAttribute('aria-label',label);controls[key]=control;body.append(field(label,control));}
 body.append(button('加入资源列表',()=>{config.resources=nextResources();Object.assign(draft,initial);for(const [key,control]of Object.entries(controls)){control.value=draft[key];control.tisyaRefresh?.();}changed();draw();}),el('small','加入列表后仍是本页草稿，点击底部“保存”才会生效。也可填写完整一条资源后直接保存。'));
 return {isDirty,prepareSave:()=>isDirty()?{...config,resources:nextResources()}:config};
}
