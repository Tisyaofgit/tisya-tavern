import {formUI} from './form-ui.js';
import {copy} from './schema.js';
import {EMPTY_NATIVE,validateNativeConfig} from './native-config.js';
export function nativeConfigForm(document,parent,value=EMPTY_NATIVE,changed=()=>{}){
 const ui=formUI(document,{changed}),root=document.createElement('div');parent.append(root);let data=copy(value),readers=[];
 const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
 const read=()=>Object.fromEntries(readers.map(([key,list])=>[key,list.map(fn=>fn())]));
 const action=(parent,label,fn)=>{const b=el('button',label);b.type='button';b.onclick=()=>{data=read();fn();changed();draw();};parent.append(b);};
 const field=(parent,label,val,type='text',choices)=>{const input=ui.input(parent,label,val,{type,choices});return ()=>type==='checkbox'?input.checked:input.value;};
 function scope(parent,row){const scope=field(parent,'作用域',row.scope,'text',[['global','全局'],['character','角色'],['preset','预设']]),target=field(parent,'目标（留空使用当前角色／预设）',row.target??'');return ()=>({scope:scope(),target:target()});}
 function draw(){root.replaceChildren();readers=[];root.append(el('p','确认蓝图后自动补建并绑定。已有同名内容保留；新预设不自动切换。预设世界书仅在选中该预设时参与原生扫描。'));
  for(const [key,label]of [['presets','预设'],['worldbooks','世界书'],['regexes','正则']]){
   const group=el('fieldset','');group.append(el('legend',label));root.append(group);const list=[];readers.push([key,list]);
   for(const [i,row]of (data[key]??[]).entries()){
    const box=el('details','');box.open=true;box.append(el('summary',row.name||'新'+label));group.append(box);const name=field(box,label+'名称',row.name);
    if(key==='presets'){
     const promptReaders=[];for(const [n,p]of row.prompts.entries()){const g=el('fieldset','');g.append(el('legend','提示词 '+(n+1)));box.append(g);const fields={id:field(g,'提示词 ID',p.id),name:field(g,'提示词名称',p.name),role:field(g,'消息角色',p.role,'text',[['system','system'],['user','user'],['assistant','assistant']]),content:field(g,'提示词内容',p.content,'textarea'),enabled:field(g,'启用提示词',p.enabled,'checkbox')};promptReaders.push(()=>Object.fromEntries(Object.entries(fields).map(([k,fn])=>[k,fn()])));action(g,'删除提示词',()=>data[key][i].prompts.splice(n,1));}
     list.push(()=>({name:name(),prompts:promptReaders.map(fn=>fn())}));action(box,'添加提示词',()=>data[key][i].prompts.push({id:crypto.randomUUID(),name:'新提示词',role:'system',content:'',enabled:true}));
    }else if(key==='worldbooks'){
     const readScope=scope(box,row),entryReaders=[];
     for(const [n,e]of row.entries.entries()){const g=el('fieldset','');g.append(el('legend','条目 '+(n+1)));box.append(g);const fields={name:field(g,'条目名称',e.name),content:field(g,'条目内容',e.content,'textarea'),keys:ui.value(g,'关键词',{type:'texts'},e.keys),constant:field(g,'蓝灯常驻（关闭为关键词绿灯）',e.constant,'checkbox'),enabled:field(g,'启用条目',e.enabled,'checkbox')};entryReaders.push(()=>Object.fromEntries(Object.entries(fields).map(([k,fn])=>[k,fn()])));action(g,'删除条目',()=>data[key][i].entries.splice(n,1));}
     list.push(()=>({name:name(),...readScope(),entries:entryReaders.map(fn=>fn())}));action(box,'添加世界书条目',()=>data[key][i].entries.push({name:'新条目',content:'',keys:[],constant:false,enabled:true}));
    }else{
     const readScope=scope(box,row),fields={id:field(box,'稳定 ID',row.id),find:field(box,'查找表达式（不带外层斜杠）',row.find),replace:field(box,'替换内容',row.replace,'textarea'),flags:field(box,'正则标记',row.flags),enabled:field(box,'启用正则',row.enabled,'checkbox'),display:field(box,'用于显示',row.display,'checkbox'),prompt:field(box,'用于提示词',row.prompt,'checkbox')},sources=Object.fromEntries([['ai_output','AI 回复'],['user_input','用户输入'],['slash_command','斜杠命令'],['world_info','世界书']].map(([id,label])=>[id,field(box,'处理'+label,row.sources.includes(id),'checkbox')]));
     list.push(()=>({name:name(),...readScope(),...Object.fromEntries(Object.entries(fields).map(([k,fn])=>[k,fn()])),sources:Object.keys(sources).filter(k=>sources[k]())}));
    }
    action(box,'删除此'+label,()=>data[key].splice(i,1));
   }
   action(group,'新增'+label,()=>{data[key]??=[];data[key].push(key==='presets'?{name:'',prompts:[]}:key==='worldbooks'?{name:'',scope:'character',target:'',entries:[]}:{id:crypto.randomUUID(),name:'',scope:'character',target:'',find:'',replace:'',flags:'g',enabled:true,display:true,prompt:false,sources:['ai_output']});});
  }
 }
 draw();return ()=>validateNativeConfig(read());
}
