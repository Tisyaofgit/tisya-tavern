'use strict';
const SOURCE=require('./tisya-protocol/source.json');
const {HEART_RULES}=require('./output-contract.cjs');
const {bindingRules}=require('./stepwise-protocol.cjs');
const fail=x=>{throw Error('TISYA_PROTOCOL_'+x);};
function render(c,{task={name:'叙事',goal:'承接本轮输入'},actor={},extensions=c.extensionRules||{}}={}){
 const entries=Object.fromEntries(SOURCE.filter(x=>!x.marker).map(x=>[x.id,x.text]));
 const r=c.stepwiseRules,k=c.checks;
 const line=(id,start,text)=>{let n=0;entries[id]=entries[id].split('\n').map(s=>s.startsWith(start)?(n++,text):s).filter(s=>s!==null).join('\n');if(n!==1)fail('ANCHOR_'+start);};
 const replace=(id,old,value)=>{if(!entries[id].includes(old))fail('TEXT_'+old);entries[id]=entries[id].replace(old,value);};
 const I='tisya_inner_chain',T='tisya_task_start',L='tisya_internal_login';
 const rule=id=>r[id]??'';
 const use=(prefix,ids)=>prefix+ids.map(rule).join('');
 // Only these selected sentences enter the model request. The configuration
 // registry and its host keys never leave this compiler.
 entries[T]=entries[T].replace(/@CONFIG current supplied selections only;[\s\S]*?(?=@HISTORY)/,'');
 line(T,'8)IF','8)IF(current resolved instruction)→its stated flow consumer;retain source scope;unadopted option examples remain data,!promote them to active rules');
 entries[T]=entries[T].replace(' @TASK @CFG @META.host',' @TASK @META.host').replace('config:@CFG,','');
 line(I,'@INPUT use','@INPUT use @IN refs;'+rule('D01')+'Each required stage consumes predecessor results;!repeat intake');
 line(L,'@MODE ',c.prose?'@MODE @RUN.mode:=narrative;'+rule('A06'):'@MODE @RUN.mode:=utility;complete the current requested task');
 line(I,'@USE @TASK+actual source','@USE @TASK+actual source refs+permissions');
 line(I,'@CONTROL ','@CONTROL classified input→authorized attempts,continuation conditions and reserved choices;'+use('', ['A01','A02','A04']));
 line(I,'@AUTH apply','@AUTH explicit bans stay binding;distinct action,major-choice and psychology permissions remain separate;contradiction→dependent @GAP');
 line(I,'@CHECK binding identity','@CHECK binding identity/attributes/state/units/source time against actual sources;'+(k.bind?'cross-check the relevant player archive':'no additional archive cross-check;binding and authorization remain required'));
 line(I,'@LOAD organization-authorized','@LOAD organization-authorized world/era/region/place/environment/scoped rules;starting/elapsed time,allowed window,current states,due items,continuing obligations,unrecorded input facts,established divergence;retain field permission refs;'+(k.source?'expand relevant historical continuity':'retain supplied historical facts without additional expansion'));
 line(I,'@USE @W.base+@W.start','@USE @W.base+@W.start+relevant world/offstage refs');
 line(I,'@FILTER explicit off',k.world_motion?'@FILTER develop only relevant unresolved world/offstage proposals under established time/causes':'@FILTER world/offstage simulation is off;carry established refs only;do not answer the following proposal question');
 line(I,'@CENTRALITY ','@CENTRALITY '+bindingRules(actor).centrality+'No cooperation,knowledge,resources or success is granted by focus.\n@PACE '+use('', ['A05','C03','C04']));
 line(I,'@LOAD applicable action rules','@LOAD applicable action rules,resource/capability refs,permissions,costs,durations,required rulings'+(extensions.E02?';'+extensions.E02:''));
 line(I,'@LIMIT criteria only','@LIMIT criteria only,!settle actions;'+bindingRules(actor).difficulty);
 line(I,'ELSE IF(character-response work enabled',k.character_mode?'ELSE IF(subject is a relevant NPC AND (new contact OR ongoing affair/due condition requires a new decision))→B':'ELSE IF(subject is an NPC)→reuse established activity/state refs;character-response simulation is off');
 line(I,'@FOCUS selected ','@FOCUS '+rule('D02')+'Retain necessary reactions,existing affairs and contact boundaries;!invent equal participation');
 line(I,'@APPLY selected @CFG.C10','@APPLY '+rule('C10')+(k.resilience?'Scrutinize remaining capacities without forced recovery,hope or rescue.':''));
 line(I,'@APPLY enabled 防神化','@APPLY '+(k.regard?'Scrutinize player-regard against actual behavior.':'')+(extensions.E03||'')+'Display grants no relationship change or single-score judgment');
 line(I,'@LIMIT !cancel existing affairs','@LIMIT !cancel existing affairs for player/plot;'+(k.initiative?'allow supported initiative from the character’s own goals':'no added initiative expansion;retain authorized response and established affairs/choices'));
 line(I,'@APPLY enabled 角色鲜活','@APPLY '+(k.voice?'develop relevant archive-based habits and individual expression;':'')+'!invent prior biography as source fact');
 line(I,'@ASK IF(new outcome simulation',k.resolve?'@ASK IF(eligible unsettled items remain) {':'@ASK IF(false;new-outcome simulation is off) {');
 line(I,'@USE @TASK+selected @CFG.B01','@USE @TASK+actual viewpoint binding+established viewpoints+settled results+per-field read_auth/emit_auth/knowers\n@VIEW '+use('', ['B01','B02','B03','B04','B05','B06'])+(extensions.E04||'')+(k.camera?'':'No additional camera expansion;retain required perspective and permission checks.'));
 replace(I,'obeys B06+source restrictions','obeys @POV+source restrictions');
 const limits={kind:c.outputEnabled?'structured':'plain',language:rule('C08'),body:{min:c.range.下限,max:c.range.上限,unit:c.range.单位,max_rule:'preferred'},actions:{min:c.actionRange.下限,max:c.actionRange.上限}};
 line(I,'@DEFINE @OUT:={kind:structured','@DEFINE @OUT:='+JSON.stringify(limits));
 line(I,'@CONFIG apply',null);line(I,'@RANGE selected',null);
 line(I,'@LANG selected','@LANG '+rule('C08'));
 if(c.authorNote)entries[I]=entries[I].replace('@LANG '+rule('C08'),'@LANG '+rule('C08')+'\n@AUTHOR_NOTE '+c.authorNote+(c.outputEnabled?'Use exactly one <aside data-tisya-author-note>public short note</aside> in extra;this is a registered display component,not story dialogue or a new fact.':'Generate the separate author-note aside only in D.3 after @BLOCK.body;exclude it from body length,paragraph refs,memory,archive and status.')+'Do not duplicate heart comments or expand any source permission.');
 line(I,'@SUMMARY ','@SUMMARY task 任务 cell 2 '+(c.outputSummary?'carries only a public source-supported conclusion;'+rule('D03'):'is empty (write adjacent separators)')+';!private reasoning/!duplicate character intentions');
 line(I,'@EXTENSION actual','@EXTENSION '+[extensions.E05,extensions.E06,extensions.E07,c.authorNote&&c.outputEnabled?'The selected author-note aside is a supplied display component;emit it once in extra.':''].filter(Boolean).join('\n')+'Only supplied triggered components may be displayed;display grants no state write');
 line(I,'selected @CFG.hearts',c.heartActive?'Follow @S.voice+@S.known;'+rule('D04')+((rule('C02').split('场外的缇斯亚')[1])?'场外的缇斯亚'+rule('C02').split('场外的缇斯亚')[1]:''):'Heart comments are disabled;emit 心声：关闭 at both positions');
 const directions=c.outputValues?JSON.parse(c.outputValues).heart_type:[];
 line(I,'apply only each selected direction:',c.heartActive?directions.map(x=>x+'：'+HEART_RULES[x]).join('\n'):null);
 const moods=c.outputValues?JSON.parse(c.outputValues).mood:[null];
 line(I,'one content row/applicable direction',c.heartActive?'one content row/applicable enabled direction at each position;1—80 visible plain-text characters;mood must be one of '+JSON.stringify(moods):null);
 line(I,'@CFG.mvu=',c.mvuEnabled?'MVU operations require an applicable card interface,valid root/path/type/rules,write authority and confirmed change;emit {"protocol":"mvu-json-patch","operations":[actual operations]}':'MVU is disabled;do not emit MVU operations');
 if(!c.heartActive)entries[I]=entries[I].replaceAll('心声：有内容|{已启用方向}|{mood或null}|{短评}','心声：关闭');
 else entries[I]=entries[I].replaceAll('心声：有内容|{已启用方向}|{mood或null}|{短评}',directions.map(d=>'心声：有内容|'+d+'|{mood或null}|{该方向短评}').join('\n'));
 if(!c.outputSummary)replace(I,'{公开创作摘要；关闭留空}','');
 line(I,'@USE @TASK+settled events','@USE @TASK+settled events+@POV+@STYLE+@OUT.body;pace and stopping boundary inherit A.2/E');
 line(I,'@STYLE apply selected','@STYLE '+use('', ['A03','C01'])+rule('C02').split('场外的缇斯亚')[0]+use('', ['C05','C06','C09'])+'Apply the source’s specific techniques and each character’s own voice to each node');
 line(I,'@SIDE selected','@SIDE follow C.1’s adopted placement;identify time/place/actors/mainline connection+return point;side-scene permission does not enable disabled offstage simulation');
 line(I,'@LIMIT !redecide goals','@LIMIT !redecide goals/outcomes/!repeat positions for length/!force developments beyond adopted stop;end on perceptible action/information in a complete paragraph;'+(k.focus?'':'use minimal ordered nodes for authorized content;retain required paragraph-completion tasks'));
 line(I,'@DETAIL apply selected','@DETAIL apply C.3’s dialogue/focus/expression rules and actual length weights;expand key processes,compress transitions;'+(k.vivid?'develop relevant sounds,objects,action traces and lived speech without padding;':'')+'retain necessary humor and relationship-appropriate intimacy');
 line(I,'@READ complete @BODY','@READ complete @BODY against settled events+@POV permissions+C.3 writing rules;'+(k.cliche?'perform targeted cliché review;':'')+(k.plain_language?'perform targeted jargon review;':'')+(k.draft_review?'perform additional full-draft review;':'no additional full-draft review;')+'mandatory source/permission/output checks remain');
 entries[I]=entries[I].replace('each supplied selected config ref→its declared consumer/effect;disabled subitem produced no new simulation;required dependency gaps remain marked;unselected alternatives absent;public summary/heart/MVU/language/count/action settings agree with their source;','each compiled requirement agrees with its responsible stage;disabled work produced no new simulation;necessary dependency gaps remain marked;');
 for(const [key,value]of Object.entries({min:c.range.下限,max:c.range.上限,unit:c.range.单位}))entries[I]=entries[I].replaceAll('{@OUT.body.'+key+'}',String(value));
 for(const [key,value]of Object.entries({min:c.actionRange.下限,max:c.actionRange.上限}))entries[I]=entries[I].replaceAll('{@OUT.actions.'+key+'}',String(value));
 if(c.prose&&c.authorNote&&!c.outputEnabled){
  replace(I,'omit structural wrappers,paragraph index labels and all ancillary blocks','omit reply/block wrappers and paragraph index labels;the enabled author-note aside is the sole exception,stays outside @BODY and is not an ancillary record');
  replace(I,'@CHECK ordinary paragraphs only,no wrappers/index labels/auxiliary records','@CHECK @BLOCK.body contains ordinary story paragraphs only,no wrappers/index labels/auxiliary records');
  replace(I,'@RESULT @DRAFT:=@BLOCK.body','@AUTHOR_NOTE produce one separate public short note as <aside data-tisya-author-note>note</aside>;obey source permissions and D04,do not duplicate heart or body;this marked aside is the only non-story display after plain body and never enters body length,paragraph refs,memory,archive or status\n@RESULT @DRAFT:=@BLOCK.body+blank line+author-note aside');
 }
 if(!c.prose){
  const deliver=entries[I].match(/\[DELIVER\][\s\S]*?\[\/DELIVER\]/)[0];
  const t=entries[I].match(/\[T\.1\][\s\S]*?\[\/T\.1\]/)[0],d=entries[I].match(/\[D\.4\][\s\S]*?\[\/D\.4\]/)[0];
  entries[I]='[INNER]\n'+t.replace('@TASK complete the requested discussion,summary or other creative work;apply its selected rules and source bounds;summary retains fact/rumor/plan distinctions,creative proposals remain unadopted','@TASK '+(task.name==='世界生成'?c.utility:task.name==='叙事'?rule('A06'):task.steps||task.goal)+'\n'+rule('D04')+(rule('C02').includes('场外的缇斯亚')?'场外的缇斯亚'+rule('C02').split('场外的缇斯亚')[1]:'')+(c.authorNote?'\n@AUTHOR_NOTE '+c.authorNote+' Append one short author-note paragraph after the requested content,without duplicating the answer or expanding permissions.':'')+'\n@FORMAT '+task.output)+'\n'+d+'\n[/INNER]\n'+deliver;
 }
 for(const [id,text]of Object.entries(entries))if(/@CFG(?:\.|\b)|@CONFIG(?:_|\b)/.test(text))fail('UNRESOLVED_CONFIG_'+id);
 return {version:1,entries,optional:[],protocol:'tisya-r238'};
}
module.exports={render,SOURCE};
