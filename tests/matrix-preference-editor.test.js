import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import catalog from '../engine/catalog.json' with {type:'json'};
import {baseline,compilePrompts} from '../engine/config.mjs';
import {PREFERENCE_GROUPS,preferenceTextKey,groupOriginalText} from '../engine/preferences.mjs';
import {preferenceTextRows,previewPreferenceText} from '../engine/preference-editor.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {mountMatrixConfiguration} from '../engine/ui.mjs';
const clone=structuredClone;
const click=(root,text)=>[...root.querySelectorAll('button')].find(n=>n.textContent===text).click();
async function fixture(){
 const macros=new Map(),disk=new Map(),ctx={extensionSettings:{},chatMetadata:{},chatId:'editor',characterId:0,characters:[{name:'世界'}],chat:[{is_user:true,mes:'开场'}],registerMacro:(name,fn)=>macros.set(name,fn),saveChat:async()=>true};
 const source={prompts:clone(baseline.prompts),order:clone(baseline.prompt_order[1].order)};
 const storage={get:async k=>clone(disk.get(k)),set:async(k,v)=>disk.set(k,clone(v)),commit:async(k,n,v)=>{if((disk.get(k)?.local_revision??0)!==n)return false;disk.set(k,clone(v));return true;}};
 const expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(raw,k)=>macros.has(k)?macros.get(k)():k==='user'?'屏幕用户':k==='char'?'世界':raw);
 const options={getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand};
 const host=createMatrixHost(options);host.register();await host.initialize();return {host,ctx,source,options,expand,disk};
}
async function uiFor(host){const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);const errors=[];const ui=mountMatrixConfiguration(w.document,root,{service:host,onError:e=>errors.push(e)});await ui.ready;return {w,root,ui,errors};}
async function settle(ui){await new Promise(r=>setTimeout(r,0));await ui.pending?.();await new Promise(r=>setTimeout(r,30));}
test('full text editor persists through formal database and cold host into the real final payload, without inactive text or evidence',async()=>{
 const f=await fixture(),{host,source,expand,options}=f;const conf=host.config.read();conf.story.play={choices:{N02:'N02-B'},parameters:{min_length:730,max_length:940}};await host.config.save(conf);
 const u=await uiFor(host);assert.equal(u.root.querySelectorAll('[data-preference-text]').length,41);
 const box=u.root.querySelector('[data-preference-group="N02"]'),control=box.querySelector('textarea');assert.match(control.value,/@/);
 control.value='写作测试专用原文：以{{main_language}}记叙石阶上的雨。';control.dispatchEvent(new u.w.Event('input'));click(u.root,'保存');await settle(u.ui);assert.deepEqual(u.errors,[]);
 const rows=preferenceTextRows((await host.readDatabase()).state);assert.equal(Object.values(rows).length,1);assert.equal(Object.values(rows)[0].text,control.value);
 u.ui.dispose();await u.w.happyDOM.abort();const reopened=createMatrixHost(options);reopened.register();await reopened.before('normal');
 const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier)),messages=source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}));
 const payload={messages};await reopened.payloadReady(payload);const text=payload.messages.map(m=>m.content).join('\n');assert.equal(text.split('写作测试专用原文').length-1,1);assert.match(text,/以中文记叙石阶上的雨/);assert.match(text,/730/);assert.match(text,/940/);assert.doesNotMatch(text,/selection_key|editor_enabled|tisya.preference-text/);
 reopened.clear();const next=reopened.config.read();next.story.play.choices.N02='N02-C';await reopened.config.save(next);const data=await reopened.preferenceEditorSource();const compiled=compilePrompts(data.source,next,{...data.slots,tisya_preference_texts:JSON.stringify(rows)});assert(!JSON.stringify(compiled).includes('写作测试专用原文'));
});
test('inherited source is taken from the actual active preset and global originals survive another story',async()=>{
 const {host,source,ctx}=await fixture();const group=PREFERENCE_GROUPS.find(g=>g.id==='N02');const current=source.prompts.find(p=>p.identifier===group.slot);current.content=current.content.replace(/(@POV[^\n]*)(?:\n|$)/,'$1\n本宿主改过的原文。\n');
 assert.match(groupOriginalText(source,host.config.read(),group),/本宿主改过/);
 const conf=host.config.read(),key=preferenceTextKey('N02',null);conf.playDefaults={textOverrides:{[key]:{id:'global-text',group:'N02',selection:'null',text:'跨故事默认原文',enabled:true}}};await host.config.save(conf);
 ctx.chatId='other';const other=host.config.read();const result=previewPreferenceText(source,other,{}, {},group);assert.match(result.text,/跨故事默认原文/);
});
test('invalid or stale edits retain drafts and do not mutate the formal record',async()=>{
 const {host}=await fixture(),u=await uiFor(host),box=u.root.querySelector('[data-preference-group="N02"]'),control=box.querySelector('textarea');
 control.value='';control.dispatchEvent(new u.w.Event('input'));click(u.root,'保存');await settle(u.ui);assert(u.errors.some(e=>/不能为空/.test(e.message)));assert.equal(Object.keys(preferenceTextRows((await host.readDatabase()).state)).length,0);
 control.value='保留这份草稿';control.dispatchEvent(new u.w.Event('input'));const db=await host.readDatabase();await host.commitDatabase({operationId:'other-page',expectedRevision:db.revision,contextKey:db.contextKey,changes:[],source:{kind:'test'}});click(u.root,'保存');await settle(u.ui);assert(u.errors.some(e=>/另一页面/.test(e.message)));assert.equal(control.value,'保留这份草稿');assert.equal(Object.keys(preferenceTextRows((await host.readDatabase()).state)).length,0);
 u.ui.dispose();await u.w.happyDOM.abort();
});

test('custom item is created from the actual UI, saved and compiled; switching choices does not inject it',async()=>{
 const {host}=await fixture(),u=await uiFor(host);let box=u.root.querySelector('[data-preference-group="S05"]');click(box,'新建自定义项');await u.ui.settled();
 box=u.root.querySelector('[data-preference-group="S05"]');const name=box.querySelector('[aria-label="主文风底座卡 · 自定义名称"]'),text=box.querySelector('textarea');assert(name);
 name.value='灯下叙事';name.dispatchEvent(new u.w.Event('input'));text.value='自定义文风仅写被灯照亮的细节。';text.dispatchEvent(new u.w.Event('input'));click(u.root,'保存');await u.ui.settled();assert.deepEqual(u.errors,[]);
 const data=await host.preferenceEditorSource(),rows=preferenceTextRows(data.database.state),record=Object.values(rows)[0];assert.equal(record.kind,'custom');assert.equal(record.name,'灯下叙事');
 const actual=compilePrompts(data.source,host.config.read(),{...data.slots,tisya_preference_texts:JSON.stringify(rows)});assert.equal(actual.prompts.map(p=>p.content).join('\n').split('自定义文风仅写').length-1,1);
 const next=host.config.read();next.story.play.choices.S05='S05-A';const other=compilePrompts(data.source,next,{...data.slots,tisya_preference_texts:JSON.stringify(rows)});assert(!JSON.stringify(other).includes('自定义文风仅写'));
 u.ui.dispose();await u.w.happyDOM.abort();
});

test('user feedback and directive keep separate formal fields, survive reopen and reach payload only while enabled',async()=>{
 const {host,source,expand}=await fixture(),u=await uiFor(host);click(u.root,'新建用户偏好');await u.ui.settled();
 let row=u.root.querySelector('[data-user-preference]');const name=row.querySelector('[aria-label="用户偏好名称"]'),quote=row.querySelector('[aria-label="用户反馈原话"]'),directive=row.querySelector('[aria-label="用户偏好完整创作指令"]');
 name.value='自然停笔';name.dispatchEvent(new u.w.Event('input'));quote.value='我不想每次都被问选A还是B';quote.dispatchEvent(new u.w.Event('input'));directive.value='用户指令专用标记：在自然的情绪落点停笔。';directive.dispatchEvent(new u.w.Event('input'));click(u.root,'保存');await u.ui.settled();assert.deepEqual(u.errors,[]);
 const db=await host.readDatabase(),saved=Object.values(db.state.tables.T_PREF_SCOPES)[0];assert.equal(saved.values.evidence_quote,quote.value);assert.equal(saved.values.compiled_directive,directive.value);
 row=u.root.querySelector('[data-user-preference]');assert.equal(row.querySelector('[aria-label="用户反馈原话"]').disabled,true);
 await host.before('normal');const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier)),payload={messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))};await host.payloadReady(payload);const final=payload.messages.map(m=>m.content).join('\n');assert.equal(final.split('用户指令专用标记').length-1,1);assert(!final.includes('我不想每次都被问选A还是B'));host.clear();
 const toggle=row.querySelector('[aria-label="启用用户偏好"]');toggle.checked=false;toggle.dispatchEvent(new u.w.Event('change'));click(u.root,'保存');await u.ui.settled();assert.deepEqual(u.errors,[]);const data=await host.preferenceEditorSource(),rows=preferenceTextRows(data.database.state),compiled=compilePrompts(data.source,host.config.read(),{...data.slots,tisya_preference_texts:JSON.stringify(rows)});assert(!JSON.stringify(compiled).includes('用户指令专用标记'));assert.equal(Object.values(data.database.state.tables.T_PREF_SCOPES)[0].values.evidence_quote,quote.value);
 u.ui.dispose();await u.w.happyDOM.abort();
});
test('import uses actual file preview and separate adoption; invalid files leave existing data untouched',async()=>{
 const {host}=await fixture(),u=await uiFor(host),pack={format:'tisya.preferences/1',entries:[{record:{id:'downloaded',group:'S05',selection:'"S05-A"',text:'下载包独有原文',enabled:true,kind:'override'},scope:'global',parameters:{min_length:800,max_length:1200},source:'本地导入'}]};
 const file=u.root.querySelector('[aria-label="导入偏好包文件"]');Object.defineProperty(file,'files',{value:[{size:500,text:async()=>JSON.stringify(pack)}]});file.dispatchEvent(new u.w.Event('change'));await u.ui.settled();assert.equal(Object.values(preferenceTextRows((await host.readDatabase()).state)).length,0);click(u.root,'确认导入到当前草稿');await u.ui.settled();click(u.root,'保存');await u.ui.settled();assert.deepEqual(u.errors,[]);
 let data=await host.preferenceEditorSource(),rows=preferenceTextRows(data.database.state);assert.equal(Object.values(rows)[0].enabled,false);let compiled=compilePrompts(data.source,host.config.read(),{...data.slots,tisya_preference_texts:JSON.stringify(rows)});assert(!JSON.stringify(compiled).includes('下载包独有原文'));assert.equal(host.config.read().playDefaults,undefined);
 const item=u.root.querySelector('[data-preference-package-item="downloaded"]');click(item,'采用此项');await u.ui.settled();click(u.root,'保存');await u.ui.settled();data=await host.preferenceEditorSource();rows=preferenceTextRows(data.database.state);compiled=compilePrompts(data.source,host.config.read(),{...data.slots,tisya_preference_texts:JSON.stringify(rows)});assert.equal(compiled.prompts.map(p=>p.content).join('\n').split('下载包独有原文').length-1,1);
 const before=JSON.stringify(rows),bad=u.root.querySelector('[aria-label="导入偏好包文件"]');Object.defineProperty(bad,'files',{value:[{size:5,text:async()=>'{broken'}]});bad.dispatchEvent(new u.w.Event('change'));await u.ui.settled();assert(u.errors.length);assert.equal(JSON.stringify(preferenceTextRows((await host.readDatabase()).state)),before);
 u.ui.dispose();await u.w.happyDOM.abort();
});
