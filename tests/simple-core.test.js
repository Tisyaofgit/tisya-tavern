import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimpleCore,parseSimpleCore} from '../tables/simple-core.js';
import {coreSourceText,coreSourceContains} from '../tables/source-text.js';
import {coreSelection,validateBundle} from '../tables/core-assets.js';
import {defaultRegistry} from '../tables/schema.js';

const access={readers:['读者'],knowers:[]};
const quote='她说："守约。"\n路径 C:\\灯塔；{{user}} <script>globalThis.coreSourceExecuted=true</script>';
function fixture({growth=true,links=true}={}){
 const registry=defaultRegistry();
 registry.types[0].fields.随身={type:'object',fields:{地点:{type:'ref'},见证者:{type:'refs'}}};
 const rows=[
  {id:'private:person-a',rev:39,table:'objects',values:{名称:'同名',类型:'character',描述:quote,别名:['远行者'],关联:['private:person-b'],核心引用:'private:old-core',属性:{性格:'保持承诺',随身:{地点:'private:unselected',见证者:['private:person-b']}}},access:{readers:['读者','private:person-b'],knowers:['private:person-a']}},
  {id:'private:person-b',rev:72,table:'objects',values:{名称:'同名',类型:'item',描述:'普通灯具用于照路，不会施法。',属性:{用途:'照路',材质:'铜'}},access},
  {id:'private:unselected',table:'objects',values:{名称:'未选地点',类型:'place',描述:'不该随未选对象展开。'},access},
  {id:'private:growth-a',table:'growth',values:{名称:'改变',主体:'private:person-a',原有倾向:'独行',当前倾向:'学会请求帮助',变化依据:'旅途中主动求助后共同脱险。'},access},
  {id:'private:growth-b',table:'growth',values:{名称:'未选改变',主体:'private:person-a',变化依据:'这项成长没有选中。'},access},
  {id:'private:link',table:'holdings',values:{名称:'持灯',物品:'private:person-b',所有者:['private:person-a'],流转原因:'她把灯作为履约的提醒。'},access},
 ];
 const selection=coreSelection({registry,rows},['private:person-a','private:person-b'],{growthIds:growth?['private:growth-a']:[],linkIds:links?['private:link']:[],instructions:'补充：旧世界名字不必保留。'});
 return {registry,source:selection.source,rows};
}
const field=(n,label,value)=>`${n} ${label}：${value.startsWith('"')||/[\r\n]/.test(value)||value.trim()!==value?JSON.stringify(value):value}`;
const item=(heading,evidence,value='跨世界仍保留这一意义。')=>`【${heading}】\n1 项名：意义\n2 内容：${value}\n${field(3,'依据',evidence)}`;
const completed='【完成】\n1 待处理：无';
function single({growth=false}={}){const f=fixture({growth,links:false});f.source.objects.pop();return {...f,...prepareSimpleCore({...f,mode:'single'})};}
const singleAnswer=(evidence=quote)=>`【基点】\n1 名称：守约者\n${item('核心／1',evidence)}\n${completed}`;
function bundleAnswer({withGrowth=true,evidence=quote}={}){return `【基点】\n1 名称：人与灯\n【成员／1】\n1 名称：守约者\n${item('核心／1／1',evidence)}\n${withGrowth?item('成长／1／1','旅途中主动求助后共同脱险。')+'\n':''}【成员／2】\n1 名称：灯\n${item('核心／2／1','普通灯具用于照路，不会施法。')}\n${item('关联／1','她把灯作为履约的提醒。')}\n${completed}`;}

test('source basis preserves actual string leaves without JSON escapes or mutation',()=>{
 const source={a:quote,b:['下一段',{c:'末段',n:8}],nil:null},before=structuredClone(source);
 assert.equal(coreSourceText(source),quote+'\n下一段\n末段');assert.deepEqual(source,before);
 assert.equal(coreSourceContains(source,quote),true);assert.equal(coreSourceContains(source,'下一段\n末段'),false);assert.equal(coreSourceContains(source,''),false);
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>coreSourceText(cyclic),/循环/);
});

test('text cells decode exactly once preserving CRLF, leading quotes, edge whitespace and literal backslash n',()=>{
 for(const evidence of ['"首句"\r\n次句','  保留空白  ','"字面\\n与\\r\\n不是换行"','实际\n换行和字面\\n共存']){
  const f=fixture({links:false,growth:false});f.source.objects.pop();f.source.objects[0].row.values.描述=evidence;
  const {privateplan,messages}=prepareSimpleCore({...f,mode:'single'}),result=parseSimpleCore(singleAnswer(evidence),privateplan);
  assert.equal(result.core.traits[0].evidence,evidence);assert.equal(coreSourceContains(f.source.objects[0].row.values,result.core.traits[0].evidence),true);
  assert.ok(messages[1].content.includes(evidence));assert.ok(!messages[2].content.includes('续行'));assert.ok(messages[2].content.includes('只解码一次'));
 }
 const {privateplan}=single();assert.throws(()=>parseSimpleCore(singleAnswer().replace(field(3,'依据',quote),'3 依据："未闭合'),privateplan),/转义/);
 // Explicit literal block uses the same grammar as archive and genesis forms.
 assert.equal(parseSimpleCore(singleAnswer().replace(field(3,'依据',quote),'3 依据：|\n  '+quote.replaceAll('\n','\n  ')),privateplan).core.traits[0].evidence,quote);
});

test('three business messages preserve all selected prose and map recursive references without internal IDs',()=>{
 const input=fixture(),before=structuredClone(input),{messages,privateplan}=prepareSimpleCore({...input,mode:'bundle',goal:'保留用途和代价。'});
 assert.equal(messages.length,3);assert.deepEqual(messages.map(x=>x.role),['system','user','user']);
 const rendered=messages.map(x=>x.content).join('\n');
 for(const text of [quote,'普通灯具用于照路，不会施法。','保持承诺','远行者','照路','铜','独行','学会请求帮助','旅途中主动求助后共同脱险。','她把灯作为履约的提醒。',input.source.instructions,'保留用途和代价。'])assert.ok(rendered.includes(text),text);
 for(const hidden of ['private:','sourceObject','sourceRow','registry','schemaChanges','"values"','rev:39','这项成长没有选中。','不该随未选对象展开。'])assert.ok(!rendered.includes(hidden),hidden);
 assert.ok(rendered.includes('成员1／同名'));assert.ok(rendered.includes('成员2／同名'));assert.ok(rendered.includes('未选关联对象1'));
 assert.equal(globalThis.coreSourceExecuted,undefined);assert.deepEqual(input,before);assert.deepEqual(privateplan.source,input.source);
 assert.throws(()=>prepareSimpleCore({source:input.source}),/模板注册表/);
});

test('core extraction retains confirmed business constraints without executing source macros or exposing process IDs',()=>{
 const input=fixture(),literal='必须保持限定 {{user}} <script>doNotExecute()</script>',supplement={
  explicitRules:literal,styleRules:[{name:'表达',pattern:'措辞',instruction:'表达不能弱化'},{enabled:false,instruction:'已停用表达不注入'}],
  preferences:[{id:'private-preference',values:{名称:'偏好',内容:'偏好原句',作用域:{全局:true}}}],
  rulePolicy:{id:'private-policy',decisions:[{id:'private-decision',action:'keep',original:[{sourceId:'private-source',quote:'保留原句'}]},{action:'optimize',changes:[{sourceId:'private-source',before:'替换前原句',after:'已确认后原句'}]}],unresolved:[{title:'未决问题',sources:[{quote:'尚未改变的原句'}]}]},
  substitute:()=>{throw Error('must never execute');}
 };
 const {messages}=prepareSimpleCore({...input,...supplement,mode:'bundle'}),wire=messages.map(x=>x.content).join('\n');
 for(const expected of [literal,'表达不能弱化','偏好原句','保留原句','替换前原句','已确认后原句','未决问题','尚未改变的原句'])assert.ok(wire.includes(expected),expected);
 for(const hidden of ['private-preference','private-policy','private-decision','private-source','已停用表达不注入'])assert.ok(!wire.includes(hidden),hidden);
 assert.equal(messages.length,3);assert.equal(wire.split(literal).length-1,1);
});

test('single form returns exact multiline quotes, original basis and old core result shape',()=>{
 const prepared=single(),before=structuredClone(prepared.privateplan),result=parseSimpleCore(singleAnswer(),prepared.privateplan);
 assert.deepEqual(result,{core:{name:'守约者',traits:[{name:'意义',value:'跨世界仍保留这一意义。',evidence:quote}],growth:[]},notes:[]});
 assert.ok(prepared.privateplan.basis.includes(quote));assert.deepEqual(prepared.privateplan,before);
 assert.ok(!Object.hasOwn(result.core.traits[0],'id'));assert.equal(globalThis.coreSourceExecuted,undefined);
});

test('custom subtype keeps its business name and recursive references without exposing type IDs',()=>{
 const input=fixture({links:false});input.source.objects.pop();
 input.registry.types.push({id:'private-subtype',name:'守灯者',aliases:[],version:1,parent:'character',fields:{同行者:{type:'ref'}}});
 input.source.objects[0].row.values.类型='private-subtype';input.source.objects[0].row.values.属性.同行者='private:person-b';
 const {messages}=prepareSimpleCore({...input,mode:'single'}),text=messages.map(x=>x.content).join('\n');
 assert.ok(text.includes('守灯者'));assert.ok(text.includes('同行者：未选关联对象1'));assert.ok(!text.includes('private-subtype'));assert.ok(!text.includes('private:person-b'));
});

test('bundle host owns member, link and item identifiers; validators accept complete ordinary evidence',()=>{
 const input=fixture(),{privateplan}=prepareSimpleCore({...input,mode:'bundle'});
 const result=parseSimpleCore(bundleAnswer({evidence:'保持承诺'}),privateplan),bundle=result.bundle;
 assert.deepEqual(bundle.members.map(x=>x.sourceObject),['private:person-a','private:person-b']);
 assert.deepEqual(bundle.links[0].members,input.source.links[0].members);assert.equal(bundle.links[0].sourceRow,'private:link');
 assert.deepEqual(bundle.members.map(x=>x.kind),['character','item']);
 const ids=[...bundle.members.flatMap(m=>[...m.traits,...m.growth].map(x=>x.id)),...bundle.links.map(x=>x.id)];
 assert.equal(new Set(ids).size,4);for(const id of ids)assert.match(id,/^[a-f\d-]{36}$/);
 assert.deepEqual(validateBundle(bundle,input.source),bundle);
});

test('exact quoted bundle evidence remains raw for production validation',()=>{
 const input=fixture(),{privateplan}=prepareSimpleCore({...input,mode:'bundle'}),result=parseSimpleCore(bundleAnswer(),privateplan);
 assert.equal(result.bundle.members[0].traits[0].evidence,quote);
 assert.deepEqual(validateBundle(result.bundle,input.source),result.bundle);
});

test('member evidence cannot borrow another member, selected growth or adjoining leaves',()=>{
 const input=fixture(),{privateplan}=prepareSimpleCore({...input,mode:'bundle'});
 for(const evidence of ['普通灯具用于照路，不会施法。','旅途中主动求助后共同脱险。','同名\ncharacter','不存在的原句'])assert.throws(()=>parseSimpleCore(bundleAnswer({evidence}),privateplan),/连续原句/);
 const result=parseSimpleCore(bundleAnswer({evidence:'旧世界名字不必保留。'}),privateplan);assert.equal(result.bundle.members.length,2);
});

test('edited bundle still cannot forge evidence from adjacent leaves or row metadata',()=>{
 const input=fixture(),{privateplan}=prepareSimpleCore({...input,mode:'bundle'}),{bundle}=parseSimpleCore(bundleAnswer(),privateplan);
 for(const evidence of ['同名\ncharacter','private:person-a']){
  const edited=structuredClone(bundle);edited.members[0].traits[0].evidence=evidence;
  assert.throws(()=>validateBundle(edited,input.source),/连续原文依据/);
 }
 const changed=structuredClone(bundle);changed.links[0].evidence='保持承诺';assert.throws(()=>validateBundle(changed,input.source),/连续原文依据/);
});

test('growth is opt-in and must quote selected growth rather than base or an unselected episode',()=>{
 const prepared=single({growth:true}),answer=singleAnswer().replace(completed,item('成长／1','旅途中主动求助后共同脱险。')+'\n'+completed);
 assert.equal(parseSimpleCore(answer,prepared.privateplan).core.growth.length,1);
 assert.throws(()=>parseSimpleCore(answer,single().privateplan),/未选择/);
 for(const evidence of ['这项成长没有选中。','保持承诺'])assert.throws(()=>parseSimpleCore(answer.replace('旅途中主动求助后共同脱险。',evidence),prepared.privateplan),/连续原句/);
});

test('missing or substituted members, links and cores reject the whole form without changing plan',()=>{
 const input=fixture(),{privateplan}=prepareSimpleCore({...input,mode:'bundle'}),before=structuredClone(privateplan),answer=bundleAnswer();
 const cases=[
  answer.replace('【成员／2】\n1 名称：灯\n',''),
  answer.replace(item('核心／2／1','普通灯具用于照路，不会施法。')+'\n',''),
  answer.replace(item('关联／1','她把灯作为履约的提醒。')+'\n',''),
  answer.replace('【关联／1】','【关联／2】'),
  answer.replace('【核心／2／1】','【核心／3／1】'),
  answer.replace('【核心／1／1】','【核心／1／2】'),
  answer.replace('她把灯作为履约的提醒。','保持承诺'),
 ];
 for(const bad of cases)assert.throws(()=>parseSimpleCore(bad,privateplan));assert.deepEqual(privateplan,before);
});

test('rejects JSON, extra fields, duplicate sections, implicit prose, wrong numbering and empty evidence',()=>{
 const {privateplan}=single(),answer=singleAnswer();
 for(const bad of [JSON.stringify({core:{name:'守约者'}}),'说明\n'+answer,answer+'\n其他内容',answer.replace('3 依据：','4 依据：'),answer.replace('3 依据：','3 来源：'),answer.replace('2 内容：','1 内容：'),answer.replace(completed,item('核心／1',quote)+'\n'+completed),answer.replace('【核心／1】','【核心：1】'),answer.replace('【核心／1】','【核心／01】'),singleAnswer(''),answer.replace('【完成】','【多余】\n1 内容：注入\n【完成】')])assert.throws(()=>parseSimpleCore(bad,privateplan));
});

test('pending material stays an explicit note and never pretends to be a save result',()=>{
 const {privateplan}=single(),result=parseSimpleCore(singleAnswer().replace('1 待处理：无','1 待处理：尚缺代价的原始说明。'),privateplan);
 assert.deepEqual(result.notes,['尚缺代价的原始说明。']);assert.equal(result.saved,undefined);
});

test('source selection rejects unselected ownership and incomplete linked selection',()=>{
 const f=fixture();f.source.objects[0].growth[0].values.主体='private:person-b';assert.throws(()=>prepareSimpleCore(f),/成长不属于/);
 const g=fixture();g.source.links[0].members.push('private:unselected');assert.throws(()=>prepareSimpleCore(g),/未选成员/);
 assert.throws(()=>prepareSimpleCore({...fixture(),mode:'single'}),/单基点/);
});
