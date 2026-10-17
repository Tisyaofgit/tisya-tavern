const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=process.env.TISYA_EVIDENCE||path.resolve(root,'../evidence/window5'),qa=process.env.TISYA_QA_DIR||'/tmp/tisya-assistant-qa';fs.mkdirSync(qa,{recursive:true});fs.mkdirSync(out,{recursive:true});
 const result={environment:'Chromium; production UI and identity/table services, isolated in-memory books and deferred model fixture; no real model or user writes; Android untested',layouts:[],flows:[],errors:[]};
 const server=http.createServer((req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',(/\.m?js$/.test(file))?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.TISYA_CHROMIUM,args:['--no-sandbox','--single-process','--no-zygote','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text())});page.on('requestfailed',r=>result.errors.push(r.url()+' '+r.failure()?.errorText));await page.goto('http://127.0.0.1:'+server.address().port+'/tests/browser-identity-host.html');await page.waitForFunction(()=>!!window.fixture);
  for(const width of [320,430,900]){
   await page.setViewportSize({width,height:844});
   for(const view of ['settings','preferences','identity','idea','core','assistant','genesis']){
    await page.evaluate(async view=>{if(view==='settings')fixture.mountSettings();else if(view==='preferences')await fixture.mountConfig();else if(view==='identity')fixture.mount();else await fixture.mountAssistant(view);},view);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width+' '+view);result.layouts.push({width,view});
    if(width===430)await page.screenshot({path:qa+'/'+view+'-430.png',fullPage:true});
   }
  }
  await page.setViewportSize({width:430,height:500});await page.evaluate(()=>fixture.mountAssistant('idea'));
  const action=id=>page.locator('[data-user-action="'+id+'"]');
  await page.locator('[data-goal]').fill('设计一个守灯人，保留谨慎与幽默');await page.evaluate(()=>fixture.gate());await action('generate').click();await page.waitForFunction(()=>fixture.tables.state().busy);
  assert(await action('generate').isDisabled());assert(await page.locator('.tisya-user [role=progressbar]').isVisible());await page.waitForFunction(()=>document.querySelector('.tisya-assistant-app').shadowRoot.querySelector('.tisya-user [role=progressbar]')?.getAttribute('aria-valuenow')==='2');
  await page.evaluate(()=>fixture.emit('人物姓名：林汀\n性格：谨慎，幽默。'));await page.waitForTimeout(450);assert((await page.locator('.tisya-user .tisya-run-view>summary').textContent()).includes('字符'));
  assert.match(await page.evaluate(()=>fixture.ui.navigate('core').then(()=>'',e=>e.message)),/正在进行/);
  result.flows.push('immediate disabled controls; real service stage/elapsed/characters; busy task switch refused');
  await page.screenshot({path:qa+'/progress-short.png',fullPage:true});await page.locator('.tisya-user:visible').getByRole('button',{name:'收起并返回聊天',exact:true}).click();assert.equal(await page.locator('.tisya-assistant-app').count(),0);
  await page.evaluate(()=>fixture.release());await page.waitForFunction(()=>!fixture.tables.state().busy);await page.evaluate(()=>fixture.resumeAssistant());await page.locator('[data-reviewed]').waitFor();assert(await page.locator('[data-proposal-row]').count()>1);result.flows.push('minimize continues same task; resume restores full editable draft');
  const previous=await page.evaluate(()=>fixture.avatar);await action('creation-save').click();assert.match(await page.locator('.tisya-user>p[role=status]').textContent(),/先核对/);await page.locator('[data-reviewed]').check();
  await action('creation-save').click();await page.waitForFunction(()=>!fixture.tables.state().busy);await page.waitForFunction(()=>!fixture.ui.root.shadowRoot.querySelector('[data-reviewed]'));assert.equal(await page.evaluate(()=>fixture.avatar),previous);result.flows.push('review gate; real save adds origin without switching identity');
  await page.evaluate(()=>fixture.ui.navigate('core'));await page.locator('[data-goal]').fill('保留基点的身份');await page.evaluate(()=>fixture.gate());await action('generate').click();await page.waitForFunction(()=>fixture.tables.state().busy);await page.evaluate(()=>fixture.emit('未完整返回的档案'));await page.waitForTimeout(450);
  await page.locator('.tisya-user:visible').getByRole('button',{name:'停止当前任务',exact:true}).click();await page.waitForFunction(()=>!fixture.tables.state().busy);await page.waitForTimeout(450);assert.match(await page.locator('.tisya-user:visible').textContent(),/未完整返回的档案/);assert.equal(await page.locator('[data-reviewed]').count(),0);result.flows.push('stop keeps partial response; no review/save offered for incomplete output');await page.evaluate(()=>fixture.release());
  await page.evaluate(()=>fixture.ui.navigate('assistant'));assert(await page.getByText('缇斯亚 · 配置助手',{exact:true}).isVisible());await page.evaluate(()=>fixture.ui.navigate('core'));assert.equal(await page.locator('[data-goal]').inputValue(),'保留基点的身份');result.flows.push('configuration uses its own review flow; identity task material retained across task switch');
  await page.locator('.tisya-user:visible .identity-picker>summary').click();await page.locator('.tisya-user:visible [data-identity-id="user-b.png"]').click();assert(await page.locator('.tisya-user:visible .identity-picker').evaluate(n=>n.open));await page.locator('.tisya-user:visible .identity-picker [data-user-action=select]').click();await page.waitForFunction(()=>fixture.avatar==='user-b.png');assert.equal(await page.locator('[data-goal]').inputValue(),'保留基点的身份');result.flows.push('top identity picker switches and binds through real service while preserving design notes');
  await page.emulateMedia({reducedMotion:'reduce'});await page.addStyleTag({content:'html{font-size:22px}'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));result.layouts.push({width:430,height:500,view:'short-screen/reduced-motion/large-text'});
  assert.deepEqual(result.errors,[]);result.passed=true;fs.writeFileSync(path.join(out,'assistant-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){fs.writeFileSync(path.join(out,'assistant-browser-failure-'+Date.now()+'.json'),JSON.stringify({...result,error:e.stack},null,2));throw e;}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
