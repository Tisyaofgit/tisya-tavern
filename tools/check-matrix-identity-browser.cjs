const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=process.env.TISYA_QA_DIR;assert(out,'TISYA_QA_DIR required');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{try{const p=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!p.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.json')?'application/json':p.endsWith('.css')?'text/css':p.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const errors=[],checks=[];let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.TISYA_CHROMIUM,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
  const settle=()=>page.waitForFunction(()=>window.fixture&&!document.querySelector('[aria-busy=true]'));
  await page.goto(base+'/tests/browser-matrix-identity.html');await settle();
  assert.deepEqual(await page.evaluate(()=>fixture.data.globals),[]);assert.equal(await page.locator('[data-role-create]').isVisible(),true);
  assert.equal(await page.locator('footer').count(),1);
  assert.deepEqual(await page.locator('footer button').allTextContents(),['取消修改','保存']);
  assert.equal(await page.getByRole('button',{name:/保存/}).count(),1);
  for(const width of [320,390,709]){
   await page.setViewportSize({width,height:844});await page.locator('[data-contractor-wish] details').last().evaluate(e=>e.open=true);
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,footerBottom:document.querySelector('footer').getBoundingClientRect().bottom,checks:[...document.querySelectorAll('[data-wish-option]')].map(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {w:r.width,h:r.height,right:p.right-r.right};})}));
   assert.equal(metrics.overflow,false,JSON.stringify({width,metrics}));for(const m of metrics.checks){assert.equal(m.w,22);assert.equal(m.h,22);assert(Math.abs(m.right)<2);}
   assert(metrics.footerBottom<=844,JSON.stringify({width,footerBottom:metrics.footerBottom}));
   await page.locator('[data-role-content]').scrollIntoViewIfNeeded();
   assert.equal(await page.locator('footer').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),true);
   checks.push({width,checkboxes:metrics.checks.length,overflow:false});
  }
  await page.setViewportSize({width:390,height:844});await page.locator('[data-identity-picker]').selectOption('b');await settle();assert.equal(await page.evaluate(()=>fixture.data.active),'a');
  await page.locator('[data-identity-wish]').fill('我想去海边看潮汐。');
  await page.locator('[data-role-name]').fill('观潮人');await page.locator('[data-role-content]').fill('姓名：观潮人\n守着海岸灯塔的旅人。');await page.locator('[data-role-create-confirm]').check();
  await page.getByRole('button',{name:'保存',exact:true}).click();await settle();assert.equal(await page.evaluate(()=>fixture.c.chatMetadata.persona),'b');
  assert.equal(await page.evaluate(()=>fixture.config.read().story.userName),'观潮人');assert.deepEqual(await page.evaluate(()=>fixture.data.globals),[]);await page.reload();await settle();
  assert.equal(await page.locator('[data-identity-wish]').inputValue(),'我想去海边看潮汐。');assert.equal(await page.evaluate(()=>fixture.data.books.基点书.length),1);assert.equal(await page.evaluate(()=>fixture.c.chat[0].name),'旧署名');
  await page.locator('[data-identity-wish]').fill('留在草稿里的文字');await page.getByRole('button',{name:'返回',exact:true}).click();
  assert.equal(await page.getByRole('dialog').count(),1);await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await page.locator('[data-identity-wish]').inputValue(),'留在草稿里的文字');
  await page.getByRole('button',{name:'取消修改',exact:true}).click();await settle();assert.equal(await page.locator('[data-identity-wish]').inputValue(),'我想去海边看潮汐。');
  await page.evaluate(()=>fixture.failChat(true));await page.locator('[data-identity-picker]').selectOption('a');await settle();assert.equal(await page.evaluate(()=>fixture.data.active),'b');
  await page.getByRole('button',{name:'保存',exact:true}).click();await settle();assert.equal(await page.evaluate(()=>fixture.identity.hasPending()),true);
  await page.reload();await settle();await page.getByRole('button',{name:'保存',exact:true}).click();await settle();assert.equal(await page.evaluate(()=>fixture.identity.hasPending()),false);
  await page.screenshot({path:path.join(out,'identity-mobile.png'),fullPage:true});await page.locator('[data-contractor-wish]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'identity-viewport.png')});checks.push('native picker + real identity/config services, persisted wish/role, reload and interrupted-save recovery');
  await page.goto(base+'/tests/browser-matrix-identity.html?screen=config');await settle();
  for(const width of [320,390,709]){await page.setViewportSize({width,height:844});for(const tab of ['游玩偏好','多媒体资源','回复格式','完整预设','生成设置']){await page.getByRole('button',{name:tab,exact:true}).click();await settle();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,width+':'+tab);assert.equal(await page.locator('.tisya-matrix-config select:not(.tisya-select select)').count(),0,tab+': all selects styled');}}
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'游玩偏好',exact:true}).click();await page.screenshot({path:path.join(out,'config-mobile.png'),fullPage:true});await page.screenshot({path:path.join(out,'config-viewport.png')});checks.push('five configuration tabs at 320/390/709px');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify({passed:true,checks,errors,boundary:'Chromium real CSS/UI and application services; isolated storage/book adapters; no external model or Android test'},null,2));console.log(JSON.stringify({passed:true,checks,errors}));
 }catch(error){
  fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify({passed:false,checks,errors,error:error.stack,boundary:'Failed browser run; no successful CSS/UI or Android claim'},null,2));throw error;
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
