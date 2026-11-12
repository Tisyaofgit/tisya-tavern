import {readFile,writeFile} from 'node:fs/promises';
import {matrixPreset} from '../engine/config.mjs';
const preset=matrixPreset(),file=new URL('../presets/Tisya.json',import.meta.url),text=JSON.stringify(preset,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==text)throw Error('Tisya.json is stale; build matrix preset');}else await writeFile(file,text);
const order=preset.prompt_order.find(group=>group.character_id===100001)?.order??[],prompts=new Map(preset.prompts.map(row=>[row.identifier,row])),active=order.filter(row=>row.enabled&&prompts.get(row.identifier)?.enabled!==false&&prompts.has(row.identifier)).length;
console.log('Matrix preset: '+active+' active slots; native persona marker retained disabled.');
