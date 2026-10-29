export const FAST_RESPONSE_ID='tisya_fast_response';
export const FAST_RESPONSE_BLOCK=`[FAST.RESPONSE]
[RESPONSE SPEED: FAST]
@MODEL SILENT THINKING: OFF
Begin the requested deliverable promptly. Use one concise planning pass and one final structural check; focus attention on scene causality, character intent, viewpoint and the complete output skeleton.
Preserve the selected prose length, characterization, creative craft, evidence and permission requirements. Use tools when needed to resolve a material dependency; batch independent calls and reuse results from this turn.
PROHIBITED: repeated planning loops, procedural preambles, or omitting required blocks to reduce latency.
[/FAST.RESPONSE]`;
export const QUALITY_PRESET_SETTINGS=Object.freeze({temperature:1.2,reasoning_effort:'max',verbosity:'high',show_thoughts:true,tool_reasoning_mode:'active_chain',function_calling:true,openai_max_tokens:32768});
export function fastResponseEnabled(mode){
 if(mode.极速模式!==undefined&&typeof mode.极速模式!=='boolean')throw Error('极速模式须为布尔值');
 return mode.极速模式===true;
}
