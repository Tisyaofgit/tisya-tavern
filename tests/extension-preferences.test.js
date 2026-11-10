import test from 'node:test';
import assert from 'node:assert/strict';
import {EXTENSION_PREFERENCE_SCHEMA,normalizeExtensionPreferences,compileExtensionPreferences,builtinExtensionDefinitions,builtinPresentationDefinitions,validateExtensionDefinition,normalizeRecordReference,extensionPreferenceRecordId} from '../extension-preferences.mjs';

const source={book:'内置美化书',uid:'beauty-1',digest:'sha256:style-1'},extensionSource={book:'内置扩展书',uid:'forum-1',digest:'sha256:forum-1'};
const definitions=()=>[{source,definition:builtinPresentationDefinitions()[0]},{source:extensionSource,definition:builtinExtensionDefinitions().find(d=>d.view==='forum')}];
const row=(extra={})=>({row_uuid:'pref-1',output_config_ref:'out-1',owner_ref:'person-1',world_ref:'world-1',view_id:'forum',enabled:true,audience_kind:'world_fans',enabled_kinds:['text','news'],style_book:source.book,style_uid:source.uid,style_digest:source.digest,extension_book:extensionSource.book,extension_uid:extensionSource.uid,extension_digest:extensionSource.digest,world_sources:[],audience_sources:[],generate_count:5,display_limit:10,topic_preferences:[],...extra});
const options=()=>({definitions:definitions(),context:{ownerId:'person-1',worldId:'world-1'}});
test('extension preference schema links existing output facts without a runtime JSON bank',()=>{
 const s=EXTENSION_PREFERENCE_SCHEMA;assert.equal(s.id,'T_PREF_EXTENSION_PRESENTATION');assert.equal(s.parent_table,'T_PREF_OUTPUT_CONFIG');assert.ok(s.fields.some(f=>f.key==='output_config_ref'&&f.ref==='T_PREF_OUTPUT_CONFIG'));assert.ok(!s.fields.some(f=>['state','payload','style','worldTime'].includes(f.key)));assert.equal(new Set(s.fields.map(f=>f.key)).size,s.fields.length);
});
test('empty preference has no default generation, population, source or scene',()=>{
 const p=normalizeExtensionPreferences({});assert.equal(p.enabled,false);assert.equal(p.view_id,null);assert.equal(p.generate_count,null);assert.equal(p.display_limit,null);assert.deepEqual(p.world_sources,[]);assert.deepEqual(p.audience_sources,[]);
 const result=compileExtensionPreferences({});assert.equal(result.generation.enabled,false);assert.equal(result.display.enabled,false);assert.equal(result.prompt,'');
});
test('zero counts, false enable and zero topic weight survive exactly',()=>{
 const value=row({enabled:false,generate_count:0,display_limit:0,topic_preferences:[{topic:'新闻',mode:'avoid',weight:0}]});const before=structuredClone(value);const p=compileExtensionPreferences(value,options());assert.equal(p.generation.count,0);assert.equal(p.display.limit,0);assert.equal(p.generation.topics[0].weight,0);assert.equal(p.prompt,'');assert.deepEqual(value,before);
});
test('form value states cannot resurrect stale values marked unknown or cleared',()=>{
 const p=normalizeExtensionPreferences({values:row(),states:{enabled:'unknown',generate_count:'unset',display_limit:'known',topic_preferences:'cleared'}});assert.equal(p.enabled,false);assert.equal(p.generate_count,null);assert.equal(p.display_limit,10);assert.deepEqual(p.topic_preferences,[]);
});
test('factory definitions have valid finite tokens and fresh values each call',()=>{
 const all=[...builtinExtensionDefinitions(),...builtinPresentationDefinitions()];assert.equal(new Set(all.map(d=>d.id)).size,all.length);for(const d of all)assert.deepEqual(validateExtensionDefinition(d),d);all[0].counts.default=9;assert.equal(builtinExtensionDefinitions()[0].counts.default,5);
});
test('unknown CSS, html, script and layout are rejected as definition data',()=>{
 const d=builtinPresentationDefinitions()[0];for(const tokens of [{css:'body{display:none}'},{density:'url(javascript:x)'},{alignment:'absolute'}])assert.throws(()=>validateExtensionDefinition({...d,tokens}),/令牌/);
 assert.throws(()=>validateExtensionDefinition({...d,html:'<script>x</script>'}),/未登记字段/);assert.throws(()=>validateExtensionDefinition({...builtinExtensionDefinitions()[0],layout:'custom-html'}),/版式/);
});
test('configuration is exact-world and exact-owner scoped',()=>{
 assert.throws(()=>compileExtensionPreferences(row(),{...options(),context:{ownerId:'person-2',worldId:'world-1'}}),/当前主体/);
 assert.throws(()=>compileExtensionPreferences(row(),{...options(),context:{ownerId:'person-1',worldId:'world-2'}}),/当前世界/);
 assert.throws(()=>compileExtensionPreferences(row(),{definitions:definitions()}),/当前主体/);
});
test('selecting a definition pins its actual book UID and digest, no first-entry fallback',()=>{
 const p=compileExtensionPreferences(row(),options());assert.deepEqual(p.presentation.source,source);assert.deepEqual(p.extension.source,extensionSource);assert.equal(p.generation.enabled,true);assert.match(p.prompt,/人物知情/);
 assert.throws(()=>compileExtensionPreferences(row({style_digest:'different'}),options()),/摘要已变化/);
 assert.throws(()=>compileExtensionPreferences(row({extension_uid:'missing'}),options()),/不存在/);
 assert.throws(()=>normalizeExtensionPreferences(row({style_digest:null})),/同时指定/);
 const unselected=compileExtensionPreferences(row({style_book:null,style_uid:null,style_digest:null,extension_book:null,extension_uid:null,extension_digest:null}),options());assert.equal(unselected.presentation,null);assert.equal(unselected.extension,null);assert.equal(unselected.generation.enabled,false);assert.equal(unselected.display.enabled,true);
});
test('view mismatch and the selected definition count bounds fail clearly',()=>{
 assert.throws(()=>compileExtensionPreferences(row({view_id:'theater'}),options()),/不属于此区域/);
 const opts=options();opts.definitions[1].definition.counts.max=3;opts.definitions[1].definition.counts.default=3;assert.throws(()=>compileExtensionPreferences(row(),opts),/允许范围/);
 for(const v of [-1,1.5,51,'3',NaN])assert.throws(()=>normalizeExtensionPreferences(row({generate_count:v})),/整数/);
});
test('world and audience selections require explicitly allowed material of the same role',()=>{
 const ref={kind:'record',tableId:'T_SYS_ENTITIES',recordId:'npc-1',revision:1};const r=row({audience_sources:[ref]});
 assert.throws(()=>compileExtensionPreferences(r,options()),/当前不可读取/);
 const base={source:ref,role:'audience',allowed:true,content:{knownFacts:['仅知广场上已经公开的消息']}};
 assert.throws(()=>compileExtensionPreferences(r,{...options(),sourceMaterials:[{...base,allowed:false}]}),/当前不可读取/);
 assert.throws(()=>compileExtensionPreferences(r,{...options(),sourceMaterials:[{...base,role:'world'}]}),/当前不可读取/);
 const compiled=compileExtensionPreferences(r,{...options(),sourceMaterials:[base]});assert.equal(compiled.generation.materials.audience.length,1);assert.match(compiled.prompt,/仅知广场/);assert.match(compiled.prompt,/模板不是已存在/);
 compiled.generation.materials.audience[0].content.knownFacts.push('x');assert.equal(base.content.knownFacts.length,1);
});
test('book source origin is equally exact; empty source selections inject no unrelated material',()=>{
 const ref={kind:'book',book:'参考书',uid:'world-1',digest:'hash1'},material={source:ref,role:'world',allowed:true,content:{region:'海湾'}};
 const p=compileExtensionPreferences(row(),{...options(),sourceMaterials:[material]});assert.deepEqual(p.generation.materials.world,[]);assert.ok(!p.prompt.includes('海湾'));
 assert.throws(()=>compileExtensionPreferences(row({world_sources:[{...ref,digest:'hash2'}]}),{...options(),sourceMaterials:[material]}),/不可读取/);
});
test('historical record references cannot silently become current rows',()=>{
 assert.throws(()=>normalizeRecordReference({tableId:'T',recordId:'r'},{historical:true}),/历史呈现/);
 assert.deepEqual(normalizeRecordReference({tableId:'T',recordId:'r',revision:0},{historical:true}),{tableId:'T',recordId:'r',revision:0});
 assert.throws(()=>normalizeRecordReference({tableId:'T',recordId:'r',snapshotId:'s',execute:'pay'}),/未登记/);
});
test('record IDs separate owner/world/view and avoid concatenation collisions',()=>{
 const a=extensionPreferenceRecordId({worldId:'a:b',ownerId:'c',view:'forum'}),b=extensionPreferenceRecordId({worldId:'a',ownerId:'b:c',view:'forum'});assert.notEqual(a,b);assert.equal(a,extensionPreferenceRecordId({worldId:'a:b',ownerId:'c',view:'forum'}));
});
test('audience ontology is explicit, preserves unconfigured null and never grants omniscience',()=>{
 assert.equal(normalizeExtensionPreferences({}).audience_kind,null);assert.equal(normalizeExtensionPreferences({view_id:'message'}).view_id,'messages');
 for(const kind of ['world_fans','higher_dimensional','mixed']){const p=compileExtensionPreferences(row({audience_kind:kind}),options());assert.equal(p.generation.audienceKind,kind);assert.equal(p.generation.enabled,true);assert.match(p.prompt,new RegExp(kind));}
 assert.match(compileExtensionPreferences(row({audience_kind:'higher_dimensional'}),options()).prompt,/不等于自动全知/);
 for(const kind of [null,'none'])assert.equal(compileExtensionPreferences(row({audience_kind:kind}),options()).generation.enabled,false);
 assert.throws(()=>normalizeExtensionPreferences(row({audience_kind:'all-knowing'})),/本体类型/);
});
