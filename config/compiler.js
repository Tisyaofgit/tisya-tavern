import {applyTableArchiveMemory} from './memory-output.js';
import {routeStyleRules} from '../tables/style-rules.js';
import {addSlotRouting} from '../tables/modes.js';
import {renderProtocol} from '../settings-core.js';
import {selectWorkflow,condenseWorkflow} from './workflow.js';
import {applyWireContract} from './wire-contract.js';
import {prepareInitiative,applyInitiative} from './initiative.js';
import {KEY,registry,worldKey,defaultWorld,emptyConfig,compileSelected,validateConfig,workflowDetail} from './core.js';
export function modularSource(source){return source.prompts.some(p=>p.content?.includes('{{tisya_config_selected}}'));}
export function currentConfiguration(context,legacy={}){const d=context.extensionSettings[KEY]===undefined?emptyConfig():validateConfig(context.extensionSettings[KEY]);return {data:d,world:d.worlds[worldKey(context)]??defaultWorld(typeof legacy==='function'?legacy():legacy)};}
export function refineCompiled(c,{data,world},source){
 addSlotRouting(c.rest.entries);if(world.mode!=='narrative'){const mode=registry.modes.get(world.mode);if(typeof mode?.compile!=='function')throw Error('该模式的编译接口尚未接入');return mode.compile({compiledBase:c,configuration:{data,world},source});}
 const m=world.modes[world.mode],r=c.stepwiseRules;
 // Main style is an open resource slot, never a built-in style choice.
 r.C01='';if(!m.actions)c.actionRange={下限:0,上限:0};const actor={难度:world.switches.difficulty,中心化:world.switches.centrality};
 const initiative=prepareInitiative(c,m);
 c.rest=renderProtocol(c,{actor});const entries=routeStyleRules(addSlotRouting(c.rest.entries));
 if(!c.prose)return c;
 if(c.outputEnabled){
  applyWireContract(entries);
 }
 const selected=compileSelected(data,world); // Validate resources without copying their material slot.
 entries.tisya_inner_chain=selectWorkflow(entries.tisya_inner_chain,c,m);
 const detail=workflowDetail(m);
 if(detail!=='full')entries.tisya_inner_chain=condenseWorkflow(entries.tisya_inner_chain,c,m,actor,detail);
 entries.tisya_inner_chain=applyInitiative(entries.tisya_inner_chain,initiative,detail);
 entries.tisya_internal_login=entries.tisya_internal_login.replace('narrative:P.1→A.1..A.4→E→C.1..C.5→D.1..D.4;utility:T.1→D.4;then','narrative:P.1→A.1..A.4→E→C.1..C.5→D.1..D.4;then');
 if(detail!=='full')entries.tisya_internal_login=entries.tisya_internal_login.replace(/^@FLOW .*$/m,'@FLOW narrative:'+(detail==='compact'?'WORKFLOW→C.2→D.1..D.4':'C.2→INNER_END')+'→COMMIT.READY→PREPARE_STEP');
 c.workflowDetail=detail;if(world.tables?.enabled&&world.tables.archive!==false)applyTableArchiveMemory(entries);pruneRegistry(entries,c.checks);c.selectedIds=selected.ids;return c;
}

function pruneRegistry(entries,checks){
 if(!checks.regard)entries.tisya_registry=entries.tisya_registry.replace('/!deify player or grant unconditional worship/submission','');
 const text=entries.tisya_registry,rows=text.split(/(?=^@(?:M|F)\.\d{2} )/m),header=rows.shift(),tail='\n[/REGISTRY]';const enabled=new Set(['F.01','F.02','F.03','F.04','F.05','F.06','F.07','F.12']);
 if(checks.resilience)enabled.add('F.08');if(checks.cliche){enabled.add('F.09');enabled.add('F.10');}if(checks.plain_language)enabled.add('F.11');
 const removed=[];entries.tisya_registry=header+rows.filter(row=>{const id=/^@((?:M|F)\.\d{2}) /.exec(row)?.[1];const keep=id?.startsWith('M.')||enabled.has(id);if(!keep)removed.push(id);return keep;}).map(s=>s.replace(/\[\/REGISTRY\]\s*$/,'')).join('')+tail;
 for(const id of removed)for(const key of Object.keys(entries))if(key!=='tisya_registry')entries[key]=entries[key].replaceAll('/@'+id,'').replaceAll('@'+id+'/','').replaceAll('@'+id,'').replace(/^@USE\s*$/gm,'');
}
