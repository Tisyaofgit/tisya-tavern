// Optional, world/mode-scoped adaptation. Missing settings preserve the legacy
// protocol byte-for-byte; the verified vendor source remains unchanged.
export const INITIATIVE_LEVELS=Object.freeze([['','沿用原设置'],['自主互动','自主互动'],['主动推进','主动推进']]);
export function initiativeBlockers(mode){
 const n=mode.narrative,missing=[];
 if(n.缇斯亚当前任务!=='叙事')missing.push('当前任务需为叙事');
 if(n.缇斯亚叙事创作模式!=='互动叙事')missing.push('创作模式需为互动叙事');
 if(!n.缇斯亚叙事角色自主)missing.push('角色自主未开启');
 for(const step of ['人物反应','行动与剧情'])if(!n.缇斯亚叙事步序.includes(step))missing.push(step+'未开启');
 return missing;
}
export function initiativeNotice(mode){
 if(mode.角色主动性===undefined)return '沿用现有角色自主规则，尚未选择新的主动性档位。';
 const missing=initiativeBlockers(mode);
 return missing.length?'已保留所选档位，本次配置不启用：'+missing.join('；')+'。':'已选择'+mode.角色主动性+'；保存后由配套预设用于下一次互动叙事。';
}
export function selectedInitiative(mode,compiled){
 return compiled.prose&&mode.角色主动性!==undefined&&!initiativeBlockers(mode).length&&compiled.checks.initiative&&compiled.checks.resolve?mode.角色主动性:null;
}
const rules={
 自主互动:'Character-led interaction: let characters express their own feelings, judgments and preferences, initiate topics, make proposals, refuse, or take immediate small actions that develop the exchange. PROHIBITED: reducing their participation to paraphrase, assent, or returning every question to the player. ',
 主动推进:'Proactive scene progression: let characters pursue their objectives, ongoing business and present opportunities through contact, demands, refusals, maintained commitments, or consequential choices that create a concrete situation for the player to respond to. NPC agency requires no player-written outline or itemized advance permission. '
};
const shared='Apply the selected permissions for player speech, action, interiority and consequential choices independently; they do not make NPC reactions or autonomous conduct contingent on player approval. A character’s proposal or decision does not establish player consent, complete a joint activity, or change a relationship by itself. Return control at the selected decision boundary; explicit scene scope and prohibitions remain binding. Ground conduct in the character’s actual knowledge, disposition, competence, resources and causal circumstances. PROHIBITED: inventing past experiences or disclosing secrets to manufacture a turn. Allow divergent intentions, failed plans and quiet companionship. PROHIBITED: imposing conflict, accidents or a mandatory surprise each turn in the name of initiative. Actions actually enacted this turn and their warranted consequences may establish new facts; unexecuted plans, candidate developments and unknown outcomes remain unsettled.';
export const LEGACY_INITIATIVE='人物保有独立目标、意愿与已有事务，按实际接触决定是否回应及主动行动。';
export function initiativeRule(level){return level?'角色主动性·'+level+'：'+rules[level]+shared:LEGACY_INITIATIVE;}
export function prepareInitiative(compiled,mode){
 const level=selectedInitiative(mode,compiled);
 if(level)compiled.stepwiseRules.A06='接续当前现场与玩家输入开展互动叙事；人物自主行为由所选角色主动性规则决定，玩家控制权限与明确停点仍有效。';
 return level;
}
export function applyInitiative(text,level,detail){
 if(!level)return text;
 const from=detail==='full'?'@LIMIT !cancel existing affairs for player/plot;allow supported initiative from the character’s own goals':LEGACY_INITIATIVE;
 if(text.split(from).length!==2)throw Error('角色主动性规则来源发生变化，请核对当前预设');
 text=text.replace(from,(detail==='full'?'@LIMIT !cancel existing affairs for player/plot;':'')+initiativeRule(level));
 // Generated current actions are not fabricated past facts. Keep this distinction
 // at the result consumer as well as at the character-choice owner.
 if(detail!=='full')text=text.replace('settled results and actual state changes from supplied sources','settled results and actual state changes from source facts and actions enacted this turn; plans and proposals alone are not completed events');
 return text;
}
