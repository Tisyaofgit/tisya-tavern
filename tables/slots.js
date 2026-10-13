import {compactMaterial,PIPES_GUIDE} from './pipes.js';
// Stable material channels shared by manual modes and automatic auxiliary calls.
export const SLOT_NAMES=Object.freeze({source:'当前来源',card:'原卡 AI 须知原文',books:'绑定原始资料',history:'完整历史原文',archive:'已确认记忆',state:'当前表单',preferences:'已确认偏好',plan:'剧情设计候选',genesis:'创世蓝图',tools:'工具结果',toolInstructions:'已选工具定义与用法',toolCalls:'本轮工具调用'});
export function materialSlots(slots){const text=Object.entries(SLOT_NAMES).filter(([key])=>slots[key]!==undefined&&slots[key]!==null&&!(Array.isArray(slots[key])&&!slots[key].length)).map(([key,label])=>'[TISYA.DATA.'+key.toUpperCase()+']\n'+label+'\n'+compactMaterial(slots[key])+'\n[/TISYA.DATA.'+key.toUpperCase()+']').join('\n\n');return text.includes('[PIPES.')?PIPES_GUIDE+'\n\n'+text:text;}
export const SLOT_ROUTER=`[TASK.START]
@ROUTE TISYA.DATA.SOURCE→current-source;ARCHIVE→established-source-records;STATE→form-snapshot;PREFERENCES→confirmed-user-rules;PLAN→conditional-proposals;GENESIS→reviewable-blueprint;TOOLS→source-tagged-tool-results;TOOLINSTRUCTIONS→selected-tool-definitions;TOOLCALLS→actual-call-records
@KEEP slot source IDs,scope,time,permissions and revisions;missing slot stays missing
@DISTINGUISH plans/drafts/tool claims from established facts;unconfirmed preference candidates never become hard rules
@OUTPUT variable commands retain original dialect and belong only inside vars;form proposals are data under extra,never native variable commands
[/TASK.START]`;
export function taskSlots(task,input){
 if(task==='tableAssistant')return {source:{question:input.question,conversation:input.conversation},state:{configuration:input.configuration,editablePaths:input.editablePaths,choices:input.choices,registry:input.registry,rows:input.currentRows,storage:input.storage,history:input.history},tools:input.diagnostics,genesis:input.blueprint};
 const slots={};
 if(input.sourceCardRaw!==undefined)slots.card=input.sourceCardRaw;
 if(input.sourceBooks!==undefined)slots.books=input.sourceBooks;
 if(input.sourceHistory!==undefined)slots.history=input.sourceHistory;
 if(task==='preferenceAnalysis')slots.source={userInput:input.userInput,generationType:input.generationType};
 else slots.source=input.archiveSource??(input.historyText!==undefined?{text:input.historyText,label:input.label,worldTime:input.worldTime}:input.userInput??{goal:input.goal,sourceCard:input.sourceCardRaw===undefined?input.sourceCard:undefined,sourceUser:input.sourceUser});
 slots.state={ruleSources:input.ruleSources,rulePolicy:input.rulePolicy,registry:input.registry,rows:input.currentRows??input.rows??input.baseArchives??[],pending:input.pending,repair:input.repair,objectsSeparate:input.objectsSeparate,nativeRules:input.nativeRules,nativeState:input.nativeState,preferenceContext:input.preferenceContext,readMore:input.readMore,omittedIds:input.omittedIds,fullIds:input.fullIds,instruction:input.instruction,phase:input.phase,window:input.window,focusObjects:input.focusObjects,focusText:input.focusText,playerObjects:input.playerObjects,timelineAnchor:input.timelineAnchor};
 if(input.userSource)slots.source={archiveSource:slots.source,userSource:input.userSource};
 if(input.latestTemporary)slots.archive={latestTemporary:input.latestTemporary};
 if(input.explicitRules||input.styleRules||input.preferences)slots.preferences={explicit:input.explicitRules,style:input.styleRules,rows:input.preferences};
 if(input.dueChecks)slots.state.dueChecks=input.dueChecks;
 if(input.blueprint)slots.genesis=input.blueprint;
 if(input.toolResults?.length)slots.tools=input.toolResults;
 if(input.toolInstructions)slots.toolInstructions=input.toolInstructions;
 if(input.toolCalls?.length)slots.toolCalls=input.toolCalls;
 return slots;
}

export const SLOT_TARGETS=Object.freeze({source:'tisya_current_input',card:'tisya_material_card_extensions',books:'tisya_material_world_context',history:'tisya_material_memory_excerpt',archive:'tisya_material_memory_archive',state:'tisya_material_current_state',preferences:'tisya_material_rule_material',plan:'tisya_material_task_analysis',genesis:'tisya_material_task_material',tools:'tisya_material_tool_result',toolInstructions:'tisya_material_tool_prompt',toolCalls:'tisya_material_tool_calls'});
export function slotText(key,value){return value===undefined||value===null?'':materialSlots({[key]:value});}
export function preprocessTask(task,input){return materialSlots(taskSlots(task,input));}
