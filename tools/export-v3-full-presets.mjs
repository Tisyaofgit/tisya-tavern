import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PROTECTED_KEYS,fullSourceEntries} from '../v3/preset.mjs';
import {createRuntimePreset,TISYA_PRESET_VERSION} from '../v3/preset-template.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.argv[2]??path.join(root,'exports'));
fs.mkdirSync(output,{recursive:true});
const files=[];
for(const [stage,file] of [['writer','Tisya.json'],['preflight','Tisya-Auxiliary-Embedded-Reference.json']]){
 const preset=createRuntimePreset(stage);
 for(const id of PROTECTED_KEYS){const original=fullSourceEntries().find(p=>p.identifier===id),actual=preset.prompts.find(p=>p.identifier===id);assert.equal(actual.content,original.content);assert.equal(actual.role,original.role);}
 if(stage==='writer')assert(preset.prompts.some(p=>p.identifier==='tisya_material_character_card'&&p.content.includes('{{tisya_v3:')));
 if(stage==='writer')assert(preset.prompts.some(p=>p.identifier==='tisya_material_user_identity'&&p.content.includes('{{tisya_v3:')));
 const content=JSON.stringify(preset,null,2)+'\n';fs.writeFileSync(path.join(output,file),content);files.push({file,stage,prompts:preset.prompts.length,bytes:Buffer.byteLength(content),sha256:createHash('sha256').update(content).digest('hex')});
}
fs.writeFileSync(path.join(output,'Tisya-Preset-Guide.txt'),`Tisya 配套预设 · ${TISYA_PRESET_VERSION}\n\n插件启动时自动检测 Tisya 主预设；缺失则创建，版本不符则先备份旧预设再更新。相同版本保留用户编辑。辅助任务预设内嵌于插件，不需要导入辅助 JSON。\n\nTisya.json 是与插件同源的主预设副本。可见资料槽由插件在实际请求中填入：原生世界书前后位置、角色卡、当前用户身份、世界定义、当前档案、记忆、作者注、近期上下文和当前输入。它不能脱离配套插件独立运行；请不要删除当前输入槽。\n\nTisya-Auxiliary-Embedded-Reference.json 仅供审阅内嵌辅助规则。插件配置可选择合并辅助调用，或拆为归档、偏好、推进三步；每步使用对应 API 路由，完整校验后才提交。主预设用于叙事。\n\n预设更新保留连接和模型选择；有旧版本时生成 Tisya backup 时间戳副本。相同版本不重写预设。\n`);
fs.writeFileSync(path.join(output,'preset-export-manifest.json'),JSON.stringify({version:TISYA_PRESET_VERSION,compiler:'v3/preset-template.mjs',protectedEntries:PROTECTED_KEYS,files},null,2)+'\n');
console.log(JSON.stringify(files));
