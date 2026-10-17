// Declarative templates: no eval, scripts, arbitrary paths or generated regex.
export const CAPTURE_RULES=Object.freeze({
 evidence:'来源支持该字段时录入；未知省略，0/false/空值按类型保留。',
 identity:'初始化设定或新发现的稳定事实；既有常量仅凭明确用户纠正修改，当前变化另记。',
 event:'正文实际发生的独立事件；保留顺序、因果、结果与未完后果，计划和未实施威胁不算发生。',
 dialogue:'有后续作用的原句及说话者/场面；不把输入台词冒充AI正文，不改写暗语。',
 motif:'有证据的重复或转折细节；不为普通动作虚构象征或默契。',
 meaning:'依主体知识记录含义、前后变化及例外；共同经历可自然形成暗语，无须事先约定；私人解释与共同记忆分别保存。',
 knowledge:'接触依据才改变知情；听闻/推测/误信与事实分开，同场和读者可见不授予人物知识。',
 state:'实际变化才更新唯一当前行；未知去向使旧状态失效，回顾矛盾不算新变化。',
 pending:'已接受约定、已启动事务或真实待答问题；拒绝、意图或到期不等于完成。',
 relation:'关系各维独立，变化须锚点依据；一次表现不升级为永久习惯或人格替换。',
 preference:'仅从用户要求或待确认候选提取；限定作用域，角色偏好不等于真实用户偏好。',
 reference:'引用已登记或同批新ID；不以同名合并，不复制整份关联资料。',
 native:'宿主唯一写入；表单保存原生路径引用，不复制数值或再次生成更新命令。',
 derived:'程序派生，模型不填录。',
});
const fail=m=>{throw Error('表单条件：'+m);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const simple=new Set(['always','selected','strict','context','cue','tagged','retrieved','focused','rule']);
export function validateCondition(node,depth=0){
 if(depth>8||!object(node)||typeof node.op!=='string')fail('结构无效或嵌套过深');let keys=['op'];
 if(simple.has(node.op)){}
 else if(['any','all'].includes(node.op)){keys.push('args');if(!Array.isArray(node.args)||!node.args.length||node.args.length>20)fail('组合条件须有1—20项');for(const x of node.args)validateCondition(x,depth+1);}
 else if(node.op==='not'){keys.push('arg');validateCondition(node.arg,depth+1);}
 else if(['eq','oneOf','has'].includes(node.op)){keys.push('field');if(typeof node.field!=='string'||!node.field||['__proto__','prototype','constructor'].includes(node.field))fail('字段名无效');if(node.op!=='has'){keys.push('value');if(node.op==='oneOf'&&(!Array.isArray(node.value)||!node.value.length))fail('匹配值须为非空数组');if(node.value===undefined)fail('缺少匹配值');}}
 else if(node.op==='text'){keys.push('source','terms');if(!['previous','user','either'].includes(node.source)||!Array.isArray(node.terms)||!node.terms.length||node.terms.length>100||!node.terms.every(x=>typeof x==='string'&&x.trim().length>=2))fail('文本条件缺少来源或有效短语');}
 else fail('未登记操作 '+node.op);
 if(Object.keys(node).some(k=>!keys.includes(k)))fail('含未登记参数');return node;
}
export function phraseMatch(text,phrase){
 const normalize=s=>String(s??'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu,' ').trim();
 text=normalize(text);phrase=normalize(phrase);if(phrase.length<2)return false;
 for(let at=text.indexOf(phrase);at>=0;at=text.indexOf(phrase,at+1)){
  const before=Array.from(text.slice(0,at)).at(-1)??'',after=Array.from(text.slice(at+phrase.length))[0]??'';
  const word=c=>/[\p{L}\p{N}]/u.test(c)&&!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c);
  if(!(word(phrase[0])&&word(before))&&!(word(phrase.at(-1))&&word(after)))return true;
 }return false;
}
export function conditionMatches(node,c){
 validateCondition(node);function run(n){
  if(n.op==='always')return true;if(simple.has(n.op))return c[n.op]===true;
  if(n.op==='any')return n.args.some(run);if(n.op==='all')return n.args.every(run);if(n.op==='not')return !run(n.arg);
  if(n.op==='has')return Object.hasOwn(c.row.values,n.field);
  if(n.op==='eq')return JSON.stringify(c.row.values[n.field])===JSON.stringify(n.value);
  if(n.op==='oneOf')return n.value.some(v=>JSON.stringify(c.row.values[n.field])===JSON.stringify(v));
  const texts=n.source==='previous'?[c.previousText]:n.source==='user'?[c.userText]:[c.previousText,c.userText];return texts.some(text=>n.terms.some(term=>phraseMatch(text,term)));
 }return run(node);
}
const any=(...ops)=>({op:'any',args:ops.map(op=>typeof op==='string'?{op}:op)});
export function tableCondition(id){
 if(['scene','facts','tasks','timers','clues','preferences','holdings'].includes(id))return {op:'always'};
 if(id==='activities')return any({op:'oneOf',field:'状态',value:['计划','进行','等待']},'context','cue','tagged','retrieved');
 if(id==='state')return {op:'not',arg:{op:'eq',field:'有效性',value:'失效'}};
 if(id==='objects')return any('context','cue','tagged','retrieved','rule');
 if(id==='events')return any('cue','tagged','retrieved');if(id==='native_cells')return {op:'not',arg:{op:'always'}};
 return any('context','cue','tagged','retrieved');
}
export function captureRule(table,key,def){
 if(def.formula)return 'derived';if(key==='原生引用'||table==='native_cells')return 'native';if(table==='preferences')return 'preference';if(['ref','refs'].includes(def.type))return 'reference';if(['台词','原文段落'].includes(key))return 'dialogue';if(['意象','触发线索'].includes(key))return 'motif';if(table==='experiences')return 'meaning';if(table==='cognition'||key==='公开范围')return 'knowledge';if(['relations','growth'].includes(table))return 'relation';if(['tasks','timers','activities'].includes(table))return 'pending';if(['state','scene','holdings'].includes(table))return 'state';if(table==='objects'||table==='type')return 'identity';if(table==='events')return 'event';return 'evidence';
}
export function applyConditionTemplates(registry){
 const fields=(defs,table)=>{for(const [key,def]of Object.entries(defs)){def.capture??=captureRule(table,key,def);def.include??={op:'selected'};if(['ref','refs'].includes(def.type))def.follow??=(table==='objects'||table==='type'||key==='关联事件')?'identity':'record';if(def.fields)fields(def.fields,table);if(def.items)fields({item:def.items},table);}};
 for(const item of registry.tables){item.assemble??=tableCondition(item.id);fields(item.fields,item.id);}for(const item of registry.types)fields(item.fields,'type');return registry;
}
