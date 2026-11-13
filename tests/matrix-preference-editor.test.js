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
