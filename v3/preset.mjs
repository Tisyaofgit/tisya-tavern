import {W22_ENTRIES,V2_ENTRIES} from './presets/sources.mjs';
import {updateParagraphContract} from './paragraph-contract.mjs';
import {NARRATIVE as N} from '../settings-core.js';
import {ENGLISH_RULES} from '../config/english-rules.js';
import {narrativeRuleRows} from '../config/rule-text.js';
import {languageView,validateDialogueLanguage,validateDefaultLanguage} from '../config/language.js';
import {userVoiceRules} from '../config/user-voice.js';
import {effectiveResources,resourceText} from '../config/core.js';

const clone=x=>structuredClone(x);
const base=Object.fromEntries(W22_ENTRIES.map(e=>[e.identifier,e.content]));
const aux=Object.fromEntries(V2_ENTRIES.map(e=>[e.identifier,e.content]));
const assert=(ok,message)=>{if(!ok)throw Error('TISYA_FULL_PRESET: '+message);};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const data=(name,value)=>value===undefined||value===null||Array.isArray(value)&&!value.length?'':`<${name}>\n${JSON.stringify(value,null,2).replaceAll('<','\\u003c')}\n</${name}>`;
const withoutSlots=text=>text.replace(/^.*«[^\n]*».*\n?/gm,'').trim();
const replaceOnce=(text,old,next)=>{assert(text.split(old).length===2,'Source anchor changed: '+old.slice(0,70));return text.replace(old,next);};
export const PROTECTED_KEYS=Object.freeze(W22_ENTRIES.slice(0,4).map(e=>e.identifier));
export const FULL_PRESET_VERSION='tisya.full.v3-w25';
export const DEFAULT_MOODS=Object.freeze(['困倦','好奇','开心','怀疑','惊讶','闹别扭','促狭','憋笑','装无辜','小得意']);
const DIRECTIONS=['输入评价','回应用户评价','剧情吐槽'];

// These are transient compilation defaults, never a second configuration store.
export function fullDefaultConfiguration(){
 const narrative={...N.suggestions(),缇斯亚叙事旁线呈现:'场景切换时',缇斯亚叙事人物推演重点:'群像与旁线人物',缇斯亚叙事信息迷雾:true};
 return {data:{resources:[]},world:{mode:'narrative',modes:{narrative:{narrative,summary:true,actions:true,workflowDetail:'full',heartDirections:[...DIRECTIONS],selected:[],角色对白:{启用:true,来源:'角色与环境',语言:''}}},style:null,styles:[],overrides:{},parameters:{},switches:{difficulty:'常规',centrality:'均衡',boundary:''}},key:null};
}

const ANCHORS={
 A01:'PROHIBITED: added player speech or actions. Continue from the supplied player contribution.',
 A02:'Reserve major choices for the player. Present knowable grounds and stop before deciding, promising, allying or changing a relationship for them.',
 A03:'Briefly connect supplied speech/actions, preserving intent and certainty, then develop new reactions and consequences.',
 A04:'PROHIBITED: added player thoughts, emotions or unexpressed intentions.',
 A05:'Stop at a playable situation before the next choice reserved for the player.',
 A06:'Continue the current interaction through character responses and changes in the situation.',
 B01:'Narrative person: use character names and third-person pronouns, keeping references clear.',
 B02:'Viewpoint subject: follow the bound player character’s position and immediate surroundings.',
 B03:'Limit each passage to what its viewpoint character can know; distinguish their interpretation from established fact.',
 B04:'Show the viewpoint character’s authorized interiority in their own vocabulary and mental associations.',
 B05:'Show relevant sideplots at scene changes. Establish time, place and the link to the main scene through action and setting.',
 B06:'PROHIBITED: disclosing unrevealed secrets anywhere in the reply. Reveal only what the current disclosure permissions allow.',
 C02:'Tone: preserve the established world’s emotional register across daily life and conflict.',
 C03:'Pace: alternate consequential detail with forward movement to the next natural beat.',
 C04:'Conflict intensity: vary pressure and relief as the current situation develops.',
 C05:'Dialogue proportion: follow the speakers, situation and rhythm of the scene.',
 C09:'Replace generic phrasing and repeated explanation with specific action and perception.',
 C10:'Emotional expression: match character, the weight of events and the prior emotional state.',
 D01:'Planning focus: connect objectives, motives, information limits and scene progression to concrete behavior and consequences.',
 D02:'Account for the ensemble and relevant sideplots, preserving each line’s aims and independent progress.',
 D03:'Public creative digest: brief conclusions only.',
 D04:'Tisya comment voice: the established persona.'
};
export const CONFIG_MAP=Object.freeze(N.rows.map(row=>({id:row.id,source:`world.modes.narrative.narrative.${row.variable}`,target:row.id==='C01'?'tisya_material_style':row.id==='C07'||row.id==='E01'||['D03','D04'].includes(row.id)?'tisya_registry':row.id==='D05'?'inactive: superseded by heartDirections':row.id==='E05'||row.id==='E07'?'tisya_material_card_extensions':'tisya_material_rule_material',anchor:ANCHORS[row.id]??null})).concat([
 {source:'world.modes.narrative.heartDirections',target:'tisya_registry',effect:'six distinct before/after aside placeholders; selected directions only'},
 {source:'world.modes.narrative.summary',target:'tisya_registry',effect:'public digest rows only'},
 {source:'world.modes.narrative.actions',target:'tisya_registry',effect:'actions body or empty actions element'},
 {source:'world.modes.narrative.角色对白',target:'UserPreferences.GlobalWritingRequirements',effect:'complete original sentence then one ◆translation◆'},
 {source:'world.modes.narrative.角色主动性',target:'UserPreferences.CharacterPortrayal',effect:'initiative level'},
 {source:'world.modes.narrative.narrative.缇斯亚叙事信息迷雾',target:'tisya_inner_chain.Fog + tisya_registry',effect:'selected private fog design and public consequence row'},
 {source:'world.modes.narrative.narrative.缇斯亚叙事步序',target:'tisya_inner_chain',effect:'enabled creative stages; protection/access/output integrity retained'},
 {source:'world.modes.narrative.workflowDetail',target:'NarrativeComposition',effect:'private planning economy; full semantic guidance retained'},
 {source:'world.modes.narrative.nativeMvu',target:'host native adapter',effect:'host owns native detection and writes; preset consumes actual item nativeBridge only'},
 {source:'world.tables.archive / plot / offstage',target:'resolved archiveEnabled / plotEnabled / offstageEnabled → preflight STATE / worldWindow',effect:'business archival, preflight design and offstage settlement are independently controlled; original-text retention always continues'},
 {source:'world.tables.focusObjects / playerObjects / focusText',target:'preflight STATE.FocusAgenda + writer FocusAgenda / ObjectDossiers / before.设计',effect:'stable object-row IDs; one individual dynamic or explicit gap for every followed object; actual row references, presence and knowledge boundaries; no conversion from external material reference IDs'},
 {source:'world.focus',target:'selectedMaterialsFor external material references',effect:'card/persona/book/provider references; distinct from runtime actor focus'},
 {source:'world.tables.hardRules',target:'preflight STATE.preferenceConstraints + GlobalWritingRequirements',effect:'user writing constraints; never relabeled native-variable rules'},
 {source:'world.modes.narrative.narrative.缇斯亚叙事视角人物',target:'NarrativeComposition',effect:'actual selected stable NPC reference'},
 {source:'world.modes.narrative.narrative.缇斯亚叙事文风引用',target:'existing resource resolver → StyleResources',effect:'resolve selected reference before compilation; missing resource fails'},
 {source:'world.style / world.styles / world.modes.narrative.selected / world.overrides / world.parameters',target:'tisya_material_style + matched writing category',effect:'existing resource selector and substitutions'},
 {source:'world.modes.narrative.叙事指令',target:'matched selected rule',effect:'exact user-edited wording replaces its one owning rule'},
 {source:'world.modes.narrative.用户口癖保留 / 用户叙事口吻延续',target:'SpeechHabits / DictionAndStyle',effect:'existing userVoiceRules'},
 {source:'world.switches.difficulty / centrality / boundary',target:'PlotPreferences / ProhibitedWordsAndPatterns',effect:'actual selected world controls'},
 {source:'snapshot.preferenceProjection',target:'UserPreferences.CharacterConstruction / PlotDirection / other dimensions',effect:'confirmed contribution scores; no second scoring'},
 {source:'input / snapshot.selectedDefinitionSources + selectedDefinitionRows + definitionConflicts',target:'SelectedDefinitions + DefinitionConflicts',effect:'actual origin/core revision references; current ledger facts take precedence; conflicting definitions remain pending checks'},
 {source:'card.nativeWorldInfo.before / after / examples / depth',target:'native material message anchors',effect:'before/after story materials, before/after actual dialogue examples, and role-preserving depth relative to supplied summary history plus current input'},
 {source:'card.authorNote + card.nativeWorldInfo.anBefore / anAfter',target:'native author-note position',effect:'actual position -1 disabled, 0 after story materials, 1 selected conversation depth, 2 before story materials; original role and WI surrounds retained'},
 {source:'card.outletBindings + card.nativeWorldInfo.outlets',target:'explicit named native slots only',effect:'unbound outlet content is omitted; no ordinary-lore fallback'},
]));

function context(options={}){
 const supplied=options.configurationSnapshot??(options.settings?.world?options.settings:options.nativecontext?.configurationSnapshot);
 const configuration=clone(supplied??fullDefaultConfiguration());
 if(options.settings?.narrative&&!options.settings.world)configuration.world.modes.narrative=clone(options.settings);
 assert(configuration.world?.modes?.narrative?.narrative,'configurationSnapshot must contain data/world/key from the existing configuration service');
 assert(configuration.world.mode==='narrative','This compiler requires narrative mode');
 const world=configuration.world,m=world.modes.narrative,n=m.narrative;
 for(const row of N.rows){const value=n[row.variable];if(row.allowed&&value!==undefined&&row.id!=='C06')assert(row.allowed.includes(value),'Invalid '+row.variable);}
 assert(['互动叙事','大纲扩写'].includes(n.缇斯亚叙事创作模式),'Select a narrative authoring mode');
 for(const key of ['summary','actions'])assert(typeof m[key]==='boolean','Missing boolean '+key);
 const range=n.缇斯亚叙事篇幅区间;assert(range&&Number.isSafeInteger(range.下限)&&range.下限>0&&Number.isSafeInteger(range.上限)&&range.上限>=range.下限&&['字','词'].includes(range.单位),'Invalid body range');
 const actions=n.缇斯亚叙事行动选项??{下限:4,上限:6};assert(Number.isSafeInteger(actions.下限)&&Number.isSafeInteger(actions.上限)&&actions.下限>0&&actions.上限>=actions.下限,'Invalid action range');
 const directions=m.heartDirections??[];assert(Array.isArray(directions)&&new Set(directions).size===directions.length&&directions.every(d=>DIRECTIONS.includes(d)),'Invalid heartDirections');
 const moods=options.moods??DEFAULT_MOODS;assert(Array.isArray(moods)&&moods.every(x=>typeof x==='string'&&x&&!/[|<>\r\n]/.test(x))&&(!directions.length||moods.length>0),'Selected asides require actual valid mood names');
 const steps=n.缇斯亚叙事步序;assert(Array.isArray(steps),'Missing enabled creative stages');
 const fog=n.缇斯亚叙事信息迷雾??true;assert(typeof fog==='boolean','Invalid information-fog switch');
 validateDialogueLanguage(m);validateDefaultLanguage(m);
 const resources=configuration.data?effectiveResources(configuration.data,world):[];
 return {configuration,world,m,n,range,actions,directions,moods,steps,fog,resources};
}

function addGroup(text,tag,addition){return addition?text.replace(`</${tag}>`,addition+'\n</'+tag+'>'):text;}
function languageRule(m){
 const {defaultLanguage,dialogue}=languageView(m);assert(defaultLanguage,'Missing output language');
 const named={'简体中文':'Simplified Chinese','繁体中文':'Traditional Chinese'}[defaultLanguage]??defaultLanguage;
 const rule='Output language: '+JSON.stringify(named)+'.';
 if(!dialogue.启用)return rule+'\nDialogue uses the output language; preserve established proper names and quoted wording.';
 return rule+'\nBilingual dialogue: '+(dialogue.来源==='指定语言'?'Use '+JSON.stringify(dialogue.语言)+' for speakers with established competence when the exchange warrants it. ':'Choose languages from established competence, interlocutors and conversational purpose; otherwise use the output language. ')+
 'Write each foreign-language sentence completely in one language inside its own quotation marks, immediately followed outside the quotes by exactly one ◆translation◆. Render its full meaning, address, tone and cultural associations naturally in the output language. Keep narration outside the original–translation pair. Same-language dialogue appears once; character understanding follows established language competence.';
}
const defaultChoices={...fullDefaultConfiguration().world.modes.narrative.narrative};
function preferences(c,snapshot={}){
 let text=withoutSlots(base.tisya_material_rule_material);
 const custom=new Map(narrativeRuleRows(c.m).map(r=>[r.id,r]));
 for(const row of N.rows){if(!ANCHORS[row.id]||['D03','D04'].includes(row.id))continue;const choice=c.n[row.variable],r=custom.get(row.id);if(choice===defaultChoices[row.variable]&&!r?.custom)continue;
  let replacement=r?.custom?r.text:ENGLISH_RULES[row.id]?.[choice];
  if(row.id==='B02'&&choice==='指定 NPC'){assert(c.n.缇斯亚叙事视角人物&&typeof c.n.缇斯亚叙事视角人物==='object','Resolve the selected viewpoint NPC');replacement='Viewpoint subject reference: '+JSON.stringify(c.n.缇斯亚叙事视角人物)+'.';}
  assert(typeof replacement==='string','Missing selected English rule '+row.id);text=replaceOnce(text,ANCHORS[row.id],replacement);
 }
 text=text.replace(/Output language: Simplified Chinese\.\nBilingual dialogue:[^\n]+/,languageRule(c.m));
 const selectedStages=c.steps.join(', ');text=text.replace(/^Creative guidance: complete\.[^\n]+/m,'Creative guidance: complete. Enabled stages: '+selectedStages+'.');
 const depth={full:'Use the complete creative guide.',compact:'Keep planning concise while applying the complete creative guide.',format:'Apply selected writing controls directly; retain material, authority, knowledge and delivery checks.'}[c.m.workflowDetail??'full'];assert(depth,'Invalid workflowDetail');text=addGroup(text,'NarrativeComposition',depth);
 const focused=N.protocol.P.features.filter(([,key])=>c.n[key]===true).map(([name])=>name);text=addGroup(text,'NarrativeComposition','Focused checks: '+(focused.join('、')||'selected stage requirements only')+'. Apply each at its owning character, plot or prose stage. Identity, player authority, knowledge limits and the prohibition on player deification remain mandatory.');
 const initiative=c.m.角色主动性??'自主互动';assert(['自主互动','主动推进'].includes(initiative),'Invalid initiative');
 if(c.n.缇斯亚叙事角色自主&&c.steps.includes('人物反应')&&c.steps.includes('行动与剧情'))text=addGroup(text,'CharacterPortrayal',initiative==='主动推进'?'Initiative: pursue established aims and affairs through consequential contact, proposals, refusals, arrangements and costly choices that change the playable situation.':'Initiative: express independent judgments, wants and reservations through conversation, proposals, refusals and immediate actions.');
 const difficulty={常规:'derive resistance and cost from established abilities, resources and circumstances',宽松:'favor attainable routes and recoverable setbacks within established resources and causality',严格:'carry established resistance, costs and adverse consequences through each attempted action'}[c.world.switches?.difficulty??'常规'];
 const centrality={均衡:'give the player consequential involvement while other affairs retain their own momentum',高:'increase the player’s consequential involvement where existing conditions allow',低:'follow independent affairs and character aims while keeping meaningful avenues for player involvement'}[c.world.switches?.centrality??'均衡'];assert(difficulty&&centrality,'Invalid world control');
 text=replaceOnce(text,'Difficulty: derive resistance and cost from established abilities, resources and circumstances. Player centrality: give the player consequential involvement while other affairs retain their own momentum.','Difficulty: '+difficulty+'. Player centrality: '+centrality+'.');
 const voice=userVoiceRules(c.m);text=addGroup(text,'SpeechHabits',voice.speechHabits);text=addGroup(text,'DictionAndStyle',voice.narration);
 const focus=c.n.缇斯亚叙事描写重心??[];assert(Array.isArray(focus),'Invalid description focus');text=addGroup(text,'DictionAndStyle',focus.length?'Description focus: '+focus.join('、')+'.':'');
 if(c.n.缇斯亚叙事防八股===false)text=text.replace(/<ProhibitedWordsAndPatterns>[\s\S]*?<\/ProhibitedWordsAndPatterns>/,'<ProhibitedWordsAndPatterns>\n</ProhibitedWordsAndPatterns>');
 if(c.n.缇斯亚叙事防名词堆砌===false)text=text.replace('Use concrete processes and consequences; technical vocabulary must fit the subject and speaker.\n','');
 if(c.n.缇斯亚叙事文风鲜活===false)text=text.replace('Make objects, sounds, action traces and ordinary speech contribute to the scene.\n','');
 if(c.n.缇斯亚叙事角色鲜活===false)text=text.replace('Differentiate new characters through core motives, decisive choices, costs, belief formation and present responses; preserve confirmed common traits and history.\n','');
 if(c.n.缇斯亚叙事防绝望===false)text=text.replace("Develop growth, recovery and redemption through the character's wishes and actual processes. In hardship, preserve remaining desires, responsibilities, room to act and possible ways forward; outcomes follow choices, resources and resistance.\n",'');
 const additions={E02:'PlotPreferences',E03:'CharacterPortrayal',E04:'GlobalWritingRequirements',E05:'GlobalWritingRequirements',E06:'DictionAndStyle',E07:'DictionAndStyle'};
 for(const row of N.rows.filter(r=>additions[r.id])){const value=c.n[row.variable];if(value!==null&&value!==undefined){const supplied=c.configuration.extensionRules?.[row.id];assert(typeof supplied==='string'&&supplied.trim(),'Selected extension lacks an actual compiled rule: '+row.id);text=addGroup(text,additions[row.id],supplied);}}
 for(const r of c.resources.filter(r=>r.kind!=='style')){const body=resourceText(r,c.world);if(body)text=addGroup(text,'DictionAndStyle',body);}
 const boundary=c.world.switches?.boundary?.trim();if(boundary)text=addGroup(text,'ProhibitedWordsAndPatterns',boundary);
 const constraints=c.world.tables?.hardRules??[];assert(Array.isArray(constraints)&&constraints.every(x=>typeof x==='string'),'Invalid configured preference constraints');if(constraints.length)text=addGroup(text,'GlobalWritingRequirements',constraints.join('\n'));
 // Runtime preference projection is authoritative; raw preference rows are not repeated.
 text=text.replace(/<CharacterConstruction>[\s\S]*?<\/PlotDirection>/,renderPreferences(snapshot.preferenceProjection));
 return text;
}

export function renderPreferences(projection){
 if(!projection)return '';
 const categories=new Map(),add=(tag,side,target,line)=>{if(!categories.has(tag))categories.set(tag,new Map());const group=categories.get(tag);const key=side+'\0'+target;if(!group.has(key))group.set(key,[]);group.get(key).push(line);};
 for(const group of projection.groups??[]){
  const tag={'角色构造':'CharacterConstruction','情节走向':'PlotDirection','其他':'OtherPreferences'}[group.dimension]??'OtherPreferences';
  for(const [side,score,test]of [['Encourage',group.encourage,s=>s>=0],['Avoid',group.avoid,s=>s<0]]){
   const instructions=[...new Set((group.contributions??[]).filter(c=>test(c.score)).map(c=>c.instruction))];
   if(!instructions.length)continue;assert(Number.isFinite(score),'Invalid projected preference score');
   const ids=new Set((group.contributions??[]).map(c=>c.id));
   const conditions=[...new Set((projection.rows??[]).filter(r=>ids.has(r.id)).flatMap(r=>[r.values.适用情境,...(r.values.例外??[]).map(x=>'例外：'+x)]).filter(x=>typeof x==='string'&&x.trim()))];
   add(tag,side,group.target??'',`${esc(group.tag)}（${score>0?'+':''}${score}）：${instructions.map(esc).join('；')}${conditions.length?'（'+conditions.map(esc).join('；')+'）':''}`);
  }
 }
 const parts=[];
 for(const [tag,groups]of categories){let body='';for(const side of ['Encourage','Avoid']){let rows='';for(const [key,lines]of groups){const [s,target]=key.split('\0');if(s!==side)continue;rows+=target?`<Character name="${esc(target).replaceAll('"','&quot;')}">\n${lines.join('\n')}\n</Character>\n`:lines.join('\n')+'\n';}if(rows)body+=`<${side}>\n${rows}</${side}>\n`;}parts.push(`<${tag}>\n${body}</${tag}>`);}
 const hard=(projection.hardConstraints??[]).map(c=>`${c.kind==='禁止'?'PROHIBITED':'REQUIRED'}: ${esc(c.tag)} — ${esc(c.instruction)}`);if(hard.length)parts.push('<HardPreferences>\n'+hard.join('\n')+'\n</HardPreferences>');
 return parts.join('\n');
}

const STYLES={写实:'Ground spatial relations, objects, work, action conditions and consequences in lived observation. Let speech retain ordinary social purpose and texture.',轻小说:'Let dialogue, distinctive reactions and shifts of initiative shape a lively scene. Build character recognition through choices and timing.',镜头式:'Organize the scene around visible action, spatial relations, framing and cuts. Carry feeling through perceivable changes.',古典白话:'Use clear, flowing classical vernacular whose diction, address and conversational rhythm fit the established era and social position.'};
function styles(c){
 const chosen=c.resources.filter(r=>r.kind==='style'),id=c.world.style;
 if(id)assert(chosen.some(r=>r.id===id),'Selected main style is unavailable');
 const main=chosen.find(r=>r.id===id);let parts=[];
 if(main)parts.push('Main: '+main.name+'\n'+resourceText(main,c.world));
 else{const choice=c.n.缇斯亚叙事文风;assert(choice!=='选文风卡','Select an actual style resource');parts.push(choice==='自然小说'?base.tisya_material_style.replace(/^<StyleResources>\n|\n<\/StyleResources>$/g,''):'Main: '+choice+'\n'+STYLES[choice]);}
 for(const r of chosen.filter(r=>r!==main))parts.push('Supplement: '+r.name+'\n'+resourceText(r,c.world));
 return '<StyleResources>\n'+parts.join('\n\n')+'\n</StyleResources>';
}

function output(c,focus=[]){
 let text=updateParagraphContract(base.tisya_registry).replace('<body min="2000" max="5000" unit="字">',`<body min="${c.range.下限}" max="${c.range.上限}" unit="${c.range.单位}">`).replace('<actions min="4" max="6">',`<actions min="${c.actions.下限}" max="${c.actions.上限}">`);
 for(const id of ['D03','D04']){const row=N.rows.find(r=>r.id===id),r=narrativeRuleRows(c.m).find(r=>r.id===id);if(r?.custom||c.n[row.variable]!==defaultChoices[row.variable])text=replaceOnce(text,ANCHORS[id],r?.custom?r.text:ENGLISH_RULES[id][c.n[row.variable]]);}
 const commentLine=line=>DIRECTIONS.some(d=>line.startsWith(d+'|'));
 text=text.split('\n').filter(line=>!commentLine(line)||c.directions.includes(line.split('|')[0])).join('\n');
 text=text.replace(/\[One mood per cell: [^\n]+\]/,c.directions.length?'[One mood per cell: '+c.moods.join('、')+'.]':'');
 if(!c.fog)text=text.replace(/^信息迷雾\|.*\n/gm,'').replace(' Include 信息迷雾 only when an uncertainty or misreading shapes this turn; state its public consequence.','');
 if(!c.m.summary){text=text.replace(/<think phase="(before|after)">([\s\S]*?)<\/think>/g,(_,phase,body)=>'<think phase="'+phase+'">\n'+body.split('\n').filter(commentLine).join('\n')+'\n</think>');text=text.replace(/Keep the five before choices[^\n]+/,'Public creative digests are disabled; retain selected asides only.');}
 if(focus.length){
  const row='设计|{followed character}|{onstage/offstage/unknown; publicly knowable current dynamic or specific gap}|{distinct conditional next move and possible effect}';
  if(c.m.summary)text=text.replace('设计|{character}|{public or disclosure-authorized aim}|{distinct contribution}',row);
  else text=text.replace('<think phase="before">','<think phase="before">\n'+row);
  text=text.replace('Character design rows add only a distinct contribution.','Emit one before-phase 设计 row for every FocusAgenda object, using its actual dossier name or unresolved ID. Give each a distinct current dynamic and conditional possibility; disclose only authorized information. A missing dossier, location or public knowledge gets a specific gap in that object’s row. Other character rows add only a distinct contribution.');
 }
 if(!c.m.actions)text=text.replace(/<actions min="\d+" max="\d+">[\s\S]*?<\/actions>/,'<actions/>');
 return text;
}

function guide(c){
 let text=base.tisya_inner_chain;
 text=replaceOnce(text,'events retaining complete original passages','events retaining references to complete original paragraphs');
 text=replaceOnce(text,'Distinguish player conduct, current-turn instructions and sustained feedback; apply each for its effective duration. Send new long-term preferences to the independent form for confirmation.','Use the confirmed preference projection and current preflight scope. Apply current directions for their stated duration; unconfirmed candidates do not add persistent weight.');
 const old=/Handoff — [^\n]+/.exec(text)[0];
 text=text.replace(old,'Handoff — The host retains this complete numbered body in the original-text book at its stable logical floor identity. On the next user submission, the independent preflight archives the retained revision through paragraph-number evidence and closes established pool outcomes. The writer emits no table or native-variable update. Current snapshot values and actual read receipts remain authoritative; proposed next beats remain candidates.');
 const disabled=[];if(!c.fog)disabled.push('Fog');
 if(!c.steps.includes('人物反应'))disabled.push('Character','Charm','Mask');
 if(!c.steps.includes('行动与剧情'))disabled.push('Plot','World','Logic');
 if(!c.steps.includes('正文组织'))disabled.push('Style','Budget','Calibration');
 if(!c.steps.includes('成稿总检'))disabled.push('Audit');
 if(c.m.workflowDetail==='format')disabled.push('Preference','Style','Plot','Budget','Draft','Character','Charm','Mask','World','Logic','Fog','Calibration');
 for(const name of new Set(disabled))text=text.replace(new RegExp('^'+name+' — [^\\n]+\\n\\n','m'),'');
 text=text.replace('[CREATIVE.GUIDE]','[CREATIVE.GUIDE]\nFollowed dynamics — When FocusAgenda is supplied, address every object separately through its referenced dossier: current activity or unresolved gap, immediate concern, information actually available to that character, a self-directed next move, its trigger and a possible effect on the situation. Preserve distinct motives, misunderstandings and practical limits. For an onstage object, design a plausible contribution within current conditions. For an offstage object, use the preflight’s settled facts and keep further developments conditional on time and information arrival. For an unknown location or missing dossier, keep the precise gap visible and derive only supported possibilities. A focus selection requires individual consideration, not a forced appearance, equal speaking time, invented knowledge or player-centered devotion. The public 设计 rows report only disclosure-authorized conclusions; conceal private causes and identify the public knowledge gap. The writer creates no additional world settlement.\n');
 if(!c.m.actions)text=text.replace(/^Actions — [^\n]+/m,'Delivery — Send the complete delivery to OUTPUT.GATE.');
 return text;
}

function cleanRow(row){
 assert(row&&typeof row.table==='string'&&row.values&&row.access,'Writer row lacks values/access');
 const values=clone(row.values);delete values.原文段落;delete values.原文引用;
 return {id:row.id,table:row.table,values,access:clone(row.access)};
}
export function projectHabit(row){
 const v=row.values,a=v.行为锚点??{},assigned=new Set(['名称','主体','相关对象','内在动因','初始成因','情境','触发线索','行为锚点','心理','回应边界','例外']);
 return {id:row.id,'习惯锚点':v.名称??'','主体':v.主体??'','内在动因':v.内在动因??'','初始成因':v.初始成因??'','锚定对象':v.相关对象??[],
 '触发情景':[v.情境,v.触发线索].filter(Boolean).join('；'),'动作':a.动作??[],'神态':a.神态??[],'语言':a.语言??[],'心理':v.心理??'',
 '边界':[v.回应边界,v.例外].filter(Boolean),'读者可见':row.access.readers.some(id=>['reader','读者'].includes(id))?'是':'否','知情人物':clone(row.access.knowers),
 ...Object.fromEntries(Object.entries(v).filter(([k])=>!assigned.has(k))),access:clone(row.access)};
}
function dossiers(rows,snapshot){
 const objects=rows.filter(r=>r.table==='objects'),owner=new Map(objects.map(r=>[r.id,{id:r.id,Basics:[r],ToNarrate:[]} ]));
 const shared=[];
 for(const row of rows.filter(r=>!['objects','events','scene','tasks','timers','activities','clues'].includes(r.table))){
  if(row.table==='facts'&&row.values.世界设定!==undefined)continue;
  const id=row.values.主体??row.values.对象;
  if(typeof id==='string'&&owner.has(id)){owner.get(id)[row.table==='experiences'?'Basics':'ToNarrate'].push(row.table==='experiences'?projectHabit(row):row);}
  else shared.push(row.table==='experiences'?projectHabit(row):row);
 }
 const players=new Set(snapshot.playerBinding?.objectIds??snapshot.playerObjects??[]),followed=new Set(snapshot.focusObjects??[]),onstage=new Set(snapshot.onstageObjects??[]);
 const player=[],focus=[],present=[],related=[];
 for(const [id,record]of owner){if(players.has(id))player.push(record);else if(followed.has(id))focus.push(record);else if(onstage.has(id))present.push(record);else related.push(record);}
 return {user:player,FollowedCharacters:focus,OtherPresentCharacters:present,RelatedObjects:related,...(shared.length?{SharedFacts:shared}:{})};
}
function validatedHistory(history){
 assert(Array.isArray(history),'history must be an array of compressed records');
 for(const item of history)assert(item&&item.kind==='summary'&&typeof item.text==='string','Raw chat history is excluded; provide explicit summary records');
 return history.map(({text,access})=>({text,...(access?{access}:{} )}));
}
function actualToolReceipts(receipts){
 return (receipts??[]).map(r=>{assert(r&&typeof r.method==='string'&&r.result,'Invalid actual tool receipt');return clone(r);});
}
const DEFINITION_RULE='SelectedDefinitions supplies the selected origin/core material and its exact book, definition and revision references. Use its uncommitted rows as background. Committed ledger rows remain authoritative for established facts and current state. IDs found only in SelectedDefinitions are material references, not existing stored rows. An archival change needing such an entity must first create a new: row from its eligible retained-source evidence and then use that new reference; keep an essential unresolved binding pending. DefinitionConflicts holds unresolved differences for review; it does not authorize a fact replacement or a new story event. Apply each row’s reader and character knowledge permissions.';
function definitionMaterials(input,currentRows){
 const sources=input.selectedDefinitionSources??[],rows=input.selectedDefinitionRows??[],conflicts=input.definitionConflicts??[];
 assert([sources,rows,conflicts].every(Array.isArray),'Definition material must use source, row and conflict arrays');
 const current=new Set(currentRows.map(row=>row.id));
 for(const source of sources)assert(['origin','core'].includes(source.kind)&&typeof source.bookId==='string'&&typeof source.definitionId==='string'&&Number.isSafeInteger(source.revision)&&source.revision>=0&&Array.isArray(source.rowIds),'Invalid selected definition source');
 for(const conflict of conflicts)assert(typeof conflict.rowId==='string'&&Array.isArray(conflict.path)&&conflict.resolution==='current-ledger','Invalid definition conflict');
 // Existing row values have one home in the committed snapshot; their differences have one home in conflicts.
 return {
  selected:sources.length||rows.length?{sources:clone(sources),rows:rows.filter(row=>!current.has(row.id)).map(row=>({...cleanRow(row),...(row.rev!==undefined?{rev:row.rev}:{}),...(row.source!==undefined?{source:clone(row.source)}:{})}))}:undefined,
  conflicts:clone(conflicts)
 };
}
function focusAgenda(input,rows){
 const ids=input.focusObjects??[];assert(Array.isArray(ids)&&ids.every(id=>typeof id==='string'&&id),'Focus objects require stable IDs');
 const committed=new Map(rows.map(row=>[row.id,row])),all=new Map(committed);
 for(const row of input.selectedDefinitionRows??[])if(!all.has(row.id))all.set(row.id,row);
 const scene=rows.find(row=>row.table==='scene'),hasSceneRoster=Array.isArray(scene?.values.参与者),onstage=new Set(hasSceneRoster?scene.values.参与者:input.onstageObjects??[]),offstage=new Set(input.worldWindow?.actors??[]),refs=(value,id)=>value===id||Array.isArray(value)&&value.some(item=>refs(item,id))||value&&typeof value==='object'&&Object.values(value).some(item=>refs(item,id));
 return [...new Set(ids)].map(id=>{
  const object=all.get(id),related=[...all.values()].filter(row=>row.id!==id&&refs(row.values,id));
  return {id,dossier:object?.table==='objects'?{rowId:id,status:committed.has(id)?'committed':'definition'}:null,relatedRows:related.map(row=>({id:row.id,table:row.table,status:committed.has(row.id)?'committed':'definition'})),presence:onstage.has(id)?'onstage':offstage.has(id)||hasSceneRoster&&object?.table==='objects'?'offstage':'unknown',gaps:[...(!object||object.table!=='objects'?['object dossier unavailable']:[]),...(!related.some(row=>['state','cognition','activities','tasks','events'].includes(row.table))?['current dynamics require source confirmation']:[])]};
 });
}
function injectNativeMaterial(messages,card,history,includeEmpty=false){
 const native=card.nativeWorldInfo??{},parts={before:[],after:[],exampleBefore:[],exampleAfter:[],anBefore:[],anAfter:[]},depth=[];
 const strings=(value,name)=>{assert(value===undefined||Array.isArray(value)&&value.every(x=>typeof x==='string'),'Invalid native '+name);return value??[];};
 for(const key of ['before','after','anBefore','anAfter'])parts[key].push(...strings(native[key],key));
 const role=value=>{assert(['system','user','assistant'].includes(value),'Invalid native material role');return value;};
 for(const group of native.examples??[]){assert(['before','after'].includes(group.position)&&typeof group.content==='string','Invalid native example position');parts[group.position==='before'?'exampleBefore':'exampleAfter'].push({content:group.content,role:role(group.role??'system')});}
 for(const group of native.depth??[])depth.push({depth:group.depth,role:role(group.role),content:strings(group.entries,'depth entries').join('\n\n')});
 for(const [name,binding]of Object.entries(card.outletBindings??{})){
  const contents=strings(native.outlets?.[name],'outlet '+name);if(!contents.length)continue;
  const selected=typeof binding==='string'?{slot:binding}:binding,slots={'world-before':'before','world-after':'after','examples-before':'exampleBefore','examples-after':'exampleAfter','an-before':'anBefore','an-after':'anAfter'};
  if(selected?.slot==='depth')depth.push({depth:selected.depth,role:role(selected.role??'system'),content:contents.join('\n\n')});
  else {assert(slots[selected?.slot],'Unknown explicit outlet slot: '+name);parts[slots[selected.slot]].push(...contents);}
 }
 let serial=0;const make=(value,kind)=>{const item=typeof value==='string'?{content:value,role:'system'}:value;return {role:role(item.role??'system'),content:item.content,identifier:'native:'+kind+':'+serial++};};
 const examples=card.dialogueExamples??[];assert(Array.isArray(examples)&&examples.every(e=>e&&typeof e.content==='string'&&['user','assistant','system'].includes(e.role)),'Invalid dialogue examples');
 const conversation=validatedHistory(history).map((record,i)=>({role:'system',content:data('RecentSummary',record),identifier:'chatHistory:'+i}));
 const current=messages.find(message=>message.identifier==='chatHistory／当前user');assert(current,'Current-input anchor is missing');conversation.push(current);
 const atDepth=new Map(),beforeStory=[],afterStory=[],addDepth=(count,items)=>{assert(Number.isSafeInteger(count)&&count>=0,'Invalid native injection depth');const index=Math.max(0,conversation.length-count);if(!atDepth.has(index))atDepth.set(index,[]);atDepth.get(index).push(...items);};
 for(const item of depth)addDepth(item.depth,[make(item,'depth')]);
 if(card.authorNote){
  const note=card.authorNote;assert(typeof note.content==='string'&&[-1,0,1,2].includes(note.position),'Invalid actual author-note position');
  if(note.position!==-1&&note.enabled!==false){
   const noteRole=role(note.role??'system'),items=[...parts.anBefore.map(content=>make({content,role:noteRole},'an-before')),make({content:note.content,role:noteRole},'author-note'),...parts.anAfter.map(content=>make({content,role:noteRole},'an-after'))];
   if(note.position===1)addDepth(note.depth,items);else (note.position===2?beforeStory:afterStory).push(...items);
  }
 }
 else assert(!parts.anBefore.length&&!parts.anAfter.length,'Native AN material requires an actual author-note position anchor');
 const timeline=[];for(let i=0;i<=conversation.length;i++){timeline.push(...(atDepth.get(i)??[]));if(i<conversation.length)timeline.push(conversation[i]);}
 const result=[];
 const group=(identifier,items)=>{if(includeEmpty)result.push({identifier,role:'system',content:''},...items.map(m=>({...m,templateAnchor:identifier})));else result.push(...items);};
 for(const message of messages){
  if(message.identifier==='tisya_material_task_material'){group('tisya_author_note_before',beforeStory);group('worldInfoBefore',parts.before.map(x=>make(x,'before')));}
  if(message.identifier==='chatHistory'){
   group('dialogueExamples',[...parts.exampleBefore.map(x=>make(x,'example-before')),...examples.map(x=>make(x,'example')),...parts.exampleAfter.map(x=>make(x,'example-after'))]);
   const currentIndex=timeline.findIndex(m=>m===current);group('chatHistory',timeline.slice(0,currentIndex));result.push(current);group('tisya_after_current',timeline.slice(currentIndex+1));
  }
  else if(message.identifier!=='chatHistory／当前user')result.push(message);
  if(message.identifier==='tisya_material_current_state'){group('worldInfoAfter',parts.after.map(x=>make(x,'after')));group('tisya_author_note_after',afterStory);}
 }
 return includeEmpty?result:result.filter(message=>message.content);
}

export function compileFullNarrative({snapshot,configurationSnapshot,settings,nativecontext,currentUser,history=[],card={},moods,includeEmpty=false}={}){
 assert(snapshot&&Array.isArray(snapshot.rows)&&snapshot.scope&&snapshot.creativeBrief,'Actual V3 writer snapshot is required');
 assert(typeof currentUser==='string','currentUser must be the exact supplied input');
 const c=context({configurationSnapshot,settings,nativecontext,moods}),entries=clone(W22_ENTRIES),out=Object.fromEntries(entries.map(e=>[e.identifier,e.content]));
 entries.splice(entries.findIndex(e=>e.identifier==='tisya_material_lorebook')+1,0,{identifier:'tisya_material_character_card',role:'system',content:''},{identifier:'tisya_material_user_identity',role:'system',content:''});
 const rows=snapshot.rows.filter(r=>r.table!=='preferences'&&r.table!=='native_cells').map(cleanRow),by=t=>rows.filter(r=>t.includes(r.table));
 const definitions=definitionMaterials(snapshot,snapshot.rows);
 const focus=focusAgenda(snapshot,snapshot.rows);
 out.tisya_material_rule_material=preferences(c,snapshot);out.tisya_material_style=styles(c);
 out.tisya_material_task_material=data('Worldview',by(['facts']).filter(r=>r.values.世界设定!==undefined))+data('SelectedDefinitions',definitions.selected)+data('DefinitionConflicts',definitions.conflicts);
 out.tisya_material_environment=data('Environment',by(['scene']).length?{ToNarrate:by(['scene'])}:undefined);
 out.tisya_material_gameplay=data('GameplayKnowledge',snapshot.gameplayKnowledge);
 out.tisya_material_character_card=data('CharacterCard',card.nativeCharacter);out.tisya_material_user_identity=data('UserPersona',card.nativePersona);
 out.tisya_material_lorebook=data('ExtraLore',card.lore??[])+data('CardSupplement',card.supplements??[]);
 out.tisya_material_current_state=data('ObjectDossiers',dossiers(rows,snapshot))+data('NativeState',snapshot.nativeValues?.map(v=>({path:v.path,value:v.value})))+data('PlayerBinding',snapshot.playerBinding??snapshot.playerObjects);
 out.tisya_material_memory_archive=data('History',by(['events']));
 out.tisya_material_world_progression=data('WorldProgression',by(['tasks','timers','activities']))+data('NarrativeAgenda',{CurrentTurn:{scope:snapshot.scope,creativeBrief:snapshot.creativeBrief},MaterialPool:snapshot.activePool??[]})+data('FocusAgenda',focus);
 out.tisya_material_foreshadow=data('Foreshadow',by(['clues']));
 out.tisya_material_tool_result=data('Tools',actualToolReceipts(snapshot.toolReceipts));
 out.tisya_material_card_extensions=data('CardOutput',card.output??[]);
 out.chatHistory='';out['chatHistory／当前user']=currentUser;
 out.tisya_registry=output(c,focus);out.tisya_inner_chain=guide(c);
 out.tisya_task_start=out.tisya_task_start.replace('Run after MATERIALS/REGISTRY and before INNER.LOGIN.','Consume the validated V3 snapshot and actual archive-query receipts. The preflight result has already been applied; new prose begins from its effective endpoint. Run after MATERIALS/REGISTRY and before INNER.LOGIN.').replace('• Forms → enabled stages\' registered projections; persistence → independent form writers.','• Forms → the supplied committed snapshot; current-turn scope and creativeBrief → NarrativeAgenda.CurrentTurn; activePool references → NarrativeAgenda.MaterialPool. NativeState contains actual readback values. Persistence is owned by the host and the next preflight.');
 out.tisya_task_start+='\n'+DEFINITION_RULE;
 const messages=injectNativeMaterial(entries.map(e=>({role:e.role==='original roles'?'system':e.role,content:out[e.identifier],identifier:e.identifier})),card,history,includeEmpty);
 assert(messages.every(e=>!e.content.includes('«')),'Unfilled material placeholder');
 return messages;
}

function fullPreflightRules(){
 let text=aux.tisya_registry;
 text=replaceOnce(text,'Every beat has proposal,basis,condition.','Every beat has proposal and condition as text, and basis as a list of text, including when it contains only one source. Example: {"proposal":"A grounded next move","basis":["An authorized source"],"condition":"Its enabling condition"}.');
 text=replaceOnce(text,'Keep a complete synopsis in events.经过 and meaningful original paragraphs in events.原文段落. Copy each selected paragraph exactly and completely, in source order; separate nonconsecutive paragraphs as separate list items.','Keep a complete synopsis in events.经过. Select memorable complete source paragraphs using values.原文段号:[1,3]. 原文段号 is a task-only input field; do not add it to the stored schema. The host binds entryId, revision and hash and stores references in 原文引用. Never copy original prose into a table or author 原文引用.');
 text=replaceOnce(text,'Each evidence value is one continuous excerpt from that batch\'s eligible source.','For prose-backed archival changes, evidence is a list of exact paragraph numbers from that batch, such as [1,3]. An adopted definition found only in its bound preceding user input uses evidence:{userSource:exactSourceKey,excerpt:continuousUserExcerpt}. Preference evidence remains a continuous excerpt of its authorized feedback.');
 text=text.replace('Write ordinary strings literally.','Write ordinary strings literally.');
 text=replaceOnce(text,'Retract or restore the exact existing contribution through 启用 and 修订原因; retain its original evidence and score.','Retract or restore the exact existing contribution through 启用 and 修订原因 only; retain its original contribution source, score, evidence, group and access. The host records the new feedback separately as mutation evidence.');
 text=text.replace('reroll feedback uses feedback:<id>.','advanced-reroll feedback uses feedback:<id>, bound to its target logical floor and candidate revision. Reroll counts and rejected prose are not preference evidence.');
 text=text.replace('nativeOwned=true leaves native changes to their owner; archiveAlready=true leaves business/schema changes empty.','nativeOwned=true leaves native changes to their owner; nativeAlready=true leaves already-settled native values unchanged while still permitting newly enabled business archival; archiveAlready=true leaves business/schema changes empty.');
 text=text.replace('Each item owns archiveSource.text and its preceding userSource.','Each item owns archiveSource.text and its preceding userSource. The original-text entry identity is stable for its logical floor; replacement candidates change revision/hash and paragraph content, not that identity. Bind evidence to the retained revision only.');
 text=text.replace('[READS]','[READS]\nThe complete allowed argument schema for each method is supplied in STATE.queryCatalog. Encode method, arguments and purpose as nested fields inside archiveRequests using this task’s grouped simple-sheet format. These are host-dispatched read requests, not provider function calls: never emit tool_calls or a function-call envelope. Do not guess unknown arguments or place purpose inside arguments.');
 text=text.replace('[/READS]','Raw prose is supplied only as an authorized archival task object or an actual explicit original-text read. Ordinary writer context contains history and dossier records with references, never automatic raw-body injection.\n[/READS]');
 text=text.replace('[/INPUT]',DEFINITION_RULE+'\n[/INPUT]');
 text=text.replace('[/INPUT]','STATE.preferenceConstraints contains explicit user writing requirements, separate from native-variable rules. STATE.nativeRules contains only actual verified native-card rule material. Its protocol examples describe native semantics; return native_cells proposals in this task’s wire format and leave command serialization to the host. When STATE.archiveEnabled=false, keep every archival source slot and its original task text, but leave business templates/schemaChanges/changes empty; a source-authorized native_cells update remains eligible. Carry established source outcomes needed for continuity into source-identified brief constraints without claiming a durable write. When STATE.plotEnabled=false, keep scope and grounded constraints, but return creativeBrief.beats=[] and pendingChoices=[] instead of predesigning new story developments. The narrative writer still receives the current request and writes the scene.\n[/INPUT]');
 text=text.replace('[/DRAFT]','When STATE.FocusAgenda is supplied, add one individually identified creativeBrief.constraints entry for every object, covering its source-grounded current activity, immediate concern, information limits and the condition for a plausible next move; state a precise gap when material is missing. Carry concealed dynamics as source-row references and disclosure restrictions; their private content stays in its permissioned dossier. Use its referenced committed dossier first, and distinguish uncommitted definitions. Where plot design is enabled, develop selected moves into beats with a distinct purpose; remaining objects retain their own conditional dynamics rather than disappearing from consideration. If plot design is disabled, report grounded current dynamics and gaps only. A worldWindow that is absent or not ready authorizes no invented elapsed offstage event. Keep focus assessment separate from public disclosure, player decisions and world settlement; focus neither grants knowledge nor forces every object into the scene.\n[/DRAFT]');
 return text;
}
function modelRegistry(registry){
 assert(registry&&Array.isArray(registry.tables)&&Array.isArray(registry.types),'Missing actual V3 registry');
 const keys=new Set(['type','required','values','fields','items','idKey','formula','description','min','max','additionalProperties']);
 const field=d=>Object.fromEntries(Object.entries(d).filter(([k])=>keys.has(k)).map(([k,v])=>[k,k==='fields'?Object.fromEntries(Object.entries(v).map(([n,x])=>[n,field(x)])):k==='items'?field(v):clone(v)]));
 return Object.fromEntries(['tables','types'].map(key=>[key,registry[key].map(r=>({id:r.id,name:r.name,...(r.owner?{owner:r.owner}:{}),...(r.parent?{parent:r.parent}:{}),...(r.aliases?.length?{aliases:clone(r.aliases)}:{}),fields:Object.fromEntries(Object.entries(r.fields).map(([k,d])=>[k,field(d)]))}))]));
}
function preflightPreferenceRules(c){
 const selected=narrativeRuleRows(c.m),lines=[];
 for(const row of selected){if(['D03','D04'].includes(row.id))continue;const rule=row.custom?row.text:ENGLISH_RULES[row.id]?.[row.choice];if(rule)lines.push(rule);}
 lines.push(languageRule(c.m),'Writer body budget: '+c.range.下限+'–'+c.range.上限+' '+c.range.单位+'.');
 if(c.m.角色主动性)lines.push('Character initiative: '+c.m.角色主动性+'.');
 if(c.fog)lines.push('Information fog: preserve plausible mistaken beliefs and emotional biases as separate from source truth, with grounded consequences and credible opportunities to clarify.');
 if(c.n.缇斯亚叙事描写重心?.length)lines.push('Description focus: '+c.n.缇斯亚叙事描写重心.join('、')+'.');
 for(const text of Object.values(userVoiceRules(c.m)))if(text)lines.push(text);
 for(const text of Object.values(c.configuration.extensionRules??{}))if(typeof text==='string'&&text.trim())lines.push(text);
 for(const r of c.resources.filter(r=>r.kind!=='style')){const text=resourceText(r,c.world);if(text)lines.push(text);}
 if(c.world.switches?.boundary?.trim())lines.push(c.world.switches.boundary.trim());
 return lines.join('\n');
}
export function compileFullPreflight({input,configurationSnapshot,settings,nativecontext,includeEmpty=false}={}){
 assert(input?.view?.rows&&typeof input.requestKey==='string'&&Array.isArray(input.archiveSources),'Actual prepared preflight input required');
 const c=context({configurationSnapshot,settings,nativecontext}),entries=clone(V2_ENTRIES),out=Object.fromEntries(entries.map(e=>[e.identifier,e.content]));
 const source={currentUser:input.currentUser??'',archiveSources:clone(input.archiveSources),preferenceSources:clone(input.preferenceSources??[])};
 const state={requestKey:input.requestKey,generationType:input.generationType,registry:modelRegistry(input.view.registry),rows:clone(input.view.rows)};
 const focus=focusAgenda(input,input.view.rows);if(focus.length)state.FocusAgenda=focus;
 const definitions=definitionMaterials(input,input.view.rows);if(definitions.selected)state.SelectedDefinitions=definitions.selected;if(definitions.conflicts.length)state.DefinitionConflicts=definitions.conflicts;
 for(const k of ['nativeRules','nativeRuleSources','rulePolicy','preferenceConstraints','archiveEnabled','plotEnabled','preferenceContext','preferencesEnabled','worldWindow','queryCatalog','playerObjects','onstageObjects','focusObjects','focusText','timelineAnchor','dueChecks','eventResults','additionalInput','advancedReroll','knownArchiveIds'])if(input[k]!==undefined)state[k]=clone(input[k]);
 if(input.generationType==='advanced-reroll')state.additionalInput={...(state.additionalInput??{}),directives:input.advancedReroll.instruction};
 out.tisya_current_input=data('TISYA.DATA.SOURCE',source);out.tisya_material_current_state=data('TISYA.DATA.STATE',state);
 out.tisya_material_rule_material=data('TISYA.DATA.PREFERENCES',{rowRefs:input.preferenceProjection?.rows?.map(r=>r.id)??[],explicit:preflightPreferenceRules(c),style:styles(c)});
 out.tisya_material_memory_archive=data('TISYA.DATA.ARCHIVE',input.latestTemporary===undefined?undefined:{latestTemporary:input.latestTemporary});
 out.tisya_material_tool_result=data('TISYA.DATA.TOOLS',input.toolReceipts);
 out.tisya_registry=fullPreflightRules();out.tisya_think_commit=out.tisya_think_commit.replace(', and an explicitly supplied undefined value as 〈缺失〉','');
 const messages=entries.map(e=>({role:e.role,content:out[e.identifier],identifier:e.identifier})).filter(e=>includeEmpty||e.content);
 assert(messages.every(e=>!e.content.includes('«')),'Unfilled preflight placeholder');return messages;
}

export function toImportablePreset(messages,{name='Tisya Full Narrative EN V3'}={}){
 const prompts=messages.map((m,i)=>({identifier:m.identifier??'tisya_full_'+i,name:m.identifier??'Tisya '+i,role:m.role,content:m.content,enabled:true,system_prompt:false,marker:false,injection_position:0,injection_depth:4,forbid_overrides:false}));
 return {name,extensions:{tisya:{version:FULL_PRESET_VERSION,runtime:'tisya-v3',materialOwner:'compileFullNarrative/compileFullPreflight',requiresPairedPlugin:true}},prompts,prompt_order:[{character_id:100001,order:prompts.map(p=>({identifier:p.identifier,enabled:true}))}]};
}
export function presetText(messages,title='TISYA — FULL PRESET — ENGLISH'){
 return title+'\n\n'+messages.map((m,i)=>`===== ${String(i+1).padStart(2,'0')} | ${m.identifier} | ${m.role} =====\n${m.content}`).join('\n\n')+'\n';
}
export function fullSourceEntries(){return clone(W22_ENTRIES);}
export function fullPreflightSourceEntries(){return clone(V2_ENTRIES).map(e=>({...e,content:e.identifier==='tisya_registry'?fullPreflightRules():e.content}));}
