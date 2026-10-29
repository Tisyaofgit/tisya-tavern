// The authoring choice changes the task inside the current delivery envelope;
// it never switches storage, preflight services or the saved configuration.
export function utilityAuthoring(mode){
 const choice=mode.narrative.缇斯亚叙事创作模式;
 if(choice==='场外讨论')return 'Out-of-story discussion: answer the actual creative question, compare proposed choices and explain relevant grounds. Keep proposals unadopted until the user accepts them.';
 if(choice==='总结整理')return 'Summary and organization: organize only the supplied material for the requested purpose, retaining source uncertainty, chronology, ownership and unresolved differences. Separate occurred facts from proposals.';
 return null;
}
export function applyUtilityAuthoring(out,mode){
 const selected=utilityAuthoring(mode);if(!selected)return out;
 const task=selected+' Do not continue the fictional scene, invent player or NPC conduct, advance story time, or turn the discussion into established events. Narrative scene-design controls apply only to quoted or explicitly requested examples; language and applicable user constraints still apply. Keep private reasoning private.';
 const scope='[AUTHORING.MODE]\n'+task+'\n[/AUTHORING.MODE]';
 if(!out.tisya_material_rule_material.includes('[AUTHORING.MODE]'))out.tisya_material_rule_material=out.tisya_material_rule_material.replace('</GlobalWritingRequirements>',scope+'\n</GlobalWritingRequirements>');
 out.tisya_inner_chain=out.tisya_inner_chain.replace(/\[CREATIVE.GUIDE\][\s\S]*?\[\/CREATIVE.GUIDE\]/,'[CREATIVE.GUIDE]\nApply AUTHORING.MODE from GlobalWritingRequirements. Deliver its requested task in body; verify source, player authority, disclosure and the active output skeleton before delivery.\n[/CREATIVE.GUIDE]');
 out.tisya_registry=out.tisya_registry.replace(/<body min="\d+"/, '<body min="0"');
 const delivery='For this out-of-story task, retain the current outer blocks and their order. Body contains the requested discussion or summary as numbered paragraphs; no narrative minimum length applies. Do not fabricate narrative outcomes for the public digests. Do not propose fictional state, variable, event or archive changes; keep any machine blocks empty except the required unchanged snapshot basis and an empty submitted-ID list. Actions, when enabled, offer feasible questions or editorial choices without inventing events.';
 if(!out.tisya_registry.includes(delivery))out.tisya_registry=out.tisya_registry.replace('[/REGISTRY]',delivery+'\n[/REGISTRY]');
 return out;
}
