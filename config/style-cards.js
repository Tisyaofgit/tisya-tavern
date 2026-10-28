// Three independent lenses; nothing is enabled until explicitly selected.
export const STYLE_CARD_ROLES={tone:'基调卡',view:'视角卡',sentence:'句式卡'};
const card=(id,role,name,content,extra={})=>({id:'builtin.card.'+id,kind:'style',styleRole:role,name,content,tasks:['main'],version:1,...extra});
const boundary='只改变叙述的关注与表达，服从玩家言行／内心授权、人物知情和秘密公开范围。卡名不决定人物性别、性向或同意；拒绝与退让按现场含义处理。';
const tension='亲密张力来自具体吸引、对彼此的察觉和仍然存在的距离。写出这个人值得留意的地方，以及对方出现后注意力、措辞或行动怎样变化。人物可依自身欲望和关系基础主动接近、发起话题或邀请，给出可被接受或拒绝的具体行动；靠近、回视、停顿、退开与转移话题依个人意图和现场反馈发生，允许不对称、落空和继续做正事。克制须有性格、职责、关系阶段或场合上的原因；不强制每轮升温，不靠误会和意外碰触凑进度。';
const fields=[{key:'direction',label:'凝视关系',type:'select',options:['依当前视角','char 凝视 user','user 凝视 char','场外观众凝视交互']},{key:'focus',label:'关注偏好',type:'text',description:'可填声音、手部、身形、能力、反差等；留空随人物与场景选择。'}];
const lens=body=>body+'\n凝视关系：${direction}。关注偏好：${focus}。char 与 user 按实际身份绑定；方向只安排关注，不替玩家产生欲望。场外观众是叙述位置，不新增故事人物或全知权限。\n'+tension+'\n'+boundary;
export const STYLE_CARDS=Object.freeze([
 card('tone.tender','tone','微热·克制心动','保留日常事务与各自目的，让靠近从一次有分寸的回应、留意或未说完的话生长。给吸引留下感官停留与余韵，轻松和欲望可以并存；不把亲密一律写成照顾，也不抢先宣布爱意。'),
 card('tone.playful','tone','轻盈·机锋往返','让人物有自己的小算盘和声口。调侃须有具体对象，接话、回敬与实际行动改变下一拍；允许认真、失手和短暂沉默，避免旁白解释笑点。'),
 card('tone.grounded','tone','沉静·日常质感','让职责、物件和实际处境承载情绪。关键互动细写，过渡简写；保留生活的松弛与人物自己的事务，重要处允许停留。'),
 card('view.female','view','女凝·欲望体验',lens('将读者放在有感受、有审美和欲望的主体位置，贴近吸引怎样被体验。被凝视者可以呈现身体、声音、能力、脆弱或反差的可欲性，也有自己的判断与回望。由特定人物的注意选择细节，让感官接近与被看见的反应互相牵动；不把女凝等同温柔照顾、禁欲或交换男女标签。'),{fields,defaults:{direction:'依当前视角',focus:''}}),
 card('view.male','view','男凝·视觉欲望',lens('强调为观看而组织的可欲画面：身形、姿态、衣料、光线、动作及其显露与遮蔽，让读者的目光有停留和期待。细节由所选对象与审美决定；被看者仍是有目标和回应能力的人，不能被固定部位清单吞没。视觉欣赏可以有情绪和关系层次，不把男凝等同粗暴、无情或所有男性的偏好。'),{fields,defaults:{direction:'依当前视角',focus:''}}),
 card('view.char','view','char凝视·被欲求的你',lens('以 char 自己的审美、欲望、经历与当前目的选择凝视细节，呈现 user 如何占据其注意：原本在做什么，被哪处具体的声音、姿态、言行或反差牵动，又如何调整距离、说话或行动。被欲求感来自这个特定人物的选择和反馈，不来自旁白宣称人人着迷。char 可主动发起有分寸的接触、邀请或试探，也保留顾虑、职责与拒绝；user 的回应仍由玩家决定。当前视角若不允许直写 char 内心，就通过可观察的注意偏移与反应呈现，不借卡片越过信息权限。'),{fields:[{...fields[0],options:['char 凝视 user']},fields[1]],defaults:{direction:'char 凝视 user',focus:''}}),
 card('view.user','view','user凝视·目光中的char',lens('从 user 已明确表达的审美、关注与获准的视角出发，呈现 char 值得凝视的具体之处：声音、手部、皮肤、姿态、能力或言行反差如何在当前距离和事务里被留意。允许欣赏时的停留，让 char 察觉目光后的回视、回应或继续做事改变下一拍。不要把这一方向写成 char 欲求 user；user 未表达的欲望、心理与行动仍按玩家授权留白，不从观看自动推定心动或同意。'),{fields:[{...fields[0],options:['user 凝视 char']},fields[1]],defaults:{direction:'user 凝视 char',focus:''}}),
 card('view.audience','view','观众凝视·交互之间',lens('让读者在场外欣赏人物之间的吸引与分寸：谁先留意，谁接住目光，谁改变措辞或距离，另一人怎样回应。把双方不同的欲望、节奏和仍在做的事编织为可观察的交互，不替玩家补反应，也不让观众位置泄露未公开内心。'),{fields:[{...fields[0],options:['场外观众凝视交互']},fields[1]],defaults:{direction:'场外观众凝视交互',focus:''}}),
 card('sentence.subtext','sentence','留白·对白潜流','对白保持当下的表层目的，让答非所问、改口、短暂的失神或行动承接显出未说尽的关注。关键处留出短句和空白，其他处顺畅连贯；不逐句解释潜台词，不把沉默都解释为试探。'),
 card('sentence.fluid','sentence','流动·自然叙事','以精确名词与主动动词建立空间，句长随注意变化。让对白接住动作和物件，用长短有别的段落承接反应与后果；避免统一的手指、喉结、低声和攥紧蒙太奇。')
]);
export function styleCardIds(world){return Object.values(world.styleCards??{}).filter(Boolean);}
export function validateStyleCards(world,bank){
 if(world.styleCards===undefined)return;
 const slots=world.styleCards;
 if(!slots||typeof slots!=='object'||Array.isArray(slots)||Object.keys(slots).some(k=>!Object.hasOwn(STYLE_CARD_ROLES,k)))throw Error('三类文风卡配置无效，原数据保留');
 for(const [role,id] of Object.entries(slots))if(id!==null){const row=bank.find(r=>r.id===id);if(!row||row.kind!=='style'||row.styleRole!==role)throw Error(STYLE_CARD_ROLES[role]+'引用失效或类型不符');}
}
