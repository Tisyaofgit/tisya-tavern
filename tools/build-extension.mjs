import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({absWorkingDir:root,entryPoints:['index.js'],outfile:'runtime.js',bundle:true,format:'esm',platform:'browser',target:'chrome110',external:['/script.js','/scripts/*','/lib.js'],write:false,metafile:true,legalComments:'inline',charset:'utf8',minifyWhitespace:true});
// Every asset-owning module currently lives at the extension root. Reject a
// future nested import.meta.url instead of silently changing its asset base.
for(const name of Object.keys(result.metafile.inputs)){
 if(path.dirname(name)!=='.'&&(await readFile(path.join(root,name),'utf8')).includes('import.meta.url'))throw Error('Nested module URL needs explicit rebasing: '+name);
}
const bytes=result.outputFiles[0].contents,file=path.join(root,'runtime.js');
if(process.argv.includes('--check')){const current=await readFile(file);if(!current.equals(Buffer.from(bytes)))throw Error('runtime.js is stale; run npm run build:extension');}
else await writeFile(file,bytes);
console.log(JSON.stringify({file:'runtime.js',localModules:Object.keys(result.metafile.inputs).length,bytes:bytes.length,externalImports:result.metafile.outputs['runtime.js'].imports.length,checked:process.argv.includes('--check')}));
