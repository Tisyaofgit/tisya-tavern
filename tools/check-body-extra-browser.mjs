import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.TISYA_QA_DIR;if(!out)throw Error('TISYA_QA_DIR required');fs.mkdirSync(out,{recursive:true});
const screenshotDir=process.env.TISYA_SCREENSHOT_DIR;if(screenshotDir)fs.mkdirSync(screenshotDir,{recursive:true});
const result={passed:false,boundary:'Real Chromium CSS/DOM and current application modules; simulated host messages and public helper roots; no real Tavern, Android or external model.',startedUTC:new Date().toISOString(),stage:'dependencies',checks:[],pageErrors:[],consoleErrors:[],requests:[],source:[]};
for(const name of ['tests/browser-body-extra.html','message-ui.js','body-content.js','native-body.js','native-panels.js','prose.js','reader.js']){const content=fs.readFileSync(path.join(root,name));result.source.push({path:name,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});}
const write=()=>fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify({...result,updatedUTC:new Date().toISOString()},null,2)+'\n');
let browser,server;
try{
 let playwright;try{playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch(error){if(process.env.PLAYWRIGHT_MODULE||!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw error;playwright=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));}
 result.stage='launch';write();browser=await playwright.chromium.launch({executablePath:process.env.TISYA_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});result.browserVersion=browser.version();
 result.stage='server';server=http.createServer((req,res)=>{const requestURL=new URL(req.url,'http://local');try{const p=path.resolve(root,'.'+decodeURIComponent(requestURL.pathname));if(!p.startsWith(root+path.sep))throw Error('Path outside repository');const content=fs.readFileSync(p);res.setHeader('Content-Type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.json')?'application/json':p.endsWith('.css')?'text/css':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.webp')?'image/webp':p.endsWith('.png')?'image/png':'text/html');res.end(content);}catch(error){res.statusCode=404;res.end();result.requests.push({path:requestURL.pathname,status:404,error:error.message});}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const base='http://127.0.0.1:'+server.address().port;
 const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'});page.on('pageerror',error=>result.pageErrors.push(error.stack??error.message));page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push(message.text());});
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(!['http:','https:'].includes(url.protocol)||url.origin===base)return route.continue();result.requests.push({url:url.href,status:'external-blocked'});return route.abort();});
 for(const width of [1280,390])for(const mode of ['static','native']){
  result.stage='page:'+width+':'+mode;write();await page.setViewportSize({width,height:1000});await page.goto(base+'/tests/browser-body-extra.html?mode='+mode,{waitUntil:'load'});await page.waitForFunction(()=>window.fixture?.ready===true,{timeout:15000});
  if(width===390)await page.getByRole('button',{name:'390px 内容',exact:true}).click();
  await page.getByRole('button',{name:'运行当前检查',exact:true}).click();await page.waitForFunction(()=>window.fixture?.lastReport!==null&&window.fixture?.lastReport!==undefined,{timeout:15000});
  const report=await page.locator('#report').textContent(),value=JSON.parse(report);result.checks.push(value);write();
  if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'body-extra-'+mode+'-'+width+'.png'),fullPage:true});
  assert.equal(value.passed,true,JSON.stringify({width,mode,checks:value.checks,error:value.error}));assert.equal(value.before.viewportWidth,width);
 }
 assert.deepEqual(result.pageErrors,[]);assert.equal(result.requests.some(row=>row.status==='external-blocked'),false,'Fixture requested an external resource');result.passed=true;result.stage='complete';
}catch(error){result.error={name:error.name,message:error.message,stack:error.stack};console.error(error.stack??error);process.exitCode=1;}
finally{result.finishedUTC=new Date().toISOString();write();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({passed:result.passed,stage:result.stage,checks:result.checks.length,output:path.join(out,'browser-result.json')}));}
