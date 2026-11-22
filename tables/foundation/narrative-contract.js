// Shared by normal turns, initialization and historical intake. These rules
// guide semantic extraction; they are not a claim of automatic fact checking.
export const narrativeFormContract = `填写职责：同一事实选择一个主要归处，其他表通过人物、事件、地点的名称关联。事件记录发生经过；实时状态只填结束时仍成立的新状态，不复述动作过程。衣着外观只写外观，姿态只写姿态，内心只写有授权的心理。行为锚点只登记值得后续复用的独立特征，关联来源事件；单次表现保持单次观察，不将每个动作另造习惯。
事件梗概用于一行索引；完整经过只补梗概不足以保留的关键过程，结果、影响、余波只填尚未表达的独立后果。同一句事实不在这些格里换词复写。事件实际落定后将事件生命周期填为“已结束”，不要仅因切换场景而提前结束。人物认知与误信关联实际来源事件，只写本人当前相信的内容；明确后续修正时新增本人认知并填写“修正的认知”关联，不用客观真相覆盖旧误信，也不跨人物建立修正链。事件结束或角色离场后的确信阶段、结算来源与角色认知编号由统一服务结算，不手填。当前地点与历史事件地点分别保留各自时点；仅当同一简表块内只有一个明确场景时，相同地点可写“同场景地点”，离场或不同地点仍写实际地点。
同字段叙事修订必须填写“合并后的完整当前值”，不是只填新增片段。新增长发、眼形等细节时，旧值中仍有效的发色、瞳色、外观、身份条件和限制必须原义保留，不得因一次同字段更新而消失；只有正文明确否定、替换、移除或时效结束时才删去对应旧信息，无法确认是否失效时保留。数值、稳定引用、枚举和精确执行规则不因文字润色而改写。程序另行保存每次前后值、共同事务和故事时间锚；当前字段不拼接历史版本。
关键原话台词逐句写“说话人→听话人：「原句」〔P段号〕”，多句以“；”分隔。说话人从原文或明确上下文核实，听话人无依据就省略箭头与听话人；无法确定说话人写“说话人未明”。每句单独标来源段号，禁止把不同说话人的话拼成一段或只在末尾堆段号。引号内逐字保留原句，不加原文没有的台词。`;

export const dialogueFieldHint='逐句：说话人→听话人：「原句」〔P17〕；说话人：「另一句」〔P28〕；归属不明标“说话人未明”';

export function unattributedDialogue(value){
 if(typeof value!=='string'||!value.trim()||['?','∅','~','无','不适用','\"\"'].includes(value.trim()))return false;
 const segments=[];let start=0,endQuote=null;
 const quotes={'「':'」','“':'”','"':'"'};
 for(let i=0;i<value.length;i++){const c=value[i];if(endQuote){if(c===endQuote)endQuote=null;}else if(quotes[c])endQuote=quotes[c];else if(/[；;\n]/.test(c)){segments.push(value.slice(start,i));start=i+1;}}
 segments.push(value.slice(start));
 return segments.filter(s=>s.trim()).some(s=>!/^\s*[^：「」“”\n]{1,100}[：:]\s*\S/.test(s));
}
