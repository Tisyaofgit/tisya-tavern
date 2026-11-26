import {USER_PREFERENCE_GROUP,expandPreferenceText,effectivePreferences} from './preferences.mjs';
import {renderPreferenceAssistant} from './preference-assistant-ui.mjs';
import {compilePrompts} from './config.mjs';
import {materials} from './materials.mjs';
import {Runtime} from './runtime.mjs';
import {createTagRegistry,compileTagProjection,validateExtensionPack,preferenceExtensionPacks} from './tag-system.mjs';

export function renderUserPreferences(document,area,{scope,config,editor,changed,draw,button,input,field,el,assistant,onStyleRules}){
 const own=()=>editor.rows;
 const all=()=>editor.rows;
 for(const [key,row]of Object.entries(config.playDefaults?.textOverrides??{}))if(!own()[key])own()[key]={...row,scope_type:row.scope_type??'global'};
 for(const pack of config.tagExtensionPacks??[])if(!Object.values(own()).some(r=>r.owner_type==='extension_pack'&&r.tag_config_json===JSON.stringify(pack))){const id=crypto.randomUUID();own()['USER:'+JSON.stringify(id)]={id,group:'USER',selection:JSON.stringify(id),kind:'user',name:pack.manifest?.name??'迁移扩展包',text:'',evidence_quote:'',enabled:pack.enabled!==false,owner_type:'extension_pack',scope_type:'global',tag_config_json:JSON.stringify(pack)};}
 const panel=el('details');panel.dataset.userPreferences='';panel.dataset.preferenceSection='saved-user';panel.open=true;panel.append(el('summary','用户偏好 · 标签与阅读偏移'),el('p','角色自身标签与用户阅读偏好分开保存。标签只引用共享语料、技法和执行链；确定性预览与正式生成使用同一组装器。'));
 const setting=Object.values(all()).find(r=>r.owner_type==='projection_setting'),tier=input(setting?.projection_tier??'full',value=>{const row=setting??{id:crypto.randomUUID(),group:'USER',kind:'user',name:'标签投影档位',text:'',evidence_quote:'',owner_type:'projection_setting',scope_type:'global',enabled:true};row.selection=JSON.stringify(row.id);row.projection_tier=value;row.tag_config_json=JSON.stringify({tier:value});put('USER:'+JSON.stringify(row.id),row);},{options:['full','brief','coordinate_only']});tier.setAttribute('aria-label','标签投影档位');panel.append(field('投影档位（完整／简略／标签坐标化）',tier));
 const registry=createTagRegistry(preferenceExtensionPacks(editor.database?.state,all())),rows=()=>Object.entries(all()).filter(([,r])=>r.group==='USER'&&(scope==='story'||(r.scope_type??'story')==='global'));
 const put=(key,record)=>{own()[key]={...record,legacy:false};changed();};
 const addTag=tag=>{const id=crypto.randomUUID(),key='USER:'+JSON.stringify(id);put(key,{id,group:'USER',selection:JSON.stringify(id),kind:'user',name:tag.label,text:'',evidence_quote:'',enabled:true,confirmation_state:'pending',tag_id:tag.id,owner_type:'user',scope_type:scope==='story'?'story':'global',subject_ref:'',projection_tier:'',strength:2,desired_frequency_weight:1,applicable_context:'',exceptions:'',tag_config_json:''});draw();};
 const library=el('details');library.dataset.preferenceSection='tag-library';library.append(el('summary','标签库 · 搜索并加入待确认'));const search=input('',()=>{renderOptions();});search.placeholder='搜索名称、ID、分类或语义槽';search.setAttribute('aria-label','搜索标签');const select=document.createElement('select');select.className='tisya-select';select.size=8;select.style.width='100%';
 const renderOptions=()=>{const q=search.value.trim().toLowerCase(),tags=[...registry.tags.values()].filter(t=>!q||[t.id,t.label,t.slot,...(t.owners??[])].join(' ').toLowerCase().includes(q)).slice(0,120);select.replaceChildren();for(const tag of tags){const o=document.createElement('option');o.value=tag.id;o.textContent=tag.label+'｜'+tag.id+'｜'+(tag.slot??'');select.append(o);}};renderOptions();
 library.append(field('标签搜索',search),select,button('加入待确认',()=>{const tag=registry.tags.get(select.value);if(tag)addTag(tag);}),el('p','当前显示前 120 条匹配结果；可继续缩小搜索范围。'));
 const custom=el('details');custom.dataset.preferenceSection='custom-preference';custom.append(el('summary','自定义文字偏好'),button('新建自定义偏好',()=>{const id=crypto.randomUUID(),key='USER:'+JSON.stringify(id);put(key,{id,group:'USER',selection:JSON.stringify(id),kind:'user',name:'新偏好',text:'',evidence_quote:'',enabled:false,legacy:false,scope_type:scope==='story'?'story':'global'});draw();}));
 const lists={pending:el('details'),enabled:el('details'),disabled:el('details')};lists.pending.append(el('summary','待确认'));lists.enabled.append(el('summary','已启用'));lists.disabled.append(el('summary','已停用'));
 for(const [key,record]of rows()){
  const target=record.confirmation_state==='pending'?lists.pending:record.enabled?lists.enabled:lists.disabled,row=el('details');row.dataset.userPreference=record.id;row.append(el('summary',record.name+' · '+(record.tag_id||'自定义')+' · '+(record.confirmation_state==='pending'?'待确认':record.enabled?'启用':'停用')));
  const get=()=>own()[key]??record;
  const name=input(record.name,value=>{get().name=value;changed();});name.setAttribute('aria-label','用户偏好名称');row.append(field('名称',name));
  const isNew=!editor.before[key],evidence=input(record.evidence_quote,value=>{get().evidence_quote=value;changed();},{multi:true,rows:3,readOnly:!isNew});evidence.setAttribute('aria-label','用户反馈原话');row.append(field('反馈原话（保存后保留）',evidence));
  if(record.tag_id){
   const owner=input(record.owner_type??'user',v=>{get().owner_type=v;changed();},{options:['user','character','relation']});row.append(field('偏好归属（用户阅读偏好与角色自身偏好分离）',owner));
   const scopeInput=input(record.scope_type??scope,v=>{get().scope_type=v;changed();},{options:['global','story','character','pair','scene']});row.append(field('作用域',scopeInput));
   const subject=input(record.subject_ref??'',v=>{get().subject_ref=v;changed();});row.append(field('对象／组合／场景引用',subject));
   const strength=input(typeof record.strength==='string'?record.strength:({0:'禁止',1:'偏好',2:'喜爱',3:'必须'}[record.strength??2]),v=>{get().strength=v;changed();},{options:['禁止','偏好','喜爱','必须']});row.append(field('强度：0 关闭／1 轻显／2 明确／3 主导',strength));
   const frequency=input(String(record.desired_frequency_weight??1),v=>{get().desired_frequency_weight=Number(v);changed();},{type:'number'});frequency.min='0';frequency.max='3';frequency.step='0.1';row.append(field('频率权重',frequency));
   row.append(field('适用情境',input(record.applicable_context??'',v=>{get().applicable_context=v;changed();},{multi:true,rows:2})),field('例外',input(record.exceptions??'',v=>{get().exceptions=v;changed();},{multi:true,rows:2})));
   const advanced=el('details');advanced.append(el('summary','高级：阅读期坐标偏移'),el('p','只影响生成投影，不写角色事件成长。JSON 示例：{"reading_offset":{"内敛":5}}'));
   advanced.append(input(record.tag_config_json??'',v=>{get().tag_config_json=v;changed();},{multi:true,rows:4}));row.append(advanced);
  }else{
   const putText=value=>{get().text=value;changed();},control=input(record.text,putText,{multi:true,rows:8});control.setAttribute('aria-label','用户偏好完整创作指令');row.append(field('完整创作指令',control));renderPreferenceAssistant(document,row,{assistant,group:USER_PREFERENCE_GROUP,initial:record,control,editor,config,put:putText,button,input,field,el});
  }
  const enabled=input('',()=>{});enabled.type='checkbox';enabled.checked=record.enabled;enabled.setAttribute('aria-label','启用用户偏好');enabled.onchange=()=>{get().enabled=enabled.checked;if(enabled.checked)get().confirmation_state='confirmed';changed();};row.append(field('启用',enabled));
  if(record.confirmation_state==='pending')row.append(button('确认并启用',()=>{get().confirmation_state='confirmed';get().enabled=true;changed();draw();}));
  const preview=el('pre');preview.style.cssText='white-space:pre-wrap;max-height:24rem;overflow:auto;font:inherit';row.append(button('查看确定性规则预览',()=>{
   const current=get();if(!current.enabled){preview.textContent='此条已停用，不进入生成投影。';return;}
   if(current.tag_id){const merged=scope==='story'?{...editor.rows,[key]:current}:{[key]:current};preview.textContent=compileTagProjection({state:editor.database?.state??{tables:{}},globalRows:merged,packs:[],tier:current.projection_tier||'full'}).text;return;}
   const view=scope==='global'?{...config,story:{...config.story,play:{}}}:config;let slots={...editor.slots};if(scope==='story'&&editor.database){const runtime=new Runtime(editor.database.state);for(const r of Object.values(editor.rows).filter(r=>r.group==='USER'&&r.legacy)){const target=runtime.rows('T_PREF_SCOPES')[r.id];if(target){target.values.compiled_directive=r.text;target.values.enabled=r.enabled;}}slots={...materials(runtime),...slots};}
   const compiled=compilePrompts(editor.source,view,{...slots,tisya_preference_texts:JSON.stringify(scope==='story'?editor.rows:{})}),text=expandPreferenceText(current.text,view,effectivePreferences(view).parameters).split('\n').find(v=>v.trim()),matches=compiled.prompts.filter(p=>text&&p.content?.includes(text));preview.textContent=matches.length?matches.map(p=>(p.name??p.identifier)+'\n'+p.content).join('\n\n'):'当前预设未找到这条原文的发送位置，请核对槽开关和已有表单条件。';
  }),preview);target.append(row);
 }
 const packs=el('details');packs.dataset.preferenceSection='tag-packs';packs.append(el('summary','扩展包 · 导入／导出／启停'));
 const exportButton=button('导出当前扩展包配置',()=>{const blob=new Blob([JSON.stringify({custom_packs:preferenceExtensionPacks(editor.database?.state,all())},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='缇斯亚_Tag扩展包.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);});packs.append(exportButton);
 const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.onchange=async()=>{try{const parsed=JSON.parse(await file.files[0].text()),list=Array.isArray(parsed)?parsed:parsed.custom_packs??[parsed];for(const pack of list){const errors=validateExtensionPack(pack,{allowDisabled:true});if(errors.length)throw Error(errors.join('\n'));}for(const pack of list){const id=crypto.randomUUID();put('USER:'+JSON.stringify(id),{id,group:'USER',selection:JSON.stringify(id),kind:'user',name:pack.manifest.name,text:'',evidence_quote:'',enabled:pack.enabled===true,owner_type:'extension_pack',scope_type:'global',tag_config_json:JSON.stringify({...pack,enabled:pack.enabled===true})});}draw();}catch(error){alert(error.message);}};packs.append(field('导入 CustomExtensionPack JSON',file));
 for(const [key,record]of rows().filter(([,r])=>r.owner_type==='extension_pack')){const pack=JSON.parse(record.tag_config_json),row=el('div');row.append(el('p',pack.manifest.name+' · '+pack.manifest.version+' · '+(record.enabled?'启用':'停用')),button(record.enabled?'停用':'启用',()=>{put(key,{...record,enabled:!record.enabled,tag_config_json:JSON.stringify({...pack,enabled:!record.enabled})});draw();}),button('移除',()=>{delete own()[key];changed();draw();}));packs.append(row);}
 const banned=el('details');banned.append(el('summary','禁用词'),el('p','默认禁词与防套话规则继续启用；手动禁词叠加到同一规则表，并用于交付前真实扫描。'),button('添加／管理手动禁词',()=>onStyleRules?.()));
 panel.append(lists.pending,lists.enabled,lists.disabled,library,custom,packs,banned);area.append(panel);
}
