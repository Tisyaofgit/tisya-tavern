import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraftWorkflow} from '../engine/draft-workflow.mjs';
import {downloadJson,downloadText} from '../engine/browser-download.mjs';
import {enabledNarrativePrompts,enabledPresetPrompts} from '../engine/prompt-selection.mjs';
import {occurrences} from '../engine/text-search.mjs';
import {digest,stable,sha256} from '../engine/common.mjs';
import {digest as storedDigest} from '../tables/books.js';
import {phonePromptSignature} from '../phone-protocol.mjs';
import {nextRecordId} from '../phone-life/record-id.mjs';
import {projectHistoryLayers} from '../engine/history-layers.mjs';
import {prepareBackfill} from '../engine/history-backfill.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('stable serialization sorts object keys but preserves arrays and valid JSON boundaries',()=>{
 const value={z:[3,undefined,{b:2,a:1}],a:1,omitted:undefined};
 assert.equal(stable(value),'{"a":1,"z":[3,null,{"a":1,"b":2}]}');
 assert.equal(stable({b:2,a:1}),stable({a:1,b:2}));
 assert.notEqual(stable([1,2]),stable([2,1]));
 assert.doesNotThrow(()=>JSON.parse(stable(value)));
});

test('stored text digest retains raw text and ordinary JSON serialization contracts',async()=>{
 assert.equal(await storedDigest('原文\n'),sha256('原文\n'));
 const value={b:2,a:1};
 assert.equal(await storedDigest(value),sha256(JSON.stringify(value)));
 assert.notEqual(await storedDigest(value),digest(value));
});

test('history projection and backfill use the same ordered source signature',()=>{
 const scope='synthetic-scope',messages=[
  {id:'u1',floor:2,role:'user',scope,text:'继续',revision:1},
  {id:'a1',floor:1,role:'assistant',scope,text:'<reply><body>1 合成历史正文。</body></reply>',revision:1}
 ];
 const projected=projectHistoryLayers({messages,scope,historyCount:5});
 const backfill=prepareBackfill({messages,scope,catalog:[{id:'T',fields:[{key:'note',type:'TEXT'}]}],world:{custom:[],labels:{}},policy:{T:{cells:['note'],archive:[]}}});
 assert.equal(projected.sourceSignature,backfill.sourceSignature);
 assert.equal(projected.sourceSignature,digest([messages[1],messages[0]]));
});

test('phone prompt freeze and replay share stable message signatures',()=>{
 const messages=[{role:'system',content:'合成提示词'},{role:'user',content:'合成输入'}];
 assert.equal(phonePromptSignature(messages),digest(messages));
 assert.equal(phonePromptSignature(messages),phonePromptSignature([{content:'合成提示词',role:'system'},messages[1]]));
 assert.notEqual(phonePromptSignature(messages),phonePromptSignature([...messages.slice(0,1),{...messages[1],content:'改写'}]));
});

test('text occurrences are exact, non-overlapping and empty needles are inert',()=>{
 assert.deepEqual(occurrences('aaaa','aa'),[0,2]);
 assert.deepEqual(occurrences('abababa','aba'),[0,4]);
 assert.deepEqual(occurrences('abc',''),[]);
 assert.deepEqual(occurrences('abc','z'),[]);
});

test('preset prompt selection retains ordered lookup and marker behavior',()=>{
 const first={identifier:'a',content:'first'},duplicate={identifier:'a',content:'duplicate'},marker={identifier:'m',marker:true,content:'marker'};
 const source={prompts:[first,duplicate,marker],prompt_order:[{character_id:1,order:[{identifier:'a',enabled:true}]},{character_id:100001,order:[{identifier:'m',enabled:true},{identifier:'a',enabled:true},{identifier:'a',enabled:true}]}]};
 assert.deepEqual(enabledPresetPrompts(source),[marker,first,first]);
 assert.deepEqual(enabledPresetPrompts({prompts:[first,{identifier:'off',enabled:false}]}),[first]);
});

test('narrative selection retains compiled array order and duplicate identifiers',()=>{
 const a={identifier:'a',content:'first'},b={identifier:'b',content:'middle'},duplicate={identifier:'a',content:'duplicate'},marker={identifier:'m',marker:true};
 const compiled={prompts:[a,b,duplicate,marker],order:[{identifier:'m',enabled:true},{identifier:'a',enabled:true},{identifier:'b',enabled:true}]};
 assert.deepEqual(enabledNarrativePrompts(compiled),[a,b,duplicate]);
 assert.deepEqual(enabledNarrativePrompts({prompts:[a]}),[]);
 compiled.prompts[2].enabled=false;
 assert.deepEqual(enabledNarrativePrompts(compiled),[a,b]);
});

test('life record allocation skips ids nested anywhere in durable state',()=>{
 const state={seq:0,wallet:{ledger:[{id:'entry-1'}]},archive:{days:[{rows:[{id:'entry-2'}]}]}};
 assert.equal(nextRecordId(state,'entry'),'entry-3');
 assert.equal(state.seq,3);
 assert.equal(nextRecordId(state,'other'),'other-4');
});

function downloadFixture(){
 const events=[],timers=[],links=[];
 class BlobType{constructor(parts,options){this.parts=parts;this.options=options;}}
 const urlApi={createObjectURL(blob){events.push(['create',blob]);return 'blob:synthetic';},revokeObjectURL(url){events.push(['revoke',url]);}};
 const document={defaultView:{},body:{append(link){events.push(['append',link]);}},createElement(tag){assert.equal(tag,'a');const link={tag,click(){events.push(['click',this]);},remove(){events.push(['remove',this]);}};links.push(link);return link;}};
 const setTimeout=(fn,delay)=>timers.push({fn,delay});
 return {events,timers,links,urlApi,BlobType,document,setTimeout};
}

test('browser downloads click and remove one temporary link then revoke its URL',()=>{
 const f=downloadFixture();
 downloadJson(f.document,'合成.json',{b:2,a:1},{urlApi:f.urlApi,BlobType:f.BlobType,setTimeout:f.setTimeout});
 assert.equal(f.links[0].download,'合成.json');
 assert.equal(f.links[0].href,'blob:synthetic');
 assert.deepEqual(f.events.map(row=>row[0]),['create','append','click','remove']);
 assert.equal(f.events[0][1].parts[0],'{\n  "b": 2,\n  "a": 1\n}');
 assert.equal(f.events[0][1].options.type,'application/json');
 assert.equal(f.timers[0].delay,1000);
 f.timers[0].fn();
 assert.deepEqual(f.events.at(-1),['revoke','blob:synthetic']);
 const raw=downloadFixture();
 downloadText(raw.document,'raw','合成.txt','text/plain',{urlApi:raw.urlApi,BlobType:raw.BlobType,setTimeout:raw.setTimeout});
 assert.equal(raw.events[0][1].parts[0],'raw');
 assert.equal(raw.events[0][1].options.type,'text/plain');
});

function workflowFixture({changed=true,save=async()=>{changed=false;return true;},discard=async()=>{changed=false;return true;}}={}){
 let open=false,disposed=false,requestHandlers=null,syncs=0,reports=[],starts=0,ends=0;
 const prompt={state:()=>({open,busy:false}),request(handlers){requestHandlers=handlers;open=true;return Promise.resolve(true);},dispose(){disposed=true;open=false;}};
 const workflow=createDraftWorkflow({prompt,hasChanges:()=>changed,save,discard,onSync:()=>syncs++,onReport:error=>reports.push(error),onRunStart:()=>{starts++;return starts;},onRunEnd:()=>ends++});
 return {workflow,reports,request:()=>requestHandlers,get syncs(){return syncs;},get starts(){return starts;},get ends(){return ends;},get promptDisposed(){return disposed;},set changed(value){changed=value;}};
}

test('draft workflow rejects concurrent runs and always restores its run state',async()=>{
 const f=workflowFixture(),gate=deferred();let calls=0;
 const first=f.workflow.run(async()=>{calls++;await gate.promise;return true;});
 assert.equal(f.workflow.busy,true);
 assert.equal(await f.workflow.run(async()=>{calls++;return true;}),false);
 gate.resolve();assert.equal(await first,true);
 assert.equal(calls,1);assert.equal(f.workflow.busy,false);assert.equal(f.starts,1);assert.equal(f.ends,1);
 const error=Error('synthetic failure');
 assert.equal(await f.workflow.run(async()=>{throw error;}),false);
 assert.deepEqual(f.reports,[error]);assert.equal(f.ends,2);
});

test('draft workflow save and discard failures stay attributed to the open prompt',async()=>{
 const saveError=Error('save failed'),failed=workflowFixture({save:async()=>{throw saveError;}});
 assert.equal(await failed.workflow.confirmLeave(),true);
 await assert.rejects(failed.request().save(),error=>error===saveError);
 assert.equal(failed.workflow.busy,false);
 assert.deepEqual(failed.reports,[saveError]);
 assert.equal(await failed.workflow.discardDraft(),true);
 assert.equal(await failed.request().discard(),true);
});

test('draft workflow deduplicates navigation and permits internal routed work',async()=>{
 const f=workflowFixture({changed:false}),gate=deferred();let navigated=0,ran=0;
 const first=f.workflow.route(async()=>{navigated++;assert.equal(f.workflow.navigating,true);await f.workflow.run(async()=>{ran++;await gate.promise;});},{external:true});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await f.workflow.route(async()=>{navigated++;}),false);
 gate.resolve();assert.equal(await first,true);await f.workflow.settled();
 assert.equal(navigated,1);assert.equal(ran,1);assert.equal(f.workflow.navigating,false);
});

test('disposing a draft workflow closes its prompt and blocks later work',async()=>{
 const f=workflowFixture();f.workflow.dispose();
 assert.equal(f.workflow.disposed,true);assert.equal(f.promptDisposed,true);
 assert.equal(await f.workflow.saveDraft(),false);
 assert.equal(await f.workflow.route(async()=>assert.fail('must not navigate')),false);
 f.workflow.report(Error('ignored'));assert.deepEqual(f.reports,[]);
});
