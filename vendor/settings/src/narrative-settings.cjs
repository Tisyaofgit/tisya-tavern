'use strict';
const {jsonClone}=require("./json-serialization.cjs");
const {NARRATIVE:N}=require('./narrative.cjs');
const {mountInteractionFeedback}=require('./interaction.cjs');
function mountNarrativeSettings(container,{controller,onNotice=()=>{},onStateChange=()=>{},embedded=false,routed=false}){
  const doc=container.ownerDocument,root=doc.createElement('details');root.className='ts-narrative tui-card tisha-ui';
  const make=(tag,text='')=>{const n=doc.createElement(tag);n.textContent=text;return n;};
  const summary=make('summary','叙事与任务'),status=make('p'),form=make('div'),buttons=make('div');
  status.setAttribute('role','status');buttons.className='tn-actions';
  const suggest=make('button','填写建议组合'),save=make('button','保存叙事设置'),discard=make('button','放弃');
  for(const n of [suggest,save,discard]){n.type='button';n.className='tui-action-face tui-feedback-surface';buttons.append(n);}
  const help=make('p','搭配当前配套预设，选定用户身份，历史消息按当前预设的装配方式读取，勿重复启用两套历史。');root.append(summary,help,status,form,buttons);container.append(root);
  const profiles=make('div'),profileName=make('input'),profileSelect=make('select');
  profileName.type='text';profileName.maxLength=32;profileName.setAttribute('aria-label','方案名称');profileName.placeholder='方案名称';
  profileSelect.setAttribute('aria-label','已存方案');
  const saveProfile=make('button','另存为方案'),loadProfile=make('button','载入方案'),defaults=make('button','采用新聊天默认');
  for(const b of [saveProfile,loadProfile,defaults]){b.type='button';b.className='tui-action-face tui-feedback-surface';}
  const updateProfile=make('button','更新所选方案'),renameProfile=make('button','修改名称'),deleteProfile=make('button','删除所选方案');
  for(const b of [updateProfile,renameProfile,deleteProfile]){b.type='button';b.className='tui-action-face tui-feedback-surface';}
  profiles.className='tn-profiles';profiles.append(make('h4','配置方案'),profileName,saveProfile,profileSelect,loadProfile,updateProfile,renameProfile,deleteProfile,defaults);root.append(profiles);
  const kernel=typeof controller.kernel==='function'?require('./kernel-view.cjs').mountKernelView(root,{controller,onNotice,onStateChange:()=>controls()}):null;
  const feedback=mountInteractionFeedback(root);
  let activePage='task';
  let alive=true,pending=null,state=null,draft=null,dirty=false,broken=false,scope='chat',library={修订:null,条目:[]},outputDraft=null,deleteArmed=null;
  if(embedded){save.remove();discard.remove();}
  const offs=[],formOffs=[];
  function bind(n,event,fn){n.addEventListener(event,fn);(form.contains(n)?formOffs:offs).push(()=>n.removeEventListener(event,fn));}
  const busy=()=>!!pending||!!kernel?.busy();
  function controls(){
    root.dataset.dirty=String(dirty);root.setAttribute('aria-busy',String(busy()));
    for(const n of form.querySelectorAll('input,select'))if(!kernel?.root.contains(n))n.disabled=busy()||broken;
    kernel?.setDisabled(!!pending||broken||scope!=='chat');
    save.disabled=busy()||broken||!draft||!dirty;discard.disabled=busy()||!dirty;
    const needs=draft&&N.protocol.KEYS.every(k=>!Object.hasOwn(draft,k));
    suggest.textContent=needs?'补充步序配置':'填写建议组合';
    suggest.disabled=busy()||broken||draft!==null&&!needs;
    saveProfile.disabled=busy()||broken||!draft;loadProfile.disabled=busy()||broken||!library.条目.length;
    for(const b of [updateProfile,renameProfile,deleteProfile])b.disabled=busy()||broken||!library.条目.length;
    profileName.disabled=busy();profileSelect.disabled=busy()||!library.条目.length;
    defaults.hidden=scope!=='chat';defaults.disabled=busy()||broken;
    save.textContent=scope==='chat'?'保存全部设置':'保存新聊天默认';
    help.textContent=scope==='global'?'保存后供尚未配置的聊天首次继承；已有聊天保留自己的设置。':'搭配当前配套预设，选定用户身份，历史消息按当前预设的装配方式读取，勿重复启用两套历史。';
    if(routed){arrange();refreshHints();}
    onStateChange();
  }
  function fieldPage(id){if(['A03','A06'].includes(id))return 'task';if(id.startsWith('A'))return 'permissions';if(id.startsWith('B'))return 'viewpoint';if(id==='C07'||id==='E01'||id==='D03')return 'output';if(id.startsWith('C'))return 'writing';if(['D01','D02'].includes(id))return 'flow';return 'thought';}
  function describe(node,id,page){node.dataset.configPage=page;let p=node.querySelector(':scope > .us-injection');if(!p){p=make('p');p.className='us-injection';node.append(p);}p.dataset.injection=id;}
  function arrange(){
    root.open=true;root.classList.add('us-narrative');summary.hidden=true;help.hidden=true;
    profiles.dataset.configPage='profiles';if(kernel)kernel.root.dataset.configPage='kernel';
    for(const n of form.children){
      if(n.tagName==='H4'){n.hidden=true;continue;}
      if(n.tagName==='P'){n.dataset.configPage=n.textContent.startsWith('本轮顺序')?'flow':n.textContent.includes('MVU')||n.textContent.includes('初值')?'kernel':'task';}
      if(n.tagName==='FIELDSET'){
        const title=n.querySelector('legend')?.textContent;
        if(title==='输出与任务块心声'){n.dataset.configPage='output thought';for(const l of n.querySelectorAll(':scope > label')){const label=l.querySelector('input').getAttribute('aria-label');const id=label===choicesSummary?'summary':label.startsWith('输入评价')?'输入评价':label.startsWith('回应用户')?'回应用户评价':'剧情吐槽';describe(l,id,id==='summary'?'output':'thought');}for(const p of n.querySelectorAll(':scope > p'))p.dataset.configPage='thought';}
        else if(title==='叙事检查组'||title==='叙事增强'){n.dataset.configPage='flow';for(const l of n.querySelectorAll(':scope > label')){const label=l.querySelector('input').getAttribute('aria-label'),id=label.startsWith('步序：')?label.slice(3):N.protocol.P.features.find(x=>x[0]===label)?.[1];if(id)describe(l,id,'flow');}}
        else if(title==='行动选项数量')describe(n,'E01','output');
        else if(title==='描写重心')describe(n,'C06','writing');
      }
      if(n.tagName==='LABEL'){
        const control=n.querySelector('select,input'),label=control?.getAttribute('aria-label')||[...n.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent).join('');
        if(control&&!control.getAttribute('aria-label'))control.setAttribute('aria-label',label);
        const row=N.rows.find(r=>r.label===label||r.id==='D04'&&label==='缇斯亚交流口吻');
        if(row)describe(n,row.id,fieldPage(row.id));else if(label==='当前任务')describe(n,'task','task');else if(label==='MVU 兼容')describe(n,'mvu','kernel');else if(label.includes('正文篇幅')||label==='篇幅单位')describe(n,'C07','output');else if(label.startsWith('单语'))describe(n,'C08','writing');
      }
      // Native select remains the sole input; chips dispatch its existing change
      // handler. No draft or save owner is duplicated by the presentation layer.
      for(const control of n.querySelectorAll('select')){
        if(control.dataset.chips)continue;control.dataset.chips='true';control.classList.add('us-native-select');const chips=make('div');chips.className='us-chips';
        for(const opt of control.options){const b=make('button',opt.textContent);b.type='button';b.dataset.choice=opt.value;b.disabled=opt.disabled;b.onclick=()=>{if(control.disabled)return;control.value=opt.value;control.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));};chips.append(b);}control.after(chips);
      }
    }
    for(const control of form.querySelectorAll('select[data-chips]'))for(const b of control.nextElementSibling.children){b.setAttribute('aria-pressed',String(control.value===b.dataset.choice));b.disabled=control.disabled||[...control.options].find(o=>o.value===b.dataset.choice)?.disabled;}
    for(const n of root.querySelectorAll('[data-config-page]'))n.hidden=!n.dataset.configPage.split(' ').includes(activePage);
    form.hidden=activePage==='profiles';buttons.hidden=!!draft&&N.protocol.KEYS.every(k=>Object.hasOwn(draft,k));
    if(kernel?.root)kernel.root.open=activePage==='kernel';
  }
  const choicesSummary='本轮任务中的公开安排摘要';
  function refreshHints(){if(!draft||!outputDraft)return;const projection=require('./settings-injection.cjs').createInjectionPreview(draft,outputDraft,state?.preview);for(const p of root.querySelectorAll('[data-injection]')){const hint=projection.get(p.dataset.injection);p.replaceChildren();if(hint.text){const label=make('small','注入原文');p.append(label,make('span',hint.text));}if(hint.note)p.append(make('small',hint.note));}}
  function edit(){deleteArmed=null;deleteProfile.textContent='删除所选方案';dirty=true;status.textContent='尚未保存';try{N.validate(draft);}catch(e){status.textContent=N.message(e,draft);}controls();}
  function bindForm(n,event,fn){n.addEventListener(event,fn);formOffs.push(()=>n.removeEventListener(event,fn));}
  function select(label,values,value,change,unavailable=[]){
    const wrap=make('label',label),control=make('select');control.setAttribute('aria-label',label);
    for(const v of values){const opt=make('option',v+(unavailable.includes(v)?'（待接入）':''));opt.value=v;opt.disabled=unavailable.includes(v);control.append(opt);}
    control.value=value;bindForm(control,'change',()=>{change(control.value);edit();});wrap.append(control);form.append(wrap);
  }
  function draw(){
    for(const off of formOffs.splice(0))off();form.replaceChildren();if(!draft){controls();return;}
    const output=make('fieldset');output.append(make('legend','输出与任务块心声'));
    const choices=[['本轮任务中的公开安排摘要','summary'],['输入评价：吐槽用户的扮演指令对人物的影响','输入评价'],['回应用户：和缇斯亚直接聊天','回应用户评价'],['剧情吐槽：评论剧情走向','剧情吐槽']];
    for(const [labelText,key]of choices){const label=make('label',labelText),input=make('input');input.type='checkbox';input.setAttribute('aria-label',labelText);input.checked=key==='summary'?outputDraft.summary:outputDraft.directions.includes(key);
      bindForm(input,'change',()=>{if(key==='summary')outputDraft.summary=input.checked;else outputDraft.directions=require('./output-contract.cjs').DIRECTIONS.filter(d=>d===key?input.checked:outputDraft.directions.includes(d));edit();});label.prepend(input);output.append(label);}
    output.append(make('p','三个心声方向独立选择，全不选即关闭。内容保留在首尾任务块。'));form.append(output);
    const mvuLabel=make('label','MVU 兼容'),mvuInput=make('input');mvuInput.type='checkbox';mvuInput.setAttribute('aria-label','MVU 兼容');mvuInput.checked=draft['缇斯亚MVU兼容']===true;bindForm(mvuInput,'change',()=>{draft['缇斯亚MVU兼容']=mvuInput.checked;edit();});mvuLabel.prepend(mvuInput);form.append(mvuLabel,make('p',scope==='chat'?'开启并保存后，首次生成会自动读取角色卡初值；已有数据继续使用，关闭保留存档。兼容变量与更新，自定义脚本可能需要另行适配。':'新聊天继承此开关；首次生成自动读取各自角色卡初值。关闭保留已有数据。'));
    const actionField=make('fieldset');actionField.append(make('legend','行动选项数量'));
    const actionKey='缇斯亚叙事行动选项',bounds=require('./action-range.cjs').resolveActionRange(draft[actionKey]);
    for(const bound of ['下限','上限']){const label=make('label','选项数量'+bound),input=make('input');input.type='number';input.min='1';input.step='1';input.value=String(bounds[bound]);input.setAttribute('aria-label','选项数量'+bound);
      bindForm(input,'input',()=>{draft[actionKey]={...(draft[actionKey]??bounds),[bound]:Number(input.value)};edit();});label.append(input);actionField.append(label);}
    actionField.append(make('p','默认 3～6 条。随叙事方案保存，上限与下限相同即可固定数量。'));form.append(actionField);
    select('当前任务',N.tasks,draft['缇斯亚当前任务'],v=>draft['缇斯亚当前任务']=v);
    if(N.protocol.KEYS.every(k=>Object.hasOwn(draft,k))){
      const steps=make('fieldset');steps.append(make('legend','叙事检查组'));
      const effect=make('p');
      const describe=()=>{effect.textContent='本轮顺序：'+(Object.values(N.protocol.P.step_names).filter(v=>draft[N.protocol.STEP_KEY].includes(v)).join(' → ')||'仅按任务交付')+'。关闭步骤保留选值；所属增强项仅在步骤开启时注入。';};
      for(const value of Object.values(N.protocol.P.step_names)){
        const label=make('label',value),input=make('input');input.type='checkbox';input.setAttribute('aria-label','步序：'+value);input.checked=draft[N.protocol.STEP_KEY].includes(value);
        bindForm(input,'change',()=>{draft[N.protocol.STEP_KEY]=Object.values(N.protocol.P.step_names).filter(v=>v===value?input.checked:draft[N.protocol.STEP_KEY].includes(v));describe();edit();});label.prepend(input);steps.append(label);
      }
      form.append(steps,effect);describe();
      const features=make('fieldset');features.append(make('legend','叙事增强'));
      for(const [labelText,key,locations]of N.protocol.P.features){
        const label=make('label',labelText+' · '+[...new Set(locations.map(([k])=>N.protocol.P.step_names[k]))].join('、')),input=make('input');input.type='checkbox';input.setAttribute('aria-label',labelText);input.checked=draft[key];
        bindForm(input,'change',()=>{draft[key]=input.checked;edit();});label.prepend(input);features.append(label);
      }
      form.append(features);
    }else form.append(make('p','原有选值已保留。点“补充步序配置”后可调整新增选项，再保存。'));
    let group='';
    for(const row of N.rows.filter(r=>!r.id.startsWith('E')&&r.id!=='D05')){
      if(group!==row.id[0]){group=row.id[0];form.append(make('h4',({A:'互动权限',B:'视角与知情',C:'文风与节奏',D:'创作与交流'})[group]));}
      const key=row.variable;
      if(row.type==='string')select(row.id==='D04'?'缇斯亚交流口吻':row.label,row.allowed,draft[key],v=>draft[key]=v,['指定 NPC','选文风卡']);
      else if(row.id==='C06'){
        const section=make('fieldset');section.append(make('legend',row.label));
        for(const choice of row.allowed){const label=make('label',choice),input=make('input');input.type='checkbox';input.checked=draft[key].includes(choice);
          bindForm(input,'change',()=>{draft[key]=row.allowed.filter(v=>v===choice?input.checked:draft[key].includes(v));edit();});label.prepend(input);section.append(label);}
        form.append(section);
      }else if(row.id==='C07'){
        for(const bound of ['下限','上限']){const label=make('label','正文篇幅'+bound),input=make('input');input.type='number';input.min='1';input.step='1';input.value=String(draft[key][bound]);
          bindForm(input,'input',()=>{draft[key][bound]=Number(input.value);edit();});label.append(input);form.append(label);}
        select('篇幅单位',['字','词'],draft[key].单位,v=>draft[key].单位=v);
      }
    }
    const label=make('label','单语／双语语言（逗号分隔）'),languages=make('input');languages.type='text';languages.value=draft['缇斯亚叙事语言配置'].join('，');
    bindForm(languages,'input',()=>{draft['缇斯亚叙事语言配置']=languages.value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean);edit();});label.append(languages);form.append(label);
    form.append(make('p','行动选项数量已接入；其他扩展模块与关联档案待接入。'));controls();
  }
  async function run(work){
    if(busy()||!alive)return;pending=Promise.resolve().then(work);controls();
    try{await pending;return true;}catch(e){if(alive){status.textContent=N.message(e,draft);onNotice(status.textContent);}return false;}
    finally{pending=null;if(alive)controls();}
  }
  bind(suggest,'click',()=>{if(busy()||broken)return;if(draft===null){draft=N.suggestions();outputDraft??={summary:true,directions:[]};}else if(N.protocol.KEYS.every(k=>!Object.hasOwn(draft,k)))draft={...draft,...N.protocol.defaults()};else return;dirty=true;status.textContent='建议组合尚未保存';draw();});
  function discardDraft(){if(busy())return;draft=state?.settings?jsonClone(state.settings):null;outputDraft=state?.output?.value?structuredClone(state.output.value):{summary:true,directions:[]};dirty=false;status.textContent=state?.kind==='ready'?'已保存':'尚未设置';draw();}
  bind(discard,'click',discardDraft);
  function saveDraft(){if(!dirty||broken||!draft||busy())return Promise.resolve(false);return run(async()=>{
    N.validate(draft);const result=await controller.save(JSON.stringify(draft),state.revision,scope,JSON.stringify({value:outputDraft,revision:state.output?.revision??null}));
    if(!alive)return;state={...result,preview:result.preview??state?.preview};draft=jsonClone(result.settings);if(result.output?.value)outputDraft=structuredClone(result.output.value);dirty=false;status.textContent=scope==='chat'?'全部设置已保存':'新聊天默认已保存';draw();
  });}
  bind(save,'click',saveDraft);
  function drawLibrary(){
    const selected=profileSelect.value;profileSelect.replaceChildren();for(const row of library.条目){const opt=make('option',row.名称);opt.value=row.编号;profileSelect.append(opt);}if(library.条目.length)profileSelect.value=library.条目.some(x=>x.编号===selected)?selected:library.条目[0].编号;
  }
  function refresh(){return run(async()=>{try{
    const result=await controller.inspect(scope);if(!alive)return;
    state=result;draft=result.settings?jsonClone(result.settings):null;outputDraft=result.output?.value?structuredClone(result.output.value):{summary:true,directions:[]};dirty=!!draft&&result.output?.kind==='absent';broken=false;
    status.textContent=result.kind==='ready'?'已保存':result.kind==='needs_setup'?'原有配置已保留，请补充步序配置':'尚未设置';draw();
    library=await controller.library('list');if(!alive)return;drawLibrary();
  }catch(e){broken=true;throw e;}});}
  bind(saveProfile,'click',()=>run(async()=>{
    N.validate(draft);library=await controller.library('save',JSON.stringify({name:profileName.value.trim(),settings:draft,output:outputDraft}));
    if(!alive)return;drawLibrary();status.textContent='方案已另存；点底部保存使草稿生效。';
  }));
  bind(loadProfile,'click',()=>run(async()=>{
    const settings=await controller.library('load',JSON.stringify({id:profileSelect.value}));if(!alive)return;
    const output=await controller.library('load-output',JSON.stringify({id:profileSelect.value}));if(!alive)return;if(output)outputDraft=structuredClone(output);
    draft=jsonClone(settings);dirty=true;status.textContent='方案已载入草稿，保存后生效';draw();
  }));
  const selected=()=>library.条目.find(x=>x.编号===profileSelect.value);
  async function change(operation,extra={}){
    const row=selected();if(!row)return;
    library=await controller.library(operation,JSON.stringify({id:row.编号,revision:library.修订,...extra}));
    if(!alive)return;deleteArmed=null;deleteProfile.textContent='删除所选方案';drawLibrary();status.textContent=operation==='delete'?'方案已删除；当前聊天设置保留':operation==='rename'?'方案已改名':'所选方案已更新；当前草稿保存后生效';
  }
  bind(profileSelect,'change',()=>{deleteArmed=null;deleteProfile.textContent='删除所选方案';const row=selected();if(row)profileName.value=row.名称;});
  bind(updateProfile,'click',()=>run(async()=>{N.validate(draft);await change('update',{settings:draft,output:outputDraft});}));
  bind(renameProfile,'click',()=>run(()=>change('rename',{name:profileName.value.trim()})));
  bind(deleteProfile,'click',()=>{
    if(busy()||broken)return;const row=selected();if(!row)return;
    if(deleteArmed!==row.编号){deleteArmed=row.编号;deleteProfile.textContent='确认删除「'+row.名称+'」';status.textContent='再次点击删除此方案；保留当前聊天设置。';return;}
    run(()=>change('delete',{confirm:row.名称}));
  });
  bind(defaults,'click',()=>run(async()=>{
    const result=await controller.inspect('global');if(!alive)return;
    if(result.kind==='absent'){status.textContent='尚未保存新聊天默认';return;}
    draft=jsonClone(result.settings);if(result.output?.value)outputDraft=structuredClone(result.output.value);dirty=true;status.textContent='默认配置已载入草稿，保存后生效';draw();
  }));
  refresh();
  return {root,setPage(page){activePage=page;if(routed){arrange();refreshHints();}},saveDraft,discardDraft,state:()=>({dirty,busy:busy(),broken}),settled:async()=>{while(busy()){if(pending)await pending.catch(()=>{});await kernel?.settled();}},requestLeave:()=>({allowed:!busy()&&!dirty,reason:pending?'saving':kernel?.busy()?kernel.phase():dirty?'unsaved':null}),
    setScope(next){if(!['chat','global'].includes(next))throw new Error('TISHA_NARRATIVE_SCOPE');if(next===scope)return {allowed:true};if(busy()||dirty)return {allowed:false};scope=next;kernel?.setScope(scope);refresh();return {allowed:true};},dispose(){if(!alive)return;alive=false;for(const off of [...offs,...formOffs])off();kernel?.dispose();feedback.dispose();controller.dispose();root.remove();}};
}
module.exports={mountNarrativeSettings};
