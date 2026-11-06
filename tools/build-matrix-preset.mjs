import {readFile,writeFile} from 'node:fs/promises';
import {matrixPreset} from '../engine/config.mjs';
const file=new URL('../presets/Tisya.json',import.meta.url),text=JSON.stringify(matrixPreset(),null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==text)throw Error('Tisya.json is stale; build matrix preset');}else await writeFile(file,text);
console.log('Matrix preset: 69 active slots; native persona marker retained disabled.');
