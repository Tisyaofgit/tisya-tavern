const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=async function({p,f,check,qa,root}){
 // Actual host styles are optional, immutable test inputs, never bundled.
 if(process.env.TISYA_HOST_CSS_DIR)for(const file of ['style.css','css/mobile-styles.css'])await p.evaluate(css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style)},fs.readFileSync(process.env.TISYA_HOST_CSS_DIR+'/'+file,'utf8'));
 await p.addStyleTag({path:root+'/shell.css'});
 await p.addStyleTag({content:'iframe{width:300px!important;height:150px!important;position:absolute!important}'});
 await p.evaluate(()=>{const old=document.createElement('iframe');old.id='old-geometry-control';old.style.cssText='position:fixed;left:0;right:0;bottom:0;width:100%;height:100dvh;border:0;';document.body.append(old)});
 assert.equal(Math.round((await p.locator('#old-geometry-control').boundingBox()).width),300);await p.locator('#old-geometry-control').evaluate(n=>n.remove());
 check('old inline-only frame reproduces 300px geometry under a host iframe reset (diagnostic, not an Android root-cause claim)');
 for(const viewport of [{width:320,height:640},{width:430,height:900},{width:900,height:430}]){
  await p.setViewportSize(viewport);await p.evaluate(()=>{fx.cg.open({type:'character'});document.getElementById('tisya-character-group').removeAttribute('style')});await f.waitForFunction(()=>!hostBusy);
  const rect=await p.locator('#tisya-character-group').boundingBox();assert.equal(Math.round(rect.width),viewport.width);assert.equal(Math.round(rect.height),viewport.height);assert.equal(rect.x,0);assert.equal(rect.y,0);
 }
 check('production character surface fills portrait and landscape despite inline-style removal and hostile iframe CSS');
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>fx.wb.open());const w=await(await p.waitForSelector('#tisya-worldbook-console')).contentFrame();await w.waitForFunction(()=>hostReady&&!hostBusy);
 assert(await p.locator('#tisya-character-group').evaluate(n=>n.hidden));await w.evaluate(()=>hostCall('display','float'));
 let rect=await p.locator('#tisya-worldbook-console').boundingBox();assert.equal(Math.round(rect.height),Math.round(844*.52));assert.equal(Math.round(rect.y+rect.height),844);
 await p.evaluate(async()=>{(await import('/panel-surface.js')).hideFullPanels(document)});assert(await p.locator('#tisya-worldbook-console').isVisible());
 await p.setViewportSize({width:844,height:390});await p.waitForFunction(()=>Math.round(document.getElementById('tisya-worldbook-console').getBoundingClientRect().height)===Math.round(390*.52));rect=await p.locator('#tisya-worldbook-console').boundingBox();assert.equal(Math.round(rect.width),844);assert.equal(Math.round(rect.height),Math.round(390*.52));
 check('half-screen console survives ordinary navigation and follows viewport rotation');
 await w.evaluate(()=>hostCall('display','full'));await w.evaluate(()=>edit(entries[0].uid));await w.locator('#entry-content').fill('页面切换仍保留这份草稿');await p.waitForFunction(()=>fx.wb.hasDraft());
 await p.evaluate(()=>fx.cg.open({type:'character'}));await f.waitForFunction(()=>!hostBusy);assert(await p.locator('#tisya-worldbook-console').evaluate(n=>n.hidden));await p.evaluate(()=>fx.wb.open());assert.equal(await w.locator('#entry-content').inputValue(),'页面切换仍保留这份草稿');assert.equal(await p.locator('#tisya-worldbook-console').count(),1);assert.equal(await p.locator('#tisya-character-group').count(),1);
 check('manager switches show one persistent surface and preserve unsaved worldbook draft on reopen');
 // Exercise the actual index.js settings/page functions with explicit host stubs.
 const source=fs.readFileSync(root+'/index.js','utf8'),navSource=source.slice(source.indexOf('function nav('),source.indexOf('\nfunction nativePanelAction')),pageSource=source.slice(source.indexOf('function page(title'),source.indexOf('\nfunction openNotebook'));
 await p.evaluate(async({navSource,pageSource})=>{
  const {settingsDestinations}=await import('/settings-navigation.js'),{mountSettingsHome}=await import('/settings-home.js'),{hideFullPanels}=await import('/panel-surface.js');
  document.body.classList.add('tisya-active');const root=document.createElement('div');root.id='tisya-shell';root.innerHTML='<main class="tisya-page"></main>';document.body.append(root);root.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:1';
  let renderEpoch=0;const VERSION='0.2.0-alpha.31.30',fontState='阅读字体已就绪',motionEnabled=true,pet={isVisible:()=>true};
  const query=s=>document.querySelector(s),immersiveSupported=()=>false,immersiveState=()=>false,drawerEntries=()=>[],close=()=>{},closeNativeDrawers=()=>{},refreshVisuals=()=>{},clearNotebook=()=>{fx.config?.dispose();fx.config=null;},esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),button=(label,action)=>`<button data-tisya-action="${esc(action)}">${esc(label)}</button>`;
  const api=eval(navSource+'\n'+pageSource+'\n({nav,page})');fx.showSettings=api.nav;fx.renderPage=api.page;fx.root=root;fx.showSettings();
  await document.fonts.ready;if(![...document.fonts].some(f=>f.family==='TisyaReading'&&f.status==='loaded'))throw Error('Font not ready');
  const {mountConfiguration}=await import('/config/panel.js'),{createStore,emptyConfig,defaultWorld,worldKey,KEY}=await import('/config/core.js');fx.ctx.extensionSettings[KEY]=emptyConfig();fx.ctx.extensionSettings[KEY].worlds[worldKey(fx.ctx)]=defaultWorld();const store=createStore({getContext:()=>fx.ctx,persist:async()=>true});
  const host={archives:async()=>[],books:async()=>[],entries:async()=>[],searchBooks:async()=>[],connections:()=>[],presets:()=>[],api:()=>({}),snapshots:()=>[],transportStatus:()=>({}),preview:()=>({})};
  fx.openFeature=async(tab)=>{api.page('缇斯亚功能','<div id="feature"></div>');fx.config=mountConfiguration(document,document.getElementById('feature'),{store,host,initialTab:tab,embedded:true,getSettings:()=>({联系人分组:{}}),onClose:()=>fx.showSettings(),onTitle:title=>{root.querySelector('h2').textContent=title}});await fx.config.ready;};
 },{navSource,pageSource});
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>fx.showSettings());await p.locator('#tisya-settings-home input').fill('世界书');await p.evaluate(()=>{window.savedSettingsNode=document.getElementById('tisya-settings-home');fx.showSettings();fx.showSettings()});assert(await p.evaluate(()=>savedSettingsNode===document.getElementById('tisya-settings-home')));assert.equal(await p.locator('#tisya-settings-home input').inputValue(),'世界书');assert.equal(await p.locator('#tisya-settings-home').count(),1);await p.locator('#tisya-settings-home input').fill('');
 check('actual settings route is singleton and re-entry preserves current search');
 for(const width of [320,430,900]){await p.setViewportSize({width,height:900});assert(await p.locator('#tisya-settings-home').evaluate(n=>n.scrollWidth<=n.clientWidth+1));await p.screenshot({path:qa+'/settings-home-'+width+'.png'});}
 await p.evaluate(()=>fx.wb.open());await w.getByRole('button',{name:'设置',exact:true}).click();await p.waitForFunction(()=>document.getElementById('tisya-worldbook-console').hidden);assert(await p.locator('#tisya-worldbook-console').evaluate(n=>n.hidden));assert(await p.locator('#tisya-settings-home').isVisible());assert(await p.evaluate(()=>fx.wb.hasDraft()));
 check('worldbook Settings button returns to the same settings page without discarding draft');
 await p.evaluate(()=>fx.cg.open({type:'character'}));await f.waitForFunction(()=>!hostBusy);await f.locator('[data-action=host-settings]:visible').first().click();await p.waitForFunction(()=>document.getElementById('tisya-character-group').hidden);assert(await p.locator('#tisya-character-group').evaluate(n=>n.hidden));
 check('character/group Settings button returns through the same route');
 for(const width of [320,430,900]){await p.setViewportSize({width,height:900});for(const tab of ['play','mode','world','api','data','theme']){await p.evaluate(tab=>fx.openFeature(tab),tab);assert(await p.locator('#feature').evaluate(n=>n.scrollWidth<=n.clientWidth+1));assert.equal(await p.locator('#feature [role=status]').filter({hasText:/is not a function|undefined/}).count(),0);if(width===320&&['play','api'].includes(tab))await p.screenshot({path:qa+'/feature-'+tab+'-'+width+'.png'});}}
 check('six real configuration tabs fit three viewport widths with explicit settings return');
 await p.evaluate(()=>fx.openFeature('play'));const language=p.getByRole('combobox',{name:'默认语言',exact:true});await language.selectOption('"繁体中文"');assert.equal(await p.evaluate(()=>fx.config.requestLeave().allowed),false);await p.getByRole('button',{name:'返回设置',exact:true}).click();assert(await p.locator('#feature').isVisible());await p.getByRole('button',{name:'保存配置',exact:true}).click();await p.waitForFunction(()=>fx.config.requestLeave().allowed);await p.getByRole('button',{name:'返回设置',exact:true}).click();assert(await p.locator('#tisya-settings-home').isVisible());
 check('feature draft blocks return until explicit save, then returns to settings');
};
