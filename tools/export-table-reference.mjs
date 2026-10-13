import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defaultRegistry} from '../tables/schema.js';
import {defaultWorld,emptyConfig} from '../config/core.js';
import {pairedPreset} from '../tables/paired-preset.js';
import {AUX_TASKS} from '../tables/prompts.js';
const configuration={data:emptyConfig(),world:defaultWorld()},reg=defaultRegistry(),entries=pairedPreset({task:'tableArchive',configuration}).entries;
const label=process.env.TISYA_DOC_LABEL??JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url))).version.split('-').at(-1).replaceAll('.','');
let out='# '+label+' · 记忆归档 · 完整预设与基础表单\n\n此文件直接从本版代码导出。应用内“预设与表单全文”显示已保存的补充要求及实际存档模板。共用身份只列一次，每个任务另列完整运行指令；所有辅助输出为任务 JSON。\n\n## 共用身份提示词\n\n';
for(const [id,text] of Object.entries(entries))if(id!=='tisya_inner_chain')out+='### '+id+'\n\n```text\n'+text+'\n```\n\n';
for(const [id,t] of Object.entries(AUX_TASKS))out+='## '+t.name+' · '+id+'\n\n```text\n'+pairedPreset({task:id,configuration}).entries.tisya_inner_chain+'\n```\n\n';
out+='## 基础表单\n\n所有行还有稳定 ID、版本、来源与 access（读者／知情者）信息；它们不等于人物共同知情。\n\n';
const cell=s=>String(s).replaceAll('|','\\|').replaceAll('\n','<br>');
for(const group of ['tables','types'])for(const t of reg[group]){out+='### '+t.name+' · '+t.id+'\n\n'+(t.owner?'填录职责：'+t.owner+'。\n\n':'')+(t.aliases.length?'别名：'+t.aliases.join('、')+'。\n\n':'')+'| 字段 | 类型 | 必填 | 约束 |\n| --- | --- | --- | --- |\n';for(const [name,f]of Object.entries(t.fields))out+='| '+cell(name)+' | '+cell(f.type)+' | '+(f.required?'是':'否')+' | '+cell(f.values?.join('、')??f.description??(f.fields||f.items||f.formula?JSON.stringify(f):''))+' |\n';out+='\n';}
const path=fileURLToPath(new URL('../docs/'+label+'-presets-and-forms.md',import.meta.url));
if(process.argv.includes('--check')){if(fs.readFileSync(path,'utf8')!==out)throw Error('预设与表单说明未同步');}else fs.writeFileSync(path,out);
console.log(JSON.stringify({tasks:Object.keys(AUX_TASKS).length,tables:reg.tables.length,types:reg.types.length,bytes:Buffer.byteLength(out)}));
