import {readFile,writeFile} from 'node:fs/promises';
const dir=new URL('../worldbook/',import.meta.url),read=n=>readFile(new URL(n,dir),'utf8');
let html=await read('template.html');
html=html.replace(/^let books=.*$/m,'let books=[];').replace(/^const seed=.*$/m,'const seed=[];').replace(/^let entries=seed\.map.*$/m,'let entries=[];');
html=html.replace('__CATALOG__',await read('native-catalog.json')).replace('__FONT__','reading.woff2');
html=html.replace('</style>',await read('console-v2.css')+'\n'+await read('console-v3.css')+'\nbody{font-family:TisyaReading,Reading,system-ui,sans-serif}\n</style>');
html=html.replace('<script>','<script>window.__TISYA_WORLDBOOK_HOST__=true;');
html=html.replace('render();\n</script>',await read('console-v2.js')+'\n'+await read('console-v3.js')+'\n'+await read('console-v4.js')+'\n</script>');
// No demonstration records are loaded in the production entry point.
if(html.includes('北峡 · 世界设定')||html.includes('顾槐会要求'))throw Error('Demo data leaked into production');
const out=new URL('console.html',dir);
if(process.argv.includes('--check')){if(await readFile(out,'utf8')!==html)throw Error('worldbook/console.html is stale');}else await writeFile(out,html);
console.log(JSON.stringify({file:'worldbook/console.html',bytes:Buffer.byteLength(html),checked:process.argv.includes('--check')}));
