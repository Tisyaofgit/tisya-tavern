import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import catalog from '../engine/catalog.json' with {type:'json'};
import {baseline} from '../engine/config.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {mountMatrixConfiguration} from '../engine/ui.mjs';
import {preferenceTextChanges,preferenceTextRows} from '../engine/preference-editor.mjs';
import {PREFERENCE_GROUPS,preferenceTextKey} from '../engine/preferences.mjs';
import {sourceAdoption,sourceEntry} from '../engine/preference-sources.mjs';
import {createConditionService} from '../tables/condition-service.js';
import {createWorldbookConditionGate} from '../worldbook-conditions.js';
const clone=structuredClone;
const group=id=>PREFERENCE_GROUPS.find(g=>g.id===id);
const click=(root,text)=>{const b=[...root.querySelectorAll('button')].find(n=>n.textContent===text);assert(b,'Missing button: '+text);b.click();};
async function fixture({conditional=false,chance=100,observed=true,unknown=false}={}){
 const macros=new Map(),disk=new Map(),ctx={extensionSettings:{},chatMetadata:{},chatId:'source-path',characterId:0,characters:[{name:'世界'}],chat:[{is_user:true,mes:'开场'}],registerMacro:(name,fn)=>macros.set(name,fn),saveChat:async()=>true};
 let writes=0,reads=0,readHook=null,draws=0;
 const book={entries:{7:{uid:7,comment:'雨夜文风',content:'来源专用标记：只写雨滴触到的东西。',disable:true,constant:false,key:['雨'],extensions:{thirdParty:{literal:'\\n 原样'}}},8:{uid:8,comment:'另一技法',content:'同文来自另一身份',disable:false,constant:true}}};
 const source={prompts:clone(baseline.prompts),order:clone(baseline.prompt_order[1].order)};
 const storage={get:async k=>clone(disk.get(k)),set:async(k,v)=>disk.set(k,clone(v)),commit:async(k,n,v)=>{if((disk.get(k)?.local_revision??0)!==n)return false;writes++;disk.set(k,clone(v));return true;}};
 const expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(raw,k)=>macros.has(k)?macros.get(k)():k==='user'?'用户':k==='char'?'世界':raw);
 const options={getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand,sourceBooks:{list:async()=>['基点书','其他世界书'],read:async name=>{reads++;await readHook?.();return ['基点书','其他世界书'].includes(name)?clone(book):null;}}};
 const host=createMatrixHost(options);host.register();await host.initialize();
 const save=async changes=>{const db=await host.readDatabase();return host.commitDatabase({operationId:crypto.randomUUID(),expectedRevision:db.revision,contextKey:db.contextKey,changes});};
 const conditions=createConditionService({database:host.createConditionDatabaseBridge(),getContext:()=>ctx,draw:()=>{draws++;return .2;}});
 if(conditional){await save([{tableId:'T_SYS_SOURCE_ROUTES',recordId:'gate',values:{source_name:'已确认的文风条件',activation_condition:'condition',condition_chance:chance}},{tableId:'M_CONDITIONS',recordId:'condition',values:{owner_table:'T_SYS_SOURCE_ROUTES',owner_row_uuid:'gate',owner_field:'activation_condition',group_key:'eligible',sequence:0,combine:'all',predicate_kind:'observed_boolean',observed_result:observed,value_state:unknown?'unknown':'known'}}]);
  const rule=(await conditions.describeConditionRules()).find(r=>r.id==='gate');assert(rule.valid,rule.diagnostic);book.entries[7].extensions.tisyaWorldbook={condition:{mode:'external',provider:rule.provider,ruleRef:rule.id,ruleVersion:rule.revision}};
 }
 async function adopt(g='S05',uid=7,bookName='基点书'){
  const before=preferenceTextRows((await host.readDatabase()).state),row=sourceAdoption(sourceEntry(bookName,book.entries[uid]),group(g),before),rows={...before,[preferenceTextKey(g,row.selection,true)]:row};await save(preferenceTextChanges(before,rows));const config=host.config.read();((config.story.play??={}).choices??={})[g]=JSON.parse(row.selection);await host.config.save(config);return row;
 }
 const gateFor=(h=host)=>createWorldbookConditionGate({getContext:()=>ctx,engine:conditions,getSupplementalEntries:()=>h.preferenceConditionEntries(),onSupplementalDecisions:results=>h.applyPreferenceConditions(results)});
 async function payload(h=host){const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier)),p={messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))};await h.payloadReady(p);return p.messages.map(m=>m.content).join('\n');}
 const data=()=>({globalLore:[],characterLore:[],chatLore:[],personaLore:[]});
 async function scan(h=host,gate=gateFor(h)){const d=data();await h.entriesLoaded(d);await gate.entriesLoaded(d);await gate.scanDone({activated:{entries:new Map()}});await gate.assertReady();return d;}
 return {host,ctx,source,options,book,adopt,save,payload,gateFor,scan,data,conditions,writes:()=>writes,reads:()=>reads,draws:()=>draws,setReadHook:hook=>readHook=hook};
}
async function uiFor(host,initialTab='sources'){const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);const errors=[];const ui=mountMatrixConfiguration(w.document,root,{service:host,initialTab,onError:e=>errors.push(e)});await ui.ready;return {w,root,ui,errors,close:async()=>{ui.dispose();await w.happyDOM.abort();}};}

test('actual source UI adopts into canonical route and preference in one write; cold final payload includes it once',async()=>{
 const f=await fixture(),original=clone(f.book),u=await uiFor(f.host),start=f.writes();click(u.root,'读取书籍目录');await u.ui.settled();click(u.root,'读取所选书条目');await u.ui.settled();click(u.root,'雨夜文风 · 原生关键词／正则匹配 · 原生停用');await u.ui.settled();
 assert.equal(u.root.querySelector('[aria-label="来源完整原文"]').value,f.book.entries[7].content);click(u.root,'预览采用后的完整位置');await u.ui.settled();assert.match(u.root.querySelector('[aria-label="来源采用预览"]').textContent,/来源专用标记/);assert.equal(f.writes(),start);
 click(u.root,'加入当前故事草稿');await u.ui.settled();assert.equal(f.writes(),start);click(u.root,'保存');await u.ui.settled();assert.deepEqual(u.errors,[]);assert.equal(f.writes(),start+1);
 const db=await f.host.readDatabase(),row=Object.values(preferenceTextRows(db.state))[0];assert.equal(db.state.tables.T_PREF_SELECTION_OPTIONS[row.id].values.source_route_ref,row.source.routeId);assert.equal(db.state.tables.T_SYS_SOURCE_ROUTES[row.source.routeId].values.source_object_key,'["基点书",7]');assert.deepEqual(f.book,original);
 await u.close();const cold=createMatrixHost(f.options);cold.register();await cold.before('normal');const text=await f.payload(cold);assert.equal(text.split('来源专用标记').length-1,1);assert(!text.includes('tisya.worldbook-preference/1'));cold.clear();f.ctx.chatId='another-story';assert(!cold.config.read().story.play?.choices?.S05);
});
test('adopted source is removed from native scan copies without mutating the native book or another entry',async()=>{
 const f=await fixture();await f.adopt('S05',7,'其他世界书');const c=f.host.config.read();c.story.referenceBooks=['其他世界书'];await f.host.config.save(c);f.ctx.loadWorldInfo=async()=>clone(f.book);await f.host.before('normal');const data=f.data();data.globalLore=Object.values(clone(f.book).entries).map(e=>({...e,world:'其他世界书'}));await f.host.entriesLoaded(data);assert.deepEqual(data.globalLore.map(e=>e.uid),[8]);assert.equal(data.chatLore.length,0);assert(f.book.entries[7]);assert.equal((await f.payload()).split('来源专用标记').length-1,1);
});
test('existing full text editor keeps provenance while editing only the current story',async()=>{
 const f=await fixture();const row=await f.adopt(),u=await uiFor(f.host,'preferences'),box=u.root.querySelector('[data-preference-group="S05"]'),textarea=box.querySelector('textarea');textarea.value='故事改写专用标记';textarea.dispatchEvent(new u.w.Event('input'));click(u.root,'保存');await u.ui.settled();assert.deepEqual(u.errors,[]);const saved=Object.values(preferenceTextRows((await f.host.readDatabase()).state))[0];assert.deepEqual(saved.source,row.source);assert.equal(saved.text,textarea.value);assert.match(f.book.entries[7].content,/来源专用标记/);await u.close();
});
test('source edits stop save and final send; explicit comparison adopts the new revision, preserving raw metadata',async()=>{
 const f=await fixture();await f.adopt();await f.host.before('normal');f.book.entries[7].extensions.thirdParty.changed=true;await assert.rejects(f.payload(),/来源已变化/);f.host.clear();const before=f.writes(),u=await uiFor(f.host);click(u.root,[...u.root.querySelectorAll('button')].find(b=>b.textContent.startsWith('雨夜文风 · 当前选用')).textContent);await u.ui.settled();assert.match(u.root.textContent,/来源变化，待核对/);click(u.root,'保留故事改写并确认来源新版');await u.ui.settled();click(u.root,'保存');await u.ui.settled();assert.deepEqual(u.errors,[]);assert.equal(f.writes(),before+1);await u.close();await f.host.before('normal');assert.match(await f.payload(),/来源专用标记/);
});
test('same source and consumer is rejected; equal prose with different source identity is retained',async()=>{
 const f=await fixture();await f.adopt('TECH');await f.adopt('LIT');await assert.rejects(f.host.before('normal'),/重复选入/);
 const g=await fixture();g.book.entries[8].content=g.book.entries[7].content;await g.adopt('TECH');await g.adopt('LIT',8);await g.host.before('normal');assert.equal((await g.payload()).split('来源专用标记').length-1,2);
});
test('source read arriving after chat switch rejects rather than attaching the previous story source',async()=>{
 const f=await fixture();f.setReadHook(async()=>{f.ctx.chatId='new-chat';});await assert.rejects(f.host.sourceLibrary.read('基点书'),/会话或配置已变化/);assert.equal(Object.keys(preferenceTextRows((await f.host.readDatabase())?.state)).length,0);
});
for(const scenario of [{name:'matched',observed:true,chance:100,expected:true,draws:1},{name:'false',observed:false,chance:100,expected:false,draws:0},{name:'unknown',observed:true,unknown:true,chance:100,expected:false,draws:0},{name:'chance miss',observed:true,chance:0,expected:false,draws:1}])test('shared scan condition '+scenario.name+' reaches actual preference payload with read-only preview',async()=>{
 const f=await fixture({conditional:true,...scenario}),row=await f.adopt(),before=f.writes(),rows=preferenceTextRows((await f.host.readDatabase()).state);const preview=await f.host.previewPreferenceSources(rows);assert.equal(f.writes(),before);assert.equal(f.draws(),0);assert.equal(preview.rows[preferenceTextKey(row.group,row.selection,true)]._sourceGateState,scenario.expected?'matched':scenario.unknown?'unknown':'not_matched');
 await f.host.before('normal');const gate=f.gateFor();gate.begin();await f.scan(f.host,gate);assert.equal(f.draws(),scenario.draws);assert.equal((await f.payload()).includes('来源专用标记'),scenario.expected);
 await f.scan(f.host,gate);assert.equal(f.draws(),scenario.draws);assert.equal(f.writes(),before+scenario.draws);
});
test('condition preferences cannot send without the shared scan or via a whole-group override',async()=>{
 const f=await fixture({conditional:true});const row=await f.adopt();await f.host.before('normal');await assert.rejects(f.payload(),/尚未完成本轮扫描/);f.host.clear();
 const g=await fixture({conditional:true});const r=await g.adopt('TECH'),config=g.host.config.read(),selection=['TECH-01','custom:'+r.id];config.story.play.choices.TECH=selection;await g.host.config.save(config);const before=preferenceTextRows((await g.host.readDatabase()).state),override={id:'whole',group:'TECH',selection:JSON.stringify(selection),text:'绕过条件的内容',enabled:true,kind:'override'};await g.save(preferenceTextChanges(before,{...before,[preferenceTextKey('TECH',selection)]:override}));await assert.rejects(g.host.before('normal'),/整组覆盖/);
});
test('ordinary native conditions and selected style share one preflight and durable chance batch',async()=>{
 const f=await fixture({conditional:true});await f.adopt();await f.host.before('normal');const gate=f.gateFor();gate.begin();const data=f.data();data.globalLore=[{...clone(f.book.entries[7]),world:'native-book',uid:99,disable:false}];await gate.entriesLoaded(data);assert.equal(f.draws(),2);const receipts=Object.values((await f.host.readDatabase()).state.runtime.receipts).filter(r=>r.result?.source?.kind==='worldbook-condition');assert.equal(receipts.length,1);assert.equal(receipts[0].result.source.receipts.length,2);await gate.scanDone({activated:{entries:new Map(data.globalLore.map(e=>[e.uid,e]))}});assert.match(await f.payload(),/来源专用标记/);
});
test('forged source fingerprints and cross-story source refs cannot bypass the native reader',async()=>{
 const f=await fixture(),row=sourceAdoption(sourceEntry('基点书',f.book.entries[7]),group('S05'),{}),bad=clone(row);bad.source.hash='0'.repeat(64);const before=f.writes();await assert.rejects(f.save(preferenceTextChanges({}, {[preferenceTextKey('S05',row.selection,true)]:bad})),/指纹没有实际读取证据/);assert.equal(f.writes(),before);
 const config=f.host.config.read();config.playDefaults={textOverrides:{[preferenceTextKey('S05',row.selection,true)]:row}};await assert.rejects(f.host.config.save(config),/属于当前故事/);
});
test('conditional source preview keeps full source and the actual error when its rule revision is obsolete',async()=>{
 const f=await fixture({conditional:true});await f.save([{tableId:'M_CONDITIONS',recordId:'condition',values:{observed_result:false}}]);const n=f.writes(),item=await f.host.sourceLibrary.preview('基点书',7);assert.equal(item.text,f.book.entries[7].content);assert.match(item.conditionError.message,/版本/);assert.equal(item.conditionPreview,null);assert.equal(f.writes(),n);
});
test('native numeric-string UID is retained in raw metadata and resolved by its canonical identity',async()=>{
 const f=await fixture();f.book.entries[7].uid='7';await f.adopt();await f.host.before('normal');assert.match(await f.payload(),/来源专用标记/);assert.equal(f.book.entries[7].uid,'7');
});
test('selected source condition shares cold retry receipts and rejects a changed rule before drawing',async()=>{
 const f=await fixture({conditional:true});await f.adopt();await f.host.before('normal');let gate=f.gateFor();gate.begin();await f.scan(f.host,gate);assert.equal(f.draws(),1);f.host.clear();gate.end();const cold=createMatrixHost(f.options);cold.register();await cold.before('normal');gate=f.gateFor(cold);gate.begin();await f.scan(cold,gate);assert.equal(f.draws(),1);assert.match(await f.payload(cold),/来源专用标记/);cold.clear();
 await f.save([{tableId:'M_CONDITIONS',recordId:'condition',values:{observed_result:false}}]);await cold.before('normal');gate.begin();await assert.rejects(f.scan(cold,gate),/版本/);assert.equal(f.draws(),1);
});
