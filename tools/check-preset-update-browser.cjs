// Real Chromium controls + the pinned host's actual PromptManager methods.
// Host persistence/selection is an isolated fixture; no model or private data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {build}=require('esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),hostPath=process.env.TISYA_HOST_PROMPT_MANAGER,output=process.env.TISYA_PRESET_EVIDENCE;
if(!hostPath||!output)throw Error('Set TISYA_HOST_PROMPT_MANAGER and TISYA_PRESET_EVIDENCE');
const originalHost=fs.readFileSync(hostPath,'utf8');
const host=originalHost.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export \{[\s\S]*?\};\s*$/m,'').replace(/^export /gm,'')+`
window.normalizeHost=settings=>{const manager=Object.create(PromptManager.prototype);manager.serviceSettings=settings;manager.log=()=>{};manager.checkForMissingPrompts(settings.prompts);manager.normalizeAgentPromptMarkerDefinitions();manager.ensureAgentPromptOrderReferences();};`;
const entry=`import {installBuiltInPreset} from './builtin-preset.js';
import {createPresetUpdateController,mountPresetUpdateControl,showPresetUpdateError} from './builtin-preset-controls.js';
import {presetLoadMismatch} from './preset-load-check.js';
import bundled from './presets/Tisya.json';
const clone=structuredClone,select=document.querySelector('select'),events=new Map();let writes=0,refreshes=0,silent=!localStorage.getItem('live');
const emit=async e=>{for(const fn of [...(events.get(e)??[])])await fn();};
const disk=JSON.parse(localStorage.getItem('disk')||'null')||{prompts:[{identifier:'old',content:'old'}],prompt_order:[],extensions:{tisya:{worldbooks:['stored']}}};
const settings=JSON.parse(localStorage.getItem('live')||'null')||{prompts:[{identifier:'old',content:'old'}],prompt_order:[],custom_model:'keep-model',temp_openai:.83,bind_preset_to_connection:true,extensions:{tisya:{worldbooks:['live']}}};
const list={presets:[{prompts:[]},disk],preset_names:{Other:0,Tisya:1}};
const context={chatCompletionSettings:settings,eventTypes:{OAI_PRESET_CHANGED_BEFORE:'before',OAI_PRESET_CHANGED_AFTER:'after'},eventSource:{on(e,fn){if(!events.has(e))events.set(e,new Set());events.get(e).add(fn);},removeListener(e,fn){events.get(e)?.delete(fn);}},saveSettingsDebounced(){localStorage.setItem('live',JSON.stringify(settings));}};
events.set('after',new Set([()=>window.normalizeHost(settings)]));
const manager={select:{0:select},getAllPresets:()=>['Other','Tisya'],getSelectedPresetName:()=>select.selectedOptions[0].text,getCompletionPresetByName:name=>list.presets[list.preset_names[name]],getPresetList:()=>list,findPreset:name=>String(list.preset_names[name]),async savePreset(name,value){writes++;localStorage.setItem('disk',JSON.stringify(value));},selectPreset(value){refreshes++;select.value=value;if(silent)return;void(async()=>{const preset=clone(list.presets[1]),change={preset,presetName:'Tisya',settings,settingsToUpdate:{custom_model:['','custom_model',false,true]}};for(const fn of [...(events.get('before')??[])])await fn(change);for(const key of ['prompts','prompt_order','extensions'])settings[key]=preset[key];await emit('after');})();}};
context.getPresetManager=()=>manager;
const controller=createPresetUpdateController({getContext:()=>context,document,isBusy:()=>false,install:(c,d,o)=>installBuiltInPreset(c,d,{...o,timeout:80})});
mountPresetUpdateControl(document.querySelector('main'),controller,{onError:e=>window.lastError=e.message});
const toastr={error(message){const div=document.createElement('div'),p=document.createElement('p');div.className='notice';p.className='toast-message';p.textContent=message;div.append(p);document.body.append(div);return {0:div};},clear(t){t[0].remove();}};
window.check=()=>({state:{...controller.state(),error:controller.state().error?.message??null},writes,refreshes,prompts:settings.prompts.length,order:settings.prompt_order[0]?.order.length,model:settings.custom_model,temp:settings.temp_openai,binding:settings.bind_preset_to_connection,books:settings.extensions.tisya.worldbooks,mismatch:presetLoadMismatch(settings,bundled)});
controller.update().catch(e=>showPresetUpdateError(document,toastr,e,()=>{silent=false;return controller.update({force:true});})).finally(()=>window.ready=true);
`;
(async()=>{
 const bundle=(await build({stdin:{contents:entry,resolveDir:root,sourcefile:'preset-check-entry.js'},bundle:true,format:'iife',platform:'browser',write:false})).outputFiles[0].text;
 const html='<!doctype html><meta charset="utf-8"><style>@font-face{font-family:TisyaReading;src:url(/font.woff2)}body{margin:0;padding:12px;background:#03251e;color:#e2ddc8;font-family:TisyaReading,serif}*{box-sizing:border-box}button{color:inherit;background:#18382c;border:1px solid #b7a46f;border-radius:6px;padding:10px;margin:3px}select{max-width:100%}.notice{padding:12px;background:#973f36;overflow-wrap:anywhere}small{font-size:13px}</style><select><option value="0">Other</option><option value="1" selected>Tisya</option></select><input id="bind_preset_to_connection" type="checkbox" checked><main></main><script src="/host.js"></script><script src="/check.js"></script>';
 const server=http.createServer((req,res)=>{if(req.url==='/font.woff2'){res.setHeader('content-type','font/woff2');return res.end(Buffer.concat([1,2,3,4].map(i=>fs.readFileSync(path.join(root,'font/reading.part'+i+'.bin')))));}res.setHeader('content-type',req.url==='/'?'text/html; charset=utf-8':'text/javascript');res.end(req.url==='/'?html:req.url==='/host.js'?host:bundle);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:process.env.TISYA_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']});
 try{
  const page=await browser.newPage({viewport:{width:360,height:800}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message);});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);await page.evaluate(()=>document.fonts.ready);
  const failed=await page.evaluate(()=>window.check());assert.match(failed.state.error,/刷新超时/);assert.equal(failed.writes,1);assert.equal(await page.locator('.notice button').count(),1);
  fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'retry-360.png')});
  await page.locator('.notice button').click();await page.waitForFunction(()=>!window.check().state.busy);assert.equal((await page.evaluate(()=>window.check())).state.error,null);
  const recovered=await page.evaluate(()=>window.check());assert.equal(recovered.mismatch,null);assert.equal(recovered.prompts,68);assert.equal(recovered.order,65);assert.equal(recovered.writes,2);assert.equal(recovered.model,'keep-model');assert.equal(recovered.temp,.83);assert.equal(recovered.binding,true);assert.deepEqual(recovered.books,['live']);assert.equal(await page.locator('.notice').count(),0);
  for(const width of [320,360,430,900]){await page.setViewportSize({width,height:800});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await page.locator('main button').boundingBox();assert(box.height>=44);}
  await page.screenshot({path:path.join(output,'success.png')});await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>document.fonts.ready);const reopened=await page.evaluate(()=>window.check());assert.equal(reopened.state.error,null);assert.equal(reopened.state.receipt.status,'current');assert.equal(reopened.writes,0);assert.equal(reopened.refreshes,0);assert.equal(reopened.mismatch,null);assert.deepEqual(errors,[]);
  const result={passed:true,browser:await browser.version(),hostCommit:'a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375',hostSourceSha256:crypto.createHash('sha256').update(originalHost).digest('hex'),failed,recovered,reopened,widths:[320,360,430,900],boundary:'Real Chromium + actual pinned PromptManager normalization methods. Native persistence/selection is a neutral isolated fixture; not installed TauriTavern, external-model or Android.'};fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,prompts:recovered.prompts,order:recovered.order,reopenedWrites:reopened.writes}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
