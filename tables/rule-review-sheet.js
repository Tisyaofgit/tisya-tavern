// Model-facing rules review sheet. The grouping/row/label/value surface follows
// foundation-sheet; nested numbered groups, explicit counts and two-space
// continuation lines are new documented extensions. Internal JSON is host-only.
export const RULE_REVIEW_SHEET_FORMAT='tisya.rule-review-sheet/1';
const fail=(code,message)=>{throw Object.assign(Error('规则校对简表：'+message),{code:'TISYA_RULE_SHEET_'+code});};
const check=(ok,code,message)=>{if(!ok)fail(code,message);};
const specifications={
 root:['问题数量'],
 issue:['问题标题','问题说明','原文引用数','优化方案数'],
 source:['来源','起始行','结束行'],
 option:['方案名称','修改理由','代价与取舍','改动数量'],
 change:['来源','起始行','结束行','修改后'],
};
function groupKind(name){
 if(name==='校对')return 'root';
 if(/^问题／[1-9]\d*$/.test(name))return 'issue';
 if(/^问题／[1-9]\d*／原文／[1-9]\d*$/.test(name))return 'source';
 if(/^问题／[1-9]\d*／方案／[1-9]\d*$/.test(name))return 'option';
 if(/^问题／[1-9]\d*／方案／[1-9]\d*／改动／[1-9]\d*$/.test(name))return 'change';
 fail('GROUP','未登记分组：'+name);
}
function readGroups(raw){
 check(typeof raw==='string'&&raw.length<=2000000,'TEXT','回答须为完整简表文本');
 let text=raw.replace(/^\uFEFF/,'');
 if(/^\s*```(?:text|txt)?\s*\n/.test(text)){const match=text.match(/^\s*```(?:text|txt)?\s*\n([\s\S]*?)\n```\s*$/);check(match,'FENCE','纯文本围栏未完整闭合');text=match[1];}
 const groups=new Map();let current=null,last=null;
 for(const [index,line]of text.split(/\r\n|\n|\r/).entries()){
  // Continuation is intentionally inspected before trimming. It can contain
  // heading-like or numbered literal source text without becoming structure.
  if(line.startsWith('  ')){
   check(last,'CONTINUATION','第 '+(index+1)+' 行续写没有所属字段');const value=line.slice(2);last.value=last.block&&!last.continued?value:last.value+'\n'+value;last.continued=true;continue;
  }
  if(!line.trim())continue;
  const heading=line.trim().match(/^【([^】]+)】$/);
  if(heading){const name=heading[1],kind=groupKind(name);check(!groups.has(name),'DUPLICATE_GROUP','分组重复：'+name);current={name,kind,rows:new Map()};groups.set(name,current);last=null;continue;}
  check(current,'GROUP','字段前缺少分组标题');
  const match=line.match(/^\s*([1-9]\d*)\s+(.+)$/);check(match,'ROW','无法识别第 '+(index+1)+' 行');
  const row=Number(match[1]),label=specifications[current.kind][row-1];check(label,'ROW','未开放行号：'+current.name+'／'+row);check(!current.rows.has(row),'DUPLICATE_ROW','字段行重复：'+current.name+'／'+row);
  check(match[2].startsWith(label),'LABEL','字段名不匹配：'+current.name+'／'+row+' 应为 '+label);
  let rest=match[2].slice(label.length);check(!rest||/^[\s：:]/.test(rest),'LABEL','字段名不匹配：'+label);
  const delimiter=rest.match(/^\s*[：:]/);if(delimiter){rest=rest.slice(delimiter[0].length);if(rest.startsWith(' '))rest=rest.slice(1);}else if(/^\s/.test(rest))rest=rest.slice(1);
  last={value:rest,block:rest==='',continued:false};current.rows.set(row,last);
 }
 return groups;
}

export function parseRuleReviewSheet(raw){
 const groups=readGroups(raw),used=new Set();
 function take(name){const group=groups.get(name);check(group,'MISSING_GROUP','缺少分组：'+name);used.add(name);check(group.rows.size===specifications[group.kind].length,'MISSING_ROW','请保留 '+name+' 的全部字段行；未知值留空');return [...Array(specifications[group.kind].length)].map((_,i)=>group.rows.get(i+1).value);}
 function integer(value,label,max,{positive=false}={}){check(/^(?:0|[1-9]\d*)$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)<=max&&(!positive||Number(value)>0),'NUMBER',label+'须为'+(positive?'正':'非负')+'整数且不超过 '+max);return Number(value);}
 function anchor(values){return {sourceId:values[0],fromLine:integer(values[1],'起始行',1000000,{positive:true}),toLine:integer(values[2],'结束行',1000000,{positive:true})};}
 const [total]=take('校对'),count=integer(total,'问题数量',200),issues=[];
 for(let n=1;n<=count;n++){
  const base='问题／'+n,[title,problem,sourceCount,optionCount]=take(base),sources=[],options=[];
  for(let m=1;m<=integer(sourceCount,'原文引用数',200,{positive:true});m++)sources.push(anchor(take(base+'／原文／'+m)));
  for(let m=1;m<=integer(optionCount,'优化方案数',6);m++){
   const optionBase=base+'／方案／'+m,[label,rationale,tradeoffs,changeCount]=take(optionBase),changes=[];
   for(let k=1;k<=integer(changeCount,'改动数量',200,{positive:true});k++){const values=take(optionBase+'／改动／'+k);changes.push({...anchor(values),after:values[3]});}
   options.push({id:'option-'+m,label,rationale,tradeoffs,changes});
  }
  issues.push({id:'issue-'+n,title,problem,sources,options});
 }
 check(groups.size===used.size,'UNEXPECTED_GROUP','存在未在数量格中声明的多余分组');
 return {format:'tisya.rule-review-proposal/2',issues};
}

export function ruleReviewSheetInstructions(){
 return `规则校对使用分组标题＋稳定行号＋字段名＋值，不输出 JSON、Markdown 表格、reply 或说明段。字段名后的冒号可有可无。所有字段行保留；问题、引用、方案与改动按声明数量展开对应分组。问题由 1 连续编号，子组各自从 1 连续编号；不要输出内部对象 ID，程序按分组编号生成。来源格原样填写提供的 sourceId，起始行和结束行填写原文行号；不得重新抄写原文来替代行号。无问题时只交付【校对】及 1 问题数量：0。
嵌套列表展开为带编号的子分组，数量格明确空列表；多行文字后续每一行以两个半角空格开头，程序只移除这两个空格并保留换行。字段行的冒号后允许一个分隔空格，其余前后空格原样保留。精确保留首行空白时，字段行只写字段名和冒号，全文每一行另起行并加两个半角空格；此时第一个续行就是内容第一行。文字内的空行也须写两个半角空格；续行换行统一为 LF，不改原始资料和原文定位。续行中的【标题】、行号、引号、分号都按文字原样保存，不作新的分组。单行普通文字中的标点不拆分。不能把嵌套对象或数组塞成 JSON 字符串。
示例目录（按实际数量重复；每组字段行号固定）：
【校对】
1 问题数量：1
【问题／1】
1 问题标题：简短标题
2 问题说明：具体冲突及其影响
3 原文引用数：1
4 优化方案数：1
【问题／1／原文／1】
1 来源：提供的 sourceId
2 起始行：1
3 结束行：2
【问题／1／方案／1】
1 方案名称：可选择的处理方式
2 修改理由：对应的具体问题
3 代价与取舍：该选择保留与改变的内容
4 改动数量：1
【问题／1／方案／1／改动／1】
1 来源：提供的 sourceId
2 起始行：1
3 结束行：2
4 修改后：替换后的第一行
  替换后的第二行
问题引用可有多个来源；每个方案只修改本问题引用范围内的原始定义。零个方案用优化方案数 0，不伪造可用方案。引用、范围、重复字段、遗漏字段、重叠改动与多余分组由程序校验，失败保留原稿，不自动增加模型请求。`;
}

// Deterministic fixture/export writer; callers still validate the proposal.
export function formatRuleReviewSheet(proposal){
 check(proposal?.format==='tisya.rule-review-proposal/2'&&Array.isArray(proposal.issues),'PROPOSAL','导出需要行号校对提案');const out=[];
 const group=(name,values)=>{out.push('【'+name+'】');for(const [index,value]of values.entries()){const label=specifications[groupKind(name)][index];if(typeof value==='number')out.push((index+1)+' '+label+'：'+value);else{check(typeof value==='string','VALUE','导出字段须为文字或行数');out.push((index+1)+' '+label+'：',...value.split('\n').map(line=>'  '+line));}}};
 group('校对',[proposal.issues.length]);
 proposal.issues.forEach((issue,i)=>{const name='问题／'+(i+1);group(name,[issue.title,issue.problem,issue.sources.length,issue.options.length]);issue.sources.forEach((ref,j)=>group(name+'／原文／'+(j+1),[ref.sourceId,ref.fromLine,ref.toLine]));issue.options.forEach((option,j)=>{const name2=name+'／方案／'+(j+1);group(name2,[option.label,option.rationale,option.tradeoffs,option.changes.length]);option.changes.forEach((change,k)=>group(name2+'／改动／'+(k+1),[change.sourceId,change.fromLine,change.toLine,change.after]));});});
 return out.join('\n');
}
