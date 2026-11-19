import {labeledNarrativeField} from './narrative-values.mjs';
const join=(values,separator='，')=>[...new Set(values.filter(Boolean))].join(separator);
const sentence=text=>text?text+(/[。！？；.!?…]$/u.test(text)?'':'。'):'';
const say=(prefix,value)=>value?prefix+value:'';
const pair=(left,right,separator='、')=>join([left,right],separator);
const storage={TIER_1_EQUIPPED:'随身穿戴或手持',TIER_2_CARRIED:'随身容器',TIER_3_STORED:'据点或他处储放'};
const taskStatuses={接受:'已接受',完成:'已完成'};

// The template receives only projected, visible fields. Remaining fields
// retain their labels on separate lines, including custom or legacy fields.
const templates={
 T_STATIC_WORLDS:({line})=>[
  line('core_proposition'),line('calendar_id',value=>`历法采用${value}`),
  line(['era_name','base_year'],(era,year)=>pair(era,say('起始年为',year)))
 ],
 T_STATIC_WORLD_RULES:({line})=>[
  line('proposition'),line('condition',value=>`成立条件为${value}`),line('effect',value=>`生效后${value}`),
  line('cost',value=>`代价为${value}`),line('limit',value=>`适用限制为${value}`),line('exception',value=>`例外为${value}`)
 ],
 T_STATIC_ORGANIZATIONS:({line})=>[
  line(['leader_ref','headquarters_ref'],(leader,base)=>pair(leader&&`由${leader}领导`,say('总部在',base),'，')),
  line(['purpose','duty'],(purpose,duty)=>pair(say('活动目的为',purpose),say('承担',duty),'，')),
  line('baseline_player_attitude',value=>`对主控的既定态度为${value}`)
 ],
 T_STATIC_ITEMS_SKILLS:({line,title})=>[
  line(['category','quality_rank'],(category,quality)=>title+`（${pair(category,quality)}）`)||title,
  line(['shape','material','unidentified_sensory_desc','identified_full_desc']),
  line('usage',value=>`用途为${value}`),line('rule_effect',value=>`生效时${value}`),
  line('usage_conditions',value=>`使用条件为${value}`),line(['consumption','consumption_unit'],(amount,unit)=>say('消耗',amount&&amount+unit))
 ],
 T_STATIC_PLACES:({line})=>[
  line(['parent_place_ref','macro_region'],(parent,region)=>say('位于',pair(parent,region))),
  line(['visual_atmosphere','background_sound','smell','light']),
  line('sound_insulation',value=>`隔音情况为${value}`),line('sight_blocking',value=>`视线条件为${value}`),
  line('access_conditions'),line('curfew_rules',value=>`门禁为${value}`)
 ],
 T_DYN_SCENE_SPACE:({line})=>[
  line('place_ref',value=>`当前场景在${value}`),
  line(['era','year','season_cycle','date_day','time_of_day'],(era,year,...rest)=>say('当前时间为',join([era,year&&year+'年',...rest],' '))),
  line(['weather','temporary_environment','access_changes']),line('stage')
 ],
 T_DYN_ENTITY_STATE:({line,title})=>[
  line(['entity_id','location_ref','posture'],(actor,place,posture)=>pair((actor||title)+say('在',place),posture,'，'))||title,
  line('live_appearance'),line('inner_thought',value=>`当前内心：${value}`)
 ],
 T_DYN_SCENE_PARTICIPANTS:({line})=>[
  line(['entity_ref','position','target_ref','distance_to_target'],(actor,position,target,distance)=>
   join([actor,position,distance&&join([say('距',target),distance],'')],'，')),
  line('audible_scope',value=>`可听及${value}`),line('visible_scope',value=>`可见${value}`)
 ],
 T_DYN_COMMUNICATIONS:({line})=>[
  line(['source_ref','target_ref','medium','reachable'],(source,target,medium,reachable)=>
   join([pair(source,target,' → '),say('通讯方式为',medium),say('能否接通：',reachable)],'，')),
  line('condition',value=>`接通条件为${value}`),line('interception_risk',value=>`截获条件为${value}`)
 ],
 T_DYN_HOLDINGS_INVENTORY:({line,title})=>[
  line(['item_ref','quantity','unit','owner_ref','holder_ref','location_ref','container_ref','storage_tier'],(item,count,unit,owner,holder,place,container,tier)=>{
   const name=item&&!title.includes(item)?title+'（'+item+'）':title;
   const location=pair(place,container),level=storage[tier]??tier;
   return join([name+say('共',count&&count+unit),say('归',owner),say('由',holder&&holder+'保管'),
    location?'存放于'+location+(level?'（'+level+'）':''):level],'，');
  })||title,
  line('physical_condition'),line('identified_status',value=>`鉴定状态为${value}`),
  line(['expiry_remaining','expiry_unit'],(time,unit)=>say('剩余保质期为',time&&time+unit))
 ],
 T_DYN_CURRENCY_BALANCES:({line})=>[
  line(['owner_ref','currency_ref','balance'],(owner,currency,balance)=>join([owner,currency,say('可用余额为',balance)],' ')),
  line('frozen_deposit',value=>`冻结定金为${value}`),line('receivable',value=>`待收${value}`),line('debt',value=>`未结债务为${value}`)
 ],
 T_DYN_TASKS:({line})=>[
  line(['responsible_ref','status'],(actor,status)=>pair(say('由',actor&&actor+'负责'),taskStatuses[status]??status,'，')),
  line('goal'),
  line(['publisher_ref','source'],(publisher,source)=>pair(say('由',publisher&&publisher+'发布'),source,'，')),
  line('accept_evidence',value=>`接受依据为${value}`),line('accept_condition',value=>`接受条件为${value}`),
  line('complete_condition',value=>`完成判定：${value}`),line('next_step',value=>`已成立的下一步：${value}`),
  line('deadline',value=>`须在${value}前完成`)
 ],
 T_DYN_PACTS:({line})=>[
  line(['party_a_ref','party_b_ref','additional_parties','content'],(a,b,others,content)=>
   pair(join([a,b,others],'、'),content,'约定：')),
  line('status',value=>`履约状态为${value}`),line('deadline',value=>`履约期限为${value}`),
  line('fulfillment_condition',value=>`履约条件为${value}`),line('fulfillment_evidence',value=>`履约依据为${value}`)
 ],
 T_DYN_TIMERS:({line})=>[
  line(['remaining','remaining_unit'],(remaining,unit)=>say('尚余',remaining&&remaining+unit)),
  line('due_time',value=>`到期于${value}`),line('trigger_cond',value=>`触发条件为${value}`),line('status',value=>`当前状态为${value}`)
 ],
 T_DYN_RELATIONS_PACTS:({line})=>[
  line(['subject_ref','target_ref','attitude_tag','relation_explanation'],(source,target,attitude,explanation)=>
   join([pair(source,target,' → '),attitude,explanation],'，')),
  line('boundary_shift',value=>`相处边界变化为${value}`),line('change_basis',value=>`变化缘由为${value}`),line('evidence')
 ],
 T_DYN_ACTIVITIES_LIFELINES:({line})=>[
  line(['subject_ref','location_ref','action'],(subject,place,action)=>join([subject,say('在',place),action],'，')),
  line('goal',value=>`行动目标为${value}`),line('next_step',value=>`计划的下一步：${value}`),line('status',value=>`目前${value}`)
 ],
 T_DYN_COGNITION:({line})=>[
  line(['subject_ref','epistemic_level','subjective_belief'],(subject,level,belief)=>join([subject,level,belief],'，')),
  line('acquisition_channel',value=>`知情来源为${value}`),line('uncertain_points',value=>`仍待核实：${value}`)
 ],
 T_DYN_STAGE_SUMMARIES:({line})=>[line('summary_text'),line('ongoing_impact',value=>`延续至今的影响：${value}`)],
 X_CALENDAR_EVENTS:({line})=>[
  line(['at','day','minute'],(at,day,minute)=>at?'开始时间：'+at:[day&&'故事第'+day+'日',minute&&'当日第'+minute+'分钟'].filter(Boolean).join('，')),
  line(['placeId','participantId','status','duration','reminderMinutes','repeat','visibility'])
 ],
 T_CHAR_DOSSIER:({line})=>[
  line(['true_name','true_name_lock','aliases','gender','gender_identity','pronouns']),
  line(['species_archetype_ref','quality_rank','life_stage','age_raw','age_reference_time','birth_time','birth_precision','birth_place_ref']),
  line(['nationality_legal_status','ethnicity_culture','languages','public_identity','social_identity_duty','organization_ref','authority_limits']),
  line(['overall_physique','facial_features','habitual_bearing','habitual_attire','sensory_impression']),
  line(['core_personality_tags','scene_personality_desc','desire_double_helix','core_contradiction','choice_cost','fatal_fracture_points','value_priorities','judgment_method','emotion_handling','strengths','weaknesses']),
  line(['refusal_boundaries','negotiation_conditions','change_conditions','alignment_axes']),
  line(['mask_presentation','mask_purpose','mask_gap','mask_fissures']),
  line(['livelihood','routine','interests','likes_with_reasons','dislikes_with_reasons','birthday_preference','long_term_goals','short_term_plans']),
  line(['diction','voice','cadence','humor','silence_conditions','relational_diff','banned_cliches']),
  line(['skilled_abilities','untrained_deficits','workflow','manifest','ability_costs_limits','unique_narrative_role','current_stage_anchor'])
 ],
 T_TYPE_ATTRIBUTES:({line,title})=>[line(['type_ref','value_type'],()=>''),line(['minimum','maximum','low_meaning','high_meaning'],(lo,hi,low,high)=>`${title}（${lo}—${hi}）：${low} → ${high}`),line(['growth_rule'])],
 T_CHAR_MEASURES:({line})=>[line(['axis_ref','value','upper_limit'],(axis,value,upper)=>`${axis}：${value}${upper?' / '+upper:''}`),line(['state_time','basis','importance','change_per_hour','threshold','release_threshold'])],
 T_CHAR_ANCHORS:({line})=>[
  line(['char_ref','origin_event_ref','related_target_ref']),
  line(['trigger_situation','trigger_cues']),
  line(['internal_motive','initial_origin']),
  line(['actions','expressions','speech']),
  line(['psychology','feeling']),line(['response_boundary','exceptions'])
 ],
 T_CHAR_RELATION_ORIGINS:({line})=>[
  line(['subject_ref','target_ref','nature','formation_process','interaction_pattern','role_division']),
  line(['subject_boundary','precondition','before_state','after_state','understanding_difference','shared_event_chain','promises_tacit','unresolved_tension'])
 ]
};

templates.T_CHAR_HABITS=templates.T_CHAR_ANCHORS;
const innerHeadings={T_CHAR_HABITS:'日常习惯',T_CHAR_ANCHORS:'记忆锚点',T_PREF_CHAR_FILTER:'角色滤镜'};
const headingInTemplate=new Set(['T_TYPE_ATTRIBUTES','T_STATIC_ITEMS_SKILLS','T_DYN_ENTITY_STATE','T_DYN_SCENE_PARTICIPANTS','T_DYN_HOLDINGS_INVENTORY']);

export function narrativeTimeCode(code,time){
 const prefix=/^\d+$/u.test(code??'')?'e'+code:code;
 return (prefix??'')+(time?'['+time+']':'');
}

export function renderNarrativeRecord(table,title,fields,{recordLabel=''}={}){
 const pending=new Map(fields.map(field=>[field.key,field]));
 const line=(keys,format)=>{
  const entries=[keys].flat().map(key=>{
   const entry=pending.get(key);pending.delete(key);return entry;
  });
  if(!format)return entries.filter(entry=>entry?.text).map(labeledNarrativeField).join('\n');
  const values=entries.map(entry=>entry?.text??'');
  return values.some(Boolean)?sentence(format(...values)):'';
 };
 const clauses=Object.hasOwn(templates,table)?templates[table]({line,title}):[];
 const remaining=[...pending.values()].map(labeledNarrativeField);
 const headingTitle=innerHeadings[table]?title:title&&recordLabel&&title!==recordLabel?recordLabel+'：'+title:title;
 const material=[headingInTemplate.has(table)?'':headingTitle,...clauses,...remaining].filter(Boolean).join('\n');
 const heading=innerHeadings[table];
 return material&&heading?heading+'：'+material:material;
}
