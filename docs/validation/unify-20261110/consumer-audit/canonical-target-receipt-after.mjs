// Related legacy writer request provenance: Tisyaofgit/tisya-tavern at ed4302bd10d9d4c8786b13ce6dd8b9a2dcf6c19c.
// See legacy-writer-request-provenance.json; this canonical-version case uses only current production services.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=pathToFileURL('/workspace/scratch/c04f833f6bb3/unify-release/');
const {createMatrixHost}=await import(new URL('engine/host.mjs',root));
const {createStoryIdentity}=await import(new URL('engine/identity.mjs',root));
const {createBookGateway}=await import(new URL('tables/books.js',root));
const {default:catalog}=await import(new URL('engine/catalog.json',root),{with:{type:'json'}});
const copy=structuredClone,books=new Map([['人物定义书',[]]]),disk=new Map();
const ctx={chatId:'canonical-proof-isolated',characterId:0,characters:[{avatar:'world.png'}],chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>true};
const helper={getWorldbookNames:async()=>[...books.keys()],getWorldbook:async name=>copy(books.get(name)),createWorldbook:async(name,rows)=>{books.set(name,copy(rows));return true;},updateWorldbookWith:async(name,fn)=>{let uid=100;const next=fn(copy(books.get(name)));books.set(name,copy(next.map(entry=>entry.uid===undefined?{...entry,uid:uid++}:entry)));return true;}};
const storage={get:async id=>copy(disk.get(id)),set:async(id,value)=>disk.set(id,copy(value)),commit:async(id,revision,value)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,copy(value));return true;}};
const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true});await host.ensureDatabase();
const database={read:()=>host.readDatabase(),commit:input=>host.commitDatabase(input)},sourceBooks=createBookGateway(()=>helper,()=>ctx);
const roles=createStoryIdentity({config:host.config,getContext:()=>ctx,getHelper:()=>helper,database,sourceBooks});
const binding={entityId:'source-person',dossierId:'source-person'},changes=[{tableId:'T_CHAR_DOSSIER',recordId:'source-person',values:{name:'归档人物',public_identity:'来源身份'}},{tableId:'T_SYS_ENTITIES',recordId:'source-person',values:{kind:'character',origin_record_ref:'source-origin'}},{tableId:'M_FIELD_REFERENCES',recordId:'source-origin',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'source-person',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'source-person',reference_kind:'record',resolution_status:'resolved'}}];
const archive=await sourceBooks.prepareDefinitionArchive({operationId:'source-archive-v1',kind:'character',name:'归档人物',binding,changes,destination:{book:'人物定义书'},schema:(await database.read()).state.schema});
const receipt=await sourceBooks.commitDefinitionArchive(archive),source=await roles.readSource(receipt.sourceArchive);
await roles.commitEdit(await roles.previewSourceImport(source));
const manual=await roles.previewCreate({name:'用户独立人物',values:{public_identity:'用户自己写的字段'}});await roles.commitEdit(manual);await roles.bind({dossierId:binding.dossierId});
const rewrite=copy(manual.changes);rewrite[0].values.name='归档现在指向的另一个人物';rewrite[0].values.public_identity='归档拟写值';
const revision=await sourceBooks.prepareDefinitionArchive({operationId:'source-archive-v2',kind:'character',mode:'revise',name:'归档现在指向的另一个人物',binding:manual.binding,changes:rewrite,destination:{book:source.book,uid:source.uid},source,schema:(await database.read()).state.schema});
await sourceBooks.commitDefinitionArchive(revision);const revised=await roles.readSource(source);assert.equal(revised.definition.id,source.definition.id);
const before=await database.read(),userRow=copy(before.state.tables.T_CHAR_DOSSIER[manual.binding.dossierId]);assert.equal(userRow.metadata.sourceDefinition,undefined);
const beforeConfig=host.config.read(),beforeBooks=copy([...books.entries()]);
let rejection;
try{await roles.previewSourceImport(revised);}catch(error){rejection=error;}
assert(rejection instanceof Error,'Revised source must not borrow the old source receipt to claim an unrelated record');
assert.match(rejection.message,/记录 ID 已被另一份内容占用/);
const after=await database.read();
assert.deepEqual(after,before,'Database must remain unchanged after rejected import');
assert.deepEqual(host.config.read(),beforeConfig,'Existing character binding must remain unchanged');
assert.deepEqual([...books.entries()],beforeBooks,'Source definition must remain unchanged after rejected import');
console.log(JSON.stringify({rejected:true,message:rejection.message,sourceDefinitionId:source.definition.id,priorVersion:source.definition.revision,revisedVersion:revised.definition.revision,priorBinding:binding,attemptedBinding:revised.definition.matrix.binding,databaseUnchanged:true,configurationUnchanged:true,sourceBooksUnchanged:true},null,2));
