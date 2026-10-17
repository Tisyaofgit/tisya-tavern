// One wire grammar for all business forms. It never resolves identities or writes data.
const check=(ok,message)=>{if(!ok)throw Error(message);};
export const FORM_TEXT_INSTRUCTIONS='每格按“行号 字段名：值”填写。多行原文可在冒号后写 |，随后每一行缩进两个空格；只去掉这两个空格，内容原样保留。也可用完整双引号字符串表示文字，\\n表示换行，只解码一次。其他文字直接写；不要把实际换行放在双引号字符串内。';

export function formSections(raw,{defaultHeading=null}={}){
 check(typeof raw==='string','仅接收极简表格文本');
 check(raw.trim()&&raw.length<=1000000,'填表回答为空或过长');
 let text=raw.replace(/^\uFEFF/,'');
 if(text.trimStart().startsWith('```')){
  const fence=text.match(/^\s*```(?:text|txt)?\r?\n([\s\S]*)\r?\n```\s*$/);
  check(fence,'文本代码块格式无效');text=fence[1];
 }
 const lines=[...text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)].filter(x=>x[0]);
 const sections=[],seen=new Set();let current=null;
 for(let i=0;i<lines.length;i++){
  const rawLine=lines[i][1],line=rawLine.trim();if(!line)continue;
  const heading=line.match(/^【([^】]+)】$/);
  if(heading){check(!seen.has(heading[1]),'分组重复：'+heading[1]);seen.add(heading[1]);current={heading:heading[1],lines:[]};sections.push(current);continue;}
  if(!current&&defaultHeading!==null){current={heading:defaultHeading,lines:[]};sections.push(current);}
  check(current,'填表回答须从分组标题开始');
  const block=line.match(/^(\d+\s+.+?[：:]\s*)\|$/);
  if(block){
   const parts=[];while(i+1<lines.length&&lines[i+1][1].startsWith('  ')){i++;parts.push({text:lines[i][1].slice(2),eol:lines[i][2]});}
   check(parts.length,'多行文字格缺少缩进内容');
   const value=parts.map((p,j)=>p.text+(j<parts.length-1?p.eol:'')).join('');
   current.lines.push(block[1]+JSON.stringify(value));
  }else current.lines.push(line);
 }
 return sections;
}

export const serializeFormSection=section=>'【'+section.heading+'】\n'+section.lines.join('\n');
export function formRow(line,fields,{labels=field=>[field.label]}={}){
 const match=line.trim().match(/^(\d+)\s+(.+)$/);check(match,'无法识别字段行');
 const number=Number(match[1]),field=fields.find((f,i)=>(f.row??i+1)===number);check(field,'行号未开放：'+number);
 const label=[...new Set(labels(field))].sort((a,b)=>b.length-a.length).find(value=>match[2].startsWith(value)&&/^[\s：:]|^$/.test(match[2].slice(value.length)));
 check(label,'字段名被修改：'+number);
 let value=match[2].slice(label.length).trimStart();if(/^[：:]/.test(value))value=value.slice(1).trimStart();
 return {number,field,raw:value};
}
export function decodeFormText(raw,label='文字'){
 if(!raw.startsWith('"'))return raw;
 let value;try{value=JSON.parse(raw);}catch{throw Error('文字格转义无效：'+label);}
 check(typeof value==='string','文字格须为文字：'+label);return value;
}
export function formTextFields(section,labels){
 check(section&&section.lines.length===labels.length,'表格缺少或多出字段');
 const fields=labels.map(label=>({label})),seen=new Set(),out={};
 for(const line of section.lines){const {number,field,raw}=formRow(line,fields);check(!seen.has(number),'行号重复：'+number);seen.add(number);const value=decodeFormText(raw,field.label);check(value.trim(),'文字格不能为空：'+field.label);out[field.label]=value;}
 return out;
}
