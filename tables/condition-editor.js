import {CONDITION_COMPARATORS} from './condition-form.js';
export function conditionEditor({data,editId,el,field,button,section,check,changed,saved,isDirty,reload,save}){
 const top=section('世界书条件');top.append(el('p','条件只登记一次；世界书条目选择引用。判定读取当前表单，未知不命中。'));
 let selected=editId??'';field(top,'选择条件',selected,{track:false,choices:[['','新建条件'],...data.rules.map(r=>[r.id,r.name])],change:v=>selected=v});
 button(top,'载入条件',()=>{check(!isDirty(),'请先保存或放弃当前修改');return reload(selected);});
 const old=data.rules.find(r=>r.id===editId);
 if(old&&!old.editable){top.append(el('p',old.diagnostic??'这条规则含有扩展判定；原定义保留，请到其原始表单修订。'));return;}
 const draft=structuredClone(old??{name:'',active:{combine:'all',rows:[]},expiry:{combine:'all',rows:[]},policy:{chance:100,cooldown:0,limit:null,start:0,end:null}}),form=section(old?'编辑条件':'新建条件');
 field(form,'条件名称',draft.name,{change:v=>draft.name=v});
 const cellChoices=data.cells.map(c=>[c.key,c.name]);
 function group(parent,label,g){
  const box=section(label,parent);field(box,label+'组合',g.combine,{choices:[['all','全部满足'],['any','任一满足']],change:v=>g.combine=v});const rows=el('div');box.append(rows);
  function render(){rows.replaceChildren();g.rows.forEach((row,index)=>{
   const line=section(label+' '+(index+1),rows),cell=()=>data.cells.find(c=>c.key===row.cell);
   field(line,'引用字段',row.cell,{choices:cellChoices,change:v=>{row.cell=v;const type=cell()?.type;row.kind=['NUMBER','INTEGER'].includes(type)?'number':type==='BOOLEAN'?'boolean':'text';row.value=row.kind==='number'?0:row.kind==='boolean'?false:'';render();}});
   field(line,'比较',row.comparator,{choices:CONDITION_COMPARATORS,change:v=>{row.comparator=v;render();}});
   if(row.comparator!=='exists'){
    field(line,'比较对象',row.kind==='reference'?'reference':'literal',{choices:[['literal','填写值'],['reference','引用另一字段']],change:v=>{row.kind=v==='reference'?'reference':['NUMBER','INTEGER'].includes(cell()?.type)?'number':cell()?.type==='BOOLEAN'?'boolean':'text';row.value=row.kind==='number'?0:row.kind==='boolean'?false:'';row.reference=data.cells[0]?.key??'';render();}});
    if(row.kind==='reference')field(line,'比较字段',row.reference,{choices:cellChoices,change:v=>row.reference=v});
    else field(line,'比较值',row.value,{type:row.kind==='number'?'number':row.kind==='boolean'?'checkbox':'text',...(row.kind==='text'&&cell()?.valueOptions.length?{choices:[['','选择值'],...cell().valueOptions]}:{}),change:v=>row.value=v});
   }
   button(line,'移除此行',()=>{g.rows.splice(index,1);changed();render();});
  });}
  button(box,'添加'+label,()=>{const c=data.cells[0];check(c,'请先在世界或对象表单登记可引用字段');const kind=['NUMBER','INTEGER'].includes(c.type)?'number':c.type==='BOOLEAN'?'boolean':'text';g.rows.push({cell:c.key,comparator:'eq',kind,value:kind==='number'?0:kind==='boolean'?false:'',reference:''});changed();render();});render();
 }
 group(form,'生效条件',draft.active);
 const more=el('details');more.append(el('summary','失效条件与触发限制（可选）'));form.append(more);group(more,'失效条件',draft.expiry);
 for(const [key,label]of [['chance','概率百分比'],['cooldown','成功间隔回合'],['start','起始回合']])field(more,label,draft.policy[key],{type:'number',change:v=>draft.policy[key]=v});
 for(const [key,label]of [['limit','成功次数上限'],['end','截止回合']])field(more,label,draft.policy[key]??'',{change:v=>draft.policy[key]=v.trim()===''?null:Number(v)});
 button(form,'保存条件',async()=>{const result=await save(draft,data.revision,data.contextKey);saved();await reload(result.id);});
}
