import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {mountCreationTable,mountCreationWorkbench} from '../engine/creation-workbench.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {createMatrixCreator} from '../engine/creation.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';
import {mountMatrixCreation} from '../engine/identity-ui.mjs';
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const raw='<reply><task/><anchor phase="before"/><title>阿青</title><body>1 阿青住在河口。我们可以继续讨论他的经历。</body><anchor phase="after"/><extra/><cells>【人物原点档案／1】\n1 显示名称：阿青\n20 公开身份：河口旅人</cells><vars/><archive/><actions/></reply>';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await tick();}throw Error('fixture condition did not settle');}
let serial=0;
async function fixture(){
 const ctx={chatId:'creation-ui-'+(++serial),characterId:null,characters:[],chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>true},disk=new Map(),inputs=[];let requestProgress,resolveRequest,rejectRequest;
 const storage={get:async id=>structuredClone(disk.get(id)),set:async(id,value)=>disk.set(id,structuredClone(value)),commit:async(id,revision,value)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,structuredClone(value));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true});await host.ensureDatabase();
 const database={read:()=>host.readDatabase(),commit:input=>host.commitDatabase(input)},creator=createMatrixCreator({database,getContext:()=>ctx,request:async(_task,input,{onProgress,signal})=>{inputs.push(JSON.parse(input));requestProgress=onProgress;onProgress({stage:'prepared',promptMessages:[{role:'system',content:'完整创作规则与模板'},{role:'user',content:input}],templateInfo:{task:'tableGenesis',template:'角色表'}});return new Promise((resolve,reject)=>{resolveRequest=resolve;rejectRequest=reject;signal.addEventListener('abort',()=>reject(Object.assign(Error('停止'),{name:'AbortError'})),{once:true});});}});
 const roles=createStoryIdentity({config:host.config,getContext:()=>ctx,database,creator,getHelper:()=>({getWorldbookNames:async()=>['测试基点'],getWorldbook:async()=>[]})});
 const win=new Window(),root=win.document.createElement('main');win.document.body.append(root);let view;
 async function mount(initial=true){view?.dispose();view=mountMatrixCreation(win.document,root,{roles,config:host.config,...(initial?{initialCreation:{kind:'character',goal:'写一个河口旅人',destination:{book:'测试基点'}}}:{})});assert.equal(await view.ready,true,root.textContent);return view;}
 await mount();return {win,root,roles,creator,inputs,mount,ctx,get view(){return view;},start(){root.querySelector('[data-creation-send]').click();},progress(p){requestProgress(p);},resolve(){resolveRequest(raw);},reject(){rejectRequest(Object.assign(Error('表单第 8 行：当前场景不存在'),{rawResponse:'<reply><body>片段</body><cells>无效表名</cells></reply>',cause:{formLocation:{line:8,table:'当前场景与时钟'}}}));},close(){view?.dispose();win.close();}};
}

test('actual identity creation streams, exposes actual prompts, survives disposal and resumes editable draft',async t=>{
 const f=await fixture();t.after(()=>f.close());f.start();await until(()=>f.inputs.length===1);assert.equal(f.root.querySelector('.tisya-identity-content').inert,false);assert.equal(f.view.state().creationRunning,true);assert.equal(f.view.requestLeave().allowed,true);
 f.progress({stage:'streaming',text:'<reply><body>阿青正在河口等船'});assert.match(f.root.querySelector('[data-creation-stream]').textContent,/阿青正在河口等船/);assert.match(f.root.querySelector('[data-creation-prompt]').textContent,/完整创作规则与模板/);assert.equal(f.root.querySelector('[data-creation-send]').disabled,true);
 const old=f.view;old.dispose();f.resolve();await old.settled();assert.equal(f.roles.creationTask().status,'ready');await f.mount(false);assert(f.root.querySelector('table.tisya-creation-table'));assert.equal(f.inputs.length,1);
 const name=f.root.querySelector('[data-creation-key="name"]');name.value='阿白';name.dispatchEvent(new f.win.Event('input'));await f.mount(false);assert.equal(f.root.querySelector('[data-creation-key="name"]').value,'阿白');assert.equal(JSON.parse(f.view.exportDraft().creation.text).name,'阿白');
 assert.equal(await f.view.discardDraft(),true);await f.mount(false);assert.equal(f.root.querySelector('[data-creation-draft]'),null);assert.equal(f.roles.creationTask(),null);
});

test('second conversational request includes previous conversation and cancellation is explicit',async t=>{
 const f=await fixture();t.after(()=>f.close());f.start();await until(()=>f.inputs.length===1);f.resolve();await f.view.settled();const input=f.root.querySelector('[data-creation-goal]');input.value='把公开身份改成渡船人';input.dispatchEvent(new f.win.Event('input'));f.start();await until(()=>f.inputs.length===2);assert(f.inputs[1].conversation.some(message=>message.role==='assistant'&&message.content.includes('阿青')));assert.equal(f.roles.creationTask().messages.at(-1).content,'把公开身份改成渡船人');f.root.querySelector('[data-creation-cancel]').click();await f.view.settled();assert.equal(f.roles.creationTask().status,'cancelled');assert.equal(f.root.querySelector('[data-creation-send]').disabled,false);
});

test('failed stream keeps both original answer and location visible without pretending a draft exists',async t=>{
 const f=await fixture();t.after(()=>f.close());f.start();await until(()=>f.inputs.length===1);f.reject();await f.view.settled();assert.match(f.root.querySelector('[data-creation-task-error]').textContent,/当前场景/);assert.match(f.root.querySelector('[data-creation-raw-reply]').textContent,/无效表名/);assert.match(f.root.querySelector('[data-creation-diagnostics]').textContent,/第 8 行|"line": 8/);assert.equal(f.root.querySelector('[data-creation-fields]'),null);
});

test('visual cells preserve typed false, zero and null while nested rules remain editable without JSON textareas',()=>{
 const win=new Window(),root=win.document.createElement('main'),proposal={matrix:{changes:[{tableId:'RULES',recordId:'rules',values:{enabled:false,limit:0,empty:null,logic:{conditions:[{field:'好感',min:2}],formula:'基础值 + 奖励'}}}]}};let changes=0;const errors={};
 mountCreationTable(win.document,root,{proposal,fieldErrors:errors,onChange:()=>changes++});assert.equal(root.querySelector('textarea[data-creation-key="logic"]').value,'好感');assert.equal(root.querySelector('[data-creation-key="enabled"]').value,'false');assert.equal(proposal.matrix.changes[0].values.empty,null);
 const threshold=[...root.querySelectorAll('input[data-creation-key="logic"]')].find(node=>node.dataset.creationPath.includes('min'));threshold.value='5';threshold.dispatchEvent(new win.Event('input'));assert.equal(proposal.matrix.changes[0].values.logic.conditions[0].min,5);assert(changes);assert.equal(proposal.matrix.changes[0].values.enabled,false);assert.equal(proposal.matrix.changes[0].values.limit,0);assert.equal(proposal.matrix.changes[0].values.empty,null);
 const number=root.querySelector('[data-creation-key="limit"]');number.value='';number.dispatchEvent(new win.Event('input'));assert(Object.keys(errors).length);assert.equal(proposal.matrix.changes[0].values.limit,0);win.close();
});

test('workbench renders text safely and has no cancel-on-dispose behavior',()=>{
 const win=new Window(),root=win.document.createElement('main'),composer=win.document.createElement('textarea');let cancels=0;const panel=mountCreationWorkbench(win.document,root,{composer,onSend:()=>{},onCancel:()=>cancels++});panel.render({status:'streaming',text:'<reply><body><img src=x onerror=alert(1)>',messages:[{role:'user',content:'<script>danger</script>'}]});assert.equal(root.querySelector('script,img'),null);panel.dispose();assert.equal(cancels,0);win.close();
});

 test('a stale view cannot write its unsaved conversation into a newly selected chat',async t=>{
 const f=await fixture();t.after(()=>f.close());f.start();await until(()=>f.inputs.length===1);const old=f.view;f.ctx.chatId+='-other';old.dispose();assert.equal(f.roles.creationView(),null);assert.equal(f.roles.creationTask(),null);f.resolve();await old.settled();assert.equal(f.roles.creationTask(),null);assert.equal(f.roles.creationView(),null);
});

test('optional field controls preserve omission until actual input, respect registered boundaries, and undo without clearing old values',()=>{
 const win=new Window(),root=win.document.createElement('main'),values={name:'简档'},proposal={matrix:{changes:[{tableId:'PERSON',recordId:'same-record',values}]}},schema={PERSON:{label:'人物',fields:[{key:'name',label:'名称',type:'TEXT'},{key:'age',label:'年龄',type:'NUMBER'},{key:'enabled',label:'公开',type:'BOOLEAN'},{key:'level',label:'级别',type:'ENUM',enum:['低','高']},{key:'notes',label:'笔记',type:'ARRAY'},{key:'row_uuid',label:'内部坐标',type:'ID'},{key:'business_id',label:'业务编号',type:'ID'},{key:'computed',label:'派生值',type:'NUMBER',read_only:true},{key:'internal',label:'程序元数据',type:'TEXT',program_owned:true}]}},fieldTexts={},fieldErrors={};let writes=0;
 const view=mountCreationTable(win.document,root,{proposal,schema,fieldTexts,fieldErrors,onChange:()=>writes++});const add=key=>{const select=root.querySelector('[data-creation-add-field]');select.value=key;select.dispatchEvent(new win.Event('change'));root.querySelector('[data-creation-add]').click();};
 const offered=[...root.querySelector('[data-creation-add-field]').options].map(option=>option.value);for(const key of ['row_uuid','business_id','computed','internal'])assert(!offered.includes(key));
 add('age');assert.deepEqual(values,{name:'简档'});assert.equal(writes,0);let input=root.querySelector('[data-creation-key="age"]');assert.equal(input.value,'');input.value='未知年龄';input.dispatchEvent(new win.Event('input'));assert.equal(Object.hasOwn(values,'age'),false);assert.equal(Object.keys(fieldErrors).length,1);
 root.querySelector('[data-creation-omit-field="age"]').click();assert.deepEqual(values,{name:'简档'});assert.equal(Object.keys(fieldErrors).length,0);assert.equal(writes,0);
 add('age');input=root.querySelector('[data-creation-key="age"]');input.value='0';input.dispatchEvent(new win.Event('input'));assert.equal(values.age,0);root.querySelector('[data-creation-omit-field="age"]').click();assert.equal(Object.hasOwn(values,'age'),false);
 add('enabled');input=root.querySelector('[data-creation-key="enabled"]');assert.equal(input.value,'');assert.equal(Object.hasOwn(values,'enabled'),false);input.value='false';input.dispatchEvent(new win.Event('change'));assert.equal(values.enabled,false);
 add('level');input=root.querySelector('[data-creation-key="level"]');assert.equal(input.value,'');assert.equal(Object.hasOwn(values,'level'),false);input.value='高';input.dispatchEvent(new win.Event('change'));assert.equal(values.level,'高');
 add('notes');assert.equal(Object.hasOwn(values,'notes'),false);const notes=[...root.querySelectorAll('tr')].find(row=>row.querySelector('th')?.textContent.startsWith('笔记'));[...notes.querySelectorAll('button')].find(button=>button.textContent==='添加一项').click();assert.deepEqual(values.notes,['']);const note=root.querySelector('textarea[data-creation-key="notes"]');note.value='后来确认的资料';note.dispatchEvent(new win.Event('input'));assert.deepEqual(values.notes,['后来确认的资料']);assert.equal(view.value().matrix.changes[0].recordId,'same-record');win.close();
});

for(const [kind,text,value,event]of [['number','0',0,'input'],['boolean','false',false,'change']])test('missing JSON type changes stay visual until explicit '+kind+' input',()=>{
 const win=new Window(),root=win.document.createElement('main'),proposal={matrix:{changes:[{tableId:'PERSON',recordId:'same-record',values:{name:'简档'},states:{detail:'unknown'}}]}},schema={PERSON:{fields:[{key:'name',type:'TEXT'},{key:'detail',type:'JSON'}]}};let writes=0;
 mountCreationTable(win.document,root,{proposal,schema,onChange:()=>writes++});const before=structuredClone(proposal),add=root.querySelector('[data-creation-add-field]');add.value='detail';add.dispatchEvent(new win.Event('change'));root.querySelector('[data-creation-add]').click();
 for(const next of ['number','boolean','array','string','null',kind]){const selector=root.querySelector('[data-creation-value-type]');selector.value=next;selector.dispatchEvent(new win.Event('change'));assert.deepEqual(proposal,before,'choosing '+next+' must not supply a value');assert.equal(writes,0);}
 const input=root.querySelector('[data-creation-key="detail"]');assert.equal(input.value,'');input.value=text;input.dispatchEvent(new win.Event(event));assert.equal(proposal.matrix.changes[0].values.detail,value);assert.equal(proposal.matrix.changes[0].states.detail,'known');assert.equal(proposal.matrix.changes[0].recordId,'same-record');assert.equal(writes,1);
 const afterInput=root.querySelector('[data-creation-value-type]');afterInput.value='string';afterInput.dispatchEvent(new win.Event('change'));assert.equal(proposal.matrix.changes[0].values.detail,'');assert.equal(writes,2);win.close();
});

test('existing null retains explicit type-change behavior',()=>{
 const win=new Window(),root=win.document.createElement('main'),proposal={matrix:{changes:[{tableId:'PERSON',recordId:'same-record',values:{detail:null}}]}};let writes=0;
 mountCreationTable(win.document,root,{proposal,onChange:()=>writes++});const type=root.querySelector('[data-creation-value-type]');type.value='number';type.dispatchEvent(new win.Event('change'));assert.equal(proposal.matrix.changes[0].values.detail,0);assert.equal(writes,1);win.close();
});
