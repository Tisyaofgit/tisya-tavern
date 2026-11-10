import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBookGateway,readMatrixDefinition} from '../tables/books.js';

const schema=Object.fromEntries(JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8')).tables.map(t=>[t.id,t]));
const copy=value=>structuredClone(value);
const ref=({tableId,recordId})=>({tableId,recordId});
const place=(recordId,name='同名地点',extra={})=>({tableId:'T_STATIC_PLACES',recordId,values:{name,...extra}});
const group=(primary,records=[primary],raw='本条作者原文')=>({key:primary.tableId+'#'+primary.recordId,tableId:primary.tableId,recordId:primary.recordId,heading:primary.values.name??'已验收记录',raw,records:records.map(ref)});
const request=(changes,groups,extra={})=>({operationId:'batch-one',kind:'world',name:'分条世界',changes,groups,destination:{book:'资料书'},schema,...extra});

function fixture(){
 const saved=new Map([['资料书',[{uid:7,name:'【角色】原始人物',content:'作者未分解的人物原文',enabled:true,custom:{keep:true}},{uid:9,name:'无关条目',content:'原作者无关材料',enabled:true}]]]);
 let writes=0,afterWrite=null,transform=null,blockReads=false;
 const helper={getWorldbookNames:async()=>[...saved.keys()],getWorldbook:async book=>{if(blockReads)throw Error('回读暂不可用');return copy(saved.get(book));},createWorldbook:async(book,entries)=>{assert(!saved.has(book));saved.set(book,copy(transform?transform(entries):entries));writes++;afterWrite?.();return true;},updateWorldbookWith:async(book,fn)=>{const entries=fn(copy(saved.get(book)));saved.set(book,copy(transform?transform(entries):entries));writes++;afterWrite?.();}};
 const ctx={loadWorldInfo:async book=>({entries:Object.fromEntries(saved.get(book).map(e=>[e.uid,{...copy(e),comment:e.name}]))})};
 return {saved,books:createBookGateway(()=>helper,()=>ctx),restart:()=>createBookGateway(()=>helper,()=>ctx),get writes(){return writes;},afterWrite(fn){afterWrite=fn;},transform(fn){transform=fn;},blockReads(value){blockReads=value;}};
}

const character=(id='person',name='测试人物')=>{
 const dossier={tableId:'T_CHAR_DOSSIER',recordId:id,values:{name,public_identity:'待完整归档的人物'}},entity={tableId:'T_SYS_ENTITIES',recordId:id+'-entity',values:{kind:'character',origin_record_ref:id+'-origin'}},origin={tableId:'M_FIELD_REFERENCES',recordId:id+'-origin',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:entity.recordId,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:id,reference_kind:'record',resolution_status:'resolved'}};
 return {changes:[dossier,entity,origin],group:group(dossier,[dossier,entity,origin],'完整人物简表原文'),binding:{entityId:entity.recordId,dossierId:id}};
};

test('accepted auxiliary groups save to separate UIDs with one native write and per-entry source receipts',async()=>{
 const f=fixture(),a=place('place-a','渡口'),b=place('place-b','集市'),before=copy(f.saved.get('资料书')),plan=await f.books.prepareDefinitionArchive(request([a,b],[group(a,undefined,'渡口原文'),group(b,undefined,'集市原文')],{kind:'character',binding:null}));
 assert.equal(f.writes,0);assert.equal(plan.definitions.length,2);
 const receipt=await f.books.commitDefinitionArchive(plan);assert.equal(f.writes,1);assert(receipt.confirmed);assert.equal(receipt.sourceArchive.entries.length,2);assert.equal(receipt.sourceArchive.uid,receipt.sourceArchive.entries[0].uid);assert.equal(new Set(receipt.sourceArchive.entries.map(e=>e.uid)).size,2);
 assert.deepEqual(f.saved.get('资料书').slice(0,2),before);assert.deepEqual(receipt.records,[ref(a),ref(b)]);
 for(const archived of receipt.sourceArchive.entries){const actual=await f.books.readSource(archived);assert.equal(actual.digest,archived.digest);assert.equal(actual.definition.id,archived.definitionId);assert.equal(actual.definition.group.raw,archived.recordId==='place-a'?'渡口原文':'集市原文');assert.deepEqual(actual.definition.group.records,archived.records);assert.equal(actual.entry.enabled,false);}
 assert.equal((await f.books.listSources({book:'资料书',kind:'character'})).entries.length,1);assert.equal((await f.books.listSources({book:'资料书',kind:'world'})).entries.length,0);assert.equal((await f.books.listSources({book:'资料书',kind:'all'})).entries.length,4);
});

test('mutual owner and child references validate across the whole batch independently of group order',async()=>{
 for(const reverse of [false,true]){
  const f=fixture(),rule={tableId:'T_STATIC_WORLD_RULES',recordId:'rule-a',values:{name:'渡口通行规则',condition:'condition-a'}},condition={tableId:'M_CONDITIONS',recordId:'condition-a',values:{owner_table:rule.tableId,owner_row_uuid:rule.recordId,owner_field:'condition',group_key:'access',sequence:1,combine:'all',predicate_kind:'observed_boolean',observed_result:true,value_state:'known',narrative:'由守卫确认通行'}};
  const changes=reverse?[condition,rule]:[rule,condition],plan=await f.books.prepareDefinitionArchive(request(changes,changes.map(c=>group(c))));
  const receipt=await f.books.commitDefinitionArchive(plan);assert(receipt.confirmed);assert.equal(receipt.sourceArchive.entries.length,2);assert.equal(f.writes,1);
 }
});

test('revised group uses its original record identity and UID while sparse fields keep the archived baseline',async()=>{
 const f=fixture(),a=place('place-a','旧名称',{smell:'潮湿木材'}),b=place('place-b','另一地点');
 const first=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request([a,b],[group(a),group(b)]))),original=first.sourceArchive.entries[0],unrelated=copy(f.saved.get('资料书').find(e=>String(e.uid)===String(first.sourceArchive.entries[1].uid))),changed=place('place-a','新名称');
 const second=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request([changed],[group(changed)],{operationId:'repair-one',mode:'revise'})));
 assert.equal(second.sourceArchive.uid,original.uid);assert.equal(second.sourceArchive.definitionId,original.definitionId);assert.equal(second.sourceArchive.version,2);assert.equal(f.saved.get('资料书').length,4);assert.deepEqual(f.saved.get('资料书').find(e=>String(e.uid)===String(first.sourceArchive.entries[1].uid)),unrelated);
 const actual=await f.books.readSource(second.sourceArchive);assert.equal(actual.definition.matrix.changes[0].values.smell,'潮湿木材');assert.equal(actual.definition.matrix.changes[0].values.name,'新名称');
});

test('repair can add a previously rejected group referencing an already accepted definition',async()=>{
 const f=fixture(),a=place('place-a','渡口'),first=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request([a],[group(a)]))),b=place('place-b','内港',{parent_place_ref:'place-a'});
 const second=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request([b],[group(b)],{operationId:'repair-new',mode:'revise'})));
 assert.notEqual(second.sourceArchive.uid,first.sourceArchive.uid);assert.equal(second.sourceArchive.version,1);assert.equal(f.saved.get('资料书').filter(e=>readMatrixDefinition(e)).length,2);assert.equal(f.writes,2);
});

test('an unaccepted character root leaves the original prose intact, then its repaired group replaces that exact UID',async()=>{
 const f=fixture(),source=await f.books.readSource({book:'资料书',uid:7}),a=place('place-a','渡口'),first=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request([a],[group(a)],{kind:'character',source,destination:{book:'资料书',uid:7}})));
 assert.equal((await f.books.readSource(source)).digest,source.digest);assert.notEqual(first.sourceArchive.uid,7);
 const person=character(),second=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request(person.changes,[person.group],{operationId:'repair-person',kind:'character',mode:'revise',binding:person.binding,source,destination:{book:'资料书',uid:7}})));
 assert.equal(second.sourceArchive.uid,7);assert.equal(second.sourceArchive.entries.length,1);assert.equal((await f.books.readSource(second.sourceArchive)).definition.source.content,source.content);assert.equal(f.saved.get('资料书').length,3);
});

test('a successful world group in a character task cannot replace the rejected character source UID',async()=>{
 const f=fixture(),source=await f.books.readSource({book:'资料书',uid:7}),world={tableId:'T_STATIC_WORLDS',recordId:'world-a',values:{name:'人物所属世界'}};
 const receipt=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request([world],[group(world)],{kind:'character',source,destination:{book:'资料书',uid:7}})));
 assert.notEqual(receipt.sourceArchive.uid,7);assert.equal((await f.books.readSource(source)).digest,source.digest);assert.equal((await f.books.listSources({book:'资料书',kind:'character'})).entries[0].uid,7);
});

test('world batches archive the root and NPC independently while exposing only complete source roots',async()=>{
 const f=fixture(),world={tableId:'T_STATIC_WORLDS',recordId:'world-a',values:{name:'测试世界',core_proposition:'世界的主命题'}},person=character(),aux=place('place-a','渡口'),changes=[...person.changes,aux,world],groups=[person.group,group(aux),group(world)],receipt=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request(changes,groups,{binding:{worldId:'world-a'},destination:{book:'新世界',newBook:true}})));
 assert.equal(receipt.sourceArchive.recordId,'world-a');assert.equal(receipt.sourceArchive.entries.length,3);assert.equal(f.writes,1);assert.equal(f.saved.get('新世界').length,4);assert(f.saved.get('新世界').every(e=>e.enabled===false));
 const people=await f.books.listSources({book:'新世界',kind:'character'}),worlds=await f.books.listSources({book:'新世界',kind:'world'});assert.equal(people.entries.length,1);assert.equal(people.entries[0].definition.matrix.binding.dossierId,'person');assert.equal(worlds.entries.length,1);assert.equal(worlds.entries[0].definition.matrix.binding.worldId,'world-a');
});

test('different stable records with equal display names remain separate definitions',async()=>{
 const f=fixture(),a=place('place-a'),b=place('place-b'),receipt=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request([a,b],[group(a),group(b)])));
 assert.equal(receipt.sourceArchive.entries.length,2);assert.notEqual(receipt.sourceArchive.entries[0].definitionId,receipt.sourceArchive.entries[1].definitionId);assert.equal(new Set(receipt.changedEntries.map(e=>e.name)).size,2);
 const repair=place('place-b','同名地点',{smell:'茶香'}),revised=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request([repair],[group(repair)],{operationId:'repair-b',mode:'revise'})));
 assert.equal(revised.sourceArchive.uid,receipt.sourceArchive.entries[1].uid);assert.equal(f.saved.get('资料书').filter(e=>readMatrixDefinition(e)).length,2);
});

test('overlapping groups, uncovered changes, missing references and reassigned record ownership reject before write',async()=>{
 const f=fixture(),a=place('place-a'),b=place('place-b');
 await assert.rejects(f.books.prepareDefinitionArchive(request([a,b],[group(a,[a,b]),group(b)])),/多个分组/);
 await assert.rejects(f.books.prepareDefinitionArchive(request([a,b],[group(a)])),/未覆盖/);
 const dangling=place('place-a','悬空',{parent_place_ref:'missing'});await assert.rejects(f.books.prepareDefinitionArchive(request([dangling],[group(dangling)])),/引用尚未/);assert.equal(f.writes,0);
 await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request([a,b],[group(a,[a,b])])));
 await assert.rejects(f.books.prepareDefinitionArchive(request([b],[group(b)],{operationId:'separate-child',mode:'revise'})),/属于另一/);assert.equal(f.writes,1);
});

test('lost acknowledgement confirms every UID by readback and survives restart without another write',async()=>{
 const f=fixture(),a=place('place-a'),b=place('place-b'),args=request([a,b],[group(a),group(b)]),plan=await f.books.prepareDefinitionArchive(args);f.afterWrite(()=>{throw Error('宿主回应丢失');});
 await assert.rejects(f.books.commitDefinitionArchive(plan),error=>{assert.equal(error.archiveReceipt.confirmed,true);assert.equal(error.archiveReceipt.status,'written-before-error');assert.equal(error.archiveReceipt.sourceArchive.entries.length,2);assert.deepEqual(error.archivePlan,plan);return true;});
 f.afterWrite(null);const fresh=f.restart(),recovered=await fresh.inspectDefinitionArchive(plan);assert(recovered.confirmed);assert.equal(recovered.status,'recovered');assert.equal((await fresh.commitDefinitionArchive(plan)).status,'replayed');const prepared=await fresh.prepareDefinitionArchive(args);assert(prepared.replay);assert.equal((await fresh.commitDefinitionArchive(prepared)).sourceArchive.entries.length,2);assert.equal(f.writes,1);
});

test('partial host writes stay unknown, retain evidence and never claim a complete batch or blindly duplicate it',async()=>{
 const f=fixture(),a=place('place-a'),b=place('place-b'),args=request([a,b],[group(a),group(b)]),plan=await f.books.prepareDefinitionArchive(args);f.transform(entries=>entries.filter(e=>!readMatrixDefinition(e)||readMatrixDefinition(e).group.recordId==='place-a'));f.afterWrite(()=>{throw Error('宿主中断');});
 await assert.rejects(f.books.commitDefinitionArchive(plan),error=>{assert.equal(error.archiveReceipt.confirmed,false);assert.equal(error.archiveReceipt.status,'unknown');assert.match(error.archiveReceipt.readError,/数量不一致/);return true;});
 f.afterWrite(null);f.transform(null);await assert.rejects(f.books.inspectDefinitionArchive(plan),/数量不一致/);await assert.rejects(f.books.commitDefinitionArchive(plan),error=>error.archiveReceipt.status==='unknown'&&!error.archiveReceipt.confirmed);await assert.rejects(f.books.prepareDefinitionArchive(args),/分组不完整/);assert.equal(f.writes,1);assert.equal(f.saved.get('资料书').filter(e=>readMatrixDefinition(e)).length,1);
});

test('unavailable readback stays unknown until every archived UID can actually be inspected',async()=>{
 const f=fixture(),a=place('place-a'),b=place('place-b'),plan=await f.books.prepareDefinitionArchive(request([a,b],[group(a),group(b)]));f.afterWrite(()=>f.blockReads(true));
 await assert.rejects(f.books.commitDefinitionArchive(plan),error=>error.archiveReceipt.status==='unknown'&&!error.archiveReceipt.confirmed);
 f.afterWrite(null);f.blockReads(false);assert((await f.books.inspectDefinitionArchive(plan)).confirmed);assert.equal(f.writes,1);
});

test('external source changes and unrelated changes during native save are never reported as a confirmed batch',async()=>{
 const f=fixture(),a=place('place-a'),source=await f.books.readSource({book:'资料书',uid:7});f.saved.get('资料书')[0].content='作者改写';await assert.rejects(f.books.prepareDefinitionArchive(request([a],[group(a)],{source})),/原始来源已变化/);assert.equal(f.writes,0);
 const plan=await f.books.prepareDefinitionArchive(request([a],[group(a)]));f.afterWrite(()=>{f.saved.get('资料书').find(e=>e.uid===9).content='保存过程中外部更改';});
 await assert.rejects(f.books.commitDefinitionArchive(plan),error=>{assert.equal(error.archiveReceipt.status,'unknown');assert.equal(error.archiveReceipt.confirmed,false);assert.match(error.archiveReceipt.readError,/无关世界书条目/);return true;});assert.equal(f.saved.get('资料书').find(e=>e.uid===9).content,'保存过程中外部更改');assert.equal(f.writes,1);
});

test('a stale preview fails before native write and never restores its old book snapshot',async()=>{
 const f=fixture(),a=place('place-a'),plan=await f.books.prepareDefinitionArchive(request([a],[group(a)]));f.saved.get('资料书').find(e=>e.uid===9).content='外部新内容';
 await assert.rejects(f.books.commitDefinitionArchive(plan),error=>error.archiveReceipt.status==='not-written'&&/已变化/.test(error.message));assert.equal(f.writes,0);assert.equal(f.saved.get('资料书').find(e=>e.uid===9).content,'外部新内容');
});

test('readonly archive review isolates runtime-only dependencies and their closure before preview',async()=>{
 const f=fixture(),good=place('good','独立可存地点'),missing=place('missing-owner','待修地点',{parent_place_ref:'runtime-only'}),dependent=place('dependent','依赖待修地点',{parent_place_ref:'missing-owner'}),changes=[dependent,good,missing],groups=changes.map(c=>group(c));
 const review=await f.books.reviewDefinitionGroups(request(changes,groups));assert.equal(f.writes,0);assert.deepEqual(review.acceptedGroups.map(g=>g.recordId),['good']);assert.deepEqual(review.changes,[good]);assert.equal(review.pendingGroups.length,2);assert.equal(review.pendingGroups.find(g=>g.recordId==='missing-owner').dependency.recordId,'runtime-only');assert.equal(review.pendingGroups.find(g=>g.recordId==='dependent').dependency.recordId,'missing-owner');assert.match(review.pendingGroups[0].field,/parent_place_ref/);
 const receipt=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(request(review.changes,review.acceptedGroups)));assert(receipt.confirmed);assert.deepEqual(receipt.records,[ref(good)]);
});

test('combined target-table and target-record references participate in both archive review and strict save',async()=>{
 const f=fixture(),owner=place('owner','所有者',{aliases:'list-ref'}),list={tableId:'M_LIST_VALUES',recordId:'list-ref',values:{owner_table:'T_STATIC_PLACES',owner_row_uuid:'owner',owner_field:'aliases',sequence:1,item_type:'reference',target_table:'T_CHAR_DOSSIER',target_row_uuid:'missing-person',value_state:'known'}},changes=[owner,list],groups=changes.map(c=>group(c));
 const review=await f.books.reviewDefinitionGroups(request(changes,groups));assert.equal(review.acceptedGroups.length,0);assert.equal(review.pendingGroups.length,2);assert(review.pendingGroups.some(g=>g.field==='M_LIST_VALUES.target_row_uuid'));
 await assert.rejects(f.books.prepareDefinitionArchive(request(changes,groups)),/missing-person/);assert.equal(f.writes,0);
});

test('phone business-ID references resolve only a unique definition in the same world',async()=>{
 for(const duplicateWorld of [false,true]){
  const f=fixture(),worlds=['world-a','world-b'].map(recordId=>({tableId:'T_STATIC_WORLDS',recordId,values:{name:recordId}})),song={tableId:'X_MEDIA_SONGS',recordId:'song-row-a',values:{id:'song-business',world_ref:'world-a',title:'第一首'}},other={tableId:'X_MEDIA_SONGS',recordId:'song-row-b',values:{id:'song-business',world_ref:duplicateWorld?'world-a':'world-b',title:'另一世界同编号'}},playlist={tableId:'X_MEDIA_PLAYLISTS',recordId:'playlist-row',values:{world_ref:'world-a',name:'歌单',songIds:['song-business']}},changes=[...worlds,song,other,playlist],groups=changes.map(c=>group(c)),input=request(changes,groups),review=await f.books.reviewDefinitionGroups(input);
  if(duplicateWorld){assert.equal(review.pendingGroups.length,1);assert.equal(review.pendingGroups[0].recordId,playlist.recordId);assert.match(review.pendingGroups[0].reason,/多个条目/);await assert.rejects(f.books.prepareDefinitionArchive(input),/唯一找到/);assert.equal(f.writes,0);}
  else{assert.equal(review.pendingGroups.length,0);const receipt=await f.books.commitDefinitionArchive(await f.books.prepareDefinitionArchive(input));assert(receipt.confirmed);assert.equal(receipt.sourceArchive.entries.length,5);assert.equal(f.writes,1);}
 }
});
