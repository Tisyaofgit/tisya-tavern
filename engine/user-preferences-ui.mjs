import {USER_PREFERENCE_GROUP,preferenceTextKey,expandPreferenceText,effectivePreferences} from './preferences.mjs';
import {renderPreferenceAssistant} from './preference-assistant-ui.mjs';
import {compilePrompts} from './config.mjs';
import {materials} from './materials.mjs';
import {Runtime} from './runtime.mjs';

export function renderUserPreferences(document,area,{scope,config,editor,changed,draw,button,input,field,el,assistant}){
 const own=()=>scope==='story'?editor.rows:((config.playDefaults??={}).textOverrides??={});
 const all=()=>scope==='story'?{...config.playDefaults?.textOverrides,...editor.rows}:config.playDefaults?.textOverrides??{};
 const panel=el('details');panel.dataset.userPreferences='';panel.append(el('summary','用户偏好'),el('p','反馈原话保留为依据，创作指令可以单独编辑。新建条目保存在当前选择的范围，已有表单条目沿用原来的条件。'));
 function create(_group,name='新用户偏好',text='',evidence=''){const id=crypto.randomUUID();own()[preferenceTextKey('USER',id)]={id,group:'USER',selection:JSON.stringify(id),kind:'user',name,text,evidence_quote:evidence,enabled:true};changed();draw();}
 panel.append(button('新建用户偏好',()=>create()));
 for(const [key,record]of Object.entries(all()).filter(([,r])=>r.group==='USER')){
  const row=el('details');row.dataset.userPreference=record.id;row.append(el('summary',record.name+' · '+(record.enabled?'启用':'停用／尚未填写指令')));
  const get=()=>{if(!own()[key])own()[key]={...record,legacy:false};return own()[key];};
  const name=input(record.name,value=>{get().name=value;changed();});name.setAttribute('aria-label','用户偏好名称');row.append(field('名称',name));
  const isNew=scope==='story'?!editor.before[key]:!editor.globalBefore[key];
  const evidence=input(record.evidence_quote,value=>{get().evidence_quote=value;changed();},{multi:true,rows:3,readOnly:!isNew});evidence.setAttribute('aria-label','用户反馈原话');row.append(field('反馈原话（保存后保留）',evidence));
  const put=value=>{get().text=value;changed();};const control=input(record.text,put,{multi:true,rows:8});control.setAttribute('aria-label','用户偏好完整创作指令');control.style.width='100%';row.append(field('完整创作指令',control));
  const enabled=input('',()=>{});enabled.type='checkbox';enabled.checked=record.enabled;enabled.setAttribute('aria-label','启用用户偏好');enabled.onchange=()=>{get().enabled=enabled.checked;changed();};row.append(field('启用',enabled));
  row.append(button('复制用户偏好',()=>create(null,name.value+'副本',control.value,evidence.value)));
  const preview=el('pre');preview.style.cssText='white-space:pre-wrap;max-height:24rem;overflow:auto;font:inherit';row.append(button('查看用户偏好生效预览',()=>{
   const current=own()[key]??record;if(!current.enabled){preview.textContent='此条已停用，不进入偏好指令。';return;}
   const view=scope==='global'?{...config,story:{...config.story,play:{}}}:config;let slots={...editor.slots};
   if(scope==='story'&&editor.database){const runtime=new Runtime(editor.database.state);for(const r of Object.values(editor.rows).filter(r=>r.group==='USER'&&r.legacy)){const target=runtime.rows('T_PREF_SCOPES')[r.id];if(target){target.values.compiled_directive=r.text;target.values.enabled=r.enabled;}}slots={...materials(runtime),...slots};}
   const compiled=compilePrompts(editor.source,view,{...slots,tisya_preference_texts:JSON.stringify(scope==='story'?editor.rows:{})}),text=expandPreferenceText(current.text,view,effectivePreferences(view).parameters).split('\n').find(v=>v.trim()),matches=compiled.prompts.filter(p=>text&&p.content?.includes(text));
   preview.textContent=matches.length?matches.map(p=>(p.name??p.identifier)+'\n'+p.content).join('\n\n'):'当前预设未找到这条原文的发送位置，请核对槽开关和已有表单条件。';
  }),preview);
  renderPreferenceAssistant(document,row,{assistant,group:USER_PREFERENCE_GROUP,initial:record,control,editor,config,put,onCopy:create,button,input,field,el});
  panel.append(row);
 }
 area.append(panel);
}
