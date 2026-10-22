import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defaultRegistry} from '../tables/schema.js';
import {defaultWorld,emptyConfig} from '../config/core.js';
import {pairedPreset} from '../tables/paired-preset.js';
import {AUX_TASKS} from '../tables/prompts.js';
const configuration={data:emptyConfig(),world:defaultWorld()},reg=defaultRegistry();
const label=process.env.TISYA_DOC_LABEL??JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url))).version.split('-').at(-1).replaceAll('.','');
let out='# '+label+' · 表单专用预设与基础表单\n\n此文件直接从本版运行编译器导出。下列每项任务各有完整的授权、预处理路由、内部填表流程和规范，不借用其他任务的规则。资料槽由本次任务填入完整原始资料；运行脚本与显示实现留在宿主。内部流程不作为可见思维过程输出，辅助任务交付各自运行契约规定的简表；程序解码为内部对象后，仍执行原有字段、来源、权限、版本与引用校验。\n\n';
for(const [task,spec] of Object.entries(AUX_TASKS)){
 const preset=pairedPreset({task,configuration}),byId=new Map(preset.prompts.map(p=>[p.identifier,p]));
 out+='## '+spec.name+' · '+task+'\n\n';
 for(const item of preset.prompt_order[0].order){
  const p=byId.get(item.identifier);if(!item.enabled||!p.enabled)continue;
  out+='### '+p.identifier+' · '+p.role+'\n\n';
  if(p.tisyaMaterialSlot)out+='资料槽：'+p.tisyaMaterialSlot+'。本轮任务将对应完整原始资料注入此处；没有资料时为空。\n\n';
  else if(p.tisyaSelectedResources)out+='当前任务已选择的附加资源。没有选择时为空。\n\n';
  else {const ticks='`'.repeat(Math.max(3,...[...p.content.matchAll(/`+/g)].map(m=>m[0].length+1)));out+=ticks+'text\n'+p.content+'\n'+ticks+'\n\n';}
 }
}
out+='## 基础表单\n\n所有行还有稳定 ID、版本、来源与 access（读者／知情者）信息；它们不等于人物共同知情。\n\n';
const cell=s=>String(s).replaceAll('|','\\|').replaceAll('\n','<br>');
for(const group of ['tables','types'])for(const t of reg[group]){out+='### '+t.name+' · '+t.id+'\n\n'+(t.owner?'填录职责：'+t.owner+'。\n\n':'')+(t.aliases.length?'别名：'+t.aliases.join('、')+'。\n\n':'')+'| 字段 | 类型 | 必填 | 约束 |\n| --- | --- | --- | --- |\n';for(const [name,f]of Object.entries(t.fields))out+='| '+cell(name)+' | '+cell(f.type)+' | '+(f.required?'是':'否')+' | '+cell(f.values?.join('、')??f.description??(f.fields||f.items||f.formula?JSON.stringify(f):''))+' |\n';out+='\n';}
const path=fileURLToPath(new URL('../docs/'+label+'-presets-and-forms.md',import.meta.url));
if(process.argv.includes('--check')){if(fs.readFileSync(path,'utf8')!==out)throw Error('预设与表单说明未同步');}else fs.writeFileSync(path,out);
console.log(JSON.stringify({tasks:Object.keys(AUX_TASKS).length,tables:reg.tables.length,types:reg.types.length,bytes:Buffer.byteLength(out)}));
