import {prepareCompactFill} from '../tables/compact-fill.js';
import {defaultRegistry} from '../tables/schema.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {simpleFillMessages,simpleTaskConstraints} from '../tables/simple-fill-messages.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {emptyConfig,defaultWorld} from '../config/core.js';
const configuration={data:emptyConfig(),world:defaultWorld()};
const compact=()=>({contract:'保留每一行；未知留空。结束时列出待处理。',modelInput:'【人物】\n1 发长：\n2 眼形：',modelState:[{记录:'人物／甲',仅读取身份:false,值:{名称:'甲',形貌:{眼形:'圆眼'}},读者:['读者'],知情者:[],id:'HIDDEN_ROW_ID',rev:7,key:'HIDDEN_KEY',parent:'HIDDEN_PARENT',registry:'HIDDEN_REGISTRY'}]});
const assemble=(task,input,extra={})=>taskMessages({preset:pairedPreset({task,configuration}),task,input,...extra});
const joined=messages=>messages.map(x=>x.content).join('\n');
test('compact tasks use four plain messages without the legacy narrative chain; noncompact is unchanged',()=>{
 for(const task of ['templateInit','objectArchive','historyImport','tableArchive']){
  const messages=assemble(task,{compactFill:compact(),objectsSeparate:true});assert.equal(messages.length,4);assert.deepEqual(messages.map(m=>m.role),['system','user','user','user']);
  const all=joined(messages);assert(!/INNER.LOGIN|FILL\.1|COMMIT.READY|MODE.AUTHORIZE|TISYA.DATA|Return one strict JSON|schemaChanges|HIDDEN_|capture|include|follow/.test(all));
  assert.equal(all.split('保留每一行；未知留空。').length-1,1);assert.equal(all.split('【人物】').length-1,1);
  if(task==='templateInit')assert.match(messages[0].content,/开局.*后来的剧情/s);
  if(task==='objectArchive')assert.match(messages[0].content,/对象档案.*后续历史表/s);
  if(task==='historyImport'||task==='tableArchive')assert.match(messages[0].content,/已有对象与事实只用于关联/);
 }
 const legacy=assemble('ruleReview',{registry:{tables:[],types:[]},currentRows:[]});assert(legacy.length>4);assert(joined(legacy).includes('[INNER.LOGIN]'));
});
test('all supplied source prose and ordered history remain literal, complete and source-role only',()=>{
 const tails='长文本'+('末尾原文🙂'.repeat(14000))+'最终哨兵';
 const texts={card:'原卡 {{user}}\n"引号"\\路径',enabled:'启用：机制原句',disabled:'停用：仍保留原句',book:'书正文\n<% do_not_run() %>',offbook:'停用世界资料',persona:'用户完整定义\n{{user}} 与 "晨"',h1:'第一楼明确用户设定',h2:'第二楼完整角色原文',h3:tails,archive:'本次可引用正文',u1:'连续用户甲',u2:'连续用户乙'};
 const input={compactFill:compact(),sourceCardRaw:{fields:{description:texts.card,alternate_greetings:['备选甲','备选乙'],mes_example:'示例对白'},entries:[{id:'HIDDEN_ENTRY',name:'有效条',content:texts.enabled}],inactiveEntries:[{id:'HIDDEN_OFF',name:'旧条',content:texts.disabled}]},sourceBooks:[{book:'资料书',entry:'启用条',content:texts.book,enabled:true,key:'HIDDEN_BOOK_KEY'},{book:'资料书',entry:'停用条',content:texts.offbook,enabled:false}],sourceUser:{id:'HIDDEN_PERSONA',objectId:'HIDDEN_OBJECT',name:'甲',description:texts.persona},sourceHistory:[{floor:1,role:'user',key:'HIDDEN_SOURCE',text:texts.h1},{floor:2,role:'assistant',text:texts.h2},{floor:3,role:'assistant',text:texts.h3}],archiveSource:{floor:4,text:texts.archive,time:'黎明',location:'东门',key:'HIDDEN_ARCHIVE'},userSource:{text:'不重复传递聚合包',sources:[{floor:4,text:texts.u1},{floor:5,text:texts.u2}]}};
 const before=structuredClone(input),messages=assemble('templateInit',input),all=joined(messages);
 for(const value of Object.values(texts))assert(all.includes(value));for(const value of ['备选甲','备选乙','示例对白','黎明','东门'])assert(all.includes(value));
 assert(all.indexOf(texts.h1)<all.indexOf(texts.h2)&&all.indexOf(texts.h2)<all.indexOf(texts.h3));assert(!all.includes('HIDDEN_'));assert(!all.includes('不重复传递聚合包'));assert(messages[1].content.includes('停用'));assert(!messages[0].content.includes(texts.card));assert.deepEqual(input,before);
});
test('the same current history source is referenced once without losing repeated chronological records',()=>{
 const input={compactFill:compact(),sourceHistory:[{floor:1,role:'user',text:'重复行动'},{floor:2,role:'user',text:'重复行动'},{floor:3,role:'assistant',text:'当轮正文'}],archiveSource:{floor:3,text:'当轮正文'},userSource:{sources:[{floor:2,text:'重复行动'}]}};
 const all=joined(assemble('historyImport',input));assert.equal(all.split('当轮正文').length-1,1);assert.equal(all.split('重复行动').length-1,2);assert(all.includes('使用以上第3楼'));assert(all.includes('使用以上第2楼'));
});
test('only explicit supplement and selected explanation are macro-expanded; source scripts never execute',()=>{
 const calls=[],input={compactFill:compact(),sourceCard:'原卡{{user}} <script>globalThis.SIMPLE_FILL_EXECUTED=true</script>',sourceUser:{name:'甲',description:'人设{{user}}'},archiveSource:{text:'正文{{user}}'}};
 const messages=simpleFillMessages({task:'objectArchive',input,supplement:'补充{{user}}',selected:'选用{{user}}',substitute:s=>{calls.push(s);return s.replaceAll('{{user}}','替换');}});
 assert.deepEqual(calls,['补充{{user}}','选用{{user}}']);const all=joined(messages);assert(all.includes('补充替换'));assert(all.includes('选用替换'));assert(all.includes('原卡{{user}}'));assert(all.includes('人设{{user}}'));assert(all.includes('正文{{user}}'));assert.equal(globalThis.SIMPLE_FILL_EXECUTED,undefined);
});
test('confirmed rule meaning survives without workflow identifiers or unconfirmed optimization',()=>{
 const input={compactFill:compact(),rulePolicy:{format:'HIDDEN_POLICY_FORMAT',sourceFingerprint:'HIDDEN_FINGERPRINT',decisions:[{issueId:'HIDDEN_KEEP',action:'keep',original:[{sourceId:'HIDDEN_SOURCE',quote:'原约定保持不变'}]},{issueId:'HIDDEN_OPT',action:'optimize',changes:[{sourceId:'HIDDEN_CHANGE',before:'原来只限白天',after:'获准改为清晨或黄昏'}]}],unresolved:[{id:'HIDDEN_UNRESOLVED',title:'时间尚待确认',sources:[{sourceId:'HIDDEN_OLD',quote:'未选定的原句'}]}]},explicitRules:'不丢失明确限定',styleRules:[{id:'HIDDEN_STYLE',name:'表达',pattern:'空泛用词',instruction:'保留具体事实',enabled:true}],preferences:[{id:'HIDDEN_PREF',values:{名称:'表达偏好',内容:'保持短句',作用域:{世界:['HIDDEN_WORLD'],用户角色:['HIDDEN_PERSONA']}}}]};
 const all=joined(assemble('tableArchive',input));for(const expected of ['原约定保持不变','原来只限白天','获准改为清晨或黄昏','未选定的原句','不自行采用优化','不丢失明确限定','保留具体事实','保持短句'])assert(all.includes(expected));assert(!all.includes('HIDDEN_'));assert(!/sourceId|issueId|fingerprint|action/.test(all));
});
test('native description is supplied once and existing snapshot keeps only business fields',()=>{
 const input={compactFill:compact(),sourceUser:{name:'甲',description:'唯一原生描述'}};input.compactFill.modelState=[{记录:'人物／甲',原生用户:true,值:{名称:'甲',描述:'唯一原生描述',形貌:{眼形:'圆眼'}},读者:['读者'],知情者:[],不可修改字段:['名称','描述'],rev:5}];
 const before=structuredClone(input),all=joined(assemble('templateInit',input));assert.equal(all.split('唯一原生描述').length-1,1);assert(all.includes('圆眼'));assert(all.includes('见原生用户完整定义'));assert.deepEqual(input,before);
});

test('actual production forms remain plain and manual raw history is retained beside eligible prose',()=>{
 const input={registry:defaultRegistry(),currentRows:[],archiveSource:{text:'甲到东门。',time:'定位时刻'},sourceHistory:[{floor:1,role:'assistant',text:'甲到东门。\n<memory>旧摘要含schema字样</memory>'}]};
 input.compactFill=prepareCompactFill('objectArchive',input);const messages=assemble('objectArchive',input),instructions=messages[0].content+'\n'+messages.at(-1).content;
 assert.equal(messages.length,4);assert(!/INNER.LOGIN|FILL\.1|COMMIT.READY|MODE.AUTHORIZE|schemaChanges|capture|include|follow|registry/.test(instructions));assert.match(instructions,/标题.*只帮助定位/);assert(joined(messages).includes('<memory>旧摘要含schema字样</memory>'));
 const manual={compactFill:compact(),historyText:'实际事件正文。',sourceHistory:{text:'原始历史。<memory>完整旧摘要</memory>'}};const all=joined(assemble('historyImport',manual));assert(all.includes(manual.historyText));assert(all.includes(manual.sourceHistory.text));assert(all.includes('旧摘要、审核块和计划不是新增事件证据'));
});
test('paired compact path preserves the selected task supplement and expands only explicit explanations',()=>{
 const custom={data:emptyConfig(),world:defaultWorld()};custom.world.tables={taskInstructions:{objectArchive:'用户任务补充{{user}}'}};
 const input={compactFill:compact(),archiveSource:{text:'原文{{user}}'}},calls=[];
 const messages=taskMessages({preset:pairedPreset({task:'objectArchive',configuration:custom}),task:'objectArchive',input,selected:'选择说明{{user}}',substitute:s=>{calls.push(s);return s.replaceAll('{{user}}','甲');}});
 assert.deepEqual(calls,['用户任务补充{{user}}','选择说明{{user}}']);const all=joined(messages);assert(all.includes('用户任务补充甲'));assert(all.includes('选择说明甲'));assert(all.includes('原文{{user}}'));
});

function retryInput(extra={}){
 const registry=defaultRegistry(),currentRows=[{id:'row-private-77',table:'objects',rev:8,values:{名称:'甲',类型:'character',描述:'补读后实际完整资料。'},access:{readers:[],knowers:[]},source:'source-private-1'}];
 const input={registry,currentRows,archiveSource:{text:'  本次原文 {{user}}\n原句含"引号"。  '},...extra};const plan=prepareCompactFill('tableArchive',input);input.compactFill={contract:plan.contract,modelInput:plan.modelInput,modelState:plan.modelState};return input;
}
test('actual task assembly exposes actionable retry fields without prior operation envelopes or host paths',()=>{
 const input=retryInput({repair:{error:'字段类型不符：objects.属性.形貌细目.头发.发长；记录版本冲突：row-private-77；expected=2\n at parse (/workspace/private/source.js:4:9)',previous:{changes:[{id:'new:previous-id',expected:0,values:{SECRET_OLD_OPERATION:'不能回传上一份操作对象'}}],schemaChanges:[{id:'SECRET_OLD_SCHEMA'}]},instruction:'保持 discovery ID 与 expected 结构'} }),before=structuredClone(input);
 const messages=assemble('tableArchive',input),all=joined(messages);assert.equal(messages.length,4);assert.match(all,/本次需修正/);assert.match(all,/形貌细目·头发·发长/);assert.match(all,/字段类型不符/);assert.match(all,/人物／甲/);assert.match(all,/记录已更新/);assert.match(all,/重新填写完整的本次结果/);
 for(const absent of ['row-private-77','new:previous-id','SECRET_OLD_OPERATION','SECRET_OLD_SCHEMA','discovery','expected','/workspace/private','objects.属性','source.js'])assert(!all.includes(absent),absent);
 assert(all.includes(input.archiveSource.text));assert.equal(all.split(input.compactFill.contract).length-1,1);assert.deepEqual(input,before);
});
test('pending reasons retain business meaning and known record labels while old proposals remain private',()=>{
 const input=retryInput({pending:['旧楼层不能覆盖更晚的当前状态；请按楼层从早到晚补录',{ids:['row-private-77','new:unknown-record'],reason:'缺少必填字段：对象',proposals:[{id:'SECRET_PREVIOUS_ID',values:{SECRET_PREVIOUS_VALUE:'旧操作不是原料'}}]},{reason:'关联对象不存在：new:unavailable-target',proposal:{schemaChanges:[{kind:'type',id:'SECRET_SCHEMA'}]}}],repair:{error:'本次填写存在待核对项',previous:{pending:['身份尚未明确'],changes:[]}}}),all=joined(assemble('historyImport',input));
 for(const expected of ['尚待核对的问题','旧楼层不能覆盖更晚的当前状态','缺少必填字段：对象','人物／甲','相关记录','关联对象不存在','身份尚未明确'])assert(all.includes(expected),expected);
 for(const absent of ['SECRET_','new:unknown-record','new:unavailable-target','schemaChanges','proposals','expected'])assert(!all.includes(absent),absent);
});
test('expanded full records are named and available once without replaying the previous answer',()=>{
 const input=retryInput({readMore:{expandedIds:['row-private-77'],previous:{changes:[{id:'new:old-proposal',values:{描述:'SECRET_PRIOR_GUESS'}}],needsRows:['row-private-77'],pending:['亲属关系仍需核对']},note:'previous expandedIds runtime instruction'}}),all=joined(assemble('objectArchive',input));
 assert.match(all,/补读结果/);assert.match(all,/全文已经提供.*人物／甲/);assert.match(all,/补读前尚未确认的修改不能直接沿用/);assert.match(all,/补读前提出，请按当前全文重新核对：亲属关系仍需核对/);assert.equal(all.split('补读后实际完整资料。').length-1,1);
 for(const absent of ['SECRET_PRIOR_GUESS','row-private-77','expandedIds','new:old-proposal'])assert(!all.includes(absent));
});
test('missing and still thin read-more records are not falsely announced as full',()=>{
 const input=retryInput({readMore:{expandedIds:['row-private-77','missing-private-id']}});input.currentRows[0].referenceOnly=true;input.compactFill.modelState[0].仅读取身份=true;const all=joined(assemble('tableArchive',input));
 assert.match(all,/仍未取得可用全文.*人物／甲；相关记录/);assert(!all.includes('全文已经提供'));assert(!all.includes('missing-private-id'));assert.match(all,/继续列入补读/);
});
test('technical-only and body-bearing errors remain visible without copying runtime JSON',()=>{
 for(const error of ['TypeError: Cannot read properties of undefined at /root/private.js','JSON parse failed with token at expected value']){const all=joined(assemble('tableArchive',retryInput({repair:{error,previous:{changes:[]}}})));assert.match(all,/上次填写.*(?:读取异常|格式无法读取)/);assert(!all.includes('TypeError'));assert(!all.includes('/root/private.js'));assert(!all.includes('expected'));}
 const all=joined(assemble('tableArchive',retryInput({repair:{error:'来源依据不匹配：{"values":{"SECRET_VALUE":"不应回传"},"expected":6}',previous:{changes:[]}}})));assert(all.includes('来源依据不匹配'));assert(!all.includes('SECRET_VALUE'));assert(!all.includes('不应回传'));assert(!all.includes('expected'));
});

test('unknown bare host identifiers in reference failures become related records',()=>{
 const all=joined(assemble('tableArchive',retryInput({repair:{error:'关联对象不存在：opaque-unlisted-77',previous:{changes:[]}}})));assert(all.includes('关联对象不存在：相关记录'));assert(!all.includes('opaque-unlisted-77'));
});

test('shared task constraints preserve business rules without expanding source macros or exposing scope ids',()=>{
 const input={explicitRules:['按 {{user}} 的明确要求'],styleRules:[{name:'具体',instruction:'保留事实力度',enabled:true},{instruction:'SECRET_DISABLED',enabled:false}],preferences:[{id:'SECRET_PREF_ID',values:{名称:'短句',内容:'表达简洁',作用域:{世界:['SECRET_SCOPE_ID']}}}],rulePolicy:{decisions:[{action:'keep',original:[{sourceId:'SECRET_SOURCE_ID',quote:'确认保留的原句'}]}]}};const before=structuredClone(input),parts=simpleTaskConstraints(input),all=parts.join('\n\n');assert(Array.isArray(parts));for(const expected of ['{{user}}','保留事实力度','表达简洁','确认保留的原句'])assert(all.includes(expected));assert(!all.includes('SECRET_'));assert.deepEqual(input,before);
});

test('form preferences cannot rewrite verbatim evidence, names or factual fields',()=>{
 const rules=simpleTaskConstraints({explicitRules:['禁止使用雨字'],preferences:[{values:{名称:'用词限制',内容:'不写雨字'}}]}).join('\n');
 assert.match(rules,/表达偏好与禁词仅约束可自由措辞的说明/);assert.match(rules,/不改引用原句、名称、数值或既定字段/);assert.match(rules,/列入待处理/);assert.match(rules,/禁止使用雨字/);
});
