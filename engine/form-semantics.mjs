// Field ownership is shared by form instructions and narrative projection.
// A merge is explicit; equal strings in unrelated fields are never evidence.
export const FIELD_MERGES={T_STATIC_PLACES:{legacy_f0343:'macro_region'},X_NETWORK_ITEMS:{author:'by'}};
export const FIELD_HINTS={
 T_STATIC_PLACES:{macro_region:'所属地域或地理位置；上级地点已有记录时引用上级，不复写其完整介绍',visual_atmosphere:'只写可见的色彩、轮廓、材质观感与空间观感；灯光数值归光照，布局设施归特征，人物往事归事件',legacy_f0344:'只写固定布局、设施、用途和可交互结构；颜色观感归视觉氛围，人物曾在此做什么归事件',light:'光源、明暗、照明覆盖与昼夜变化',background_sound:'地点通常可听见的声音；本轮临时声音归场景',smell:'地点稳定气味；人物气味归人物档案',access_conditions:'谁在什么条件下可进入；公共城市不填写私人住宅门禁'},
 T_STATIC_ITEMS_SKILLS:{identified_full_desc:'程序从独立字段组织完整说明；不另填一份综合副本',shape:'外形、尺寸与结构；材质单列',material:'构成材料及加工材料；不复述外形',usage:'能用来完成什么目标；操作步骤和适用条件另填',rule_effect:'确切作用、强度、作用对象和条件；没有数值规则时填写描述，不编固定消耗',narrative_meaning:'这件事物不可替代的象征或关系意义；没有则省略，不以通用来历凑写',narrative_manifest:'实际使用时旁人能够观察的动作、声音与结果；不复写能力定义、效果数字或代价',origin:'获得或形成经过；已有事件用关联，避免复制事件全文',consumption:'只有明定固定消耗才填数值；没有固定点数不等于消耗为0',cooldown:'再次可用的恢复条件；日常休息只有确实限制该能力时才填'},
 T_CHAR_DOSSIER:{
  name:'角色当前对外使用的名称；真名与别名分别填写，不复制完整身份介绍',
  true_name:'有来源支持的真名；只知晓姓氏时可暂存，后续有依据可补全或修正；真名不是身份键，修改不改变人物与关联；公开称呼归显示名称，知情范围归真名知情锁级',
  aliases:'其他稳定称呼；临时绰号只有一次语境依据时不扩成稳定别名',
  gender:'来源明确的性别表述；人物自己的性别认同另填',gender_identity:'人物自己的性别认同；没有明确自述或授权心理依据时不推断',
  life_stage:'当前生命阶段及其社会含义；具体年龄数值与参照时点另填',age_reference_time:'年龄成立的故事时点；不使用现实设备时间代替',
  birth_precision:'出生时间实际已知到何种精度；未知日期不能补成精确日',
  public_identity:'他人可公开识别的身份；该身份实际承担的义务归社会身份职责',social_identity_duty:'该身份要求人物持续承担的职责；不重复公开称谓',
  overall_physique:'稳定身型、身高、体重；临时姿态与伤势归实时状态',facial_features:'五官、发色、肤色和瞳色；不重复身型',habitual_bearing:'跨场景的姿态倾向；具体重复动作归习惯',sensory_impression:'人物通常带来的气味、体温或触感印象；外貌与音色各归本格',
  core_personality_tags:'少量性格分类词；不复制具体反应',scene_personality_desc:'性格在不同情境下如何切换；具体触发与动作归习惯',
  desire_double_helix:'相互牵制的两项长期诉求；本轮强度归心性量值',core_contradiction:'两项诉求为何不能同时满足；不复述诉求',choice_cost:'为了坚持选择会实际失去什么',fatal_fracture_points:'恐惧的具体情景及失去功能的边界；不将恐惧写成已经发生的事实',
  value_priorities:'发生冲突时的价值排序',judgment_method:'如何寻找证据、作判断和纠正判断；具体技能操作归操作流程',emotion_handling:'情绪出现和受压时如何调节或失控；单次心情归实时状态',
  strengths:'稳定性情长处；专业技能归擅长本领',weaknesses:'稳定性情短处；不会的技能归不会的不足项',refusal_boundaries:'跨对象、跨场景的通用拒绝行为；特定关系边界归对应关系',
  negotiation_conditions:'人物可被协商改变决定的条件；不能用协商条件软化永久拒绝',change_conditions:'长期性格或价值改变所需的经历与证据；不是本轮情绪波动',alignment_axes:'人物立场与自我定位；不用单一阵营标签替代价值取舍',
  mask_presentation:'对外刻意维持的形象与表现；真实内在差异另填',mask_purpose:'维持面具要保护、获得或回避什么；须有独立目的依据',mask_gap:'外在形象与真实反应之间的稳定落差；何时显露归刺激外显映射',mask_fissures:'何种刺激下面具松动及可观察差异；不再写一遍真实性格',
  livelihood:'长期职业、社会角色与谋生方式；公开称谓归公开身份',routine:'日常作息和反复做法；特定对象互动归对应关系',interests:'持续关注或参与的活动主题；好恶评价及其原因另填',likes_with_reasons:'明确喜爱及形成原因；不只把活动名称复抄到兴趣',dislikes_with_reasons:'明确厌恶及形成原因；通用拒绝行为归拒绝边界',
  long_term_goals:'人物主动追求的长期方向；任务进度与短期下一步另填',
  diction:'惯常用词、比喻与话题选择；长短快慢归句式节奏',voice:'音色、音高与可听质感；选词与句速另填',cadence:'语句长短、快慢及展开方式；具体用词归措辞',humor:'什么会使其发笑、如何开玩笑及分寸；不是作者搞笑标签',silence_conditions:'人物在何种条件下主动沉默；单次没有发言不算稳定条件',relational_diff:'面对不同对象时稳定改变的表达方式；具体关系经过归关系',banned_cliches:'该人物不会使用的台词套路；不是全局文风禁词',
  workflow:'跨多项本领的工作组织方式；某项技能步骤归该技能',manifest:'人物多种本领共同形成的辨识风格；不重复单项技能表现',skilled_abilities:'只引用已登记本领名称；熟练程度归人物本领掌握',untrained_deficits:'明确不会或缺乏训练的事项；不是性情短处',ability_costs_limits:'跨能力共通的个体限制；单项代价归对应能力',
  unique_narrative_role:'该人物在故事中独有的功能、视角或不可替代选择；不复述人物简介',current_stage_anchor:'引用人物当前成长阶段；阶段内变化与历史锚点保持各自记录',
  short_term_plans:'由任务和生活计划读取，不另存摘要副本',legacy_f0367:'只写年龄依据确有冲突的内容；无冲突省略，不塞入身高、出生地或关系阶段'
 },

 T_CHAR_RELATION_ORIGINS:{
  nature:'已经确立的联系性质；不在这里复述形成过程',formation_process:'联系如何形成；已有事件只引用，不复抄事件全文',interaction_pattern:'主体对此对象的惯常互动、表达与态度；单次事件不泛化成惯例',role_division:'双方稳定分工或职责；一般性格能力归人物档案',subject_boundary:'仅本关系特有的范围限制与边界；人物通用底线不重复',precondition:'关系成立的既有条件；不是未来恋爱或和解计划',before_state:'形成或转变前的关系状态',after_state:'形成或转变后的关系状态',understanding_difference:'双方各自如何理解同一关系；不代替客观关系性质',shared_event_chain:'实际共同经历的关联；不写成一篇公共摘要',promises_tacit:'已成立的承诺与默契；未说出口的期待需标明主体与确信',unresolved_tension:'仍存在的具体矛盾及牵引；不预设必然解决'
 },
 T_CHAR_SECRETS:{
  fact_proposition:'隐情的事实正文，只在此写完整真相',observable_clues:'他人实际可观察的线索；不能直接泄入真相全文',unlock_condition:'允许揭示隐情的明确条件；不是自动知情条件',impact_scope:'隐情暴露或持续存在造成的影响；知情人物另填实际知情引用',related_object_refs:'隐情直接涉及的对象；物品来源者或地点不因此自动知情',allowed_reader_refs:'作者/读者读取权限，不等于世界内人物知情',allowed_disclosure_positions:'允许向谁或在何种范围披露；实际已经知情另填',cognition_refs:'引用人物实际获知记录；不得用读者可见代替人物知情'
 },
 T_DYN_EVENTS:{
  spine_digest:'只写一行因果梗概供索引；完整过程与独立结果另填',cause:'本次事件已确认的前因；不把相邻事件自动当因果',full_process:'梗概不足以保留的关键经过；不逐句复抄正文',result:'事件实际落定的结果；影响与余波分别填写',impact:'事件结束后仍持续的客观影响；人物感受归情感余波',scene_blocking:'确有需要的场面调度与空间动作；不代替事件经过',core_imagery:'反复或承载意义的核心意象；单次普通物件不凑写',foreshadowing:'已埋设且指向后续的具体线索；不能提前写成已揭晓',unfinished_followup:'事件结束时仍未完成的牵引；下一步计划不等于已发生',emotional_aftermath:'事件后仍持续的情绪后果；各方当时心理另填',multi_party_psychology:'各主体在事件当时的授权心理与误解；按主体区分',before_state:'事件前已确认的相关状态',after_state:'事件后实际形成的相关状态',action_response_chain:'有顺序依据的动作与回应；不补写原文没有的来回',narrative_function:'该事件在故事中实际承担的独特作用；不复述事件摘要',lifecycle_status:'事件实际结束后填已结束；不要仅因换场景或开始另一事件而提前结束本事件'
 },
 T_DYN_COGNITION:{
  subject_ref:'只填写实际持有该认知或误信的人物；读者、作者和其他人物知情不能代替本人记录',event_ref:'认知实际来源事件；事件结束后由统一服务结算本人确信，不复制事件客观真相',epistemic_level:'误信使用K_MIS；不得为了让人物继续相信错误内容而伪填K3',subjective_belief:'只写该人物本人当前实际相信的完整内容；后续修正通过新记录和修正关联表达，不用客观真相覆盖当时误信',belief_truth_status:'作者侧核验结果，不向人物投影；人物误信不会因为此字段而自动被纠正',supersedes_ref:'只有新记录明确取代同一人物旧认知时填写；跨人物、同名或仅涉及同一事件都不能建立修正链',lifecycle_phase:'由事件结束、角色离场和后续修正统一结算；离场确信仍是本人主观认知，不等于客观事实',recall_label:'由服务派生的角色认知编号；检索只选择记录，不改写编号或信念'
 },
 T_CHAR_ANCHORS:{name:'一段可辨认的个人记忆；不使用日常习惯名称',category:'记忆的性质；反复动作单独填人物习惯',origin_event_ref:'引用实际发生的事件；事件经过只保存在事件表',initial_origin:'当事人如何理解记忆的成因；不重述客观事件',legacy_f0220:'只补关联事件未记录的主观记忆片段',trigger_situation:'什么情境会唤起此段记忆',trigger_cues:'能唤起记忆的具体感官线索',internal_motive:'唤起后试图保护或争取什么',psychology:'唤起时的判断或联想',feeling:'身体和情绪的主观感受，与判断分开',past_current_boundary:'当时事实与现在反应的边界；记忆不代表当前仍在发生',repeated_evidence:'如已形成习惯，引用对应习惯名；不复制动作'},
 T_CHAR_HABITS:{name:'一个可重复观察的习惯名称',category:'习惯用途或情境类别',trigger_situation:'习惯发生的常见条件',trigger_cues:'该条件中实际引起反应的信号',initial_origin:'形成习惯的成因；有记忆记录时引用记忆',repeated_evidence:'反复出现的依据；单次观察不能标成已稳定习惯',origin_event_ref:'首次或关键实例的来源事件；不复制事件正文',legacy_f0220:'仅放其余独立字段不能表达的习惯细节'},
 X_SOCIAL_ACCOUNTS:{name:'账号对外昵称；不是任何联系人的私有备注',personId:'账号持有人；一账号一份登记，其他角色通过关联引用',owner_ref:'数据作用域；账号持有人以关联人物为准，不填写观察者',handle:'平台内唯一账号标识',bio:'账号本人设置的简介；不复制人物完整档案',owned:'持有人可登录或控制此账号；不随查看此账号的角色改变'},
 X_SOCIAL_CONTACTS:{owner_ref:'写备注的角色；不同角色对同一联系人可有不同备注',name:'本角色给对方设置的备注名；没有备注时由关联账号昵称显示',note:'仅写本角色的私有备注、注意事项和自己的判断，不复制对方公开资料',personId:'没有关联账号时引用人物；账号已关联人物则不重复填写',accountId:'引用对方独立账号；不再复制昵称、简介、平台资料',phone_number:'本角色另外保存的联系电话；与对方手机号相同时直接引用手机档案',conversation_ref:'引用双方共享会话；会话消息仅存一份',draft:'本角色尚未发送的草稿；不会成为对方已知信息'},
 X_NETWORK_DOCUMENTS:{kind:'私聊、群聊或公开页面',title:'会话或页面的唯一名称',text:'页面正文；聊天会话只写主题或说明，逐条消息归网络消息与条目',participant_accounts:'会话成员账号；同一会话供各参与者引用，不按角色复制',author:'公开页面作者；多方聊天不冒用某一方为全部消息作者',audience:'获准阅读的账号；并非所有联系人'},
 X_NETWORK_ITEMS:{thread_ref:'所属共享会话或页面；一条消息只存一次',by:'本条实际发言账号',text:'本条消息原文；对方回复另起一条',at:'本条消息发送时间，不是查看时间'},
 T_TYPE_ATTRIBUTES:{axis_label:'量表名称；定义只登记一次，人物只填对应当前量值',low_meaning:'此量表低端的确切含义；两极各自计量，不互相抵消',high_meaning:'此量表高端的确切含义；不以高低判定人格好坏'},
 T_CHAR_MEASURES:{axis_ref:'引用公共量表；五能、七情、六欲光影、倾向双端和属性均复用此定义',value:'该人物在参照时点的当前值；不是终身人格定论',upper_limit:'个人当前资源上限；普通心性评分使用量表上限，不另填副本',basis:'只写该项数值独有的判断依据；具体已发生事件用关联',change_per_hour:'仅填写已有规则明确规定的每叙事小时变化；空缺表示未启用自动增长'},
 T_DYN_LIFELINE_NODES:{action:'尚未发生的候选行动；不写成既成历史',possible_consequence:'条件成立后可能发生的后果；不提前确定玩家反应'},
};
export const FORM_OWNERSHIP_CONTRACT='信息单次落位：先按主体、时间、权限和业务含义确定唯一字段。公共世界、地点、物品、能力、账号各登记一次；人物只保留个人差异与引用。静态定义、当前状态、实际事件、个人记忆、日常习惯、未来候选各自独立；同一句话不能为了填满表格反复放入摘要、描述和表现。完整描述由已有字段组织；空缺与不适用如实留空，独有信息不得因去重删除。账号资料不随联系人数量复制，联系人只保存本人的备注与共享会话引用；发言按消息保存一次。图鉴命途、心性、属性和技能页面读取同一真源，不另填可编辑展示摘要。';
export function semanticField(table,field){
 const into=FIELD_MERGES[table]?.[field.key],hint=FIELD_HINTS[table]?.[field.key];
 const label=table==='X_SOCIAL_ACCOUNTS'&&field.key==='owned'?'持有人可控制':table==='X_SOCIAL_ACCOUNTS'&&field.key==='personId'?'账号持有人':table==='X_MEDIA_PHOTOS'&&field.key==='art'?'画面内容':table==='T_STATIC_PLACES'&&field.key==='legacy_f0344'?'布局设施与用途':table==='X_SOCIAL_CONTACTS'&&field.key==='name'?'联系人备注名':table==='T_CHAR_ANCHORS'&&field.key==='legacy_f0220'?'补充记忆片段':field.label;
 return {...field,label,...(hint?{fill_hint:hint,description:hint}:{}),...(into?{merged_into:into,read_only:true}:{})};
}
const f=(key,label,type='LONG_TEXT',ref)=>({key,label,type,...(ref?{ref}:{})});
export function semanticSchemas(tables){
 const anchor=tables.find(t=>t.id==='T_CHAR_ANCHORS');
 const habits=anchor?{...structuredClone(anchor),id:'T_CHAR_HABITS',label:'人物习惯',fields:anchor.fields.filter(x=>!['past_current_boundary','shared_knowers','first_occurrence_ref'].includes(x.key)).map(x=>x.key==='category'?Object.fromEntries(Object.entries({...x,type:'TEXT',editor:'text'}).filter(([key])=>!['enum','options','enum_set_id'].includes(key))):x.key==='legacy_f0220'?{...x,label:'补充习惯细节'}:{...x})}:null;
 const measures={id:'T_CHAR_MEASURES',label:'人物心性与属性量值',partition:'III',sheet:'人物细节',fields:[f('row_uuid','稳定记录ID','ID'),f('char_ref','人物','REF','T_CHAR_DOSSIER'),f('axis_ref','公共量表','REF','T_TYPE_ATTRIBUTES'),f('value','当前值','NUMBER'),f('upper_limit','个体资源上限','NUMBER'),f('state_time','参照时点','CHILD_REF','M_WORLD_TIME'),f('basis','取值依据'),f('event_ref','关联事件','REF','T_DYN_EVENTS'),f('change_per_hour','每叙事小时变化','NUMBER'),f('importance','个人重要性','NUMBER'),f('threshold','触发阈值','NUMBER'),f('release_threshold','解除阈值','NUMBER')]};
 return [habits,measures].filter(Boolean).map(t=>({...t,fields:t.fields.map(x=>semanticField(t.id,x))}));
}
export function extendSemanticCatalog(catalog){
 const complete=catalog.tables.every(t=>{
  if(t.id==='T_CHAR_ANCHORS'&&t.label!=='人物记忆锚点')return false;
  return t.fields.every(field=>{
   const into=FIELD_MERGES[t.id]?.[field.key],hint=FIELD_HINTS[t.id]?.[field.key],expectedLabel=semanticField(t.id,field).label;
   return field.label===expectedLabel&&(!hint||field.fill_hint===hint&&field.description===hint)&&(!into||field.merged_into===into&&field.read_only===true);
  });
 })&&catalog.tables.some(t=>t.id==='T_CHAR_MEASURES')&&(!catalog.tables.some(t=>t.id==='T_CHAR_ANCHORS')||catalog.tables.some(t=>t.id==='T_CHAR_HABITS'));
 if(complete)return catalog;
 const copy=structuredClone(catalog);
 for(const t of copy.tables){if(t.id==='T_CHAR_ANCHORS')t.label='人物记忆锚点';t.fields=t.fields.map(f=>semanticField(t.id,f));}
 for(const t of semanticSchemas(copy.tables))if(!copy.tables.some(x=>x.id===t.id))copy.tables.push(t);
 return copy;
}

export async function ensureSemanticFormSchema(database){
 const current=await database.read();if(!current)return null;if(!current.state.schema.T_CHAR_ANCHORS)return current;
 const missing=semanticSchemas(Object.values(current.state.schema)).filter(t=>!current.state.schema[t.id]);
 if(!missing.length)return current;
 return database.commit({operationId:'semantic-forms-v1',contextKey:current.contextKey,expectedRevision:current.revision,changes:[],schema:missing,source:{kind:'form-schema',purpose:'single-fact-ownership'}});
}
