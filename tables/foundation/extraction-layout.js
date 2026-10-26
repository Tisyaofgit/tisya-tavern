// One model-facing form, projected from the shared archive schema.
// Unrequested schema fields stay absent, never inferred or copied.
const excluded={
 'origin.character':new Set([17,22,23,32,39]),
 'origin.character.history':new Set([8,9,11]),
 'origin.character.relationships':new Set([2,10])
};
export function checkExtractionLayout(layout){if(layout!=='compact-v2')throw Error('未知提炼布局');}
export function visibleExtractionFields(fields,tid,layout){checkExtractionLayout(layout);return fields.filter(f=>!excluded[tid]?.has(f.row));}
export function extractionLabel(f,tid,layout){
 if(tid==='origin.character.relationships'&&f.key==='关系底稿·对象')return '关系对象';
 checkExtractionLayout(layout);
 {
  if(tid==='origin.character.history'&&f.row===2)return '经过';
  if(tid==='origin.character.history'&&f.row===10)return '延续影响';
  if(tid==='origin.character.secrets'&&f.row===2)return '真相';
  if(tid==='origin.character'&&f.row===25)return '日常习惯';
  if(tid==='origin.character'&&f.row===36)return '操作表现';
 }
 return f.label;
}
const hints={
 'origin.character':{
  8:'长期职业、社会角色与谋生方式；已单列的私人关系不重复。',
  14:'只写价值优先排序，不复抄具体拒绝行为或条件规则。',
  15:'如何找证据、作判断和纠正判断；技术操作归操作表现，协商门槛归协商条件。',
  18:'稳定性格弱点；不混对特定人的好恶，不复述完整前史。',
  19:'稳定拒绝的行为；不重复价值排序、理由和单次拒绝。',
  25:'日常作息和反复做法；包括有依据的稳定待人习惯，具体关系互动归对应关系。',
  26:'本世界可具体完成的长期项目与已知进展；驱动力归欲望双螺旋，不重复其全文。',
  28:'只写用词、比喻与话题选择；长短快慢与按步骤讲解归节奏。',
  29:'语句长短、快慢及展开方式；可写对一般听众或讲解情境的区别。',
  36:'按本领说明惯常操作与外显动作；不复抄一般处事原则，不表示本轮已执行。'
 },
 'origin.character.history':{
  1:'事件短名，供检索；不把整段经过写进名称。',
  2:'本次发生什么及明确选择/结果，保留有辨识力的动作、物件或原话，不另编场面。时间地点人名已有索引格，不机械重抄；先后/因果须有依据。',
  5:'材料明确的事件时期；没有留空。',
  6:'材料明确的事件地点；没有留空。',
  7:'实际参与者；未交代不填“无”，不把事后听说者加入。',
  10:'此事明确形成、改变或延续了什么核心/欲望/矛盾/面具/关系/能力/习惯，或留下何种未解决牵引；写联系，不复抄完整现状，不把相邻事实当后果，不预设解决。',
  12:'事件直接涉及的已登记物品或其他对象；未交代留空。'
 },
 'origin.character.relationships':{
  1:'关系短名，供检索；不重复双方姓名。',
  6:'已确立的联系性质；不抄形成过程或互动细节。',
  7:'只写联系如何形成；已有前史只用短名提及，不再重述事件。',
  8:'主体对本条对象的惯常互动、分工、表达及态度，保留对象差异；不推断双向对称，不把单次事件或拒绝底线填在这里。',
  9:'仅本关系特有的稳定边界；人物通用底线已填写则不重复，对方催促等好恶归相处方式。'
 },
 'origin.character.secrets':{
  2:'隐情的事实正文，只在此写；保持知情范围与尚未发生等限定。',
  4:'隐情本身直接涉及的已登记对象；目标地点、物品来源者不因间接影响加入。',
  7:'本隐情的影响与知情范围；不重抄真相全文，材料未提供不等于人物不知道。'
 }
};
const groundedHints={
 'origin.character':{
  11:'只填材料明确写为反复/惯常的身体姿态；场景里单次偏头、手势、站姿不能推成习惯，留空即可。',
  38:'只填已登记的能力/规则档案名称；条件词表的状态键不是档案对象，不填到本格。 多项。',
  40:'用少量性格词概括已呈现的稳定底色；不把能力、职业或动机猜测写成标签。 多项。',
  41:'只收材料明确表达的内在追求；每股各一项。目标事实可支持一股追求，不自动产生第二股；行为或弱点不证明其深层动机，不能自行补出证明自己、体面、控制欲等。只给出具体项目而没有更深追求时，此格留空，项目写26。 多项。',
  42:'只写材料已有的冲突及取舍代价，不编解释性心理或因果链。两件事同时存在不证明互为原因；未给欲望间依赖则不强编依赖。具体事件经过只在前史写，隐情不进入此格。',
  43:'仅材料明确给出外在形象与真实反应的刻意/习惯性落差时填写。平静、礼貌、教学或一次情绪不自动构成面具；缺少落差证据则43至45留空。',
  44:'已有面具实际用来保护/获得/回避什么；须有独立证据，不能从外在表现反推目的。',
  45:'已有面具在何种场合松动、出现何种可见差异；无面具证据就留空，受保护隐情及线索不转抄。',
  19:'跨对象、跨场景的通用拒绝行为。特定承诺的范围限制放对应关系9，条件已表达的沉默门槛不重抄。',
  34:'保留材料明确的能力及掌握程度；不要漏掉熟练等限定，也不自行换成未登记数字。 多项。'
 },
 'origin.character.history':{13:'只写材料明确提供的当时心理、认识或误解；行为本身不等于当时相信某种道理，不把行动换个说法填进此格。无心理证据留空。'},
 'origin.character.relationships':{8:'主体对本条对象的惯常互动、分工、表达及态度；单次历史不泛化成惯例。通用底线不复抄，特定承诺范围写9。',9:'只写该联系特有的范围限制或边界；通用拒绝不得按人名再抄一遍，工作分工/争执方式/好恶不属此格。没有独有边界留空。'},
 'origin.character.secrets':{7:'保留影响及准确的知情客体：不知道凭据内容不等于什么都不知道。材料未给信息不等于人物不知；不省略这些限定。'}
};
export function extractionHint(f,tid,layout){checkExtractionLayout(layout);return groundedHints[tid]?.[f.row]??hints[tid]?.[f.row];}
// Compile the visible form into the shared engine input; hidden fields are blank.
export function expandExtractionSection(lines,fields,tid,layout){
 const visible=visibleExtractionFields(fields,tid,layout),allowed=new Map(visible.map(f=>[f.row,f])),seen=new Map();
 for(const line of lines){
  const n=line.trim().match(/^(\d+)\s+/),f=n&&allowed.get(Number(n[1]));if(!f)throw Error('未开放的精简表行：'+line.trim());
  if(seen.has(f.row))throw Error('精简表行重复：'+f.row);
  const label=extractionLabel(f,tid,layout).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=line.trim().match(new RegExp('^'+f.row+'\\s+'+label+'(?:\\s*[：:]\\s*|\\s+)(.*)$'));
  if(!match)throw Error('精简表字段名或格式不符：'+f.row);
  seen.set(f.row,match[1]);
 }
 for(const f of visible)if(!seen.has(f.row))throw Error('精简表缺行：'+f.row+' '+extractionLabel(f,tid,layout));
 return fields.map(f=>f.row+' '+(f.key==='关系底稿·对象'?'关系对象':f.label)+'：'+(seen.get(f.row)??''));
}
