import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceObjectArchive,archiveStoryTime,objectArchiveIdentity,projectArchiveVersion} from '../engine/object-archive.mjs';
import {syncObjectArchiveBooks,OBJECT_ARCHIVE_MARKER} from '../engine/object-archive-book.mjs';
import {OBJECT_ARCHIVE_FORMAT} from '../engine/object-archive.mjs';

const copy=structuredClone;
const source={book:'基点书',uid:7,definitionId:'character.root',version:1,digest:'source'};
const person=(name,age,personality,likes,metadata={sourceDefinition:source})=>({values:{row_uuid:'a',name,age,personality,likes},states:{row_uuid:'known',name:'known',age:'known',personality:'known',likes:'known'},metadata});
const calendar=year=>({mode:'MONTH_FIXED',year,month:1,day:1,hour:0,minute:0,months_per_year:12,days_per_month:30,day_hours:24,hour_minutes:60});
function bundle(revision=1,year=1,row=person('阿青',5,'安静','纸灯')){
 return {local_revision:revision,state:{runtime:{scope:{session_ref:'chat-a',branch_ref:'main'},calendar:calendar(year)},tables:{T_CHAR_DOSSIER:{a:row},T_DYN_EVENTS:{}}}};
}
const time=year=>({...archiveStoryTime(bundle(1,year).state)});

test('source identity crosses sessions without treating equal names or session rows as the same object',()=>{
 const a=bundle(),other=bundle();other.state.runtime.scope.session_ref='chat-b';
 assert.equal(objectArchiveIdentity(a.state,'T_CHAR_DOSSIER','a').archive_id,objectArchiveIdentity(other.state,'T_CHAR_DOSSIER','a').archive_id);
 other.state.tables.T_CHAR_DOSSIER.a.metadata.sourceDefinition={...source,uid:8};assert.notEqual(objectArchiveIdentity(a.state,'T_CHAR_DOSSIER','a').archive_id,objectArchiveIdentity(other.state,'T_CHAR_DOSSIER','a').archive_id);
 const localA=bundle(),localB=bundle();for(const b of [localA,localB])delete b.state.tables.T_CHAR_DOSSIER.a.metadata.sourceDefinition;localB.state.runtime.scope.session_ref='chat-b';
 assert.notEqual(objectArchiveIdentity(localA.state,'T_CHAR_DOSSIER','a').archive_id,objectArchiveIdentity(localB.state,'T_CHAR_DOSSIER','a').archive_id);
});

test('five, ten and fifteen year snapshots remain whole versions selected by story time',()=>{
 let projected=advanceObjectArchive(bundle());const entry=()=>projected.dossiers[0];
 projected=advanceObjectArchive(bundle(2,6,person('阿青',10,'好胜','剑术')),projected);
 projected=advanceObjectArchive(bundle(3,11,person('阿青',15,'克制','航海')),projected);
 assert.equal(entry().versions.length,3);assert.equal(projected.histories.length,1);assert.equal(projected.histories[0].changes.length,2);
 const ten=projectArchiveVersion(entry(),time(6));assert.equal(ten.snapshot.values.age,10);assert.equal(ten.snapshot.values.personality,'好胜');assert.equal(ten.snapshot.values.likes,'剑术');
 const five=projectArchiveVersion(entry(),time(1));assert.equal(five.snapshot.values.personality,'安静');assert.equal(five.snapshot.values.likes,'纸灯');
 assert.equal(projectArchiveVersion(entry(),{...time(6),branch:'other'}),null);
 // A past-time edit does not unconditionally replace a later age version.
 projected=advanceObjectArchive(bundle(4,1,person('阿青',5,'安静','折纸')),projected);
 assert.equal(projectArchiveVersion(entry(),time(1)).snapshot.values.likes,'折纸');assert.equal(projectArchiveVersion(entry(),time(6)).snapshot.values.likes,'剑术');
 assert.equal(projected.events.events.length,0);
});

test('unknown clocks never use device time; deletion is a tombstone and old versions remain readable',()=>{
 const first=bundle();delete first.state.runtime.calendar;let projected=advanceObjectArchive(first);assert.equal(projected.time.status,'unknown');assert.equal(projected.time.ordinal,null);
 const removed=bundle(2);delete removed.state.tables.T_CHAR_DOSSIER.a;delete removed.state.runtime.calendar;projected=advanceObjectArchive(removed,projected);
 const selected=projectArchiveVersion(projected.dossiers[0],archiveStoryTime(removed.state));assert.equal(selected.snapshot,null);assert.equal(projected.dossiers[0].versions[0].snapshot.values.name,'阿青');
 const original=advanceObjectArchive(bundle());assert.throws(()=>advanceObjectArchive(bundle(1,1,person('阿青',5,'冲突','纸灯')),{dossiers:original.dossiers}),/同一存档修订/);
});

function bookFixture(){
 const files=new Map(),owner={id:'chat-a',key:'owner-a'},refs={dossierRef:{name:'档案书'},historyRef:{name:'历史书'}},books={listBooks:async()=>[...files.keys()],readBook:async name=>copy(files.get(name)),writeBook:async(name,data)=>files.set(name,copy(data))};
 return {files,owner,refs,books,sync:b=>syncObjectArchiveBooks({books,owner,bundle:b,...refs})};
}
test('book sync splits each object and history into disabled entries while preserving user content and old versions',async()=>{
 const f=bookFixture();await f.sync(bundle());assert.deepEqual([...f.files.keys()].sort(),['历史书','档案书']);
 const dossier=f.files.get('档案书'),managed=Object.values(dossier.entries).filter(x=>x.extensions?.[OBJECT_ARCHIVE_MARKER]===OBJECT_ARCHIVE_FORMAT);assert.equal(managed.length,2);assert(managed.every(x=>x.disable));
 dossier.entries[99]={uid:99,content:'用户附记',disable:false};await f.sync(bundle(2,6,person('阿青',10,'好胜','剑术')));
 const saved=Object.values(f.files.get('档案书').entries).find(x=>JSON.parse(x.content).kind==='dossier'),value=JSON.parse(saved.content);assert.equal(value.format,OBJECT_ARCHIVE_FORMAT);assert.equal(value.versions.length,2);assert.equal(f.files.get('档案书').entries[99].content,'用户附记');
 const history=Object.values(f.files.get('历史书').entries).map(x=>JSON.parse(x.content));assert(history.some(x=>x.kind==='history'&&x.changes.length===1));assert(history.some(x=>x.kind==='events'));
 await assert.rejects(f.sync(bundle(1)),/版本较新/);
 const foreign={...f.owner,id:'chat-b'};await assert.rejects(syncObjectArchiveBooks({books:f.books,owner:foreign,bundle:bundle(3),...f.refs}),/另一聊天/);
});

test('a dossier-only partial write rebuilds the missing history on retry',async()=>{
 const f=bookFixture();await f.sync(bundle());const write=f.books.writeBook;let fail=true;f.books.writeBook=async(name,data)=>{if(fail&&name==='历史书')throw Error('history disk full');await write(name,data);};
 await assert.rejects(f.sync(bundle(2,6,person('阿青',10,'好胜','剑术'))),/history disk full/);
 const dossier=Object.values(f.files.get('档案书').entries).map(x=>JSON.parse(x.content)).find(x=>x.kind==='dossier');assert.equal(dossier.versions.length,2);
 fail=false;await f.sync(bundle(2,6,person('阿青',10,'好胜','剑术')));
 const history=Object.values(f.files.get('历史书').entries).map(x=>JSON.parse(x.content)).find(x=>x.kind==='history');assert.equal(history.changes.length,1);assert(history.changes[0].fields.some(x=>x.field==='likes'&&x.after.value==='剑术'));
});
