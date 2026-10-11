import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),vendor=path.join(root,'vendor/reply-ui'),p=JSON.parse(fs.readFileSync(path.join(vendor,'provenance.json'),'utf8'));
for(const [name,hash]of Object.entries(p.files))if(createHash('sha256').update(fs.readFileSync(path.join(vendor,name))).digest('hex')!==hash)throw Error('Original reply UI changed: '+name);
for(const [name,hash]of Object.entries(p.art))if(createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')!==hash)throw Error('Original control art changed: '+name);
const layout=fs.readFileSync(path.join(vendor,'water-layout.html'),'utf8'),view=fs.readFileSync(path.join(vendor,'water-view.cjs'),'utf8'),controls=fs.readFileSync(path.join(vendor,'water-controls.cjs'),'utf8');
const task=layout.slice(layout.indexOf('<section class="task-region"'),layout.indexOf('</section>')+10),next=layout.slice(layout.indexOf('<div class="next-heading"'),layout.indexOf('<div class="action-heading"'));
if(!task.includes('task-toggle')||!next.includes('next-toggle'))throw Error('Original layout boundary changed');
const section=view.slice(view.indexOf('function section(parent,'),view.indexOf("section($('#task-content')"));
if(!section.endsWith('}\n'))throw Error('Original ledger boundary changed');
const css=controls.split('const WATER_CONTROL_CSS=`')[1].split('`;')[0].replaceAll('LXGW WenKai','TisyaReading');
const decorate=controls.slice(controls.indexOf('function decorateWaterControl('),controls.indexOf('module.exports='));
const output='// Generated from byte-preserved r243 water UI. Do not edit.\n'+
 'export const TASK_TEMPLATE='+JSON.stringify(task)+';\nexport const NEXT_TEMPLATE='+JSON.stringify(next)+';\nexport const WATER_CONTROL_CSS='+JSON.stringify(css)+';\n'+decorate+'export {decorateWaterControl};\n'+
 'export function mountOriginalLedger(doc,parent,title,rows,kind="ledger"){const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};\n'+section+'section(parent,title,rows,kind);return parent.lastElementChild;}\n';
const dest=path.join(root,'reply-ui-original.js');if(process.argv.includes('--check')){if(fs.readFileSync(dest,'utf8')!==output)throw Error('Reply UI bundle stale');}else fs.writeFileSync(dest,output);
console.log('Original task/next templates, ledger and control art verified');
