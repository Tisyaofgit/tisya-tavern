import {LEGACY_INITIATIVE} from './initiative.js';
// Preserve the rendered source protocol, including its stage inputs, results,
// dependencies and repair routes. Selection removes only inactive work; it must
// never replace the narrative stages with a summary of their configuration.
const fail=id=>{throw Error('工作流来源锚点不匹配：'+id);};
function block(text,id,transform){
 const begin='['+id+']',end='[/'+id+']',a=text.indexOf(begin),b=text.indexOf(end,a);
 if(a<0||b<0||text.indexOf(begin,a+begin.length)>=0)fail(id);
 return text.slice(0,a)+transform(text.slice(a,b+end.length))+text.slice(b+end.length);
}
function replace(text,from,to){
 if(text.split(from).length!==2)fail(from);
 return text.replace(from,to);
}
function omitQuestion(text,id,replacement=''){
 return block(text,id,s=>{
  const match=s.match(/^@ASK[^\n]*\{\n[\s\S]*?^\}\n/m);
  if(!match)fail(id+' @ASK');
  return s.replace(match[0],replacement);
 });
}

export function selectWorkflow(text,c,mode){
 const k=c.checks;
 text=block(text,'T.1',()=> '');
 text=replace(text,'(@RUN.mode=narrative AND DONE(D.3) OR @RUN.mode=utility AND DONE(T.1))','DONE(D.3)');
 if(!k.world_motion){
  text=omitQuestion(text,'A.2');
  text=replace(text,'@FILTER world/offstage simulation is off;carry established refs only;do not answer the following proposal question','@FILTER carry supplied established processes and due conditions only;no new world/offstage proposals');
  text=replace(text,'@W.agenda:={established_process_refs,due_refs,conditional_proposals,relevant_actor_refs}','@W.agenda:={established_process_refs,due_refs,relevant_actor_refs}');
 }
 if(!k.character_mode){
  text=block(text,'B',()=> '');
  text=text.replaceAll('→responsible P/B stage','→responsible P stage')
   .replaceAll('underlying character choice error→responsible B stage','unsupported character facts→their supplied source refs')
   .replaceAll('responsible P/E/B/C stage','responsible P/E/C stage')
   .replaceAll('资料与知情←E.1/B.1/C.1+record checks','资料与知情←E.1/C.1+supplied character-source checks+record checks')
   .replaceAll('人物与关系←B.6+C.5','人物与关系←supplied character evidence+C.5');
 }
 if(!k.resolve){
  text=omitQuestion(text,'E.3');
  text=replace(text,'@ELSE inherit supplied established outcomes/receipts only','@INHERIT supplied established outcomes/receipts only');
 }
 if(!k.camera)text=omitQuestion(text,'C.1');
 if(!k.focus)text=omitQuestion(text,'C.3','@ARRANGE supplied authorized content into minimal ordered nodes;retain required paragraph-completion tasks\n');
 if(k.character_mode&&!k.regard)text=text.replaceAll('unsupported relationship change/deification','unsupported relationship change');
 if(!c.outputEnabled)return plainDelivery(text,c);
 if(!mode.actions){
  text=replace(text,'<actions format="pipes" actions_min="0" actions_max="0">\n行动：{交流/调查/移动/操作/战斗/休整/其他}|{待选动作短语}|{当前可知依据}\n</actions>','<actions/>');
  text=block(text,'CALL blk.actions',()=> '[CALL blk.actions]\n@TASK render the required empty <actions/> block;no action suggestions\n@RESULT @BLOCK.actions:=<actions/>\n@DONE blk.actions\n@RETURN @BLOCK.actions\n[/CALL blk.actions]');
 }
 return text;
}

function plainDelivery(text,c){
 const out={kind:'plain',language:c.stepwiseRules.C08,body:{min:c.range.下限,max:c.range.上限,unit:c.range.单位,max_rule:'preferred'}};
 text=block(text,'C.2',()=> '[C.2]\n@REQUIRE DONE(C.1)\n@DEFINE @OUT:='+JSON.stringify(out)+'\n@LANG '+c.stepwiseRules.C08+'\n@FORMAT ordinary public prose only;no wrappers,paragraph labels,summary,hearts,records,actions or state updates\n@BODY count only visible body text per @M.11\n@RESULT @OUT\n@DONE C.2\n[/C.2]');
 text=block(text,'D.1',()=> '[D.1]\n@REQUIRE DONE(C)\n[CALL blk.body]\n@INPUT final @BODY+@OUT\n@TASK render the completed public prose unchanged,without labels or wrappers;do not regenerate the story\n@RESULT @BLOCK.body\n@DONE blk.body\n@RETURN @BLOCK.body\n[/CALL blk.body]\n@RESULT @BLOCK.body\n@DONE D.1\n[/D.1]');
 text=block(text,'D.2',()=> '[D.2]\n@REQUIRE DONE(D.1)\n@CHECK final body identity,reader permissions,source and authorization consistency\n@REJECT extraction error→blk.body;prose inconsistency→responsible P/E/C stage\n@RESULT content findings+actual corrections\n@DONE D.2 after blocking errors are corrected\n[/D.2]');
 text=block(text,'D.3',()=> '[D.3]\n@REQUIRE DONE(D.2)\n@CHECK ordinary paragraphs only;no wrappers,index labels,auxiliary records or process leakage\n@REJECT rendering error→blk.body;content error→owning stage\n@RESULT @DRAFT:=@BLOCK.body+checks tied to this revision\n@DONE D.3 after blocking errors are corrected\n[/D.3]');
 return text;
}

const featureRules={角色自主:LEGACY_INITIATIVE,防绝望:'依据人物现有资源保留改变可能，困难不预设必败，也不强制治愈或救赎。',防神化:'人物对主控的态度以实际互动为依据，不无因崇拜、依附或贬低。',防八股:'删除套话、预总结、无新增作用的重复和定义式旁白。',防名词堆砌:'用具体可感知的过程和后果表达，不以抽象术语替代行动。',文风鲜活:'使用符合场景的物件、声音、动作痕迹与生活化语言，避免灌水。',角色鲜活:'依据已知档案呈现个人习惯和差异化声口，不虚构人物旧经历为事实。'};
const conclusions='bind @P.control_limits from selected authorization; @P.update only actual authorized player changes; @POV and @POV.authorized_secret_fragments from source permissions and selected viewpoint; @OUTLINE.title_anchor from actual scene; @BODY complete public prose with paragraph_refs; settled results and actual state changes from supplied sources; unresolved facts remain unresolved; disabled optional work has no fabricated result';
function extract(text,id){let value;block(text,id,s=>{value=s;return s;});return value;}
const remap=text=>text.replace(/\b(?:P\.[1-9]|A\.[1-9]|B\.[1-9]|C\.[13456789]|E\.[1-9])\b/g,'WORKFLOW').replace(/WORKFLOW(?:\/WORKFLOW)+/g,'WORKFLOW')
 .replaceAll('DONE(C)','DONE(WORKFLOW)').replaceAll('responsible P/E/B/C stage','WORKFLOW').replaceAll('responsible P/E/C stage','WORKFLOW');

export function condenseWorkflow(text,c,mode,actor,detail){
 const r=c.stepwiseRules,steps=new Set(mode.narrative.缇斯亚叙事步序),lines=[],join=ids=>ids.map(id=>r[id]??'').join('');
 const add=(name,value)=>{if(steps.has(name))lines.push(name+'：'+value);};
 add('身份复核','核对实际世界、user 主控、人物身份与来源。');
 add('资料承接','承接已发生事实与后果；区分事实、传闻、推测、计划和未执行事项。');
 add('视角认知','按 @AUTH 核对主镜头、人物可知信息与读者公开范围。');
 add('人物反应','每名有关人物依据自身所知、经历、意愿和当前目标作出反应。'+r.D02+r.C10);
 add('行动与剧情','沿实际能力、资源、意愿和因果判断结果；未执行计划不能写成既成事实。'+join(['C03','C04']));
 add('正文组织',r.C02.split('场外的缇斯亚')[0]+join(['C05','C06','C09'])+'依已发生事件展开动作、对白和过程，完成完整自然段落。');
 add('成稿总检','复核草稿的身份、事实、知情、授权、篇幅及输出格式，修正后一次交付；只展示结论。');
 const activeFeatures={角色自主:c.checks.initiative,防绝望:c.checks.resilience,防神化:c.checks.regard,防八股:c.checks.cliche,防名词堆砌:c.checks.plain_language,文风鲜活:c.checks.vivid,角色鲜活:c.checks.voice};
 const features=Object.entries(featureRules).filter(([name])=>activeFeatures[name]).map(([,value])=>value);
 const auth=join(['A01','A02','A03','A04','A05','B01','B02','B03','B04','B05','B06']);
 const start='[INNER]\n@USE [REGISTRY]\n@INPUT actual current input and supplied materials;source knowledge and public-release boundaries remain binding\n@PLANNING '+r.D01+'\n@AUTH '+auth+'\n';
 const actorRules='中心化：'+actor.中心化+'；行动难度：'+actor.难度+'，不改动既定事实与规则。';
 if(detail==='compact'){
  const workflow='[WORKFLOW]\n'+[...lines,...features,actorRules].join('\n')+'\n@RESULT '+conclusions+'\n@DONE WORKFLOW after applicable work is complete\n[/WORKFLOW]\n';
  return start+workflow+remap(extract(text,'C.2')+'\n'+extract(text,'D'))+'\n[/INNER]\n'+extract(text,'DELIVER');
 }
 if(detail!=='format')fail('detail');
 const config=join(['D02'])+r.C02.split('场外的缇斯亚')[0]+join(['C03','C04','C05','C06','C09','C10'])+actorRules;
 const output=extract(text,'C.2').replace(/^@REQUIRE .*\n/m,'');
 return start+'@CONFIGURATION '+config+'\n'+features.join('\n')+'\n@BIND '+conclusions+'\n'+output+
  '\n@DELIVERY write the complete selected reply directly from actual input,source facts and selected configuration;no stage-by-stage narrative workflow or private reasoning in output\n@AUDIT only checks actually performed support a verdict;unperformed or unsupported checks→待确认;no actual body count→篇幅待程序计数;never invent completion,receipts or state changes\n@CHECK actual sources,authorization,body limits and selected output format;repair errors before delivery\n@RESULT @DRAFT:=complete selected deliverable\n@FREEZE the entire assembled output text as @DRAFT\n@SET @LOCK:=READY\n@DONE INNER_END\n[/INNER]\n'+extract(text,'DELIVER');
}
