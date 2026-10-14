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
 自主互动:'让人物主动表达自己的感受、判断和偏好，发起话题、提议、拒绝或做出当下的小动作，以具体言行推进眼前互动；不只复述玩家、赞同或把问题抛回去。',
 主动推进:'让人物依据自身目标、已有事务与当前机会主动采取行动，包括发起接触、提出要求、拒绝配合、坚持安排或作出有代价的选择，让局面出现玩家可以回应的具体变化；不等待玩家设计大纲或逐项授权 NPC 行动。'
};
const shared='玩家代写、重大选择和内心描写仍各按已选权限执行；这些权限不要求 NPC 的个人反应与自主行动先获玩家许可。人物的提议与决定不等于玩家已同意，不自动完成共同活动或改变双方关系。在需要玩家回应的重要节点按所选停点交还回合；明确限定的片段和禁令仍有效。依据人物实际知情、性格、能力、资源与因果展开，不虚构既往经历或靠泄露秘密制造转折。允许人物间不同意愿和计划落空，也允许平静相处；不为主动性强塞冲突、事故或每轮必有的惊喜。本轮实际展开的新行为及其合理后果可以成为新事实；未执行计划、候选发展和未知结果仍为未定。';
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
