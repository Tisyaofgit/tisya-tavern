import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountCompactAtlas,recordView} from '../tables/compact-atlas.js';
import {demoArchive} from '../preview/archive-atlas/demo.js';

const button=(root,text)=>{const result=[...root.querySelectorAll('button')].find(b=>b.textContent===text);assert(result,'missing '+text);return result;};
function fixture(options={}){const win=new Window(),root=win.document.createElement('div');win.document.body.append(root);const data=demoArchive(),ui=mountCompactAtlas(root,data,{authorizeRow:r=>r.access.readers.includes('读者'),authorizeField:()=>true,...options});return {win,root,data,ui,close:async()=>{ui.dispose();await win.happyDOM.close();}};}
async function select(f,label,value){const s=f.root.querySelector('select[aria-label="'+label+'"]');assert(s);s.value=value;s.dispatchEvent(new f.win.Event('change'));await f.ui.settled();}

test('compact atlas is read-only, shows full stable records, and separates history/current state by table IDs',async()=>{
 const f=fixture();try{assert.equal(f.root.querySelector('textarea'),null);assert.equal(f.root.querySelector('[data-record="fanglu"]').tagName,'ARTICLE');assert.match(f.root.querySelector('[data-record="fanglu"]').textContent,/方鹿/);assert.equal(f.root.querySelector('[data-record="e-flood"]'),null);assert.equal(f.root.querySelector('[data-record="r-fang-ahe"]'),null);
 await select(f,'查看内容','events');assert(f.root.querySelector('[data-record="e-flood"]'));assert.equal(f.root.querySelector('[data-record="fanglu"]'),null);
 await select(f,'查看内容','snapshot');assert(f.root.querySelector('[data-record="r-fang-ahe"]'));assert.equal(f.root.querySelector('[data-record="e-flood"]'),null);assert.equal(f.root.querySelector('[data-record="fanglu"]'),null);
 assert.equal(recordView('events'),'events');assert.equal(recordView('native_cells'),'snapshot');assert.equal(recordView('objects'),'atlas');assert.equal(recordView('facts'),'atlas');assert.equal(recordView('experiences',{类别:'习惯'}),'atlas');assert.equal(recordView('experiences',{类别:'回忆'}),'snapshot');assert.equal(recordView('custom',{}, {fields:{status:{type:'text',capture:'state'}}}),'snapshot');assert.equal(recordView('custom',{}, {fields:{fact:{type:'text',capture:'identity'}}}),'atlas');assert.equal(recordView('custom',{}, {fields:{record:{type:'text',capture:'event'}}}),'events');
 }finally{await f.close();}
});

test('authorized projection precedes search, fields, associations and nested details',async()=>{
 const f=fixture({authorizeField:(_row,path)=>path.join('.')!=='属性.身份细目.出身地'});try{assert.doesNotMatch(f.root.textContent,/欠款凭据/);assert(!f.root.querySelector('[data-record="secret"]'));const person=f.root.querySelector('[data-record="fanglu"]');assert(!person.textContent.includes('出身地'));assert(!person.querySelector('[data-record="secret"]'));
 const search=f.root.querySelector('input[aria-label="搜索档案"]');search.value='欠款';search.dispatchEvent(new f.win.Event('input'));await f.ui.settled();assert.equal([...f.root.querySelectorAll('[data-record]')].filter(x=>!x.hidden).length,0);
 }finally{await f.close();}
});

test('linked records are same-layer read views with return restoring search and type filters',async()=>{
 const f=fixture();try{await select(f,'档案类型','type:character');const search=f.root.querySelector('input[aria-label="搜索档案"]');search.value='方鹿';search.dispatchEvent(new f.win.Event('input'));await f.ui.settled();const person=f.root.querySelector('[data-record="fanglu"]');button(person,'阿禾').click();await f.ui.settled();assert.equal(f.ui.state().selected,'ahe');assert(f.root.querySelector('[data-record="ahe"]'));assert.equal(f.root.querySelector('[data-record="ahe"]').hidden,false);button(f.root,'← 返回').click();await f.ui.settled();assert.equal(f.ui.state().selected,null);assert.equal(f.ui.state().query,'方鹿');assert.equal(f.ui.state().filter,'type:character');
 }finally{await f.close();}
});

test('edit only invokes explicit handler after freshness verification, and schema tables include empty registered types',async()=>{
 let fresh=true,edits=0,fault='',schema=null;const f=fixture({showSchemas:true,onEdit:()=>edits++,onSchema:value=>schema=value,beforeRead:async()=>{if(!fresh)throw Error('档案版本已变化');},onError:e=>fault=e.message});try{assert.equal(edits,0);assert.equal(f.root.querySelector('textarea'),null);button(f.root,'编辑').click();await f.ui.settled();assert.equal(edits,1);button(f.root,'编辑 人物 的类型与字段').click();await f.ui.settled();assert.equal(schema.id,'character');assert.equal(schema.kind,'types');fresh=false;button(f.root,'编辑').click();await f.ui.settled();assert.equal(edits,1);assert.match(fault,/版本已变化/);
 }finally{await f.close();}
});

test('zero, false, empty arrays and markup remain exact safe text, without manufacturing links',async()=>{
 const win=new Window(),root=win.document.createElement('div');win.document.body.append(root);const data=demoArchive();data.registry.types.find(t=>t.id==='character').fields.检验={type:'object',fields:{零:{type:'number'},关闭:{type:'boolean'},空:{type:'texts'},原文:{type:'text'}}};data.rows.find(r=>r.id==='fanglu').values.属性.检验={零:0,关闭:false,空:[],原文:'<img src=x onerror=alert(1)> bell'};const ui=mountCompactAtlas(root,data,{authorizeRow:()=>true,authorizeField:()=>true});try{const row=root.querySelector('[data-record="fanglu"]'),values=[...row.querySelectorAll('dd')].map(x=>x.textContent);assert(values.includes('0'));assert(values.includes('否'));assert(values.includes(''));assert(values.includes('<img src=x onerror=alert(1)> bell'));assert.equal(root.querySelector('img'),null);assert(![...row.querySelectorAll('button')].some(b=>b.textContent==='bell'));}finally{ui.dispose();await win.happyDOM.close();}
});

test('origin character keeps the identity handoff under associated objects with freshness validation',async()=>{
 let identity=null,checks=0;const f=fixture({onIdentity:row=>identity=row,beforeRead:()=>checks++});try{f.data.live=true;assert(![...f.root.querySelectorAll('button')].some(b=>b.textContent==='用作用户身份'));await select(f,'资料层','origin');button(f.root.querySelector('[data-record="fanglu"]'),'用作用户身份').click();await f.ui.settled();assert.equal(identity.id,'fanglu');assert.equal(checks,2);}finally{await f.close();}
});
