import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {compileFullNarrative,compileFullPreflight,toImportablePreset,presetText,PROTECTED_KEYS,fullSourceEntries} from '../v3/preset.mjs';

// Export the complete static rules from the actual V3 compilers. Runtime data
// belongs to the paired plugin and must never be frozen into an import file.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.argv[2]??path.join(root,'exports'));
const registry=JSON.parse(fs.readFileSync(path.join(root,'v3/runtime-source/config/registry.json'),'utf8'));
const dynamic=new Set(['tisya_material_task_material','tisya_material_environment','tisya_material_gameplay','tisya_material_lorebook','tisya_material_current_state','tisya_material_memory_archive','tisya_material_world_progression','tisya_material_foreshadow','tisya_material_tool_result','tisya_material_card_extensions','tisya_current_input','chatHistory','chatHistory／当前user']);
const narrative=compileFullNarrative({snapshot:{rows:[],scope:{},creativeBrief:{}},currentUser:''}).filter(m=>!dynamic.has(m.identifier));
const preflight=compileFullPreflight({input:{requestKey:'export-only',view:{registry,rows:[]},archiveSources:[],currentUser:''}}).filter(m=>!dynamic.has(m.identifier));
const source=fullSourceEntries();
for(const messages of [narrative,preflight])for(const id of PROTECTED_KEYS){const original=source.find(x=>x.identifier===id),actual=messages.find(x=>x.identifier===id);assert.equal(actual.content,original.content);assert.equal(actual.role,original.role);}
fs.mkdirSync(output,{recursive:true});
const records=[];
for(const [kind,messages]of [['Narrative',narrative],['Preflight',preflight]]){
 const name=`Tisya_Full_${kind}_EN_V3_W29_20261024`,preset=toImportablePreset(messages,{name});
 preset.extensions.tisya.exportRevision='W29-20261024';
 preset.extensions.tisya.exportKind='complete-static-rules';
 preset.extensions.tisya.dynamicMaterials='Injected by the paired V3 plugin at request time; not included in this export.';
 const contents=JSON.stringify(preset,null,2)+'\n',file=name+'.json';
 fs.writeFileSync(path.join(output,file),contents);
 records.push({file,prompts:messages.length,bytes:Buffer.byteLength(contents),sha256:createHash('sha256').update(contents).digest('hex')});
}
const title='缇斯亚 V3 完整预设 · W29 / 2026-10-24';
fs.writeFileSync(path.join(output,'Tisya_Full_Presets_V3_W29_20261024.txt'),title+'\n\n此导出使用当前 v3/preset.mjs 的完整规则。A 为正文前辅助任务，B 为正文。正文默认简体中文；规则以英文编写。\n两个 JSON 均需配套 V3 插件；单独导入不会补齐身份切换、历史补录或 API 拆分功能。动态档案、原文证据、当前用户输入与工具回执由插件按真实会话注入，没有把测试剧情写进预设。\n规则源版本仍为 tisya.full.v3-w25；W29 是本次重新导出与核验编号，不表示未完成的功能已上线。\n\n'+presetText(preflight,'A — FULL PREFLIGHT')+'\n'+presetText(narrative,'B — FULL NARRATIVE'));
fs.writeFileSync(path.join(output,'preset-export-manifest.json'),JSON.stringify({exportRevision:'W29-20261024',compiler:'v3/preset.mjs',protectedEntries:PROTECTED_KEYS,files:records},null,2)+'\n');
console.log(JSON.stringify(records));
