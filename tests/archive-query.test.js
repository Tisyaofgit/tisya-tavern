import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegistry} from '../tables/schema.js';
import {createArchiveQuerySession,archiveFieldPath} from '../tables/archive-query.js';
const row=(id,values,knowers=['young'])=>({id,table:'objects',rev:1,values:{名称:id,类型:'character',...values},access:{readers:['读者'],knowers},source:'floor1'});
function fixture(extra={}){
 const registry=defaultRegistry();Object.assign(registry.types.find(t=>t.id==='character').fields,{年龄:{type:'number'},开关:{type:'boolean'},备注:{type:'text'},空值:{type:'json'},'称号.正式名':{type:'text'},关系:{type:'array',items:{type:'object',fields:{对象:{type:'ref'},状态:{type:'text'},秘密:{type:'text'}}}}});
 const rows=[row('a',{名称:'岚',别名:['小岚'],属性:{年龄:14,开关:false,备注:'',空值:null,'称号.正式名':'见习',关系:[{对象:'b',状态:'陌生',秘密:'隐藏阵营'},{对象:'a',状态:'同伴'}]},关联:['b','hidden']}),row('b',{名称:'同名岚',属性:{年龄:0,开关:true},关联:['a']}),row('hidden',{名称:'40岁才认识的未来人物',属性:{年龄:40}},['old'])];
 const view={registry,rows},context={world:'world',branch:'branch-14',task:'character-query',actor:'young',storyPoint:'14岁阶段'};let live=true;
 const args={view,context,authorizeRow:r=>r.access.knowers.includes('young'),authorizeField:(_r,p)=>!p.includes('秘密'),guard:()=>{if(!live)throw Error('快照已过期');},...extra};return {view,context,session:createArchiveQuerySession(args),expire:()=>live=false,args};
}
const code=expected=>error=>error.code===expected;
test('source position is host-bound authorized metadata, never guessed from a hash or model argument',async()=>{
 const base=fixture(),context={...base.context,source:'review'},sourceOrder={floor1:2,review:1},view=structuredClone(base.view);
 view.rows[1].source='missing';
 const session=createArchiveQuerySession({...base.args,view,context,sourceOrder,authorizeMetadata:()=>true});
 sourceOrder.floor1=0;
 const a=await session.read_archive({id:'a',select:['名称']}),b=await session.read_archive({id:'b',select:['名称']});
 assert.deepEqual(a.records[0].sourcePosition,{rowFloor:3,reviewFloor:2,relation:'later'});
 assert.deepEqual(b.records[0].sourcePosition,{rowFloor:null,reviewFloor:2,relation:'unknown'});
 const denied=createArchiveQuerySession({...base.args,view,context,sourceOrder,authorizeMetadata:()=>false});
 assert.deepEqual((await denied.read_archive({id:'a',select:['名称']})).records,[{id:'a',rev:1}]);
 await assert.rejects(session.read_archive({id:'hidden'}),code('NOT_AVAILABLE'));
 await assert.rejects(session.read_archive({id:'a',sourceOrder:{floor1:0}}),code('INVALID_QUERY'));
 for(const [position,relation]of [[0,'earlier'],[1,'same']]){
  const q=createArchiveQuerySession({...base.args,context,sourceOrder:{floor1:position,review:1},authorizeMetadata:()=>true});
  assert.equal((await q.read_archive({id:'a',select:['名称']})).records[0].sourcePosition.relation,relation);
 }
});
test('directory depth remains exactly one at the host boundary regardless of schema conversion',async()=>{
 const {session}=fixture();const omitted=await session.list_archive(),explicit=await session.list_archive({depth:1});assert.deepEqual(explicit.items,omitted.items);
 for(const depth of [0,2,1.5,'1',null,false])await assert.rejects(session.list_archive({depth}),code('INVALID_QUERY'));
});
test('directory and keyword query expose only authorized identities, counts, references and fields',async()=>{
 const {session,view}=fixture(),before=structuredClone(view),root=await session.list_archive();assert.equal(root.total,1);assert.equal(root.items[0].path,'/tables/objects');
 const types=await session.list_archive({path:'/tables/objects'});assert.equal(types.items[0].path,'/tables/objects/types/character');const records=await session.list_archive({path:types.items[0].path});assert.equal(records.total,2);assert(!JSON.stringify(records).includes('未来'));
 const found=await session.search_archive({query:'小岚',select:['名称','关联']});assert.equal(found.total,1);assert.deepEqual(found.items[0].fields[1].value,['b']);assert.equal((await session.search_archive({query:'40岁'})).total,0);
 const read=await session.read_archive({id:'a',select:['属性.关系']});assert(!JSON.stringify(read).includes('隐藏阵营'));assert.deepEqual(view,before);assert(session.diagnostics().every(x=>x.status==='ok'));assert(!JSON.stringify(session.diagnostics()).includes('隐藏阵营'));
 assert.equal((await session.search_archive({ids:['a','hidden','absent']})).total,1);assert.equal((await session.search_archive({ids:[]})).total,0);await assert.rejects(session.read_archive({id:'hidden'}),code('NOT_AVAILABLE'));await assert.rejects(session.read_archive({id:'absent'}),code('NOT_AVAILABLE'));
});
test('field discovery retains actual nested types and literal dotted keys without exposing unauthorized fields',async()=>{
 const {session}=fixture();let fields=[],cursor;do{const page=await session.describe_fields({path:'/tables/objects/types/character',limit:100,...(cursor?{cursor}:{})});fields.push(...page.items);cursor=page.next_cursor;}while(cursor);
 assert(fields.some(f=>JSON.stringify(f.path)==='["属性","年龄"]'&&f.type==='number'));assert(fields.some(f=>JSON.stringify(f.path)==='["属性","称号.正式名"]'));assert(!JSON.stringify(fields).includes('秘密'));assert(fields.some(f=>f.path.at(-1)==='关系'&&f.itemFields.some(x=>x.path[0]==='对象')));
 const found=await session.search_archive({where:{field:['属性','称号.正式名'],op:'eq',value:'见习'}});assert.equal(found.total,1);await assert.rejects(session.search_archive({where:{field:'属性.称号.正式名',op:'eq',value:'见习'}}),code('INVALID_FIELD'));
});
test('AND/OR and array any/all constrain the same array item, never combine separate relationships',async()=>{
 const {session}=fixture(),where={and:[{field:'属性.年龄',op:'gte',value:14},{or:[{field:'属性.开关',op:'eq',value:false},{field:'名称',op:'eq',value:'未知'}]}]};assert.equal((await session.search_archive({where})).total,1);
 const relation=status=>({field:'属性.关系',any:{and:[{field:'对象',op:'eq',value:'b'},{field:'状态',op:'eq',value:status}]}});
 assert.equal((await session.search_archive({where:relation('同伴')})).total,0);assert.equal((await session.search_archive({where:relation('陌生')})).total,1);
 assert.equal((await session.search_archive({where:{field:'属性.关系',all:{field:'状态',op:'eq',value:'同伴'}}})).total,0);
});
test('zero false empty null and missing remain distinct; bad fields and numeric strings are errors',async()=>{
 const {session}=fixture();for(const [field,value,id]of [['属性.年龄',0,'b'],['属性.开关',false,'a'],['属性.备注','','a'],['属性.空值',null,'a']]){const r=await session.search_archive({where:{field,op:'eq',value},select:[field]});assert.equal(r.total,1);assert.equal(r.items[0].id,id);assert.deepEqual(r.items[0].fields[0].value,value);}
 assert.equal((await session.search_archive({where:{field:'属性.空值',op:'exists',value:false}})).items[0].id,'b');
 await assert.rejects(session.search_archive({where:{field:'属性.年龄',op:'gte',value:'14'}}),code('TYPE_MISMATCH'));await assert.rejects(session.search_archive({where:{field:'不存在',op:'exists',value:false}}),code('INVALID_FIELD'));
});
test('opaque pagination binds query and snapshot, is stable across pages and refuses another session cursor',async()=>{
 const {session}=fixture(),first=await session.search_archive({limit:1});assert(first.has_more);assert.equal(first.total,2);const next=await session.search_archive({limit:1,cursor:first.next_cursor});assert.equal(next.has_more,false);assert.notEqual(first.items[0].id,next.items[0].id);
 await assert.rejects(session.search_archive({limit:1,query:'别的查询',cursor:first.next_cursor}),code('INVALID_CURSOR'));await assert.rejects(fixture().session.search_archive({limit:1,cursor:first.next_cursor}),code('INVALID_CURSOR'));
 const replay=await session.search_archive({limit:1,cursor:first.next_cursor});assert.deepEqual(replay.items,next.items);
});
test('source and long field reads preserve complete paragraphs with exact offsets and ordering',async()=>{
 const text='第一段\r\n\r\n第二段\n \n第三段',f=fixture({readSource:async()=>({id:'source-1',text})});f.view.rows[0].values.描述='外部修改不会进入快照';let cursor,parts=[];
 do{const r=await f.session.read_archive({id:'a',select:['名称'],source:true,limit:1,...(cursor?{cursor}:{})});parts.push(...r.items.filter(x=>x.sourceDocument));cursor=r.next_cursor;}while(cursor);
 assert.equal(parts.map(p=>p.value).join(''),text);for(const p of parts)assert.equal(text.slice(p.start,p.end),p.value);assert(!JSON.stringify(parts).includes('外部修改'));
 await assert.rejects(fixture().session.read_archive({id:'a',source:true}),code('SOURCE_UNAVAILABLE'));
});
test('reference expansion terminates cycles and never expands forbidden objects',async()=>{
 const {session}=fixture(),r=await session.read_archive({id:'a',select:['名称'],expandDepth:3});assert.deepEqual(r.records.map(x=>x.id),['a','b']);assert(!JSON.stringify(r).includes('hidden'));
 await assert.rejects(session.read_archive({id:'a',expandDepth:9}),code('INVALID_QUERY'));
});
test('expired or changed host snapshots fail instead of returning stale rows or a zero result',async()=>{
 const {session,expire}=fixture();expire();await assert.rejects(session.search_archive(),/快照已过期/);session.dispose();await assert.rejects(session.list_archive(),code('SNAPSHOT_EXPIRED'));
 const f=fixture({limits:{maxCalls:1}});await f.session.list_archive();await assert.rejects(f.session.list_archive(),code('BUDGET_EXCEEDED'));
 const small=fixture({limits:{pageChars:200}});await assert.rejects(small.session.read_archive({id:'a'}),code('QUERY_TOO_LARGE'));
});
test('oversized pages can be narrowed without truncation while total character and call budgets remain terminal',async()=>{
 const f=fixture({limits:{pageChars:600,maxChars:600,maxCalls:3}});
 await assert.rejects(f.session.read_archive({id:'a'}),code('QUERY_TOO_LARGE'));
 assert.deepEqual(f.session.metrics(),{calls:1,characters:0,closed:false});
 const r=await f.session.read_archive({id:'a',select:['名称']});assert.equal(r.items[0].value,'岚');
 const delivered=f.session.metrics().characters;assert(delivered>300&&delivered<=600);
 await assert.rejects(f.session.read_archive({id:'a',select:['名称']}),code('BUDGET_EXCEEDED'));
 assert.equal(f.session.metrics().characters,delivered);
 await assert.rejects(f.session.read_archive({id:'a',select:['名称']}),code('BUDGET_EXCEEDED'));
 assert.equal(f.session.metrics().calls,3);
});
test('unbound authorization, prototype paths, extra context parameters and invalid trees are rejected',async()=>{
 assert.throws(()=>createArchiveQuerySession({view:{rows:[]},context:{}}),code('AUTHORIZATION_REQUIRED'));assert.throws(()=>fixture({authorizeRow:async()=>true}),code('AUTHORIZATION_REQUIRED'));const thin=fixture();thin.args.view.rows[0].referenceOnly=true;assert.throws(()=>createArchiveQuerySession(thin.args),code('INVALID_VIEW'));
 for(const p of ['__proto__.x',['属性','constructor'],'属性..年龄'])assert.throws(()=>archiveFieldPath(p),code('INVALID_FIELD'));
 const {session}=fixture();await assert.rejects(session.search_archive({world:'other'}),code('INVALID_QUERY'));await assert.rejects(session.search_archive({where:{and:[],or:[]}}),code('INVALID_QUERY'));await assert.rejects(session.search_archive({where:{field:'名称',op:'eval',value:'anything'}}),code('TYPE_MISMATCH'));
});
test('accepted query input is snapshotted before asynchronous host checks',async()=>{
 let release;const f=fixture({guard:()=>new Promise(resolve=>release=resolve)}),input={query:'小岚'},pending=f.session.search_archive(input);input.query='未来人物';release();await new Promise(resolve=>setImmediate(resolve));release();const result=await pending;assert.equal(result.total,1);assert.equal(result.items[0].id,'a');
});
test('concurrent paragraph reads share one immutable source snapshot',async()=>{
 let count=0,release;const {session}=fixture({readSource:()=>{count++;return new Promise(resolve=>release=resolve);}}),input={id:'a',select:['名称'],source:true,limit:1};const one=session.read_archive(input),two=session.read_archive(input);await new Promise(resolve=>setImmediate(resolve));assert.equal(count,1);release({id:'source',text:'同一段\n\n第二段'});const [a,b]=await Promise.all([one,two]);assert.deepEqual(a.items,b.items);const next=await session.read_archive({...input,cursor:a.next_cursor});assert.equal(next.items[0].value,'同一段\n\n');assert.equal(count,1);
});
test('write metadata needs separate host authorization and never leaks through ordinary reads',async()=>{
 const ordinary=fixture(),privateRow=ordinary.args.view.rows[0];privateRow.access.knowers.push('unseen-person');privateRow.lockedFields=['名称'];
 const base={...ordinary.args,view:ordinary.args.view};const query=createArchiveQuerySession(base);
 const read=await query.read_archive({id:'a',select:['名称']});assert.deepEqual(read.records,[{id:'a',rev:1}]);assert(!JSON.stringify(read).includes('unseen-person'));
 await assert.rejects(query.read_archive({id:'a',metadata:true}),code('INVALID_QUERY'));
 const author=createArchiveQuerySession({...base,authorizeMetadata:r=>r.id==='a'}),result=await author.read_archive({id:'a',select:['名称'],expandDepth:1});
 assert.deepEqual(result.records[0],{id:'a',rev:1,access:privateRow.access,lockedFields:['名称']});assert.deepEqual(result.records[1],{id:'b',rev:1});
 result.records[0].access.knowers.push('tampered');assert(!(await author.read_archive({id:'a'})).records[0].access.knowers.includes('tampered'));
 await assert.rejects(author.read_archive({id:'hidden'}),code('NOT_AVAILABLE'));
 assert.throws(()=>createArchiveQuerySession({...base,authorizeMetadata:async()=>true}),code('AUTHORIZATION_REQUIRED'));
});
