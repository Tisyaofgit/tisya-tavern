// The compact permission spelling is user-facing wire syntax. Scoped policies
// remain supported for explicit audience/field overrides, never required merely
// to make a compact record parse. Keep the frozen upstream source unchanged.
function once(text,from,to){if(text.split(from).length!==2)throw Error('回复格式来源锚点不匹配');return text.replace(from,to);}
export function applyWireContract(entries){
 let registry=entries.tisya_registry;
 registry=once(registry,
  '@PERM := [level,read_auth,emit_auth,knowers];level=A/B/C/D/E/null;other cells=bracketed lists of scoped audience/subject names or null;names need no quotation marks;[]=known none,null=unresolved;never treat unresolved as public',
  '@PERM := one compact grade A/B/C/D/E or ~;A and ~ mean public;B/C/D/E retain their M.08 classification and do not by themselves authorize reader display or other characters;lowercase grades are readable;~ means public only in a permission cell. Explicit scoped form [level,read_auth,emit_auth,knowers] remains available for source-established audiences: level=A/B/C/D/E/null,other cells=bracketed name lists or null;[]=known none,null=unresolved;never invent a scope or treat unresolved as public');
 registry=once(registry,
  'grade alone grants neither read nor emit;no evidence→retain null+@GAP for dependent use',
  'compact A/~ require established public availability;compact B–E allow internal narrative/record organization only,not inferred character knowledge or public display;use an explicit scoped form when source-authorized audiences must be carried;no evidence→[null,null,null,null]+@GAP');
 registry=once(registry,'public field requires "读者" in emit_auth plus authorized fragment/context','public field requires compact A/~ or explicit "读者" in emit_auth plus authorized fragment/context');
 registry=once(registry,'internal stage requires its purpose in read_auth','internal stage requires compact-grade internal-purpose access or its purpose in explicit read_auth');
 entries.tisya_registry=registry;
 let inner=entries.tisya_inner_chain;
 inner=once(inner,'PERM:权限 cells use @PERM or @FIELD_PERM;array scopes retain list types;unresolved cells retain null,!guess public access','PERM:权限 cells accept one A/B/C/D/E or ~;~ is public here;explicit scoped @PERM and @FIELD_PERM remain valid;keep source restrictions and unknowns,!guess public access');
 inner=once(inner,'LIST:顿号-separated names/items;known-empty=[],unavailable optional list=~;','LIST:顿号-separated names/items or bracketed comma-separated string lists;known-empty=[],unavailable optional list=~;');
 inner=once(inner,'VALUE:~ marks schema-permitted unavailable optional metadata;','VALUE:outside permission cells,~ marks schema-permitted unavailable optional metadata;');
 inner=inner.replace('serialize A—E/read_auth/emit_auth/knowers','serialize compact A–E/~ or source-established scoped permissions per @M.08');
 if(inner.includes('MVU is disabled;do not emit MVU operations')){
  inner=once(inner,'权限：vars|{已输出操作的实际JSON Pointer}|{本操作权限}\n','');
  inner=once(inner,'@OPTION valid variable operations replace <vars/> with <vars format="json">...</vars>;final output contains actual operations only','@OPTION MVU disabled→only <vars/>;omit vars permission rows;do not move disabled operations to another block');
 }
 // Narrative states carry their own policy. The optional native route is
 // valid only with a supplied registry AND an actual row in this same reply.
 inner=inner.replace('@OPTION permission rows require actual targets;', '@OPTION 权限注记只从本轮已输出目标生成；先核目标再写注记。叙事状态自带权限，不生成status注记；原生状态注记仅用[类型,对象,字段]且逐项匹配本轮原生状态行。标题时间不是状态写入；不得照抄历史注记或以JSON Pointer填status。无原生状态行→省略全部status注记；<vars/>→省略全部vars注记。permission rows require actual targets;');
 const top=inner.match(/<task format="pipes">([\s\S]*?)<\/task>/)?.[1];
 if(top===undefined)throw Error('回复格式来源锚点不匹配：task');
 const count=(top.match(/^心声：有内容\|/gm)??[]).length;
 inner=inner.replace('opening←actual input/task;closing←completed progress',
  'task依据本轮输入与开局；next依据本轮正文的实际进展。同一方向在两处各写新内容：上评任务，下评落地结果；禁止复制、近义改写或回放开篇心声，未发生情节不得当成结果。');
 inner=inner.replace('one content row/applicable enabled direction at each position',`task与next各输出${count}条心声；每处将已选方向逐项写一条，顺序按模板；不拆分到两处、不合并、不减项`);
 inner=inner.replace('回应用户评价：以缇斯亚身份直接回应用户对缇斯亚说的话、问题或感想，与用户聊天互动。','回应用户评价：以缇斯亚身份回应用户实际的话、问题或感想；只有指令时就接这句话，不虚构用户发言。');
 inner=inner.replace('no public basis→omit item;all enabled items omitted→心声：沉默;disabled→心声：关闭',count?'只评可公开的输入、开局或已发生结果；依据不足就点明未知，不编造情节或私密信息；仍保留该方向一条。':'未选心声：两处均写心声：关闭。');
 inner=inner.replace('selected opening hearts/moods;', 'both heart positions: exact selected directions/count and allowed moods per @HEART;');
 inner=inner.replace('@EXTENSION Only supplied triggered components may be displayed;display grants no state write', '@BRIEF 任务摘要只点明本轮目标；七项审计各给一句实际核验结论及必要字段/段号，不复述剧情、输入清单或自夸；已交付只写尚未表达的新增结果，无则省略。辅助字段删去同义叠加、空泛修辞和无依据的极端评价。\n@EXTENSION Only supplied triggered components may be displayed;display grants no state write');
 entries.tisya_inner_chain=inner;
}
