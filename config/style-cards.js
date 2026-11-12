export const STYLE_CARD_ROLES={tone:'基调卡',view:'视角卡',sentence:'句式卡'};
const card=(id,role,name,content,extra={})=>({id:'builtin.card.'+id,kind:'style',styleRole:role,name,content,tasks:['main'],version:3,...extra});
export const USER_POSITIONS=['主攻','主受','可攻可受'];
export const AESTHETICS=['富态','清瘦','健壮','成熟','慕强','恋弱','战损','病弱','可爱化','高冷化','锋利','温润','明艳','阴郁','幼态（非情色造型）'];
export const STYLE_CARDS=Object.freeze([
 card('tone.tender','tone','微热·克制心动','把心动藏在仍需完成的事务和人物自己的分寸里。循着人物的注意慢写声音的远近、衣袖擦过物件的轻响、目光停留的位置，以及一句话说出口前的犹疑；感官细节带着当时的情绪和个人联想。容许一次照料、并肩做事或安静相处占据足够篇幅，关系可以维持原有温度。想靠近的缘由、自持的习惯与偶尔的坦率自然并存，让亲近从具体相处中积累。段落可落在尚有余温的物件、做了一半的事或人物继续着的动作上。'),
 card('tone.playful','tone','轻盈·机锋往返','用人物各自的声口、小算盘和观察角度组织轻盈的往返。玩笑从眼前的人、事、物里生长，写清说话时的眼神、手上忙的事和接话的分寸；认真与促狭可以藏在同一句话里。给会意后的停顿、忍笑的过程和熟人间的惯例留出空间，一句打趣也可以只是已有亲近的延续。叙述随注意在对白、环境与获准的心绪间轻巧转折，笑意过去后仍有生活的声音和人物要做的事。让话头自然落下，留下轻快的余味。'),
 card('tone.grounded','tone','沉静·日常质感','用职责、物件和处境承载情绪，让日常有可触摸的质地。慢写水温、饭香、衣料的磨损、窗外声响和一个熟练动作的过程；选择人物此刻真正在意的细节，连着身体的疲乏、习惯与获准的心事。关键交流可以细写，重复的劳动、共享的安静和没有变化的关系也有自己的分量。人物的愿望与现实事务相互牵连，时间可以在眼前停留，再顺着实际需要流动。段落落在生活仍在继续的具体状态里，保留平常日子的余地。'),
 card('view.female','view','女凝·欲望体验','从欲望主体的感官、审美与判断出发，贴近吸引被感受到的过程。声音的质地、手部的细节、衣料下的体态、做事的能力与日常反差，都经过观看者独有的注意和联想取得意味；在获准的内心视角里细写好奇、欣赏、犹疑和想靠近的缘由。容许目光停在一个姿态或一段安静相处中，审美体验可以慢慢展开。被看者保有自己的事务、意愿和回应节奏，回望或继续手头的事都成立；亲近的分量留在具体感受里。',{viewAxis:'lens'}),
 card('view.male','view','男凝·视觉欲望','站在观看者的审美与欲望位置组织画面，让视觉注意有鲜明的个人偏爱。借景别、光线、衣料与动作的显露和遮蔽，细写面容、肩背、手势、站姿及其在空间中的关系；轮廓、色泽和细小动作可以获得从容的停留。把观看者的期待落实在视线所及的具体细节上，让美感在安静或寻常动作里持续。被看者仍按自己的目的行动，回望、交谈或专注别处各有意味。画面可停在尚未收回的目光或一个完整姿态上，保留审美的余韵。',{viewAxis:'lens'}),
 card('view.char','view','char凝视·char→user','以 char 的审美和欲望凝视 user，依据已给出的 user 形象与动作，细写哪些特征吸引了 char。把偏爱落到具体声音、表情、姿态、衣着或做事方式上，让 char 的经历、心绪和个人习惯决定目光停在哪里。慢写 char 如何看、如何斟酌一句话、如何维持或调整距离；安静的注视与熟悉的相处也能延续已有吸引。char 可主动接近、照料或邀请，user 的回应留在已提供的言行与当前授权范围内。让被珍视的体验从人物专属的注意中显现。',{viewAxis:'direction'}),
 card('view.user','view','user凝视·user→char','以 user 选择的审美凝视 char，通过获准的视角与可见细节呈现值得注目的魅力。慢写 char 的声音、面容、衣着、姿态、动作的从容或笨拙，以及能力与日常习惯之间的反差，让外貌和举止带着人物自己的生活。目光可以在一个细节上停留，环境的光、温度和声响共同托住此刻。char 的回视、交谈或继续做事各循自己的理由；user 的心绪和进一步举动依已有输入与代写授权呈现。吸引可以静静存在，留出由 user 自己感受和靠近的空间。',{viewAxis:'direction'}),
 card('view.audience','view','观众凝视·交互之间','站在场外欣赏双方相处中的魅力与张力，以可见的距离、目光、姿态和声口组织画面。细写谁专注手头的事、谁在听、同一件物品怎样被递过或共同使用，让并置与前后照应显出各自的性情。给并肩静坐、习惯性的照料和没有接上的话留出篇幅，关系的稳定与节奏的错位同样值得观看。内心描写沿既定知情权限展开，场外位置仍保留人物各自的秘密。场面可收在双方仍共享的空间与动作里，让余味留给读者。',{viewAxis:'direction'}),
 card('sentence.subtext','sentence','留白·对白潜流','让对白先处理眼前的事务，未说尽的情绪由用词、改口、停顿、目光和手上的动作显露。细写说话的节奏与环境声之间的间隙，让同一句寻常话在具体关系和处境中生出意味；沉默可以是熟悉、犹疑、专注或暂时无话。关键处用短句和留白，其余处用舒展的句子承接感官与获准的联想。保留有意味的重复和未被解释的细节，让读者从并置中体会潜台词。话题与动作可以自然停住，余意留在最后一个具体细节里。'),
 card('sentence.fluid','sentence','流动·自然叙事','用精确的名词和贴合动作的动词建立空间，让叙述沿人物的注意自然流动。观察外貌、姿态和环境时，可以用舒展的长句层层展开质地、声音与获准的心理联想；动作或情绪落定时，用短句稳住节奏。对白接住眼前的物件与正在做的事，段落长短随感受的密度变化，细描、静景和过渡各有空间。围绕同一景物的回望可以积累意味，叙事依实际因果继续。收尾顺着本段的呼吸落在一个完整感受或仍在延续的生活状态上。')
]);
// Exact stock text is the migration authority. Saved edits, external sources and
// unknown versions keep their original body; reading/compiling never mutates storage.
const STYLE_CARD_V2_CONTENT=Object.freeze({
 "builtin.card.tone.tender": "把欲望藏在仍需完成的事务里。细写想靠近的理由、真正靠近后的反应与停住的原因；让一次回视、改口或主动邀请留下余热。",
 "builtin.card.tone.playful": "用个人声口、小算盘和机锋组织互动。调侃有具体对象，接话、回敬与行动互相牵动，认真处让情绪落地。",
 "builtin.card.tone.grounded": "用职责、物件和处境承载情绪。细写关键交流，简写过渡，让生活事务与个人欲望一起向前走。",
 "builtin.card.view.female": "从欲望主体的感官、审美与判断出发，让被看者成为值得渴望的人。贴近声音、皮肤、手部、体态、能力和反差带来的吸引，写出想看、想触碰、想靠近的具体缘由。把被看者的回望与自主回应写进交流，借关注、反馈与距离变化勾起观看者的欲望。",
 "builtin.card.view.male": "站在观看者的欲望位置组织画面。用身形、姿态、衣料、光线和动作的显露与遮蔽强化被看者的诱惑力；让镜头在审美偏爱的细节上停留，借观看、期待与回应勾起欲望。",
 "builtin.card.view.char": "以 char 的审美和欲望凝视 user，写 user 哪些具体特征吸引 char，以及这种吸引怎样改变 char 的注意、措辞、距离与行动。让 char 主动看、接近、邀请，以人物专属的选择制造被渴望的体验。",
 "builtin.card.view.user": "以 user 选择的审美凝视 char，把 char 塑造成值得看、值得靠近的人。选择让 user 心动或产生欲望的声音、身体细节、姿态、能力与反差，让 char 察觉目光后的回视和行动形成拉扯。通过获准的视角与可见细节传达吸引。",
 "builtin.card.view.audience": "站在场外观看双方的欲望交锋。细写谁先看、谁接住目光、谁接近、谁回应，欣赏个人魅力、距离和节奏怎样在来回互动中擦出张力。",
 "builtin.card.sentence.subtext": "让对白处理表层事务，改口、停顿、动作和下一句回应承载欲望。关键处用短句和留白，其余处流畅承接，让读者从交流里读到潜台词。",
 "builtin.card.sentence.fluid": "用精确名词和主动动词建立空间，句长随注意变化。让对白接住动作和物件，用长短有别的段落承接反馈、感受与后果。"
});
export function currentStyleCard(row){
 const current=STYLE_CARDS.find(card=>card.id===row?.id);
 if(!current||row.kind!=='style'||row.styleRole!==current.styleRole||row.source!==undefined||row.version!==2||row.content!==STYLE_CARD_V2_CONTENT[row.id])return row;
 return {...row,content:current.content,version:current.version};
}
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
