import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({absWorkingDir:root,entryPoints:['v3/runtime-source/index.mjs'],outfile:'v3/host-runtime.mjs',bundle:true,format:'esm',platform:'browser',target:'chrome110',loader:{'.txt':'text'},external:['/scripts/*'],write:false,charset:'ascii'});
const bytes=result.outputFiles[0].contents,file=new URL('../v3/host-runtime.mjs',import.meta.url);
if(process.argv.includes('--check')){if(!(await readFile(file)).equals(Buffer.from(bytes)))throw Error('v3/host-runtime.mjs is stale');}
else await writeFile(file,bytes);
console.log(JSON.stringify({file:'v3/host-runtime.mjs',bytes:bytes.length,checked:process.argv.includes('--check')}));
