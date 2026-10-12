// Generation contract only. Historical null moods remain readable as written.
export function requireMoodNames(names){
 if(!Array.isArray(names)||!names.length||names.some(n=>typeof n!=='string'||!n.trim()||n==='null')||new Set(names).size!==names.length)throw Error('心声表情目录为空或无效，请检查表情图鉴后重试。');
 return [...names];
}
export function heartRule(count,moods){
 return '首尾各按所选方向写'+count+'条心声：开篇接输入，收篇每条都评正文新增的具体变化，观点不得与开篇重复。每条1—80字，只评可公开事实，不编造用户言行。每条mood必选一个表情：'+JSON.stringify(requireMoodNames(moods))+'。';
}
