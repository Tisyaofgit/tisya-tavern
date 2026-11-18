import {renderUserPreferences} from './user-preferences-ui.mjs';
import {renderPreferencePackages} from './preference-package-ui.mjs';
import {renderPreferenceText} from './preference-text-ui.mjs';
import {preferenceStyles} from './preference-styles.mjs';
import {PREFERENCE_GROUPS,effectivePreferences,preferenceOptions,preferenceTextKey} from './preferences.mjs';
import {storyAvatar} from './identity.mjs';
import {selectControl} from './form-controls.mjs';
import {renderingResources,RESOURCE_SLOTS} from '../rendering-resources.js';
import {renderMediaAtlas} from '../media-atlas-ui.js';

export function renderPreferences(document,body,{config,changed,button,navigationButton=button,field,input,el,onIdentity,historyLimit,editor,download,assistant,viewState={}}){
 const option=(label,value)=>{const n=el('option',label);n.value=value;return n;};
 let scope=viewState.scope??'story';const refreshers=new Map();
 body.classList.add('tisya-preferences');const style=el('style');style.textContent=preferenceStyles;body.append(style);
 const intro=el('p','选择故事的叙事方式。修改后保存，下轮回复生效。叙述人称管外部叙事，第一人称心声独立设置。');intro.className='preference-intro';
 const scopes=el('select');scopes.setAttribute('aria-label','偏好范围');
 for(const [id,label]of [['story','当前故事'],['global','所有故事默认']])scopes.append(option(label,id));scopes.value=scope;
 const toolbar=el('div');toolbar.className='preference-toolbar';
 const area=el('div'),search=input(viewState.search??'',()=>filter());search.setAttribute('aria-label','搜索偏好');search.placeholder='查找名称或原文';
 toolbar.append(field('应用范围',scopes),field('搜索偏好',search));body.append(intro,toolbar,area);
 function filter(){const q=search.value.trim().toLocaleLowerCase();for(const box of area.querySelectorAll('[data-preference-group]')){box.hidden=!!q&&!(box.dataset.preferenceKeywords??'').includes(q)&&!box.textContent.toLocaleLowerCase().includes(q)&&![...box.querySelectorAll('textarea')].some(n=>n.value.toLocaleLowerCase().includes(q));if(q&&!box.hidden)box.parentElement.open=true;}for(const section of area.querySelectorAll('[data-preference-category]'))section.hidden=!!q&&![...section.querySelectorAll('[data-preference-group]')].some(n=>!n.hidden);}
 const owner=()=>scope==='global'?(config.playDefaults??={choices:{},parameters:{}}):(config.story.play??={choices:{},parameters:{}});
 const chosen=()=>scope==='global'?config.playDefaults??{}:effectivePreferences(config);
 const set=(id,value)=>{const target=owner();target.choices??={};target.choices[id]=value;changed();};
 const openState=()=>Object.fromEntries([...area.querySelectorAll('details[data-preference-section],details[data-preference-text]')].map(n=>[n.dataset.preferenceSection??n.dataset.preferenceText,n.open]));
 function restoreOpen(state){for(const n of area.querySelectorAll('details[data-preference-section],details[data-preference-text]')){const key=n.dataset.preferenceSection??n.dataset.preferenceText;if(Object.hasOwn(state,key))n.open=state[key];}}
 function addCustom(group,name=group.label+' · 自定义',text=''){const id=crypto.randomUUID(),selection=group.multiple?['custom:'+id]:'custom:'+id;const records=scope==='story'?editor.rows:((config.playDefaults??={}).textOverrides??={});records[preferenceTextKey(group.id,selection)]={id,group:group.id,selection:JSON.stringify(selection),kind:'custom',name,text,enabled:true};set(group.id,selection);refreshers.get(group.id)?.(true);}
 function mountGroup(group){
  const box=el('fieldset');box.dataset.preferenceGroup=group.id;if(group.id==='S09-Blocks')box.dataset.preferenceKeywords='角色 对白 对话 情绪 心声 格式 署名';if(group.id==='S08-MindVoice')box.dataset.preferenceKeywords='心声 内心 独白 第一人称';if(['S08-Dial','S08-Look','S08-Mind','S08-MindVoice'].includes(group.id))box.dataset.preferenceKeywords=(box.dataset.preferenceKeywords??'')+' 描写占比';box.append(el('legend',group.label));
  const picker=el('div'),tools=el('div'),textHost=el('div');tools.className='preference-actions';textHost.className='preference-text';box.append(picker,tools,textHost);
  let select,note,checks=[];
  const choose=value=>{set(group.id,value);refresh();};
  function options(){
   if(!group.multiple){
    if(!select){select=el('select');select.setAttribute('aria-label',group.label);select.onchange=()=>choose(select.value||null);picker.append(selectControl(document,select));}
    select.replaceChildren(option('沿用完整预设',''));for(const choice of preferenceOptions(group,config,scope==='story'?editor?.rows:{}))select.append(option(choice.label,choice.id));
   }else{
    picker.replaceChildren();note=el('small');picker.append(note);checks=[];
    for(const choice of preferenceOptions(group,config,scope==='story'?editor?.rows:{})){const check=el('input');check.type='checkbox';check.value=choice.id;check.setAttribute('aria-label',choice.label);checks.push(check);check.onchange=()=>choose(checks.filter(n=>n.checked).map(n=>n.value));const row=field(choice.label,check);row.classList.add('tisya-check-row');picker.append(row);}
   }
  }
  if(group.multiple)tools.append(button('沿用本组预设',()=>choose(null)),button('关闭本组',()=>choose([])));
  const inherit=button('恢复默认继承',()=>{delete config.story.play.choices[group.id];changed();refresh();});if(scope==='story')tools.append(inherit);
  function refresh(rebuildOptions=false){
   if(rebuildOptions)options();const value=chosen().choices?.[group.id];
   if(select){select.value=value??'';select.tisyaRefresh?.();}else{note.textContent=value==null?'沿用预设 · 勾选后采用本组选择':'采用当前勾选';for(const check of checks)check.checked=Array.isArray(value)&&value.includes(check.value);}
   inherit.disabled=!Object.hasOwn(config.story.play?.choices??{},group.id);
   const opened=Object.fromEntries([...textHost.querySelectorAll('details')].map((n,i)=>[i,n.open]));textHost.replaceChildren();
   if(editor)try{renderPreferenceText(document,textHost,{group,scope,config,editor,changed,button,input,field,el,onCopy:addCustom,onNew:()=>addCustom(group),assistant});}catch(error){const warning=el('p',error.message+'；本组原文编辑暂不可用。');warning.setAttribute('role','alert');textHost.append(warning);}
   [...textHost.querySelectorAll('details')].forEach((n,i)=>{if(Object.hasOwn(opened,i))n.open=opened[i];});
  }
  options();refresh();refreshers.set(group.id,refresh);return box;
 }
 function draw(){
  const opened=openState(),scroll=body.closest('.tisya-matrix-content'),top=scroll?.scrollTop;
  area.replaceChildren();refreshers.clear();const value=chosen(),sections=new Map(),avatar=storyAvatar(config),binding=avatar.binding;
  const summary=el('details');summary.dataset.avatarSummary='';summary.dataset.preferenceSection='avatar';summary.append(el('summary','主控化身 · '+(binding?config.story.userName||'已绑定':avatar.mode==='ensemble'?'无主控群像':'未绑定')),el('p',binding?'当前角色：'+(config.story.userName||'')+' · '+(binding.database?'当前表单 / '+binding.dossierId:binding.book+' / '+binding.uid):'在用户身份页选择当前主控人物。'),navigationButton('前往用户身份选择档案',onIdentity));area.append(summary);
  for(const group of PREFERENCE_GROUPS){
   if(['W','N01'].includes(group.id))continue;
   const category=['文风与凝视','技法与场合'].includes(group.section)?'文风与技法':'游玩规则';let section=sections.get(category);
   if(!section){section=el('details');section.dataset.preferenceCategory=category;section.dataset.preferenceSection=category;section.open=sections.size===0;section.append(el('summary',category));sections.set(category,section);area.append(section);}
   if(group.id==='S09-Blocks')section.append(el('p','勾选后保存，下轮按【角色#情绪】“对白”和【角色#情绪】■心声■输出。外观开关在阅读外观 → 区块样式 → 正文。'));if(group.id==='S08-Dial'){const heading=el('div');heading.className='preference-section-note';heading.append(el('h3','描写占比'),el('p','对白、外貌、心理分别调整。第一人称心声独立设置。'));section.append(heading);}section.append(mountGroup(group));
  }
  const params=el('details');params.dataset.preferenceSection='parameters';params.append(el('summary','语言、篇幅与记忆'));
  for(const [id,label,type,fallback]of [['main_language','主语言','text','中文'],['min_length','正文最少字数','number',2000],['max_length','正文最多字数','number',5000],['history_messages','历史聊天条数（当前输入始终保留）','number',historyLimit?.()??50]]){
   const control=input(value.parameters?.[id]??(id==='history_messages'?fallback:''),v=>{const target=owner();target.parameters??={};if(v==='')delete target.parameters[id];else target.parameters[id]=type==='number'?Number(v):v;changed();},{type});control.placeholder=String(fallback);control.setAttribute('aria-label',label);if(type==='number'){control.min='0';control.step='1';}params.append(field(label,control));
  }
  area.append(params);if(editor)renderUserPreferences(document,area,{scope,config,editor,changed,draw,button,input,field,el,assistant});if(editor&&download)try{renderPreferencePackages(document,area,{scope,config,editor,changed,draw,button,input,field,el,download});}catch(error){const warning=el('p','偏好包暂不可用：'+error.message);warning.setAttribute('role','alert');area.append(warning);}
  restoreOpen(opened);filter();if(scroll)scroll.scrollTop=top;
 }
 scopes.onchange=()=>{scope=scopes.value;draw();};draw();restoreOpen(viewState.open??{});filter();
 return {state:()=>({scope,search:search.value,open:openState()})};
}

export function renderResources(document,body,{config,changed,button,field,input,el,mediaAtlas=null}){
 const localView=mediaAtlas?renderMediaAtlas(document,body,{atlas:mediaAtlas,button,field,input,el}):null;
 const external=el('details');external.open=!mediaAtlas;external.append(el('summary','提示词与外链资源'));body.append(external);body=external;
 body.append(el('p','在这里登记资源。全部资源自动汇入同一段多媒体提示词，AI 用 @rendering{ID} 引用。'));
 const list=el('div');body.append(list);
 function draw(){list.replaceChildren();for(const resource of renderingResources(config.resources??[])){const row=el('p',resource.id+' · '+resource.name+' · '+resource.kind+' · '+RESOURCE_SLOTS[resource.slot]);list.append(row);}}
 draw();const initial={id:'',name:'',kind:'image',slot:'body',url:''},draft={...initial},controls={};
 const isDirty=()=>Object.keys(initial).some(key=>draft[key]!==initial[key]);
 const nextResources=()=>{const resources=[...(config.resources??[]),{...draft}];renderingResources(resources);return resources;};
 for(const [key,label]of [['id','参数 ID'],['name','资源含义'],['url','资源地址']]){const control=input('',value=>draft[key]=value);control.setAttribute('aria-label',label);controls[key]=control;body.append(field(label,control));}
 for(const [key,label,options]of [['kind','资源类型',['image','audio','video','emotion']],['slot','对应位置',Object.keys(RESOURCE_SLOTS)]]){const control=input(draft[key],value=>draft[key]=value,{options});control.setAttribute('aria-label',label);controls[key]=control;body.append(field(label,control));}
 body.append(button('加入资源列表',()=>{config.resources=nextResources();Object.assign(draft,initial);for(const [key,control]of Object.entries(controls)){control.value=draft[key];control.tisyaRefresh?.();}changed();draw();}),el('small','加入列表后仍是本页草稿，点击底部“保存”才会生效。也可填写完整一条资源后直接保存。'));
 return {isDirty,prepareSave:()=>isDirty()?{...config,resources:nextResources()}:config,dispose:()=>localView?.dispose()};
}
