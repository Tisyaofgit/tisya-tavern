import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('./demo.js',import.meta.url));
const result=await build({entryPoints:[entry],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',legalComments:'none'});
process.stdout.write(result.outputFiles[0].text);
