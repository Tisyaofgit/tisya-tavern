import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {Window} from 'happy-dom';
import {displayValues,displayOverrides,withDisplayOverrides,mountDisplaySettings,DISPLAY_DEFAULTS} from '../display-settings.js';
import {readWorldExtra,mountWorldExtra,splitExtraDocuments} from '../world-extra.js';
import {emotionCatalog,EMOTIONS,mountEmotionAtlas} from '../emotion-catalog.js';
import {mountHeartBlock} from '../reply-details.js';import {registerPresetProtocol} from '../preset.js';
import {fixture,SECRET} from './fixtures/journey-r4.cjs';
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const ui=()=>{const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document,root=d.createElement('div');d.body.append(root);return {w,d,root};};
const format=s=>s;
test('display inheritance is read-only; false stays false and clearing removes only the explicit custom value',()=>{
 const s={联系人分组:{a:'友人'},动态效果:false},before=JSON.stringify(s);assert.deepEqual(displayValues(s),DISPLAY_DEFAULTS);assert.equal(JSON.stringify(s),before);
 const next=withDisplayOverrides(s,{水纹:false,背景特效模式:'关闭'});assert.equal(displayValues(next).水纹,false);assert.equal(displayValues(next).背景特效模式,'关闭');assert.equal(next.动态效果,false);assert.equal(next.联系人分组.a,'友人');
 assert.deepEqual(displayOverrides(withDisplayOverrides(next,{})),{});assert.throws(()=>displayValues({显示区块:{extensions:{水纹:'false'}}}),/配置损坏/);assert.throws(()=>displayValues({显示区块:null}),/配置损坏/);
});
test('display settings have a draft, native-save receipt, local retry and stale-draft rejection',async()=>{
 const {w,d,root}=ui();let state={联系人分组:{}},writes=0,fail=true;
 const page=mountDisplaySettings(d,root,{getSettings:()=>state,save:async custom=>{writes++;state=withDisplayOverrides(state,custom);if(fail)throw Error('尚未确认保存');}});
 root.querySelector('[aria-label="水纹"]').value='1';assert.equal(writes,0);root.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(writes,1);assert.match(root.textContent,/尚未确认保存/);assert.equal(displayValues(state).水纹,false);
 fail=false;root.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(writes,2);assert.match(root.textContent,/已应用并保存/);
 state=withDisplayOverrides(state,{水纹:true});root.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(writes,2);assert.match(root.textContent,/其他位置修改/);
 const form=root.querySelector('form');page.dispose();form.dispatchEvent(new w.Event('submit'));assert.equal(writes,2);await w.happyDOM.abort();
});
test('world extra uses top-level ownership, decodes CDATA after partition and excludes forbidden contents even on error paths',async()=>{
 const raw=fixture({extra:'<first title="甲"><nested>一</nested></first><second><![CDATA[<h2>乙</h2>]]></second>'}),rows=readWorldExtra(raw);
 assert.equal(rows.length,2);assert.equal(rows[0].label,'甲');assert.match(rows[0].html,/<nested>一<\/nested>/);assert.match(rows[1].html,/<h2>乙/);
 const hidden=fixture({extra:'<面板 title="SECRET_SENTINEL"><姓名>SECRET_SENTINEL</姓名></面板>',memory:'权限：extra|["面板","姓名"]|'+JSON.stringify(SECRET)});assert.deepEqual(readWorldExtra(hidden),[]);
 for(const source of [hidden,hidden.slice(0,-15)]){const {w,d,root}=ui(),view=mountWorldExtra(d,root,{source,structured:true,formatBody:format});assert.ok(!root.innerHTML.includes('SECRET_SENTINEL'));assert.equal(root.querySelector('iframe'),null);view.dispose();await w.happyDOM.abort();}
 assert.equal(raw,fixture({extra:'<first title="甲"><nested>一</nested></first><second><![CDATA[<h2>乙</h2>]]></second>'}));
});
test('extra document fences preserve code, reject incomplete fences, and unsupported pages retain only their own public text',async()=>{
 assert.deepEqual(splitExtraDocuments('前言\n```html\n<h2>卡片</h2>\n```\n```js\n<script>x()</script>\n```'),['前言\n','<h2>卡片</h2>\n','<pre><code>&lt;script&gt;x()&lt;/script&gt;\n</code></pre>']);assert.throws(()=>splitExtraDocuments('```html\n未完'),/INCOMPLETE/);
 const {w,d,root}=ui(),errors=[],source=fixture({extra:'<first title="交互"><![CDATA[<script>parent.PRIVATE_CANARY=1</script><p>公开交互</p>]]></first><second title="普通"><p>正常页</p></second>'}),view=mountWorldExtra(d,root,{source,structured:true,formatBody:format,onError:e=>errors.push(e.message)});
 assert.deepEqual(errors,['TISYA_EXTRA_RUNTIME_REQUIRED']);assert.equal(root.querySelector('script'),null);assert.equal(root.querySelectorAll('iframe').length,1);assert.match(root.textContent,/交互运行时/);const tabs=root.querySelectorAll('.extra-tabs button');tabs[1].click();assert.equal(root.querySelectorAll('.extra-page')[1].hidden,false);assert.equal(root.querySelectorAll('.extra-page')[0].hidden,true);assert.equal(view.capture().active,'extra-2');view.dispose();tabs[0].click();assert.equal(root.childNodes.length,0);await w.happyDOM.abort();
});
function decodedImages(w,{missing=null,wait={}}={}){w.Image=class{set src(value){this.url=value;}async decode(){const row=EMOTIONS.find(x=>x.url===this.url);if(row.name===missing)throw Error('missing');if(wait[row.name])await wait[row.name];this.naturalWidth=row.size[0];this.naturalHeight=row.size[1];}};}
test('one decoded six-emotion catalog feeds the atlas, every heart image and actual preset mood macro',async()=>{
 const {w,d,root}=ui();decodedImages(w);const catalog=emotionCatalog(d);assert.throws(()=>catalog.names(),/仍在加载/);await catalog.ready;assert.equal(emotionCatalog(d),catalog);assert.deepEqual(catalog.names(),['困倦','好奇','开心','怀疑','惊讶','闹别扭']);
 for(const row of EMOTIONS){const bytes=fs.readFileSync(new URL(row.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.equal((await catalog.resolve(row.name)).url,row.url);}
 const view=mountEmotionAtlas(d,root);assert.equal(root.querySelectorAll('img').length,6);await tick();assert.match(root.textContent,/六张表情已就绪/);view.dispose();
 const heart=mountHeartBlock(d,root,{status:'有内容',items:EMOTIONS.map(r=>({type:'剧情吐槽',text:r.name,mood:r.name}))});for(const row of EMOTIONS){await tick();assert.equal(heart.querySelector('img').src,row.url);heart.querySelector('button').click();}
 const macros=new Map(),source={prompts:[{identifier:'tisya_output'}],order:[{identifier:'tisya_output',enabled:true}]};const release=registerPresetProtocol({registerMacro:(n,f)=>macros.set(n,f),unregisterMacro:n=>macros.delete(n)},()=>source,()=>{},()=>catalog.names());assert.deepEqual(JSON.parse(macros.get('tisya_heart_moods')()),[null,...catalog.names()]);source.order[0].enabled=false;assert.equal(macros.get('tisya_heart_moods')(),'[null]');release();await w.happyDOM.abort();
});
test('missing and unknown emotion resources show an error; delayed old bindings cannot replace the current page or detached heart',async()=>{
 const one=ui();decodedImages(one.w,{missing:'怀疑'});const bad=emotionCatalog(one.d);await assert.rejects(bad.ready);assert.throws(()=>bad.names(),/加载失败/);const broken=mountHeartBlock(one.d,one.root,{status:'有内容',items:[{type:'剧情吐槽',text:'公开内容',mood:'开心'}]});await tick();assert.match(broken.textContent,/表情不可用/);assert.equal(broken.querySelector('img'),null);await one.w.happyDOM.abort();
 const two=ui();let release;decodedImages(two.w,{wait:{好奇:new Promise(r=>release=r)}});const heart=mountHeartBlock(two.d,two.root,{status:'有内容',items:[{type:'剧情吐槽',text:'一',mood:'好奇'},{type:'剧情吐槽',text:'二',mood:null}]});heart.querySelector('button').click();release();await emotionCatalog(two.d).ready;await assert.rejects(emotionCatalog(two.d).resolve('未收录表情'),/未收录/);await tick();assert.equal(heart.querySelector('img'),null);assert.equal(heart.dataset.mood,'');heart.querySelector('button').click();heart.remove();await tick();assert.equal(heart.querySelector('img'),null);await two.w.happyDOM.abort();
});
