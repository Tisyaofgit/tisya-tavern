import {packageEntries,makePreferencePackage,planPreferenceImport,applyPreferenceImport} from './preference-packages.mjs';
import {PREFERENCE_GROUPS,preferenceGroup,preferenceTextKey} from './preferences.mjs';

export function renderPreferencePackages(document,area,{scope,config,editor,changed,draw,button,input,field,el,download}){
 const local=()=>scope==='story'?editor.rows:config.playDefaults?.textOverrides??{};
 const own=()=>scope==='story'?editor.rows:((config.playDefaults??={}).textOverrides??={});
 const choices=()=>{const owner=scope==='story'?(config.story.play??={}):(config.playDefaults??={});return owner.choices??={};};
 const entries=packageEntries(editor.source,config,editor.rows,scope);
 const panel=el('details');panel.dataset.preferencePackages='';panel.append(el('summary','自定义项与偏好包'),el('p','导出只包含偏好原文与参数。导入后先加入列表，点击“采用此项”才启用；底部保存后生效。'));
 const selections=new Set();
 const exportEntries=list=>download('Tisya-preferences.json',makePreferencePackage(list));
 panel.append(button('导出所选条目',()=>exportEntries(entries.filter(e=>selections.has(e.record.id)))),button('导出全部当前偏好',()=>exportEntries(entries)));
 function deactivate(record){
  const group=preferenceGroup(record.group);if(record.kind!=='custom')return;
  const value=(scope==='story'?{...config.playDefaults?.choices,...config.story.play?.choices}:config.playDefaults?.choices??{})[group.id],id='custom:'+record.id;
  if(group.multiple&&Array.isArray(value)&&value.includes(id))choices()[group.id]=value.filter(v=>v!==id);
  else if(value===id)choices()[group.id]=null;
 }
 for(const entry of entries){
  const r=entry.record,key=preferenceTextKey(r.group,r.selection,true),group=preferenceGroup(r.group),row=el('details');row.dataset.preferencePackageItem=r.id;
  const selected=input('',()=>{});selected.type='checkbox';selected.setAttribute('aria-label','导出选择 · '+(r.name??group.label));selected.onchange=()=>selected.checked?selections.add(r.id):selections.delete(r.id);
  const summary=el('summary');summary.append(selected,document.createTextNode(' '+(r.name??group.label)+' · '+(r.enabled?'已登记':'停用')+' · '+entry.source));row.append(summary);
  const raw=el('pre',r.text);raw.style.cssText='white-space:pre-wrap;font:inherit';row.append(raw,button('导出此项',()=>exportEntries([entry])));
  if(local()[key]||r.kind==='custom'){
   row.append(button('采用此项',()=>{own()[key]={...r,enabled:true};if(r.group!=='USER')choices()[r.group]=JSON.parse(r.selection);changed();draw();}),button('停用编辑',()=>{own()[key]={...r,enabled:false};deactivate(r);changed();draw();}));
  }
  panel.append(row);
 }
 const preview=el('div'),file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;file.setAttribute('aria-label','导入偏好包文件');
 const read=button('',async()=>{
  const selected=file.files?.[0];if(!selected)return;if(selected.size>4*1024*1024)throw Error('偏好包超过4MB，请拆分后导入。');
  const plans=planPreferenceImport(JSON.parse(await selected.text()),scope==='story'?{...config.playDefaults?.textOverrides,...editor.rows}:config.playDefaults?.textOverrides??{});preview.replaceChildren(el('h4','导入预览'),el('p','不会自动采用条目，也不会改动语言或篇幅。覆盖已启用的自定义项会先停用，确认后可重新采用。'));
  for(const plan of plans){const r=plan.entry.record,group=preferenceGroup(r.group),item=el('details');item.append(el('summary',(r.name??group.label)+' · '+(plan.conflict?'与已有条目冲突':'新条目')));const raw=el('pre',r.text);raw.style.cssText='white-space:pre-wrap;font:inherit';item.append(raw);
   const action=input(plan.action,v=>plan.action=v,{options:plan.conflict?['keep','overwrite','duplicate']:['add','duplicate','keep']});for(const opt of action.options)opt.textContent=({keep:'保留本地／跳过',overwrite:'覆盖已有',duplicate:'另存自定义项',add:'新增'})[opt.value]??opt.textContent;action.setAttribute('aria-label','冲突处理 · '+(r.name??group.label));item.append(field('处理方式',action));preview.append(item);
  }
  preview.append(button('确认导入到当前草稿',()=>{
   const next=applyPreferenceImport(plans,local());
   for(const [key,r]of Object.entries(next))if(r.enabled===false)deactivate(r);
   if(scope==='story')editor.rows=next;else(config.playDefaults??={}).textOverrides=next;
   changed();draw();
  }));
 });file.onchange=read.onclick;panel.append(button('导入偏好包',()=>file.click()),file,preview);area.append(panel);
}
