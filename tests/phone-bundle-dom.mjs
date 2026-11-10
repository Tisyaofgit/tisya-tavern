// Execute the delivered inline ESM byte-for-byte in Node's native module VM,
// backed by Happy DOM. This tests bundling/DOM behavior, not graphical layout.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Window} from 'happy-dom';
import {createPhoneService} from '../phone-core.mjs';
import {fundedPhoneProfile} from './fixtures/phone-current.mjs';
import {currentPhoneHost} from './fixtures/phone-host-current.mjs';
import {chatKey} from '../engine/controller.mjs';

const htmlPath=resolve(process.env.PHONE_BUNDLE_HTML??'phone.html');
const reportPath=resolve(process.env.PHONE_BUNDLE_REPORT??'phone-bundle-dom-report.json');
const html=await readFile(htmlPath,'utf8'),matches=[...html.matchAll(/<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(matches.length,1,'single inline module');const source=matches[0][1],results=[];
const state=win=>JSON.parse(win.localStorage.getItem('tisya.phone.preview.20261109'));
const pause=()=>new Promise(r=>setTimeout(r,0));

async function load({host=null,url='http://localhost/phone.html',frozen=false}={}){
  const errors=[],external=[];
  const win=new Window({url,settings:{enableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableImageFileLoading:false,suppressInsecureJavaScriptEnvironmentWarning:true},console:{log(){},info(){},warn(){},debug(){},error(...values){errors.push(values.map(v=>String(v)).join(' '));}}});
  // Happy DOM does not expose structuredClone on this Window. The application's
  // state is JSON-only; this test-only realm-local shim retains that data shape.
  // It intentionally does not claim to test the browser's structuredClone API.
  if(typeof win.structuredClone!=='function')vm.runInContext('globalThis.structuredClone = value => JSON.parse(JSON.stringify(value));',win);
  win.fetch=async url=>{external.push(String(url));throw Error('Unexpected network request: '+url);};
  if(host)win.Tisya={phone:host};
  win.document.write(html.replace(matches[0][0],''));await win.happyDOM.waitUntilComplete();
  const module=new vm.SourceTextModule(source,{context:win,identifier:url+'#delivered-inline-module',importModuleDynamically:()=>{throw Error('Unexpected dynamic dependency')}});
  await module.link(specifier=>{external.push(specifier);throw Error('Unexpected external module: '+specifier)});await module.evaluate();
  for(let i=0;i<12;i++){await pause();if(frozen?win.document.querySelector('.phone-snapshot'):win.tisyaPhoneApp)break;}
  const root=win.document.getElementById('phone-root')??win.document.getElementById('app');
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(external.length,0);assert.ok(root,'delivered root exists');
  if(!frozen)assert.ok(win.tisyaPhoneApp,'delivered module booted');
  const app=win.tisyaPhoneApp;
  const settle=async()=>{await app?.settled();await pause();await app?.settled();};
  const click=async selector=>{const el=root.querySelector(selector);assert.ok(el,selector);el.click();await settle();};
  const input=(selector,value)=>{const el=root.querySelector(selector);assert.ok(el,selector);el.value=value;el.dispatchEvent(new win.Event('input',{bubbles:true}));};
  const submit=async selector=>{const el=root.querySelector(selector);assert.ok(el,selector);el.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await settle();};
  return {win,root,app,errors,external,settle,click,input,submit,close(){app?.dispose();win.close();}};
}

test('delivered HTML has closed assets/modules and boots all 17 entry points',async()=>{
  assert.ok(!/<script\b[^>]*\bsrc=|<link\b[^>]*\bhref=/i.test(html));
  // Inspect delivered markup/CSS, not JavaScript template expressions for
  // user-selected media URLs. Actual runtime fetches are trapped by load().
  const markup=html.replace(matches[0][0],'');
  for(const [,url]of markup.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g))assert.ok(url.startsWith('data:')||url.startsWith('#'),'external CSS asset '+url);
  const f=await load();assert.equal(f.root.querySelectorAll('.phone-app-grid>.phone-app').length,17);assert.equal(f.win.document.querySelectorAll('script[src]').length,0);assert.ok(f.root.textContent.includes('独立预览'));f.close();results.push('inline-native-ESM boot + 17 apps + no external dependencies');
});

test('delivered bundle keeps forum event targets, search and actual phone-file import',async()=>{
  const f=await load();f.win.confirm=()=>true;await f.click('.phone-app-grid [data-phone-open="forum-encore"]');assert.equal(f.root.querySelectorAll('[data-phone-send]').length,1);assert.equal(f.root.querySelectorAll('[data-compose]').length,0);
  await f.click('[data-reply-floor="8"]');f.input('[name="text"]','打包后的真实提交');await f.submit('[data-phone-send]');assert.ok(f.root.textContent.includes('打包后的真实提交'));assert.equal(state(f.win).actions.at(-1).reference.floor,9);
  await f.click('[data-phone-react-floor="9"][data-phone-react-value="like"]');await f.click('[data-phone-react-floor="9"][data-phone-react-value="down"]');assert.equal(f.root.querySelector('[data-phone-react-floor="9"][data-phone-react-value="down"]').getAttribute('aria-pressed'),'true');assert.equal(f.root.querySelector('[data-phone-react-floor="9"][data-phone-react-value="like"]').getAttribute('aria-pressed'),'false');
  await f.click('[data-phone-nav="search"]');f.input('[name="query"]','打包后的真实提交');await f.submit('[data-phone-search]');assert.equal(f.root.querySelectorAll('.phone-search-result').length,1);
  const archive=f.win.localStorage.getItem('tisya.phone.preview.20261109');await f.click('.phone-search-result');f.input('[name="text"]','导入后应被替换的后续消息');await f.submit('[data-phone-send]');assert.ok(f.root.textContent.includes('导入后应被替换的后续消息'));f.app.navigate('settings');
  const file=new f.win.File([archive],'phone-progress.json',{type:'application/json'}),transfer=new f.win.DataTransfer();transfer.items.add(file);const chooser=f.root.querySelector('[data-phone-import]');chooser.files=transfer.files;chooser.dispatchEvent(new f.win.Event('change',{bubbles:true}));await f.settle();assert.ok(f.root.textContent.includes('已导入进度'));f.app.open('forum-encore');assert.ok(f.root.textContent.includes('打包后的真实提交'));assert.ok(!f.root.textContent.includes('导入后应被替换的后续消息'));assert.equal(state(f.win).actions.length,JSON.parse(archive).actions.length);assert.equal(f.errors.length,0);f.close();results.push('bundled event path + scoped search + real File-input phone archive import');
});

test('delivered frozen URL takes only the accepted bundle snapshot and stays read-only',async()=>{
  const live=await load();live.app.open('forum-encore');await live.app.send('定格请求');const request=await live.app.prepare(),row=state(live.win).requests[request.requestId];const payload={requestId:request.requestId,acks:row.actionIds,blocks:[{type:'forum',thread:'forum-encore',items:[{by:'forum_momo_a',text:'来自打包运行的冻结回复'}]}],markers:[{id:'m1',thread:'forum-encore',floor:10}]};
  const accepted=await live.app.receive(JSON.stringify(payload),request.requestId),snapshot=JSON.parse(JSON.stringify(accepted.snapshot));await live.app.send('这条发生在定格之后');const sourceId=snapshot.frame.sourceId;live.close();let calls=0,opened=null;
  const host={contextKey:()=> 'preview-phone',snapshot:async id=>{calls++;assert.equal(id,sourceId);return snapshot},service(){throw Error('Frozen bundle must not fetch current service')},open(value){opened=value}};
  const f=await load({host,frozen:true,url:`http://localhost/phone.html?chat=preview-phone&frozen=${encodeURIComponent(sourceId)}&marker=m1`});assert.equal(calls,1);assert.ok(f.root.textContent.includes('来自打包运行的冻结回复'));assert.ok(!f.root.textContent.includes('这条发生在定格之后'));assert.equal(f.root.querySelectorAll('[data-phone-send]').length,0);assert.ok(f.root.querySelector('.phone-snapshot-body').hasAttribute('inert'));await f.click('[data-phone-open]');assert.equal(opened.docId,'forum-encore');assert.equal(f.errors.length,0);f.close();results.push('bundled frozen URL + accepted frame + no current-service read + full-phone jump');
});

test('delivered life URL mounts configured wallet and commits its real form through host service',async()=>{
 const context={chatId:'bundle-life',characterId:0,groupId:null,chat:[],chatMetadata:{}},key=chatKey(context);
 const profile=fundedPhoneProfile({worldId:'bundle-world',personId:'bundle-person',world:{name:'打包世界',apps:['wallet','album'],appNames:{wallet:'打包银行'},currency:{name:'星币',symbol:'¤',minorUnits:2}},character:{name:'打包角色',wallet:{accounts:[{id:'cash',name:'零钱',balance:10000}],defaultAccountId:'cash',fundingAccountId:'cash'},contacts:[{id:'friend',name:'朋友'}]}});
 const matrix=await currentPhoneHost({context,profile}),service=createPhoneService({seed:{accounts:{me:{name:'我'}},documents:[]},contextKey:key,storage:matrix.phoneStorage});await service.init();await service.initLife(profile);
 const host={contextKey:()=>key,selectionKey:()=> 'same-selection',service:async()=>service,open:()=>{},openIdentity:()=>{}};
 const f=await load({host,url:'http://localhost/phone.html?chat='+encodeURIComponent(key)+'&app=wallet'});
 try{const shadow=f.app.getRoot();assert.match(shadow.querySelector('.bar-title').textContent,/打包银行/);assert.equal(f.win.localStorage.length,0);await f.app.handle('nav',{app:'wallet',tab:'transfer'});const form=shadow.querySelector('form[data-action="wallet.transfer"]');form.querySelector('[name="amount"]').value='1.25';form.querySelector('[name="to"]').value='friend';form.dispatchEvent(new f.win.Event('submit',{bubbles:true,cancelable:true}));await f.settle();assert.equal(service.readLife().state.wallet.accounts[0].balance,9875);assert.equal((await matrix.read()).life.state.wallet.ledger.length,1);assert.equal(f.errors.length,0);results.push('exact bundled life URL + isolated shadow UI + real transfer form + current Matrix database service');}finally{f.close();}
});

after(async()=>{await writeFile(reportPath,JSON.stringify({utc:new Date().toISOString(),html:htmlPath,bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),inlineScriptSha256:createHash('sha256').update(source).digest('hex'),expectedGroups:4,passedGroups:results.length,groups:results,execution:'Exact delivered inline script, Node native vm.SourceTextModule in Happy DOM 20.14.5 window; parsed delivered HTML/CSS; actual controller events',limitations:['Happy DOM automatic ESM loader rejected a script accepted by node --check; native VM bypasses only that simulator module compiler.','Happy DOM Window lacks structuredClone; a test-only realm-local JSON-data clone shim is installed. This is not a full structuredClone API test.','No graphical browser, layout, Android, real-host session, or real-model call.'],command:'PHONE_BUNDLE_HTML=<path> node --experimental-vm-modules --test --test-reporter=tap phone-work/phone-bundle-dom.test.mjs'},null,2)+'\n');});
