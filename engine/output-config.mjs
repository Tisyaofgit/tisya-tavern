import {fail} from './common.mjs';
const print=v=>typeof v==='string'?v:JSON.stringify(v);
const replace=(text,key,value)=>text.replace(new RegExp('^@'+key.replaceAll('.','\\.')+'\\s*:?=[\\s\\S]*?(?=^@|^</|$(?![\\s\\S]))','m'),()=> '@'+key+' := '+value+'\n');
export function applyOutputConfiguration(entries,values){
 if(!values)return;const p=id=>entries.find(p=>p.identifier===id),n=p('tisya_pref_narrative'),s=p('tisya_pref_style'),plot=p('tisya_pref_plot'),registry=p('tisya_registry');
 const bind=(row,key,value)=>{if(value!=null&&value!==''){const old=row.content;row.content=replace(old,key,print(value));if(row.content===old&&!old.includes('@'+key+' :='))row.content+='\n@'+key+' := '+print(value);}};
 if(values.person)bind(n,'POV.PERSON',({first:'以故事主角的第一人称叙事。',second:'以第二人称称呼故事主角，叙述其可知的行动与感受。',third:'以第三人称及明确人名称谓叙事。'})[values.person]??fail('OUTPUT_PERSON','叙事人称无效'));
 if(values.focal_subject_ref||values.camera_rotation)bind(n,'POV.LENS',[values.focal_subject_ref?'焦点主体：'+values.focal_subject_ref:'',values.camera_rotation?print(values.camera_rotation):''].filter(Boolean).join('；'));
 bind(n,'EPISTEMIC.FOG',values.limited_knowledge);bind(n,'SIDEPLOT.CUT',values.side_plot_policy);
 if(values.language||values.translation_notes)bind(n,'LANG.GATE',[values.language?'输出语言：'+values.language:'',values.translation_notes?print(values.translation_notes):''].filter(Boolean).join('；'));
 bind(n,'STOP.GATE',values.preferred_ending);bind(s,'GRAMMAR.DENSITY',values.sentence_pattern);bind(s,'DIALOGUE.RATIO',values.dialogue);bind(s,'PROSE.DISCIPLINE',values.diction);bind(plot,'INK.GRANULARITY',values.description_focus);bind(plot,'INK.ALLOCATION',values.scene_allocation);
 if(values.style){const style=p('tisya_material_style_card');style.content=print(values.style);}
 for(const [field,key]of [['secret_display','SECRET.DISPLAY'],['visible_blocks','VISIBLE.BLOCKS'],['count_scope','COUNT.SCOPE']])bind(registry,key,values[field]);
 if(['min_length','max_length','length_unit'].some(k=>values[k]!=null)){
  const match=/<body\b([^>]*)>/.exec(registry.content);if(!match)fail('OUTPUT_LENGTH_CONTRACT','篇幅配置没有对应的正文骨架');
  const old=key=>new RegExp('\\b'+key+'="([^"]+)"').exec(match[1])?.[1],min=values.min_length??(old('min')==null?undefined:Number(old('min'))),max=values.max_length??(old('max')==null?undefined:Number(old('max'))),unit=values.length_unit??old('unit')??'字';
  if([min,max].some(v=>v!=null&&(!Number.isSafeInteger(v)||v<0))||min!=null&&max!=null&&max<min||!['字','词','字符','段落'].includes(unit))fail('OUTPUT_LENGTH','篇幅范围或单位无效');
  const other=match[1].replace(/\s+(?:min|max|unit)="[^"]*"/g,'').replace(/\s*\/$/,'').trim(),attributes=[other,min==null?'':'min="'+min+'"',max==null?'':'max="'+max+'"','unit="'+unit+'"'].filter(Boolean).join(' ');
  registry.content=registry.content.replace(match[0],()=>'<body '+attributes+(match[1].trimEnd().endsWith('/')?'/':'')+'>');
 }
}
