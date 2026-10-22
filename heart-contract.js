// Generation contract only. Historical null moods remain readable as written.
export function requireMoodNames(names){
 if(!Array.isArray(names)||!names.length||names.some(n=>typeof n!=='string'||!n.trim()||n!==n.trim()||n==='null'||/[|\r\n<>]/.test(n))||new Set(names).size!==names.length)throw Error('心声表情目录为空或无效，请检查表情图鉴后重试。');
 return [...names];
}
// This is prompt text, not a JSON value. Mood names remain the exact pipe-cell
// values recognized by the reader; the list marker is never part of the name.
export function moodOptions(moods){return requireMoodNames(moods).map(name=>'- '+name).join('\n');}
export function moodSelectionRule(moods){return 'mood 从以下表情名中原样选择一个，不带列表标记或引号：\n'+moodOptions(moods);}
export function heartRule(count,moods){
 return '首尾各按所选方向写'+count+'条心声：开篇接输入，收篇每条都评正文新增的具体变化，观点不得与开篇重复。上下两块心声的内容、观点与笑点不得重复，换词复述也算重复；收篇须以正文新增变化形成不同观察，不重复开篇吐槽。每条1—80字，只评可公开事实，不编造用户言行。每条'+moodSelectionRule(moods);
}

export const titleRule='标题最多8字（含标点；title.text≤8个字符），优先使用贴合本轮情境的意象、梗或典故化用，避免长句概述与直白剧透；地点、时间、世界放在各自字段，不塞进标题。';
