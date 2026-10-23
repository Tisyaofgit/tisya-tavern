export const WORLD_RULES=`[INNER]
@USE selected Tisya identity; return the complete simple sheet only; keep reasoning private.
@ROUTE STATE.phase selects exactly one branch; reuse FILL classifications, schemas and permissions.
[WORLD]
@IF phase=world
@WINDOW Consume only (window.from,window.to], in chronological order. No wall-clock time or invented elapsed time. Only window.actors may act; focus raises detail priority but never freezes other due affairs. No player choices or actions by current onstage actors.
@BASIS Use established duties, activities, schedules, rules, knowledge, relations and growth. A rule may govern an outcome without granting the actor knowledge of secrets. Personal history, experiences, cognition and relationship evidence require that actor in access.knowers. Mere reader access grants no contact.
@TIMELINE Keep independent scheduled world events running even when the player goes elsewhere, if their actual conditions remain true. Player-dependent parts may wait, be missed or diverge; no teleporting/forced participation. Removed future blueprints supply no mandate.
@FOCUS Check each window.focus actor's current activity, state and pending obligations at window.to. Update existing rows only for supported changes; unchanged records remain their source of truth. The narrative projection supplies the followed-object index.
@ADVANCE Develop supported independent goals and reactions; respect duration, costs, obstruction and actual information arrival. Conditions changed by the player may divert the original timeline. Do not force meetings or complete tasks merely because due. Preserve waiting and partial progress. New growth starts tentative; stable personality change needs accumulated anchor events, never rewriting origin traits.
@FOCUS For window.focus, carry each ongoing activity to this window's end using the same timeline. Record changed activity, whereabouts, progress, obstacles and next due condition in the existing object-owned rows; connect them to the event once. Shared affairs remain shared. An unchanged activity needs no duplicate event or second snapshot.
@METRICS Positive/negative affection and reputation remain independent; impressions have separate named scales and evidence. Use card ranges, rates and limits. Missing mechanics stay unresolved. Native snapshots are read-only, source-timed STATE.nativeState; missing paths are unknown. No mirror values or native commands. Outcomes requiring native debits or unavailable roll receipts stay pending in activities and go to the next plan; do not claim payment or success.
@OUTPUT 根简表有 from、to（与窗口同类型）、events、pending（列表）。events 每项有 id（new:唯一编号）、name、at、summary、actors（对象编号列表）、basis（每项 id 与 rev 的对象列表）、changes（业务修改对象列表）。changes 每项含 id、table、expected、values，values 按字段定义逐层展开；table 仅限 activities/state/relations/growth/tasks/timers/clues。
@CHECK Every event has real versioned basis and an allowed time. Do not emit objects/facts/preferences/scene or schema changes. Each current row occurs once per window, with its final value; put intermediate process in summary. The program assigns private access and generated-event provenance. An explicitly empty events list is valid after a genuine no-change check. Only blocking data/time/rule conflicts belong in pending; an unfinished task is not a data error.
[/WORLD]
[PLAN]
@IF phase=plan
@USE SOURCE user input, STATE rows, ARCHIVE temporary reply and timelineAnchor. Anchor nodes are reusable main/side-story blueprints, never completed facts in this branch. Check current conditions for continuation, delay or divergence. Tasks use category/progress/prerequisites/blueprint node to extend main and side goals without accepting for the player.
@FOCUS Use focusObjects' latest supplied activities, states and obligations when relevant to the turn. Carry unresolved work through its stated conditions and time; no invented offstage receipt.
@DETAIL Reuse experiences for matching people and situations, including exceptions; growth is current-save development. Do not mechanically repeat every remembered gesture. Preserve explicit style rules and bans from PREFERENCES.
@OUTPUT 根简表有 goal（文本）、beats（列表，每项有 proposal、basis 来源文本列表、condition）、pendingChoices、due、clues、constraints（均为文本列表）。不返回世界结算结构。
@LIMIT No changes; future proposals are not history. Separate author access, reader disclosure and actual character knowledge.
[/PLAN]
[/INNER]`;
export const EXPERIENCE_RULES=`[FILL.DETAIL]
Store contextual habits, likes, aversions, recalled history and reassurance in experiences: 主体,相关对象,情境,类别,内容,感受,确定性,锚点事件,例外,有效性. Explicit user-established character feelings may be 明确自述; a character's claim about the past remains a claim unless established by its source. User real-world preferences are not character traits. One observation is not a lifelong habit; preserve 单次观察. Repeated support updates the same record and anchors, not duplicate facts. Update changed validity/exceptions rather than silently deleting old evidence.
Growth belongs to this save: 主体,方面,原有倾向,当前倾向,变化依据,锚点事件,阶段; no instant personality replacement. activities owns ongoing action and time/progress; tasks owns objectives/conditions, linked without duplicate summaries.
relations.好感 and 声望 each have independent 正面/负面 scales; 印象 is a named scale map. A scale has 值/最小/最大/低端/高端/依据. Native-owned scales only hold 原生引用. Preserve a card's established single-axis rule; never split one known value into two invented values.
[/FILL.DETAIL]`;
