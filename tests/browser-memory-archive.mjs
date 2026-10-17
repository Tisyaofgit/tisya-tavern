// Offline integration check. Both browser dependencies are supplied explicitly;
// every model answer and worldbook write belongs to the synthetic host fixture.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const source=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
assert(process.env.TISYA_PLAYWRIGHT_MODULE&&process.env.TISYA_CHROMIUM,'Browser dependencies must be supplied explicitly');
const {chromium}=await import(process.env.TISYA_PLAYWRIGHT_MODULE);
const server=createServer(async(req,res)=>{
 try{const file=path.resolve(source,'.'+new URL(req.url,'http://localhost').pathname);assert(file.startsWith(source+path.sep));
  const bytes=await readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(bytes);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const checks=[],errors=[];
try{
 browser=await chromium.launch({executablePath:process.env.TISYA_CHROMIUM,headless:true,args:['--no-sandbox','--single-process','--no-zygote','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/tests/browser-archive-host.html');await page.waitForFunction(()=>!!window.fixture);
 await page.getByLabel('表单功能').selectOption('history');await page.evaluate(()=>fixture.panel.settled());
 const confirm=async()=>{await page.getByRole('button',{name:'确认保留并归档最新回复',exact:true}).click();await page.evaluate(()=>fixture.panel.settled());};
 await page.evaluate(()=>fixture.setResponder(()=>({changes:[],pending:[{reason:'门锁待核'},{reason:'人物待核'}]})));
 await confirm();assert.equal(await page.evaluate(async()=>(await fixture.service.scan())[0].pending.length),2);
 await page.evaluate(()=>fixture.setResponder(()=>({changes:[],pending:[{reason:'人物待核'}]})));await confirm();
 assert.deepEqual(await page.evaluate(async()=>(await fixture.makeService().scan())[0].pending),[{reason:'人物待核'}]);
 const rowText=async()=>{const summary=page.getByText('查看楼层清单',{exact:true});if(!await summary.evaluate(el=>el.parentElement.open))await summary.click();return page.getByRole('row').filter({hasText:'测试开局'}).innerText();};assert.match(await rowText(),/人物待核/);assert.doesNotMatch(await rowText(),/门锁待核/);
 checks.push('partial retry supersedes resolved items in UI and a recreated service');
 await page.evaluate(()=>fixture.setResponder(()=>{throw Error('测试连接中断');}));await confirm();await confirm();
 assert.deepEqual(await page.evaluate(async()=>(await fixture.makeService().scan())[0].pending.map(p=>p.reason)),['人物待核','测试连接中断']);
 assert.equal(await page.evaluate(()=>fixture.service.state().progress.stage),'error');checks.push('repeated failure retains unresolved work without duplicate diagnostics');
 for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push({view:'pending',width,overflow:false});}
 await page.getByLabel('表单功能').selectOption('forms');await page.evaluate(()=>fixture.panel.settled());await page.getByLabel('表单功能').selectOption('history');await page.evaluate(()=>fixture.panel.settled());
 assert.match(await rowText(),/人物待核/);assert.doesNotMatch(await rowText(),/门锁待核/);checks.push('page reload retains only current pending items');
 await page.evaluate(()=>fixture.setResponder(()=>({changes:[]})));await confirm();
 assert.equal(await page.evaluate(async()=>(await fixture.makeService().scan())[0].archived),true);assert.match(await rowText(),/已归档/);
 assert.deepEqual(await page.evaluate(async()=>(await fixture.service.scan())[0].pending),[]);checks.push('successful retry archives the floor and clears current pending without deleting history');
 const manual=await page.evaluate(async()=>{
  fixture.context.chat.push({is_user:true,mes:'继续'},{is_user:false,mes:'下一条回复'});
  const snap=fixture.store.read();snap.data.worlds[snap.key].tables={...snap.world.tables,archive:false};await fixture.store.save(snap.data,snap.revision,snap.key);
  return (await fixture.service.archive({includeLatest:true})).run;
 });assert.equal(manual.status,'complete');assert.equal(manual.completed,1);checks.push('explicit manual archive works with automatic archive disabled');
 const barrier=await page.evaluate(async()=>{
  fixture.context.chat.push({is_user:true,mes:'继续'},{is_user:false,mes:'尚未归档'},{is_user:true,mes:'继续'});
  const snap=fixture.store.read();snap.data.worlds[snap.key].tables={...snap.world.tables,archive:true,offstage:true};await fixture.store.save(snap.data,snap.revision,snap.key);
  const count=fixture.calls.length;try{await fixture.makeService().advance();return {code:'NO_ERROR'};}catch(e){return {code:e.code,newCalls:fixture.calls.length-count};}
 });assert.deepEqual(barrier,{code:'ARCHIVE_INCOMPLETE',newCalls:0});checks.push('manual offstage advancement blocks before any additional model request');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks,errors,realModelCalls:0,realUserWrites:0,android:false}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
