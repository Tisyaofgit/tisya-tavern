// Isolated module simulation, not a real host or full phone import test.
// common.mjs and phone-clock.mjs are real source modules. WorldClock, the
// phone archive boundary and the extension schema are explicit test doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const sourcePath=process.argv[2]??join(root,'engine/phone-database.mjs');
const common=await import(pathToFileURL(join(root,'engine/common.mjs')));
const clockScope=await import(pathToFileURL(join(root,'engine/phone-clock.mjs')));
const context=vm.createContext({structuredClone,TextEncoder,TextDecoder});
const synthetic=(values,id)=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context,identifier:id});
class SimulatedWorldClock{
 constructor(config){this.c=structuredClone(config);}
 ordinal(){return this.c.testOrdinal??0;}
 setOrdinal(value){this.c.testOrdinal=value;}
}
const modules=new Map([
 ['./common.mjs',synthetic(common,'common-real')],
 ['./phone-clock.mjs',synthetic(clockScope,'clock-scope-real')],
 ['./math.mjs',synthetic({WorldClock:SimulatedWorldClock},'math-test-double')],
 ['../phone-core.mjs',synthetic({importPhone:structuredClone,exportPhone:structuredClone,attachPhoneDatabaseSnapshot:structuredClone},'phone-boundary-test-double')],
 ['../extension-preferences.mjs',synthetic({EXTENSION_PREFERENCE_SCHEMA:{id:'X_TEST_PREFERENCES',fields:[]}},'schema-test-double')]
]);
const mod=new vm.SourceTextModule(await readFile(sourcePath,'utf8'),{context,identifier:pathToFileURL(sourcePath).href});
await mod.link(specifier=>{if(!modules.has(specifier))throw Error('Unregistered simulation dependency: '+specifier);return modules.get(specifier);});
await mod.evaluate();
const {encodePhoneDatabase,decodePhoneDatabase,createPhoneDatabaseStorage}=mod.namespace;
const clock=world=>({values:{world_ref:world,mode:'MONTH_TABLE',year:1,month:1,day:1,hour:0,minute:0,hour_minutes:60,testOrdinal:0},states:{world_ref:'known'}});
const phone=()=>({contextKey:'test-chat',revision:0,life:{world:{id:'B',name:'World B',apps:[],appNames:{},theme:{},currency:{},economy:{investments:[]},travel:{},settlementOwner:'matrix'},state:{identity:{personId:'person-b',name:'Person B'},config:{calendarOrigin:0,epoch:null},clock:{year:1,month:1,day:1,minute:0,totalMinutes:0},wallet:{},commerce:{products:[]},map:{places:[]}}}});
const database=(runtime={})=>({runtime,schema:{T_STATIC_WORLDS:{fields:['world_id','name'].map(key=>({key}))},T_SYS_ENTITIES:{fields:['entity_id','name'].map(key=>({key}))},X_WORLD_CLOCKS:{fields:Object.keys(clock('B').values).map(key=>({key}))}},tables:{X_WORLD_CLOCKS:{foreign:clock('A'),mine:clock('B')}}});
const errorCode=(fn,code)=>assert.throws(fn,error=>error.code===code);
function hydrated(){const db=database({calendar_record_id:'mine'}),encoded=encodePhoneDatabase(phone(),db);for(const change of encoded.changes){const table=db.tables[change.tableId]??={};const row=table[change.recordId]??={values:{}};Object.assign(row.values,structuredClone(change.values));}return db;}

test('actual encoder binds the same-world clock, not the first row',()=>{
 const encoded=encodePhoneDatabase(phone(),database());const binding=encoded.changes.find(x=>x.tableId==='X_PHONE_BINDINGS');assert.equal(binding.values.layout.clock.recordId,'mine');
});
test('actual encoder rejects an explicit foreign-world clock',()=>errorCode(()=>encodePhoneDatabase(phone(),database({calendar_record_id:'foreign'})),'PHONE_DATABASE_CLOCK_SCOPE'));
test('actual encoder does not replace a dangling clock binding',()=>errorCode(()=>encodePhoneDatabase(phone(),database({calendar_record_id:'missing'})),'PHONE_DATABASE_CLOCK'));
test('actual decoder rejects a stored binding to another world',()=>{
 const db=hydrated();db.tables.X_PHONE_BINDINGS['phone-current'].values.layout.clock.recordId='foreign';errorCode(()=>decodePhoneDatabase(db),'PHONE_DATABASE_CLOCK_SCOPE');
});
test('actual decoder rejects a stored binding to a non-clock table',()=>{
 const db=hydrated();db.tables.X_OTHER={mine:clock('B')};db.tables.X_PHONE_BINDINGS['phone-current'].values.layout.clock.tableId='X_OTHER';errorCode(()=>decodePhoneDatabase(db),'PHONE_DATABASE_CLOCK');
});
test('save rejects foreign-world binding before the commit boundary',async()=>{
 let commits=0;const db=database({calendar_record_id:'foreign'});const storage=createPhoneDatabaseStorage({contextKey:'test-chat',database:{read:async()=>({contextKey:'test-chat',revision:1,state:db}),commit:async()=>{commits++;return {revision:2};}}});
 await storage.load();await assert.rejects(()=>storage.save(phone(),{expectedRevision:null}),error=>error.code==='PHONE_DATABASE_CLOCK_SCOPE');assert.equal(commits,0);
});
test('legacy migration rejects foreign-world binding before commit',async()=>{
 let commits=0;const db=database({calendar_record_id:'foreign'});const storage=createPhoneDatabaseStorage({contextKey:'test-chat',legacyLoad:async()=>phone(),database:{read:async()=>({contextKey:'test-chat',revision:1,state:db}),commit:async()=>{commits++;return {revision:2,state:db};}}});
 await assert.rejects(()=>storage.load(),error=>error.code==='PHONE_DATABASE_CLOCK_SCOPE');assert.equal(commits,0);
});
test('failed encoding leaves source archive and database unchanged',()=>{
 const db=database({calendar_record_id:'foreign'}),p=phone(),before=JSON.stringify({db,p});errorCode(()=>encodePhoneDatabase(p,db),'PHONE_DATABASE_CLOCK_SCOPE');assert.equal(JSON.stringify({db,p}),before);
});
