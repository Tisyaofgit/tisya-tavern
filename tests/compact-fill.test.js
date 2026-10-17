import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCompactFill,parseCompactFill} from '../tables/compact-fill.js';
import {defaultRegistry} from '../tables/schema.js';
import {foundationTemplatePlan} from '../tables/foundation-templates.js';
import {prepareCommit} from '../tables/ledger.js';

const source='甲擅长修船，佩戴旧铜铃。乙将旧铜铃交给甲。甲只知铜铃来自乙，并不知其中隐情。';
const row=(id,table,values,extra={})=>({id,table,rev:3,values,access:{readers:['读者'],knowers:[]},source:'old',...extra});
const character=(id,name,attributes={},extra={})=>row(id,'objects',{名称:name,类型:'character',属性:attributes},extra);
const registry=()=>foundationTemplatePlan('character').registry;
function setup(task='tableArchive',extra={}){return prepareCompactFill(task,{registry:registry(),currentRows:[],archiveSource:{text:source},...extra});}
const done=(pending='无',more='无')=>'【完成】\n1 状态：完成\n2 待处理：'+pending+'\n3 补读记录：'+more;
function group(plan,table,type,name,values={},phase=plan.task==='templateInit'?'base':'archive'){
 const schema=plan.schema.find(t=>t.table===table&&t.type===(type??'—'));assert(schema,'missing '+table+':'+type);
 const fields={'来源依据':source,'读者':'无','知情者':'无',...values};
 return '【'+schema.form+'：'+name+'】\n'+schema.fields.map(f=>f.row+' '+f.label+'：'+(fields[f.label]??'')).join('\n');
}
test('runtime registry creates leaf cells without exposing host IDs or revisions',()=>{
 const actor=character('secret-host-id','甲',{形貌:{整体:'高挑',感官印象:'松香'},人物核心:{核心矛盾:'谨慎而向往远行'}}),p=setup('tableArchive',{currentRows:[actor]});
 assert(p.schema.find(t=>t.type==='character').fields.some(f=>f.label==='属性·形貌·感官印象'));
 for(const visible of [p.contract,p.modelInput,JSON.stringify(p.modelState)])assert(!visible.includes('secret-host-id'));
 assert.match(JSON.stringify(p.modelState),/高挑/);assert.match(JSON.stringify(p.modelState),/谨慎而向往远行/);
});
test('no changes requires an explicit full completion; pending never becomes silent success',()=>{
 const p=setup();assert.deepEqual(parseCompactFill(p,done()).changes,[]);
 assert.deepEqual(parseCompactFill(p,done('缺新能力字段')).pending,['缺新能力字段']);
 for(const raw of ['', '{}','【完成】\n1 状态：完成',done().replace('2 待处理：无','2 待处理：'),done()+'\n【完成】\n1 状态：完成'])assert.throws(()=>parseCompactFill(p,raw));
});
test('new identities are registered before values and cross-record references are parsed',()=>{
 const p=setup(),text=[group(p,'holdings',null,'铜铃归属',{物品:'物品／旧铜铃',所有者:'人物／甲',数量:'1'}),group(p,'objects','character','甲',{'属性·本领·擅长':'修船',知情者:'人物／甲'}),group(p,'objects','item','旧铜铃',{'属性·用途':'铃声提示'}),done()].join('\n');
 const result=parseCompactFill(p,text),[holding,actor,item]=result.changes;
 assert.equal(holding.values.物品,item.id);assert.deepEqual(holding.values.所有者,[actor.id]);assert.deepEqual(actor.access.knowers,[actor.id]);assert.equal(holding.expected,0);
 const view={registry:p.registry,rows:[],last:null};assert.equal(prepareCommit(view,result,{source:'s',evidence:source,allowedTables:['objects','holdings']}).commit.changes.length,3);
});
test('sparse nested updates retain siblings and omit unfilled top-level fields',()=>{
 const existing=character('a','甲',{形貌:{整体:'高挑',感官印象:'松香'},人物核心:{核心矛盾:'旧矛盾'}}),p=setup('objectArchive',{currentRows:[existing]}),before=structuredClone(p);
 const result=parseCompactFill(p,group(p,'objects','character','甲',{'属性·形貌·整体':'清瘦'})+'\n'+done()),op=result.changes[0];
 assert.equal(op.id,'a');assert.equal(op.expected,3);assert.deepEqual(op.values.属性.形貌,{整体:'清瘦',感官印象:'松香'});assert.equal(op.values.属性.人物核心.核心矛盾,'旧矛盾');assert(!Object.hasOwn(op.values,'名称'));assert(!Object.hasOwn(op.values,'描述'));assert.deepEqual(p,before);
});
test('zero false null empty lists and unknown keep distinct existing schema types',()=>{
 for(const [raw,value]of [['0',0],['false',false],['null',null],['[]',[]]]){const a=character('a','甲'),p=setup('tableArchive',{currentRows:[a]}),text=group(p,'state',null,'测试状态',{对象:'人物／甲',字段:'测试',值:raw})+'\n'+done();assert.deepEqual(parseCompactFill(p,text).changes[0].values.值,value);}
 const a=character('a','甲',{生活:{兴趣:['读书'],习惯:['清点工具']}}),p=setup('objectArchive',{currentRows:[a]}),out=parseCompactFill(p,group(p,'objects','character','甲',{'属性·生活·兴趣':'无'})+'\n'+done());assert.deepEqual(out.changes[0].values.属性.生活,{兴趣:[],习惯:['清点工具']});
});
test('unknown references changed labels missing duplicate rows and extra fields reject atomically',()=>{
 const p=setup(),valid=group(p,'objects','character','甲',{'属性·身份细目·出身地':'地点／未登记'})+'\n'+done(),snapshot=structuredClone(p);
 assert.throws(()=>parseCompactFill(p,valid),/引用/);
 const base=group(p,'objects','character','甲');for(const bad of [base.replace('1 来源依据','1 错误依据'),base.replace(/^2 读者.*\n/m,''),base+'\n2 读者：无',base+'\n999 私造格：值',base+'\n'+base])assert.throws(()=>parseCompactFill(p,bad+'\n'+done()));
 assert.deepEqual(p,snapshot);
});
test('record access and evidence are required; no automatic public or knower widening',()=>{
 const p=setup();for(const values of [{'读者':''},{'知情者':''},{'来源依据':'并非原文'}, {'读者':'陌生人'}])assert.throws(()=>parseCompactFill(p,group(p,'objects','character','甲',values)+'\n'+done()));
 const op=parseCompactFill(p,group(p,'objects','character','甲')+'\n'+done()).changes[0];assert.deepEqual(op.access,{readers:[],knowers:[]});assert.equal(op.evidence,source);
});
test('objectsSeparate and template initialization phases retain their write boundaries',()=>{
 const separate=setup('historyImport',{objectsSeparate:true});assert.throws(()=>parseCompactFill(separate,'【人物：甲】\n'+done()),/不能填写/);
 const p=setup('templateInit',{sourceCard:source}),text=group(p,'objects','character','甲')+'\n'+group(p,'state',null,'开局状态',{对象:'人物／甲',字段:'体力',值:'0'},'initial')+'\n'+done();const result=parseCompactFill(p,text);assert.equal(result.base.changes.length,1);assert.equal(result.initial.changes.length,1);assert.deepEqual(result.notes,[]);
 assert.throws(()=>parseCompactFill(p,group(p,'events',null,'后续事件',{},'initial')+'\n'+done()),/不能填写/);
 assert.throws(()=>parseCompactFill(p,'【initial | objects | character | 甲】\n'+done()),/标题/);
});
test('ambiguous identities and aliases cannot be turned into silent creates or merges',()=>{
 const a=character('a','甲',{}),b=character('b','甲',{}),p=setup('objectArchive',{currentRows:[a,b]});assert.throws(()=>parseCompactFill(p,group(p,'objects','character','甲')+'\n'+done()),/不唯一/);
 a.values.别名=['船匠'];const q=setup('objectArchive',{currentRows:[a]});assert.throws(()=>parseCompactFill(q,group(q,'objects','character','船匠')+'\n'+done()),/别名冲突/);
});
test('unrelated delimiter names do not block preparation; encoded identities are exact',()=>{
 const a=character('a','甲；乙|丙%'),p=setup('objectArchive',{currentRows:[a]});assert.match(p.modelState[0].记录,/%EF%BC%9B/);const encoded=p.modelState[0].记录.split('／').slice(1).join('／');const out=parseCompactFill(p,group(p,'objects','character',encoded,{'属性·身份细目·社会身份':'船匠'})+'\n'+done());assert.equal(out.changes[0].id,'a');assert(!Object.hasOwn(out.changes[0].values,'名称'));
});
test('thin records explicitly request full reading and cannot be modified without it',()=>{
 const a=character('a','甲',{}, {referenceOnly:true}),p=setup('objectArchive',{currentRows:[a]});assert.deepEqual(parseCompactFill(p,done('无','人物／甲')).needsRows,['a']);assert.throws(()=>parseCompactFill(p,group(p,'objects','character','甲')+'\n'+done()),/薄档/);assert.throws(()=>parseCompactFill(p,done('无','人物／外人')),/授权身份/);
});
test('top-level and explicit nested locks reject updates while unrelated leaf updates survive',()=>{
 for(const key of ['属性','属性.形貌','属性.形貌.整体']){const p=setup('objectArchive',{currentRows:[character('a','甲',{形貌:{整体:'高挑'}},{lockedFields:[key]})]});assert.throws(()=>parseCompactFill(p,group(p,'objects','character','甲',{'属性·形貌·整体':'清瘦'})+'\n'+done()),/锁定/);}
 const p=setup('objectArchive',{currentRows:[character('a','甲',{形貌:{整体:'高挑'}},{lockedFields:['属性.形貌.整体']})]});assert.equal(parseCompactFill(p,group(p,'objects','character','甲',{'属性·生活·兴趣':'读书'})+'\n'+done()).changes.length,1);
});
test('virtual native user is referenceable, attributes are deltas and protected source/access cannot change',()=>{
 const access={readers:[],knowers:[]},p=setup('templateInit',{sourceCard:source,sourceUser:{objectId:'new:persona',name:'甲',description:'程序保留原文',access}}),text=group(p,'objects','character','甲',{'属性·本领·擅长':'修船'})+'\n'+done();const op=parseCompactFill(p,text).base.changes[0];assert.equal(op.id,'new:persona');assert.equal(op.expected,0);assert(!Object.hasOwn(op.values,'名称'));assert(!Object.hasOwn(op.values,'描述'));
 assert.throws(()=>parseCompactFill(p,group(p,'objects','character','甲',{描述:'别的原文'})+'\n'+done()),/逐字维护/);assert.throws(()=>parseCompactFill(p,group(p,'objects','character','甲',{'读者':'读者'})+'\n'+done()),/权限由程序/);
});
test('complex map and array references use display names without changing canonical field types',()=>{
 const r=defaultRegistry();r.tables.find(t=>t.id==='facts').fields.细节={type:'map',items:{type:'object',fields:{对象:{type:'ref'},强度:{type:'number'}}}};const p=setup('tableArchive',{registry:r,currentRows:[character('a','甲')]});const op=parseCompactFill(p,group(p,'facts',null,'复杂关联',{细节:'{"线索":{"对象":"人物／甲","强度":0}}'})+'\n'+done()).changes[0];assert.deepEqual(op.values.细节,{线索:{对象:'a',强度:0}});assert.equal(p.registry.tables.find(t=>t.id==='facts').fields.细节.type,'map');assert.match(p.modelInput,/完整对应项/);
});
test('model filling cannot design structures; original registry stays unchanged',()=>{
 const p=setup('objectArchive'),before=JSON.stringify(p.registry),ext={templates:[],schemaChanges:[{kind:'type',id:'item',fields:{纪念意义:{type:'text'}},evidence:source}]};
 assert.throws(()=>parseCompactFill(p,'【结构扩展】\n1 提案：'+JSON.stringify(ext)+'\n'+done()),/不设计字段/);assert.equal(JSON.stringify(p.registry),before);
 const result=parseCompactFill(p,done('原料有纪念意义，当前表格缺少专格'));assert.equal(result.changes.length,0);assert.equal(result.pending.length,1);
});

test('non-JSON and absent sources fail closed without any plan mutation',()=>{
 const p=prepareCompactFill('tableArchive',{registry:defaultRegistry(),rows:[]}),snapshot=structuredClone(p);assert.deepEqual(parseCompactFill(p,done()).changes,[]);assert.throws(()=>parseCompactFill(p,group(p,'objects','character','甲')+'\n'+done()),/来源/);assert.deepEqual(p,snapshot);
});
test('discovery temporary IDs remain unique when the subsequent history phase adds records',()=>{
 const actor=character('new:compact-historyImport-1','甲'),p=setup('historyImport',{currentRows:[actor],objectsSeparate:true});const op=parseCompactFill(p,group(p,'events',null,'交接铜铃',{经过:'乙将旧铜铃交给甲。',参与者:'人物／甲'})+'\n'+done()).changes[0];assert.notEqual(op.id,actor.id);assert.deepEqual(op.values.参与者,[actor.id]);
});
test('native user evidence keeps original quotes independently of escaped card serialization',()=>{
 const description='甲说："我只修船，不碰机关。"',access={readers:[],knowers:[]},p=setup('templateInit',{sourceCard:JSON.stringify({user:description}),archiveSource:undefined,sourceUser:{objectId:'new:persona',name:'甲',description,access}});
 const out=parseCompactFill(p,group(p,'objects','character','甲',{'来源依据':description,'属性·本领·擅长':'修船'})+'\n'+done());assert.equal(out.base.changes[0].evidence,description);assert(!p.modelInput.includes(p.contract));assert(p.modelInput.startsWith('本次可填表格：'));
});

test('natural sparse forms infer phase and resolve named references without runtime syntax',()=>{
 const p=setup('templateInit',{sourceCard:source}),form=p.schema.find(t=>t.type==='character'),f=form.fields.find(f=>f.label==='属性·本领·擅长');
 const raw='【人物：甲】\n1 来源依据：'+source+'\n2 谁可看到：无\n3 故事里谁已知：无\n'+f.row+' 本领·擅长：修船\n'+done();const result=parseCompactFill(p,raw);assert.equal(result.base.changes.length,1);assert.equal(result.initial.changes.length,0);assert.deepEqual(result.base.changes[0].values.属性.本领.擅长,['修船']);assert(!Object.hasOwn(result.base.changes[0].values,'描述'));
 for(const word of ['schemaChanges','capture','additionalProperties','objects /','base（','archive |','结构扩展'])assert(!p.modelInput.includes(word)&&!p.contract.includes(word),word);
 assert.throws(()=>parseCompactFill(p,raw.replace('本领·擅长','本领·伪造')),/字段名/);assert.throws(()=>parseCompactFill(p,raw.replace('【完成】','1 来源依据：'+source+'\n【完成】')),/重复/);
 const q=setup('tableArchive',{currentRows:[character('a','甲')]}),sf=q.schema.find(t=>t.table==='state'),lines=['【'+sf.form+'：修船】','1 来源依据：'+source,'2 谁可看到：读者','3 故事里谁已知：人物／甲'];for(const [label,value]of [['对象','人物／甲'],['字段','工作'],['值','修船']]){const f=sf.fields.find(f=>f.label===label);lines.push(f.row+' '+label+'：'+value);}const out=parseCompactFill(q,lines.join('\n')+'\n'+done()).changes[0];assert.equal(out.values.对象,'a');assert.equal(out.values.值,'修船');assert.deepEqual(out.access.knowers,['a']);
});

test('encoded multiline evidence matches its exact original, including CRLF and outer spaces',()=>{
 const evidence='  登记人：甲\r\n职业：修船匠\n备注："只修船"。  ',p=setup('objectArchive',{archiveSource:undefined,userSource:{text:evidence}}),result=parseCompactFill(p,group(p,'objects','character','甲',{'来源依据':JSON.stringify(evidence),'属性·身份细目·社会身份':'修船匠'})+'\n'+done());
 assert.equal(result.changes[0].evidence,evidence);assert.match(p.contract,/只解码一次/);
});
test('encoded text preserves whitespace, quotes, escapes and literal escape sequences once',()=>{
 const values=['  原文前后空白  ','甲\n乙','甲\r\n乙','"原文引号"','字面\\n不会换行','反斜线\\与引号"','""','【完成】\n999 未开放字段：不会创建新字段'];
 for(const value of values){const p=setup('objectArchive'),op=parseCompactFill(p,group(p,'objects','character','甲',{描述:JSON.stringify(value)})+'\n'+done()).changes[0];assert.equal(op.values.描述,value);assert.equal(Object.keys(op.values).length,3);}
 const p=setup('objectArchive'),op=parseCompactFill(p,group(p,'objects','character','甲',{描述:'"\\u7532\\t\\u4e59"'})+'\n'+done()).changes[0];assert.equal(op.values.描述,'甲\t乙');
});
test('plain text and explicit empty text remain distinct from an unfilled cell',()=>{
 for(const value of ['普通文字','“中文引号”','字面\\n','false','0','null','{"正文":"字面JSON"}']){const p=setup('objectArchive');assert.equal(parseCompactFill(p,group(p,'objects','character','甲',{描述:value})+'\n'+done()).changes[0].values.描述,value);}
 const existing=character('a','甲');existing.values.描述='原描述';const p=setup('objectArchive',{currentRows:[existing]});
 const empty=parseCompactFill(p,group(p,'objects','character','甲',{描述:'""'})+'\n'+done()).changes[0];assert.equal(empty.values.描述,'');
 const untouched=parseCompactFill(p,group(p,'objects','character','甲',{描述:''})+'\n'+done()).changes[0];assert(!Object.hasOwn(untouched.values,'描述'));
});
test('bad string encodings and forged decoded evidence reject without fallback or plan mutation',()=>{
 const p=setup('objectArchive'),before=structuredClone(p);
 for(const raw of ['"坏\\q转义"','"未闭合','"正文" trailing','"\\uZZZZ"','"两段" "字符串"'])assert.throws(()=>parseCompactFill(p,group(p,'objects','character','甲',{描述:raw})+'\n'+done()),/转义无效/);
 assert.throws(()=>parseCompactFill(p,group(p,'objects','character','甲',{'来源依据':JSON.stringify('伪造\n来源')})+'\n'+done()),/来源依据/);assert.deepEqual(p,before);
});
test('encoded time text is decoded while enum, list and complex JSON semantics stay unchanged',()=>{
 const r=registry();r.tables.find(t=>t.id==='events').fields.登记时间={type:'time'};const p=setup('tableArchive',{registry:r});
 const op=parseCompactFill(p,group(p,'events',null,'中性事件',{登记时间:JSON.stringify('  第一天\n清晨  '),原文段落:'"仍是列表中的字面引号"'})+'\n'+done()).changes[0];assert.equal(op.values.登记时间,'  第一天\n清晨  ');assert.deepEqual(op.values.原文段落,['"仍是列表中的字面引号"']);
 const state=setup('tableArchive',{currentRows:[character('a','甲')]});assert.equal(parseCompactFill(state,group(state,'state',null,'测试状态',{对象:'人物／甲',字段:'正文',值:JSON.stringify('"JSON格的字面引号"')})+'\n'+done()).changes[0].values.值,'"JSON格的字面引号"');
 assert.throws(()=>parseCompactFill(state,group(state,'state',null,'测试状态',{对象:'人物／甲',字段:'正文',值:'0',有效性:'"有效"'})+'\n'+done()));
});
test('native user original stays protected when quoted descriptions or explicit empty values are submitted',()=>{
 const description='  甲说："只修船。"\n这是本人原文。  ',p=setup('templateInit',{sourceCard:JSON.stringify({user:description}),archiveSource:undefined,sourceUser:{objectId:'new:persona',name:'甲',description,access:{readers:[],knowers:[]}}}),before=structuredClone(p);
 const values={'来源依据':JSON.stringify(description),'属性·身份细目·社会身份':JSON.stringify('修船匠\n兼任木工')},op=parseCompactFill(p,group(p,'objects','character','甲',values)+'\n'+done()).base.changes[0];assert.equal(op.evidence,description);assert.equal(op.values.属性.身份细目.社会身份,'修船匠\n兼任木工');assert(!Object.hasOwn(op.values,'描述'));
 for(const raw of [JSON.stringify(description),'""'])assert.throws(()=>parseCompactFill(p,group(p,'objects','character','甲',{...values,描述:raw})+'\n'+done()),/逐字维护/);assert.deepEqual(p,before);
});
