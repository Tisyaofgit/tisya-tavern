// Isolated real-browser geometry test. It does not connect a live tavern,
// invoke a model, or claim Android coverage. Existing evidence is never replaced.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=process.env.TISYA_QA_DIR;
 assert(out,'TISYA_QA_DIR required');fs.mkdirSync(out,{recursive:true});
 const label=process.env.TISYA_QA_LABEL||'legacy-scroll';
 assert(/^[a-z0-9-]+$/.test(label),'TISYA_QA_LABEL must be a filename-safe label');
 const resultPath=path.join(out,label+'-result.json'),errorPath=path.join(out,label+'-error.log');
 assert(!fs.existsSync(resultPath)&&!fs.existsSync(errorPath),'Use a new label; previous evidence is retained');
 const errors=[],checks=[];let server,browser,phase='load-browser-library';
 const startedAt=new Date().toISOString();
 const boundary='Isolated Chromium CSS/scroll test with real identity UI and mocked persistence; no native host, model, or Android test';
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  phase='start-local-server';
  server=http.createServer((req,res)=>{try{
   const p=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
   if(!p.startsWith(root+path.sep))throw Error('path');
   res.setHeader('Content-Type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(p));
  }catch{res.statusCode=404;res.end();}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  phase='launch-browser';
  browser=await chromium.launch({executablePath:process.env.TISYA_CHROMIUM,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.stack??e.message));
  phase='measure-layout';
  await page.goto('http://127.0.0.1:'+server.address().port+'/tests/browser-legacy-identity.html');await page.waitForFunction(()=>window.fixture);
  for(const viewport of [{width:320,height:844},{width:390,height:844},{width:709,height:844},{width:844,height:390},{width:390,height:420}]){
   await page.setViewportSize(viewport);
   const metrics=await page.evaluate(()=>{
    const form=document.querySelector('.tisya-user'),scroll=document.querySelector('.tisya-identity-scroll'),footer=document.querySelector('.tisya-settings-actions');
    scroll.scrollTop=0;const r=form.getBoundingClientRect(),s=scroll.getBoundingClientRect(),f=footer.getBoundingClientRect();
    return {formBottom:r.bottom,scrollTop:s.top,scrollBottom:s.bottom,clientHeight:scroll.clientHeight,scrollHeight:scroll.scrollHeight,footerTop:f.top,footerBottom:f.bottom,overflow:document.documentElement.scrollWidth>innerWidth+1,viewportHeight:innerHeight};
   });
   assert(metrics.clientHeight>40,JSON.stringify({viewport,metrics}));
   assert(metrics.scrollHeight>metrics.clientHeight+50,JSON.stringify({viewport,metrics}));
   assert(metrics.footerBottom<=viewport.height+1,JSON.stringify({viewport,metrics}));
   assert(metrics.scrollBottom<=metrics.footerTop+1,JSON.stringify({viewport,metrics}));
   assert.equal(metrics.overflow,false,JSON.stringify({viewport,metrics}));
   const box=await page.locator('.tisya-identity-scroll').boundingBox();
   await page.mouse.move(box.x+box.width/2,box.y+Math.min(30,box.height/2));await page.mouse.wheel(0,500);
   await page.waitForFunction(()=>document.querySelector('.tisya-identity-scroll').scrollTop>0);
   await page.locator('[data-user-action="export-draft"]').scrollIntoViewIfNeeded();
   const reached=await page.locator('[data-user-action="export-draft"]').evaluate(e=>{const r=e.getBoundingClientRect(),s=document.querySelector('.tisya-identity-scroll').getBoundingClientRect();return r.top>=s.top-1&&r.bottom<=s.bottom+1;});
   assert.equal(reached,true,JSON.stringify({viewport,metrics}));
   assert.equal(await page.locator('.tisya-settings-actions').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight+1),true);
   checks.push({viewport,metrics,actualWheelScrolled:true,lastControlReachable:true});
  }
  assert.equal(await page.evaluate(()=>fixture.writes()),0);assert.deepEqual(errors,[]);
  fs.writeFileSync(resultPath,JSON.stringify({passed:true,startedAt,finishedAt:new Date().toISOString(),phase,checks,errors,boundary},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({passed:true,resultPath,checks:checks.length,boundary}));
 }catch(error){
  const raw=error.stack??String(error);fs.writeFileSync(errorPath,raw+'\n',{flag:'wx'});
  fs.writeFileSync(resultPath,JSON.stringify({passed:false,startedAt,finishedAt:new Date().toISOString(),phase,checks,errors,error:raw,boundary},null,2)+'\n',{flag:'wx'});
  throw error;
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
