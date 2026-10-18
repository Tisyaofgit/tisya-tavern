import {readFile,writeFile} from 'node:fs/promises';
const dir=new URL('../character-group/',import.meta.url),read=n=>readFile(new URL(n,dir),'utf8');
let app=await read('app.js');app=app.replace(/^let store=.*$/m,'let store={characters:[],groups:[]};').replace("selectedId='night.png',draft=clone(store.characters[0])","selectedId=null,draft=null");
let css=(await read('style.css')).replace('__FONT__','reading-subset.woff2');css+='\nhtml{font-family:var(--tisya-global-font,TisyaReading),TisyaReading,Tisya,serif}.host-float .sidebar,.host-float .main{display:none}.host-float .dock{height:100dvh;max-height:100dvh}.host-float{padding:0}.panel select{width:100%}.error{white-space:pre-wrap}.avatar{overflow:hidden}\n';
const script=app+'\n'+await read('host.js')+'\n'+await read('advanced.js');
const html=(await read('template.html')).replace('__CSS__',()=>css).replace('__CATALOG__',(await read('native-catalog.json')).replaceAll('<','\\u003c')).replace('__JS__',()=>script);
if(html.includes("id:'night.png'"))throw Error('Demo data in production');
const out=new URL('console.html',dir);if(process.argv.includes('--check')){if(await readFile(out,'utf8')!==html)throw Error('character-group console stale')}else await writeFile(out,html);
console.log(JSON.stringify({file:'character-group/console.html',bytes:Buffer.byteLength(html)}));
