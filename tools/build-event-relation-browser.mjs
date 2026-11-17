import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
const out=process.argv[2];if(!out?.startsWith('/workspace/'))throw Error('Pass a preview path under /workspace');await mkdir(out,{recursive:true});
await build({entryPoints:['tests/browser-event-relation.mjs'],outfile:out+'/event-relation.bundle.js',bundle:true,format:'esm',platform:'browser',target:'chrome110'});
for(const [from,to]of [['tests/browser-event-relation.html','index.html'],['engine/catalog.json','catalog.json'],['package.json','package.json']])await copyFile(from,out+'/'+to);

const hash=createHash('sha256').update(await readFile(out+'/event-relation.bundle.js')).digest('hex');await writeFile(out+'/index.html',(await readFile(out+'/index.html','utf8')).replace('<output id="state">','<p id="build">本次构建 '+hash.slice(0,16)+'</p><output id="state">'));
