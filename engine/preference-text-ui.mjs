import {clone} from './common.mjs';
import {effectivePreferences,preferenceTextKey,selectedPreferenceText} from './preferences.mjs';
import {previewPreferenceText} from './preference-editor.mjs';

export function renderPreferenceText(document,box,{group,scope,config,editor,changed,button,input,field,el}){
 const previewConfig=()=>scope==='global'?{...config,story:{...config.story,play:{}}}:config;
 const selected=effectivePreferences(previewConfig()).choices[group.id],key=preferenceTextKey(group.id,selected);
 const rows=()=>scope==='global'?(config.playDefaults??={}).textOverrides??{}:editor.rows;
 const local=()=>rows()[key];
 const inherited=()=>config.playDefaults?.textOverrides?.[key];
 const effective=()=>local()??(scope==='story'?inherited():null);
 const original=selectedPreferenceText(editor.source,previewConfig(),group);
 const initial=effective(),text=initial?.enabled!==false&&initial?initial.text:original;
 const note=el('p',initial?.enabled!==false&&initial?(local()?'采用编辑原文':'继承全局编辑原文'):(selected==null?'沿用当前完整预设':'采用所选内置原文'));
 note.dataset.preferenceTextSource='';box.append(note);
 const full=el('details');full.dataset.preferenceText=group.id;full.append(el('summary','查看与编辑完整原文'));
 const control=input(text,value=>{put(value);note.textContent='编辑原文 · 尚未保存';},{multi:true,rows:8});
 control.setAttribute('aria-label',group.label+' · 完整原文');control.style.width='100%';
 function put(value){
  const records=scope==='global'?((config.playDefaults??={}).textOverrides??={}):editor.rows;
  records[key]={id:records[key]?.id??crypto.randomUUID(),group:group.id,selection:JSON.stringify(selected??null),text:value,enabled:true};
  changed();
 }
 const preview=el('pre');preview.style.cssText='white-space:pre-wrap;max-height:24rem;overflow:auto;font:inherit';preview.setAttribute('aria-label',group.label+' · 编译预览');
 full.append(field('编辑原文',control),el('small','修改后点击底部“保存”。此处编辑当前选择；切换选项会采用相应原文。'));
 full.append(button('查看实际生效预览',()=>{
  const result=previewPreferenceText(editor.source,previewConfig(),editor.slots,scope==='story'?editor.rows:{},group);
  preview.textContent=(result.enabled?'对应提示词槽已启用。以下是当前草稿编译后的完整槽内容：':'对应提示词槽未启用，此内容不会发送。编译内容：')+'\n\n'+result.text;
 }));
 full.append(button('恢复内置原文',()=>{put(original);control.value=original;note.textContent='已恢复当前预设／所选内置原文 · 尚未保存';}),button('恢复继承原文',()=>{delete rows()[key];const value=scope==='story'?inherited():null;control.value=value&&value.enabled!==false?value.text:original;note.textContent=scope==='story'&&value?'继承全局原文 · 尚未保存':'沿用预设／所选内置原文 · 尚未保存';changed();}));
 const source=el('details');source.append(el('summary','查看当前预设／内置原文'));const raw=el('pre',original);raw.style.cssText='white-space:pre-wrap;font:inherit';source.append(raw);full.append(source,preview);box.append(full);
 return {group:group.id,key,text:()=>control.value,selection:clone(selected??null)};
}
