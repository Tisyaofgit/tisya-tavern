export const STYLE_CARD_ROLES={tone:'基调卡',view:'视角卡',sentence:'句式卡'};
const card=(id,role,name,content,extra={})=>({id:'builtin.card.'+id,kind:'style',styleRole:role,name,content,tasks:['main'],version:2,...extra});
export const USER_POSITIONS=['主攻','主受','可攻可受'];
export const AESTHETICS=['富态','清瘦','健壮','成熟','慕强','恋弱','战损','病弱','可爱化','高冷化','锋利','温润','明艳','阴郁','幼态（非情色造型）'];
export const STYLE_CARDS=Object.freeze([
 card('tone.tender','tone','微热·克制心动','把欲望藏在仍需完成的事务里。细写想靠近的理由、真正靠近后的反应与停住的原因；让一次回视、改口或主动邀请留下余热。'),
 card('tone.playful','tone','轻盈·机锋往返','用个人声口、小算盘和机锋组织互动。调侃有具体对象，接话、回敬与行动互相牵动，认真处让情绪落地。'),
 card('tone.grounded','tone','沉静·日常质感','用职责、物件和处境承载情绪。细写关键交流，简写过渡，让生活事务与个人欲望一起向前走。'),
 card('view.female','view','女凝·欲望体验','从欲望主体的感官、审美与判断出发，让被看者成为值得渴望的人。贴近声音、皮肤、手部、体态、能力和反差带来的吸引，写出想看、想触碰、想靠近的具体缘由。把被看者的回望与自主回应写进交流，借关注、反馈与距离变化勾起观看者的欲望。',{viewAxis:'lens'}),
 card('view.male','view','男凝·视觉欲望','站在观看者的欲望位置组织画面。用身形、姿态、衣料、光线和动作的显露与遮蔽强化被看者的诱惑力；让镜头在审美偏爱的细节上停留，借观看、期待与回应勾起欲望。',{viewAxis:'lens'}),
 card('view.char','view','char凝视·char→user','以 char 的审美和欲望凝视 user，写 user 哪些具体特征吸引 char，以及这种吸引怎样改变 char 的注意、措辞、距离与行动。让 char 主动看、接近、邀请，以人物专属的选择制造被渴望的体验。',{viewAxis:'direction'}),
 card('view.user','view','user凝视·user→char','以 user 选择的审美凝视 char，把 char 塑造成值得看、值得靠近的人。选择让 user 心动或产生欲望的声音、身体细节、姿态、能力与反差，让 char 察觉目光后的回视和行动形成拉扯。通过获准的视角与可见细节传达吸引。',{viewAxis:'direction'}),
 card('view.audience','view','观众凝视·交互之间','站在场外观看双方的欲望交锋。细写谁先看、谁接住目光、谁接近、谁回应，欣赏个人魅力、距离和节奏怎样在来回互动中擦出张力。',{viewAxis:'direction'}),
 card('sentence.subtext','sentence','留白·对白潜流','让对白处理表层事务，改口、停顿、动作和下一句回应承载欲望。关键处用短句和留白，其余处流畅承接，让读者从交流里读到潜台词。'),
 card('sentence.fluid','sentence','流动·自然叙事','用精确名词和主动动词建立空间，句长随注意变化。让对白接住动作和物件，用长短有别的段落承接反馈、感受与后果。')
]);
const directions={'char 凝视 user':'builtin.card.view.char','user 凝视 char':'builtin.card.view.user','场外观众凝视交互':'builtin.card.view.audience'};
export const isDirectionCard=r=>r?.styleRole==='view'&&(r.viewAxis==='direction'||Object.values(directions).includes(r.id));
export function viewSelection(world,bank=STYLE_CARDS){
 const old=bank.find(r=>r.id===world.styleCards?.view),explicit=Object.hasOwn(world.styleCards??{},'gaze');
 return {view:isDirectionCard(old)?null:world.styleCards?.view??null,gaze:explicit?world.styleCards.gaze:isDirectionCard(old)?old.id:directions[world.parameters?.[old?.id]?.direction]??null};
}
export function styleCardIds(world,bank=STYLE_CARDS){const selected=viewSelection(world,bank);return [...new Set([world.styleCards?.tone,selected.view,world.styleCards?.sentence,selected.gaze].filter(Boolean))];}
export function validateStyleCards(world,bank){
 const slots=world.styleCards;
 if(slots!==undefined){if(!slots||typeof slots!=='object'||Array.isArray(slots)||Object.keys(slots).some(k=>!['tone','view','sentence','gaze'].includes(k)))throw Error('三类文风卡配置无效，原数据保留');
 for(const [role,id]of Object.entries(slots))if(id!==null){const row=bank.find(r=>r.id===id);if(!row||row.kind!=='style'||row.styleRole!==(role==='gaze'?'view':role)||role==='gaze'&&!isDirectionCard(row))throw Error((STYLE_CARD_ROLES[role]??'凝视方向')+'引用失效或类型不符');}}
 const g=world.styleGaze;if(g!==undefined){if(!g||typeof g!=='object'||Array.isArray(g)||Object.keys(g).some(k=>!['userRole','focus'].includes(k))||g.userRole!==undefined&&g.userRole!==null&&!USER_POSITIONS.includes(g.userRole)||g.focus!==undefined&&typeof g.focus!=='string')throw Error('凝视倾向配置无效');}
 const a=world.styleAesthetics;if(a!==undefined){if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['user','others'].includes(k)))throw Error('人物审美配置无效');for(const v of Object.values(a))if(!Array.isArray(v)||new Set(v).size!==v.length||v.some(x=>!AESTHETICS.includes(x)))throw Error('人物审美选项无效');}
}
const aestheticRules={富态:'柔厚饱满的体态、丰润轮廓与从容的分量感',清瘦:'修长清瘦的轮廓与轻盈姿态',健壮:'力量、肌肉与行动中的身体控制',成熟:'成熟的体态、声线、阅历与判断力',慕强:'能力、判断力、力量与胜任事务的魅力',恋弱:'脆弱处、求助的分寸及仍有的个人意愿',战损:'战斗留下的痕迹、衣装破损与伤后仍在行动的意志',病弱:'倦意、气息、身体负担与个人意志的反差',可爱化:'灵动、亲近感与鲜明的小习惯',高冷化:'疏离感、自持、简洁声口及靠近时的反差',锋利:'利落轮廓、目光与行动中的锐气',温润:'柔和质地、从容声口与细致举止',明艳:'鲜明色彩、张扬姿态与醒目的存在感',阴郁:'暗沉气息、寡言与内敛的情绪张力','幼态（非情色造型）':'非情色场景中的稚拙比例、圆润线条与天真造型'};
export function styleProjection(world,bank=STYLE_CARDS){
 const parts=[],a=world.styleAesthetics??{},g=world.styleGaze??{};
 if(Object.values(a).some(v=>v.includes('幼态（非情色造型）')))parts.push('禁止将幼态特征用于欲望或情色描写。');
 for(const [key,label]of [['others','其他角色'],['user','user']])if(a[key]?.length)parts.push(label+'审美：'+a[key].map(x=>x+'：'+aestheticRules[x]).join('；')+'。');
 const role={主攻:'user主攻：以侵略性、攻击性与主动逼近的气质组织user的魅力，体现在目光、姿态、声线和接近节奏中。',主受:'user主受：以魅惑性、诱惑力与牵引目光的气质组织user的魅力，体现在体态、声音、回应与距离变化中。',可攻可受:'user可攻可受：依当下意愿和互动节奏，在主动进攻与魅惑回应之间切换。'}[g.userRole];if(role)parts.push(role+'以明确选择的审美确定具体形象。');
 const old=world.parameters?.[world.styleCards?.view],focus=g.focus??old?.focus;if(focus?.trim())parts.push('凝视关注：'+focus.trim()+'。');
 return parts.join('\n');
}
