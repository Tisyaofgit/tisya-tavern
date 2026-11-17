import {build} from 'esbuild';
import {readFile,mkdir,copyFile,cp} from 'node:fs/promises';
import {loadNativeHost,provenance} from '../tests/fixtures/native-layers/load-host-fragments.mjs';
// Verify the pinned excerpts before adapting only the test harness's filesystem
// and hash imports for a browser bundle. Product modules are bundled unchanged.
loadNativeHost();
const out=process.argv[2];if(!out)throw Error('Pass an absolute output directory');await mkdir(out,{recursive:true});
const browserFixture={name:'browser-native-fixture',setup(b){b.onLoad({filter:/load-host-fragments\.mjs$/},async args=>{
 let source=await readFile(args.path,'utf8');source=source.replace("import {readFileSync} from 'node:fs';",'').replace("import {createHash} from 'node:crypto';",'').replace(/export const provenance = [^\n]+;/,'export const provenance = '+JSON.stringify(provenance)+';');
 source=source.replace(/ for \(const \[name, block\] of Object\.entries\(blocks\)\) \{[\s\S]*?\n \}/,'');return {contents:source,loader:'js'};
});}};
for(const [entry,name]of [['tests/browser-scene-source.mjs','scene-source'],['tests/browser-source-layer.mjs','source-layer']])await build({entryPoints:[entry],outfile:out+'/'+name+'.bundle.js',bundle:true,format:'esm',platform:'browser',target:'chrome110',plugins:[browserFixture]});
for(const [from,to]of [['tests/browser-scene-source.html','index.html'],['tests/browser-source-layer.html','source-layer.html'],['engine/catalog.json','catalog.json'],['package.json','package.json']])await copyFile(from,out+'/'+to);

await cp('assets/dialogue',out+'/assets/dialogue',{recursive:true});
