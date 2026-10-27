import {applyUtilityAuthoring} from '../config/authoring-mode.js';
import {applyCreativeRevision} from './creative.mjs';
import {PIPE_ROWS} from './pipes.mjs';
import {sixEntries,SIX_KEYS} from '../six/preset.mjs';
export const ONEPASS_ID='tisya-onepass-1';
export const ONEPASS_KEYS=SIX_KEYS;
export const isOnePassPreset=source=>source?.protocol===ONEPASS_ID||source?.prompts?.some(p=>p.content?.includes('{{tisya_live_onepass_')||p.identifier==='tisya_registry'&&p.content?.includes('[ONEPASS.CONTRACT]')&&p.content.includes('<reply id="'+ONEPASS_ID+'">'));
export function onePassEntries(configuration,moods,options={}){
 const out=sixEntries(configuration,moods,options);
 if(options.structured===false)return out;
 out.tisya_registry=out.tisya_registry
  .replace('Preserve all six blocks and their order, including empty extra and actions. Public think blocks contain brief creative conclusions, never private reasoning.','Preserve all eleven blocks in order: task/think-before/title/body/think-after/status/extra/vars/archive/memory/actions. task and both think blocks contain public conclusions only, never private reasoning. Historical reply layouts are source material, not this turn’s output contract.')
  .replace('<reply>','<reply id="'+ONEPASS_ID+'">\n<task format="pipes">\n偏好：明确要求|{effective scope}|{exact user feedback or confirmed preference source}|{this turn application}\n偏好：候选|{this turn only}|{actual feedback evidence}|{reversible interpretation, not confirmed}\n</task>')
  .replace('<title>','<title format="pipes">')
  .replace('<extra>',machineSkeleton('status')+'\n<extra>')
  .replace('</extra>','</extra>\n'+['vars','archive','memory'].map(machineSkeleton).join('\n'));
 out.tisya_registry=out.tisya_registry.replace('[/REGISTRY]',ONEPASS_CONTRACT+'\n[/REGISTRY]');
 out.tisya_task_start=out.tisya_task_start.replace('No independent form or archival execution is implied.','ONEPASS_STATE supplies the actual registry, rows, revisions, focus and elapsed-world window. Classify these facts before creation; produce their updates once in this reply.');
 out.tisya_delivery_warning+='\nUse the complete eleven-block ONEPASS contract. Preserve every outer block, both public think digests and their configured comments. Follow the fixed-column pipes contract for state and archival proposals. Never copy historical layouts or claim persistence without a host receipt.';
 applyCreativeRevision(out,configuration);
 return applyUtilityAuthoring(out,configuration.world.modes.narrative);
}
const standards={
 所属事实:'Owning fact ID (must have a 事实发现 row in this batch)',快照:'Exact ONEPASS_STATE.basis',提交编号:'All submitted primary row IDs, including vars (join with 、; none [])',关联编号:'Related row ID (or ~)',缺项:'Precise missing prerequisite',解除条件:'Condition that permits resuming',
 证据:'Current body paragraph IDs (P1、P2; no evidence: pending)',原文段号:'Current body paragraph IDs (P1、P2; = inherits evidence)',读者:'Authorized reader IDs (literal 读者 only if permitted; none [])',知情者:'Object IDs with actual knowledge (none []; unknown ~)',
 对象:'Object ID list',主体:'Single object ID (= only for one common object)',参与者:'Participant IDs (= inherits common objects)',事实:'Fact ID list',相关对象:'Related object IDs',锚点事件:'Occurred event IDs',
 确认程度:'K0/K1/K2/K3 (certainty is separate from belief truth)',登记字段路径:'Exact registered table.field for this row (e.g. state.值, never an invented field or native path)',原值:'Exact snapshot field value',新值:'Supported number or true/false (null only if nullable)',变化后文本:'Changed narrative description',
 地点:'Place ID list',故事时间:'Established story time (unknown ~)',生效时间:'Established effective time',到期轮次:'Absolute retained AI reply count (not a delay in turns)',
 公开范围:'Authorized reader/object IDs (access is not acquisition)',阶段:'埋设/推进/回收/作废',类别:'喜好/厌恶/习惯/回忆/安心方式/边界',默契层次:'共同经历/明确约定/单方联想/待确认',确定性:'明确自述/反复表现/单次观察/暂定',状态:'等待/到期/完成/取消',领域:'方向/法则/空间/生态/社会/生活/文化/时间',
 获知途径:'Actual acquisition channel',认识:'Changed belief or understanding',心理:'Supported psychological change',授权依据:'Source authority for this disclosure',
 情境:'Applicable situation',内容:'Supported habit, preference or memory anchor',感受:'Authorized feeling',例外:'Exception or limitation',表现方式:'Observable expression',回应边界:'Response boundary',内在动因:'Authorized inner motive',初始成因:'Established origin',
 时间范围:'Occurred time interval',经过:'What actually happened',结果:'Actual result',场面:'Distinctive scene detail',台词:'Exact finished line',意象:'Memorable image',前因:'Established cause',影响:'Actual consequence',后续:'Established follow-through (not a candidate)',情感余波:'Authorized emotional aftermath',
 命题:'Established fact proposition',条件:'Applicability condition',验证状态:'Verification status (supported free text, not a truth guarantee)',已出现内容:'Clue content already present in this body',推进条件:'Condition for advancing the clue',
 时间基准:'Established clock or timing basis',起点:'Established starting point',到期时间:'Due time on that basis',触发条件:'Actual trigger condition',失效条件:'Expiry/cancellation condition',重复规则:'Established recurrence rule',
 时期:'Established period',选择:'Occurred choice',后果:'Actual consequence',当下影响:'Present effect',原文:'Exact excerpt locatable in this body',当时理解:'Authorized understanding at that time',
 性质:'Established relationship nature',形成经过:'How the relationship formed',相处方式:'Established interaction pattern',主体边界:'Subject boundary',成立条件:'Condition under which it holds',揭示条件:'Authorized reveal condition',影响范围:'Affected scope',适用范围:'Applicable scope'
};
const idLists=new Set(['替代事实','任务','事件','关联事件','前置事件','后续事件','涉及对象','地点引用','参与者引用','关联对象']);
const textLists=new Set(['动作','神态','语言','触发线索','标签','可观察线索']);
function cellHint(kind,key){
 if(key==='编号')return ['描述','变量'].includes(kind)?'Existing row alias/ID (snapshot only; never +ID)':'Existing row alias/ID or unique +ID (new row only)';
 if(key==='有效性')return kind==='描述'?'有效/失效/待确认':'有效/已改变/待确认';
 if(key==='生效时间'&&kind==='事实发现')return 'Established effective time (= inherits common story time)';
 const hint=standards[key]??(idLists.has(key)?'Registered ID list':textLists.has(key)?'Supported text list':null);
 if(!hint)throw Error('Missing one-pass column guidance: '+kind+'.'+key);
 return hint;
}
function machineSkeleton(block){
 const lines=Object.entries(PIPE_ROWS[block]).map(([kind,fields])=>kind+'：'+fields.map(key=>'<'+cellHint(kind,key)+'>').join('|'));
 return '<'+block+' format="pipes">\n'+lines.join('\n')+'\n</'+block+'>';
}
export const ONEPASS_CONTRACT=String.raw`
[ONEPASS.CONTRACT]
Use one native generation for prose and fixed-column record proposals; no extra form, memory or preference model call. The host validates against the same snapshot before saving; output is not a save receipt.
Keep all eleven blocks in order: task/think-before/title/body/think-after/status/extra/vars/archive/memory/actions. Historical layouts do not override this contract. These instructions are English; prose and public cell text still follow the configured output language. Keep Chinese wire labels/enums exactly as shown.
task: actual feedback only, always 偏好：status|scope|source|application, with four nonempty cells; status is 明确要求 or 候选. Do not drop 偏好：. When summaries are enabled, retain the five before choices in order and seven distinct after outcomes; absent outcomes use 留白|original category|specific reason. Preserve enabled comments/moods. Every enabled comment direction MUST have one row in EACH think phase, before AND after: three selected directions mean six rows total, never three shared rows. After-comments respond to the finished result and must not repeat the opening. If no actual user appraisal exists, explicitly note its absence briefly instead of inventing one.
Public columns: ordinary before/after rows 2; 设计 and 解锁 4; comments, 留白 and task rows inside after 3. Replace cell contents only; question clauses are not extra columns. Escape literal pipes. Both thinks contain brief public creative conclusions, never private reasoning.
Ownership: memory = occurred events, facts, clues, timers and fact subtables; status = narrative descriptions, cognition, habit anchors; vars = existing business numbers/booleans; archive = batch IDs and pending gaps. No extra offstage settlement or candidates presented as events. extra retains authorized card displays, never write commands.
Wire: fullwidth ： after each row label; | between cells; newline or & between records; 、 between list items. Lists are 1、2 or P1、P2, NOT [1,2], [Name,Name] or JSON; only [] denotes an empty list. Escape literal backslash, pipe, &, 、, LF, CR, TAB as \\, \|, \&, \、, \n, \r, \t; then XML-escape & and < once. A record-separator & may be &amp;. Keep column order/count; omit only trailing ~ cells, retaining interior ~ or empty cells. Do not emit placeholder questions/instructions.
~ = unprovided, retaining old value on update; = inherits only a same-meaning/type common value; ! clears an optional clearable field; [] = actual empty list; null requires a nullable field. Preserve 0 and false. Escape literal ~, =, ! as \~, \=, \!. Booleans are true/false only; enums must match the column or snapshot schema exactly. Verification status is free text, not an enum or proof of truth.
共用 lasts until the next common row in the SAME block. It cannot inherit from another block. In record rows, = may use matching common objects/time/evidence; a single subject can inherit only one object. New rows need explicit evidence, readers and knowers. [] means nobody, never unknown permission. Omitted access on existing rows preserves it. Intimacy, co-presence or source visibility does not establish knowledge.
References: use numeric aliases from ONEPASS_STATE.aliases or exact existing IDs, never character/place names. New primary rows use unique +E1/+F1/+C1 etc.; same-batch references are allowed. The host uses that ID as the new row's internal name. This wire cannot create missing object dossiers: keep dependent records pending. Snapshot rows bind revisions; never invent revisions.
UPDATE versus CREATE: 描述 and 变量 require EXISTING row IDs; +IDs are invalid there. Use the record's ID, not its owner's ID. Paths must be registered direct table.field keys belonging to that row. For a state row whose 字段 names a property, its stored value may be state.值; do not turn the property name into an invented path. 描述 updates text only; its optional validity/event columns require matching registered fields, otherwise ~. 变量 updates numeric/boolean business fields: exact old value, common object matching the stored owner, supported new value. Missing rows/paths go pending, not JSON or guessed IDs. One primary operation per row ID across blocks. preferences/native_cells and native-bound values retain their independent writer. Use dedicated cognition/habit rows; one charming beat cannot establish a lasting habit/preference.
归档: exactly one row; copy basis verbatim and list EVERY submitted primary ID from memory, status AND vars, once each. Do not list object/evidence-only references or count fact subtables again. No changes: []. A pending row is 关联编号|precise gap|release condition; use ~ if its record ID is unresolved, not a name.
Evidence is P1、P2 etc. from this completed body; the host retains full paragraphs. Old-source-only items without current locatable evidence remain pending; never invent prose/events. Omitted event paragraph IDs inherit common evidence. Each fact subtable must belong to a 事实发现 row in this batch; at most one of each subtype per fact. Tables do not expand secret-disclosure permission.
Emit only new/materially changed records. With summaries enabled, consider each followed object's actual knowledge, affairs, wishes, triggers and feasible actions individually; keep exact missing dossier/location gaps without forced appearances or player-centered devotion. Empty status/vars/memory blocks may stay empty or self-close; archive retains the real basis. Missing required content/references goes in archive 待定 with its release condition.
Clues record only content already present and its current function: planted, advanced or paid off in actual prose, without invented history. Local echoes may remain in events; create clues for cross-turn value. Do not archive the before plan or after summary as duplicate events.
[/ONEPASS.CONTRACT]`;
