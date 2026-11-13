import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {digest} from '../engine/common.mjs';
import originalText from './fixtures/returned-4a-text-digests.json' with {type:'json'};
import * as style from '../config/style-cards.js';
import {emptyConfig,defaultWorld,resources,validateConfig,compileSelected,cleanExport} from '../config/core.js';
import {BUILTIN_STYLE_RULES,styleRules,stylePrompt,scanStyle} from '../tables/style-rules.js';
import {PRESENTATION_PROMPT_CONTRACT} from '../extension-host.mjs';

// Exact candidate29 rows captured before the W15 change. This fixture is
// independent of the production v3 matching table; edits cannot redefine it.
const V3_CARDS=[
  {
    "id": "builtin.card.tone.tender",
    "kind": "style",
    "styleRole": "tone",
    "name": "微热·克制心动",
    "content": "把心动藏在仍需完成的事务和人物自己的分寸里。循着人物的注意慢写声音的远近、衣袖擦过物件的轻响、目光停留的位置，以及一句话说出口前的犹疑；感官细节带着当时的情绪和个人联想。容许一次照料、并肩做事或安静相处占据足够篇幅，关系可以维持原有温度。想靠近的缘由、自持的习惯与偶尔的坦率自然并存，让亲近从具体相处中积累。段落可落在尚有余温的物件、做了一半的事或人物继续着的动作上。",
    "tasks": [
      "main"
    ],
    "version": 3
  },
  {
    "id": "builtin.card.tone.playful",
    "kind": "style",
    "styleRole": "tone",
    "name": "轻盈·机锋往返",
    "content": "用人物各自的声口、小算盘和观察角度组织轻盈的往返。玩笑从眼前的人、事、物里生长，写清说话时的眼神、手上忙的事和接话的分寸；认真与促狭可以藏在同一句话里。给会意后的停顿、忍笑的过程和熟人间的惯例留出空间，一句打趣也可以只是已有亲近的延续。叙述随注意在对白、环境与获准的心绪间轻巧转折，笑意过去后仍有生活的声音和人物要做的事。让话头自然落下，留下轻快的余味。",
    "tasks": [
      "main"
    ],
    "version": 3
  },
  {
    "id": "builtin.card.tone.grounded",
    "kind": "style",
    "styleRole": "tone",
    "name": "沉静·日常质感",
    "content": "用职责、物件和处境承载情绪，让日常有可触摸的质地。慢写水温、饭香、衣料的磨损、窗外声响和一个熟练动作的过程；选择人物此刻真正在意的细节，连着身体的疲乏、习惯与获准的心事。关键交流可以细写，重复的劳动、共享的安静和没有变化的关系也有自己的分量。人物的愿望与现实事务相互牵连，时间可以在眼前停留，再顺着实际需要流动。段落落在生活仍在继续的具体状态里，保留平常日子的余地。",
    "tasks": [
      "main"
    ],
    "version": 3
  },
  {
    "id": "builtin.card.view.female",
    "kind": "style",
    "styleRole": "view",
    "name": "女凝·欲望体验",
    "content": "从欲望主体的感官、审美与判断出发，贴近吸引被感受到的过程。声音的质地、手部的细节、衣料下的体态、做事的能力与日常反差，都经过观看者独有的注意和联想取得意味；在获准的内心视角里细写好奇、欣赏、犹疑和想靠近的缘由。容许目光停在一个姿态或一段安静相处中，审美体验可以慢慢展开。被看者保有自己的事务、意愿和回应节奏，回望或继续手头的事都成立；亲近的分量留在具体感受里。",
    "tasks": [
      "main"
    ],
    "version": 3,
    "viewAxis": "lens"
  },
  {
    "id": "builtin.card.view.male",
    "kind": "style",
    "styleRole": "view",
    "name": "男凝·视觉欲望",
    "content": "站在观看者的审美与欲望位置组织画面，让视觉注意有鲜明的个人偏爱。借景别、光线、衣料与动作的显露和遮蔽，细写面容、肩背、手势、站姿及其在空间中的关系；轮廓、色泽和细小动作可以获得从容的停留。把观看者的期待落实在视线所及的具体细节上，让美感在安静或寻常动作里持续。被看者仍按自己的目的行动，回望、交谈或专注别处各有意味。画面可停在尚未收回的目光或一个完整姿态上，保留审美的余韵。",
    "tasks": [
      "main"
    ],
    "version": 3,
    "viewAxis": "lens"
  },
  {
    "id": "builtin.card.view.char",
    "kind": "style",
    "styleRole": "view",
    "name": "char凝视·char→user",
    "content": "以 char 的审美和欲望凝视 user，依据已给出的 user 形象与动作，细写哪些特征吸引了 char。把偏爱落到具体声音、表情、姿态、衣着或做事方式上，让 char 的经历、心绪和个人习惯决定目光停在哪里。慢写 char 如何看、如何斟酌一句话、如何维持或调整距离；安静的注视与熟悉的相处也能延续已有吸引。char 可主动接近、照料或邀请，user 的回应留在已提供的言行与当前授权范围内。让被珍视的体验从人物专属的注意中显现。",
    "tasks": [
      "main"
    ],
    "version": 3,
    "viewAxis": "direction"
  },
  {
    "id": "builtin.card.view.user",
    "kind": "style",
    "styleRole": "view",
    "name": "user凝视·user→char",
    "content": "以 user 选择的审美凝视 char，通过获准的视角与可见细节呈现值得注目的魅力。慢写 char 的声音、面容、衣着、姿态、动作的从容或笨拙，以及能力与日常习惯之间的反差，让外貌和举止带着人物自己的生活。目光可以在一个细节上停留，环境的光、温度和声响共同托住此刻。char 的回视、交谈或继续做事各循自己的理由；user 的心绪和进一步举动依已有输入与代写授权呈现。吸引可以静静存在，留出由 user 自己感受和靠近的空间。",
    "tasks": [
      "main"
    ],
    "version": 3,
    "viewAxis": "direction"
  },
  {
    "id": "builtin.card.view.audience",
    "kind": "style",
    "styleRole": "view",
    "name": "观众凝视·交互之间",
    "content": "站在场外欣赏双方相处中的魅力与张力，以可见的距离、目光、姿态和声口组织画面。细写谁专注手头的事、谁在听、同一件物品怎样被递过或共同使用，让并置与前后照应显出各自的性情。给并肩静坐、习惯性的照料和没有接上的话留出篇幅，关系的稳定与节奏的错位同样值得观看。内心描写沿既定知情权限展开，场外位置仍保留人物各自的秘密。场面可收在双方仍共享的空间与动作里，让余味留给读者。",
    "tasks": [
      "main"
    ],
    "version": 3,
    "viewAxis": "direction"
  },
  {
    "id": "builtin.card.sentence.subtext",
    "kind": "style",
    "styleRole": "sentence",
    "name": "留白·对白潜流",
    "content": "让对白先处理眼前的事务，未说尽的情绪由用词、改口、停顿、目光和手上的动作显露。细写说话的节奏与环境声之间的间隙，让同一句寻常话在具体关系和处境中生出意味；沉默可以是熟悉、犹疑、专注或暂时无话。关键处用短句和留白，其余处用舒展的句子承接感官与获准的联想。保留有意味的重复和未被解释的细节，让读者从并置中体会潜台词。话题与动作可以自然停住，余意留在最后一个具体细节里。",
    "tasks": [
      "main"
    ],
    "version": 3
  },
  {
    "id": "builtin.card.sentence.fluid",
    "kind": "style",
    "styleRole": "sentence",
    "name": "流动·自然叙事",
    "content": "用精确的名词和贴合动作的动词建立空间，让叙述沿人物的注意自然流动。观察外貌、姿态和环境时，可以用舒展的长句层层展开质地、声音与获准的心理联想；动作或情绪落定时，用短句稳住节奏。对白接住眼前的物件与正在做的事，段落长短随感受的密度变化，细描、静景和过渡各有空间。围绕同一景物的回望可以积累意味，叙事依实际因果继续。收尾顺着本段的呼吸落在一个完整感受或仍在延续的生活状态上。",
    "tasks": [
      "main"
    ],
    "version": 3
  }
];
const V2_CARDS=JSON.parse(fs.readFileSync(new URL('./fixtures/style-cards-v2.json',import.meta.url),'utf8'));
const LEGACY_ENDING_RULE={
  "id": "builtin.regex.6",
  "name": "等待下轮的说明句收尾",
  "kind": "regex",
  "pattern": "(等待|等着|等候).{0,12}(回复|回应|回答|开口|决定)",
  "flags": "u",
  "enabled": true,
  "instruction": "等待下轮的说明句收尾",
  "source": "缇斯亚原预设 r243 / F.10"
};
const endingRule=()=>BUILTIN_STYLE_RULES.find(row=>row.id==='builtin.regex.6');
const endingHits=text=>scanStyle(text,[endingRule()]);

test('returned cards retain all ten public interfaces and independently selected roles',()=>{
 assert.deepEqual(Object.keys(style).sort(),['AESTHETICS','STYLE_CARDS','STYLE_CARD_ROLES','USER_POSITIONS','currentStyleCard','isDirectionCard','styleCardIds','styleProjection','validateStyleCards','viewSelection'].sort());
 assert.equal(style.STYLE_CARDS.length,10);
 assert.deepEqual(style.STYLE_CARDS.map(row=>[row.id,row.name,row.styleRole,row.viewAxis]),V3_CARDS.map(row=>[row.id,row.name,row.styleRole,row.viewAxis]));
 assert(style.STYLE_CARDS.every(row=>row.version===5));
 const world=defaultWorld();world.styleCards={tone:'builtin.card.tone.playful',view:'builtin.card.view.female',gaze:'builtin.card.view.char',sentence:'builtin.card.sentence.fluid'};
 assert.deepEqual(style.styleCardIds(world),[world.styleCards.tone,world.styleCards.view,world.styleCards.sentence,world.styleCards.gaze]);
});

test('all ten exact v2 and v3 stock bodies project to v5 while saved metadata and exports remain unchanged',()=>{
 for(const shipped of [V2_CARDS,V3_CARDS]){
  const data=emptyConfig(),world=defaultWorld();data.worlds.a=world;
  data.resources=shipped.map((row,index)=>({...structuredClone(row),name:'我的标题 '+index,enabled:false,custom:{count:0,flag:false}}));
  world.modes.narrative.selected=data.resources.map(row=>row.id).reverse();
  const before=structuredClone(data),effective=resources(data),compiled=compileSelected(data,world);
  assert.deepEqual(compiled.ids,world.modes.narrative.selected);
  for(const saved of data.resources){
   const current=style.STYLE_CARDS.find(row=>row.id===saved.id);
   assert.deepEqual(effective.find(row=>row.id===saved.id),{...saved,content:current.content,version:5});
   assert.equal(compiled.text.split(current.content).length-1,1,saved.id);
  }
  assert.deepEqual(data,before);
  assert.deepEqual(cleanExport(data).configuration.resources,before.resources);
 }
});

test('same-ID authored text, external cards, changed axes and unsupported stock versions remain authoritative',()=>{
 for(const old of V3_CARDS){
  for(const changes of [{content:old.content+'\n我的补充。'},{content:''},{content:old.content.replace(/。/,'！')},{source:{book:'我的卡',uid:8}},{version:5},{version:undefined},{styleRole:'other'}]){
   const row={...old,...changes};assert.equal(style.currentStyleCard(row),row);
  }
 }
 const lens={...V3_CARDS.find(row=>row.viewAxis==='lens'),viewAxis:'direction'};
 assert.equal(style.currentStyleCard(lens),lens);
});

test('explicit off is respected even when a saved card is also selected by role, style or mode',()=>{
 const data=emptyConfig(),world=defaultWorld();data.worlds.a=world;data.resources=structuredClone(V3_CARDS);
 const id=V3_CARDS[0].id;world.style=id;world.styles=[id];world.styleCards={tone:id};world.modes.narrative.selected=[id];world.overrides[id]='off';
 const before=structuredClone(data);assert.deepEqual(compileSelected(data,world).ids,[]);assert.equal(compileSelected(data,world).text,'');assert.deepEqual(data,before);
 delete world.overrides[id];assert.deepEqual(compileSelected(data,world).ids,[id]);
 data.resources[0].tasks=['summary'];assert.equal(compileSelected(data,world).text,'');assert(compileSelected(data,world,'summary').text);
});

test('old aesthetic remains valid and returned names preserve their original meanings',()=>{
 const data=emptyConfig(),world=defaultWorld();data.worlds.a=world;world.styleAesthetics={user:['幼态（非情色造型）'],others:['稚拙','白幼瘦']};
 const before=structuredClone(data);assert.doesNotThrow(()=>validateConfig(data));
 const text=style.styleProjection(world);assert.match(text,/幼态（非情色造型）.*非情色场景/);assert.match(text,/稚拙.*澄澈眼神/);assert.match(text,/白幼瘦.*冷白细腻/);assert.doesNotMatch(text,/undefined|稚拙与白幼瘦仅作非情色/);assert.deepEqual(data,before);
 world.styleAesthetics.user=['未知'];assert.throws(()=>validateConfig(data),/审美选项/);
});

test('returned voices retain their distinct original 4a text',()=>{
 const bodies=style.STYLE_CARDS.map(row=>row.content).join('\n');
 for(const row of originalText.styleCards)assert.equal(digest(style.STYLE_CARDS.find(c=>c.id===row.id).content),row.sha256,row.id);
 const anchors={'tone.tender':'衣袖擦过器物','tone.playful':'小算盘','tone.grounded':'饭菜热气','view.female':'感官与私心','view.male':'景别','view.char':'char 的私心','view.user':'user 的审美偏爱','view.audience':'场外半步','sentence.subtext':'半截改口','sentence.fluid':'精准名词'};
 for(const [id,anchor]of Object.entries(anchors))assert(style.STYLE_CARDS.find(row=>row.id==='builtin.card.'+id).content.includes(anchor),id);
 assert.doesNotMatch(bodies,/user 的回应留在已提供的言行与当前授权范围内/);
 assert.doesNotMatch(bodies,/既定知情权限/);
});

test('old exact built-in ending rule projects once while off, saved data and custom edits are preserved',()=>{
 for(const enabled of [true,false]){
  const saved={...LEGACY_ENDING_RULE,enabled,custom:{flag:false}},settings={styleRules:[saved]},before=structuredClone(settings);
  const effective=styleRules(settings)[0];assert.equal(effective.scope,'body-ending');assert.equal(effective.enabled,enabled);assert.deepEqual(effective.custom,saved.custom);assert.deepEqual(settings,before);
  assert.deepEqual(styleRules({styleRules:[effective]}),[effective]);
  if(!enabled)assert.deepEqual(scanStyle('你要选择红色还是蓝色？',[effective]),[]);
 }
 for(const changes of [{pattern:'红色'},{instruction:'我自己的要求'},{name:'我的规则'},{source:'用户自定'},{version:1},{scope:'custom-scope'}]){
  const row={...LEGACY_ENDING_RULE,...changes};assert.deepEqual(styleRules({styleRules:[row]}),[row]);
 }
});

test('ending scan checks only the final body sentence and preserves original offsets',()=>{
 for(const tail of ['你是选红色还是蓝色？','你要进去，还是留在门口？','接下来想怎么做？','等待你的回复。','决定权交到了你的手里。']){
  const text='<body>案卷还在桌上。\n\n'+tail+'</body>\n<archive>你是选甲还是乙？</archive>',hits=endingHits(text);
  assert.equal(hits.length,1,tail);assert.equal(hits[0].text,tail);assert.equal(hits[0].offset,text.indexOf(tail));
 }
 assert.equal(endingHits('灯影落在门上。\n你要走进去，\n还是继续等在门口？').length,1);
});

test('normal mid-scene questions and situated character questions are not ending hits',()=>{
 for(const text of ['你是选红色还是蓝色？他随即合上色卡。','你要进去，还是留在门口？\n\n门房将灯放回窗台。','店主问：“你是选红色还是蓝色？”','老师问：“告诉我你的答案。”','她终于知道该如何抉择。','他问你想怎么做。','要不要告诉他？'])assert.deepEqual(endingHits(text),[],text);
 const custom={...LEGACY_ENDING_RULE,pattern:'红色'};
 assert.equal(scanStyle('红色布料放在桌上。最后，他关了窗。',styleRules({styleRules:[custom]})).length,1);
});

test('ending checks stay advisory and presentation writes only authorized cells form',()=>{
 const prompt=stylePrompt([endingRule()]);assert.match(prompt,/正文尾段末句核对候选/);assert.match(prompt,/角色发问/);assert.match(prompt,/不自动删除正文/);assert.doesNotMatch(prompt,/直接定格|删除尾段/);
 assert.match(PRESENTATION_PROMPT_CONTRACT,/<cells format="form">/);assert.doesNotMatch(PRESENTATION_PROMPT_CONTRACT,/@ROW\+|<archive/);assert.match(PRESENTATION_PROMPT_CONTRACT,/引用不扩大角色知情/);
 assert.equal(BUILTIN_STYLE_RULES.length,15);
});
