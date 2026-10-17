import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sheetCatalog} from '../../tables/foundation/catalog.js';
import {build} from 'esbuild';
const output=new URL('./dist/',import.meta.url);await mkdir(output,{recursive:true});
const catalog=sheetCatalog(),css=await readFile(new URL('./style.css',import.meta.url),'utf8');
const bundle=await build({absWorkingDir:fileURLToPath(new URL('../../',import.meta.url)),stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),sourcefile:'foundation-preview-entry.js',contents:`import {sheetCatalog} from './tables/foundation/catalog.js';import {createSheetEngine} from './tables/foundation/engine.js';import {valueValid} from './tables/schema.js';import {mountFoundationSheet} from './preview/foundation-sheet/ui.js';const catalog=sheetCatalog();const engine=createSheetEngine(catalog,valueValid);const controller=mountFoundationSheet(document.querySelector('main'),engine,catalog,{download(name,text){const url=URL.createObjectURL(new Blob([text],{type:name.endsWith('.txt')?'text/plain;charset=utf-8':'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});window.addEventListener('beforeunload',event=>{if(controller.isDirty()){event.preventDefault();event.returnValue='';}});`},bundle:true,format:'iife',platform:'browser',target:'chrome110',write:false,charset:'utf8'});
const script=bundle.outputFiles[0].text;
const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>缇斯亚 · 基础表单</title><style>'+css+'</style></head><body><main></main><script>'+script.replaceAll('</script','<\\/script')+'</script></body></html>';
const manifest={format:'tisya.foundation-sheet-build/1',templates:catalog.templates.length,fields:catalog.templates.reduce((n,t)=>n+t.fields.length,0),htmlSha256:createHash('sha256').update(html).digest('hex'),status:'isolated-preview-not-installed',remoteResources:0};
for(const [name,content]of Object.entries({'foundation-sheet.html':html,'catalog.json':JSON.stringify(catalog,null,2),'manifest.json':JSON.stringify(manifest,null,2)})){
 const file=new URL(name,output);if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==content)throw Error('Foundation preview stale: '+name);}else await writeFile(file,content);
}
console.log(fileURLToPath(output));
