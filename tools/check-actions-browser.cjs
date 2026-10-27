// Production action markup/CSS, neutral reply, real Chromium at phone/desktop widths.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.TISYA_ACTION_EVIDENCE;
const rows=[
 ['调查','提起铜铃，对着窗边的光看清裂纹，再问宋遥上次修补留下的位置。','有机会发现旧修补的痕迹，判断这次异响是否来自同一处。'],
 ['交流','把旧工具放回掌心，问陆舟为什么一直留着它。','可能让一句玩笑接上共同经历，打开尚未说透的话题。'],
 ['移动','绕到门廊听一听雨声，顺手查看等在檐下的送货人。','让室内谈话与门外的行程发生交集。'],
 ['休整','靠在窗边喝口热茶，等手指暖起来再试一次。','给紧张的修理过程留出停顿，也可能让人物换一种方式接话。']
];
const html=`<!doctype html><meta charset="utf-8"><style>@font-face{font-family:TisyaReading;src:url('/reading-font.woff2')}*{box-sizing:border-box}body{margin:0;background:#03251e;color:#e3e6d8;font-family:TisyaReading,serif}#fixture{max-width:740px;margin:auto;padding:16px}#send_textarea{width:100%;min-height:48px}#reader{padding:16px}.tisya-reader-tabs{display:flex;gap:8px;flex-wrap:wrap}.tisya-reader-tabs button{min-height:44px}button{cursor:pointer}</style><div id="fixture"></div><textarea id="send_textarea" aria-label="输入框"></textarea><script type="module">
import {mountMessageVisual} from '/message-ui.js';import {mountMessageReader} from '/reader.js';import {onePassReply} from '/tests/fixtures/onepass-reply.js';
const rows=${JSON.stringify(rows)},source=onePassReply().replace(/<actions[^>]*>[\\s\\S]*?<\\/actions>/,'<actions min="4" max="6">\\n'+rows.map(r=>r.join('|')).join('\\n')+'\\n</actions>');
window.chosen=[];window.ready=false;window.openView=kind=>{window.ui?.dispose();const node=document.querySelector('#fixture');node.replaceChildren();const options={source,name:'工坊',formatBody:t=>t,onChooseAction:(text,mode)=>{window.chosen.push({text,mode});document.querySelector('#send_textarea').value=text;},getMotion:()=>false};window.ui=kind==='reader'?mountMessageReader(document,node,{...options,initialTab:'actions'}):mountMessageVisual(document,node,options);window.ready=true;};window.openView('message');
</script>`;
const server=http.createServer((req,res)=>{
 try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(html);}if(url.pathname==='/reading-font.woff2'){res.setHeader('content-type','font/woff2');return res.end(Buffer.concat([1,2,3,4].map(i=>fs.readFileSync(path.join(root,'font/reading.part'+i+'.bin')))));}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('path');const type={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.css':'text/css','.woff2':'font/woff2'}[path.extname(file)]??'application/octet-stream';res.setHeader('content-type',type);res.end(fs.readFileSync(file));
 }catch{res.statusCode=404;res.end();}
});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:process.env.TISYA_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']});const checks=[];
 try{const page=await browser.newPage({deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);await page.evaluate(()=>document.fonts.ready);
  for(const kind of ['message','reader'])for(const width of [320,360,430,900]){
   await page.setViewportSize({width,height:950});await page.evaluate(kind=>window.openView(kind),kind);
   const cards=page.locator('.tisya-reader-actions .action');assert.equal(await cards.count(),4);
   const measurements=await cards.evaluateAll(cards=>cards.map(b=>{const bounds=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};},main=b.querySelector('.text'),hint=b.querySelector('.action-possibility');return {card:bounds(b),main:bounds(main),hint:bounds(hint),type:b.querySelector('.action-type').textContent,mainSize:parseFloat(getComputedStyle(main).fontSize),hintSize:parseFloat(getComputedStyle(hint).fontSize),scroll:b.scrollWidth,client:b.clientWidth};}));
   for(const [i,m]of measurements.entries()){assert.equal(m.type,rows[i][0]);assert(m.card.left>=0&&m.card.right<=width+1,JSON.stringify(m));assert(m.hint.top>=m.main.bottom&&m.hint.bottom<=m.card.bottom,JSON.stringify(m));assert(m.hintSize<m.mainSize);assert(m.scroll<=m.client+1);assert(m.card.height>=44);}
   await cards.first().locator('small').click();assert.deepEqual(await page.evaluate(()=>window.chosen.at(-1)),{text:rows[0][1],mode:'append'});assert.equal(await page.locator('#send_textarea').inputValue(),rows[0][1]);
   if(kind==='message')assert(await page.locator('.action-region img').evaluateAll(async imgs=>{await Promise.all(imgs.map(i=>i.decode()));return imgs.every(i=>i.naturalWidth>0);}));
   if(output&&kind==='message'){fs.mkdirSync(output,{recursive:true});await page.locator('.action-region').screenshot({path:path.join(output,'actions-'+width+'.png')});}
   checks.push({kind,width,cards:measurements.length,overflow:false,smallTextBelow:true,actionOnly:true});
  }
  assert.deepEqual(errors,[]);const result={passed:true,browser:await browser.version(),checks,boundary:'Local Chromium, production modules/CSS and neutral fixture; not Android or installed TauriTavern.'};if(output)fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
