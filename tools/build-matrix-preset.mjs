import {readFile,writeFile} from 'node:fs/promises';
import {createPreset} from '../matrix/configuration.mjs';
const url=new URL('../presets/Tisya.json',import.meta.url),text=JSON.stringify({...createPreset(),name:'Tisya'},null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(url,'utf8')!==text)throw Error('Stale presets/Tisya.json');}else await writeFile(url,text);
console.log('Matrix preset: complete configured source');
