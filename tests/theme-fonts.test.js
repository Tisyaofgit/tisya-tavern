import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {webcrypto} from 'node:crypto';
import {createGlobalFonts,fontPreferences} from '../global-fonts.js';
import {inspectFont,fontURL,prepareFont} from '../font-library.js';
import {waterOffset} from '../lower-water-motion.js';
const bytes=new Uint8Array([0,1,0,0,0,0,0,0,0,0,0,0,12]);
class Font{constructor(family,data){this.family=family;this.data=data;this.status='loaded';}async load(){return this;}}
async function fixture(){const w=new Window(),files=new Map();w.FontFace=Font;Object.defineProperty(w,'crypto',{value:webcrypto});Object.defineProperty(w.document,'fonts',{value:new Set()});let settings={联系人分组:{},其他:'保留'},fail=false;const fetcher=async(url,options)=>{if(url==='/api/files/upload'){const b=JSON.parse(options.body),path='/user/files/'+b.name;files.set(path,Uint8Array.from(Buffer.from(b.data,'base64')));return {ok:true,json:async()=>({path})};}const data=files.get(url);return {ok:!!data,status:data?200:404,arrayBuffer:async()=>data.buffer};};const service=createGlobalFonts(w.document,{getSettings:()=>settings,saveSettings:async next=>{if(fail)throw Error('保存失败');settings=next;},fetcher,headers:()=>({})});return {w,files,service,settings:()=>settings,fail:()=>fail=true};}
test('font imports verify readback, deduplicate, retain settings and reject deleting selected fonts',async()=>{const f=await fixture(),file={name:'测试.ttf',size:bytes.length,arrayBuffer:async()=>bytes.buffer};const row=await f.service.importFile(file);await f.service.importFile(file);assert.equal(f.service.list().rows.length,1);assert.equal(f.settings().其他,'保留');await f.service.select(row.id);assert.equal(f.w.document.documentElement.style.getPropertyValue('--tisya-global-font'),row.family);await assert.rejects(f.service.remove(row.id),/正在使用/);f.fail();await assert.rejects(f.service.select('default'),/保存失败/);assert.equal(f.service.list().selected,row.id);assert.equal(f.w.document.documentElement.style.getPropertyValue('--tisya-global-font'),row.family);f.service.dispose();await f.w.happyDOM.abort();});
test('font registry rejects foreign paths and bad bytes never change current selection',async()=>{assert.throws(()=>inspectFont(new TextEncoder().encode('<html>not a font</html>')),/不是可识别/);for(const url of ['http://font.test/a.ttf','https://user:pass@font.test/a.ttf','javascript:alert(1)'])assert.throws(()=>fontURL(url),/HTTPS/);const prepared=await prepareFont(bytes,{name:'font',Font,cryptoApi:webcrypto});assert.throws(()=>fontPreferences({字体设置:{selected:'default',rows:[{...prepared.record,path:'/user/files/other.ttf'}]}}),/损坏/);const f=await fixture();await assert.rejects(f.service.importFile({name:'bad.ttf',size:20,arrayBuffer:async()=>new TextEncoder().encode('no font here at all').buffer}),/不是可识别/);assert.equal(f.service.list().selected,'default');assert.equal(f.files.size,0);f.service.dispose();await f.w.happyDOM.abort();});
test('character lower water remains continuous, bounded, deterministic and anchored above the waist',()=>{for(const mm of [5,7.5,10])for(let t=0;t<100;t+=.1){assert.equal(waterOffset(t,.4,390,mm),0);const x=waterOffset(t,.9,390,mm);assert.equal(x,waterOffset(t,.9,390,mm));assert(Math.abs(x)<=mm*96/25.4/2);assert(Math.abs(x-waterOffset(t+.001,.9,390,mm))<.01);}});

test('title font persists independently, inherits global, protects used files and restores owned iframes',async()=>{
 const f=await fixture(),row=await f.service.importFile({name:'标题.ttf',size:bytes.length,arrayBuffer:async()=>bytes.buffer});
 assert.equal(fontPreferences({字体设置:{selected:'default',body:'inherit',rows:[]}}).title,'inherit');
 await f.service.select(row.id,'title');assert.equal(f.service.list().selected,'default');assert.equal(f.service.list().body,'inherit');
 assert.equal(f.w.document.documentElement.style.getPropertyValue('--tisya-title-font'),row.family);
 assert.equal(f.w.document.documentElement.style.getPropertyValue('--tisya-body-font'),'TisyaReading');
 await assert.rejects(f.service.remove(row.id),/正在使用/);
 const frame=f.w.document.createElement('iframe');frame.dataset.tisyaPanel='';f.w.document.body.append(frame);await f.service.refresh();
 assert.equal(frame.contentDocument.documentElement.style.getPropertyValue('--tisya-title-font'),row.family);
 f.fail();await assert.rejects(f.service.select('inherit','title'),/保存失败/);assert.equal(f.service.list().title,row.id);
 f.service.dispose();assert.equal(f.w.document.documentElement.style.getPropertyValue('--tisya-title-font'),'');await f.w.happyDOM.abort();
});

test('workbench stages title fonts until shared save, discards and keeps failed font changes retryable',async()=>{
 const {mountThemeWorkbench}=await import('../theme-workbench.js'),f=await fixture();const row=await f.service.importFile({name:'标题.ttf',size:bytes.length,arrayBuffer:async()=>bytes.buffer});const box=f.w.document.createElement('div');f.w.document.body.append(box);const view=mountThemeWorkbench(f.w.document,box,{getSettings:f.settings,fontService:f.service,saveAppearance:async()=>{},externalActions:true});const root=box.firstElementChild.shadowRoot;root.querySelector('[data-page=fonts]').click();await view.settled();
 const pick=async()=>{const select=root.querySelector('[aria-label="标题单独字体"]');select.value=JSON.stringify(row.id);select.onchange();await view.settled();};
 await pick();assert.equal(f.service.list().title,'inherit');assert.equal(view.requestLeave().allowed,false);await view.discardDraft();assert.equal(view.requestLeave().allowed,true);assert.equal(root.querySelector('[aria-label="标题单独字体"]').value,'"inherit"');
 await pick();assert.equal(await view.saveDraft(),true);assert.equal(f.service.list().title,row.id);
 const select=root.querySelector('[aria-label="标题单独字体"]');select.value='"default"';select.onchange();await view.settled();f.fail();assert.equal(await view.saveDraft(),false);assert.equal(f.service.list().title,row.id);assert.equal(view.requestLeave().allowed,false);view.dispose();f.service.dispose();await f.w.happyDOM.abort();
});
