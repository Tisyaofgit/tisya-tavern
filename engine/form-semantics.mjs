// Field ownership is shared by form instructions and narrative projection.
// A merge is explicit; equal strings in unrelated fields are never evidence.
export const FIELD_MERGES={T_STATIC_PLACES:{legacy_f0343:'macro_region'},X_NETWORK_ITEMS:{author:'by'}};
export const FIELD_HINTS={
 T_STATIC_PLACES:{macro_region:'所属地域或地理位置；上级地点已有记录时引用上级，不复写其完整介绍',visual_atmosphere:'只写可见的色彩、轮廓、材质观感与空间观感；灯光数值归光照，布局设施归特征，人物往事归事件',legacy_f0344:'只写固定布局、设施、用途和可交互结构；颜色观感归视觉氛围，人物曾在此做什么归事件',light:'光源、明暗、照明覆盖与昼夜变化',background_sound:'地点通常可听见的声音；本轮临时声音归场景',smell:'地点稳定气味；人物气味归人物档案',access_conditions:'谁在什么条件下可进入；公共城市不填写私人住宅门禁'},
 T_STATIC_ITEMS_SKILLS:{identified_full_desc:'程序从独立字段组织完整说明；不另填一份综合副本',shape:'外形、尺寸与结构；材质单列',material:'构成材料及加工材料；不复述外形',usage:'能用来完成什么目标；操作步骤和适用条件另填',rule_effect:'确切作用、强度、作用对象和条件；没有数值规则时填写描述，不编固定消耗',narrative_meaning:'这件事物不可替代的象征或关系意义；没有则省略，不以通用来历凑写',narrative_manifest:'实际使用时旁人能够观察的动作、声音与结果；不复写能力定义、效果数字或代价',origin:'获得或形成经过；已有事件用关联，避免复制事件全文',consumption:'只有明定固定消耗才填数值；没有固定点数不等于消耗为0',cooldown:'再次可用的恢复条件；日常休息只有确实限制该能力时才填'},
 T_CHAR_DOSSIER:{overall_physique:'稳定身型、身高、体重；临时姿态与伤势归实时状态',facial_features:'五官、发色、肤色和瞳色；不重复身型',habitual_bearing:'跨场景的姿态倾向；具体重复动作归习惯',sensory_impression:'人物通常带来的气味、体温或触感印象；外貌与音色各归本格',core_personality_tags:'少量性格分类词；不复制具体反应',scene_personality_desc:'性格在不同情境下如何切换；具体触发与动作归习惯',desire_double_helix:'相互牵制的两项长期诉求；本轮强度归心性量值',core_contradiction:'两项诉求为何不能同时满足；不复述诉求',choice_cost:'为了坚持选择会实际失去什么',fatal_fracture_points:'恐惧的具体情景及失去功能的边界；不将恐惧写成已经发生的事实',value_priorities:'发生冲突时的价值排序',workflow:'跨多项本领的工作组织方式；某项技能步骤归该技能',manifest:'人物多种本领共同形成的辨识风格；不重复单项技能表现',skilled_abilities:'只引用已登记本领名称；熟练程度归人物本领掌握',ability_costs_limits:'跨能力共通的个体限制；单项代价归对应能力',short_term_plans:'由任务和生活计划读取，不另存摘要副本',legacy_f0367:'只写年龄依据确有冲突的内容；无冲突省略，不塞入身高、出生地或关系阶段'},
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
