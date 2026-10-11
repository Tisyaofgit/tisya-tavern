'use strict';
const template=require('./stepwise-template.json'),login=require('./flow-login.json');
const STEP_CHECKS={'N1.1':null,'N1.2':['bind','source'],'N2.1':null,'N3.1':['source'],'N3.2':['world_motion'],'N3.3':['world_motion','perceive'],'N3.4':['numeric'],'N4.1':['character_mode'],'N4.2':['character_mode'],'N5.1':['resolve'],'N5.2':['stop'],'N5.3':['camera'],'N5.4':['focus'],'N5.5':null,'N5.6':['draft_review'],'C1':['continuity'],'C2':['perceive'],'C3':['motive'],'C4':['resilience'],'C5':['relationship','regard'],'C6':['voice','initiative']};
function bindingRules(actor={}){return { centrality:{低:'世界与人物沿自身目标推进，机会和后果不因玩家身份倾斜。',均衡:'兼顾玩家参与和世界独立进展。',高:'在事实允许范围增加与玩家相遇和参与的机会。'}[actor.中心化||'均衡'],difficulty:(actor.难度||'常规')+'难度；仅调整未规定的阻力与容错，禁止改动既定规则、人物意愿和历史后果。'};}
function renderStepwise({text,r,checks,actor={},outputEnabled=true}){
 const selected={...text,A01:r.A01,A02:r.A02,A04:r.A04,
 offstage:checks.offstage_progress?'必须沿场外人物自身目标承接已知进展；未确认结果保持候选，禁止把推演当作已发生事件。':'当前关闭场外关注推演，必须保留场外对象已知状态，禁止补造远处已经发生的新事件。',
 ...bindingRules(actor)};
 let s=template.replace(/\{\{(\w+)\}\}/g,(_,key)=>{if(typeof selected[key]!=='string')throw Error('TISYA_FLOW_CONFIG_'+key);return selected[key];});
 if(!checks.cliche)s=s.replace(/  固定短语: \[[\s\S]*?\],\n/,'').replace(/  语境模式: \[[\s\S]*?\n  \],\n/,'');
 if(!checks.plain_language)s=s.replace(/  术语腔: \{[\s\S]*?\n  \},\n/,'');
 if(!checks.cliche&&!checks.plain_language)s=s.replace(/const 禁用词 = Object.freeze\(\{[\s\S]*?\n\}\);\n/,'');
 if(!checks.vivid)s=s.replace(/鼓励：用物件的使用[\s\S]*?宠物化比喻。\n/,'');
 if(!checks.initiative)s=s.replace('鼓励：依具体处境主动接近、接话、拒绝、协商、回避、离开或继续手头工作。\n','');
 // Skipped questions still define their result slot so later steps never refer
 // to missing variables. They carry confirmed inputs only, without new inference.
 s=s.replace(/STEP ([NC][\d.]+) ([\s\S]*?)(?=\nSTEP |\nN[2-5] |\nRETURN :=|\n<\/|$)/g,(whole,id,body)=>{
  const required=STEP_CHECKS[id];if(!required||required.some(k=>checks[k]))return whole;
  const answer=body.match(/答案 ([^:=]+) :=/);if(!answer)throw Error('TISYA_FLOW_RESULT_'+id);
  return 'STEP '+id+' 已关闭扩展推演\n答案 '+answer[1].trim()+' := 已确认输入中与本步有关的事实；没有事实则为空，未判事项仍待定。禁止在此补造推演结果。\n';
 });
 if(!checks.character_mode)s=s.replace('角色自我模板在N4逐人调用。','本轮关闭逐人模板调用。');
 if(!checks.character_mode){const source=template.match(/STEP C2 感知与认知([\s\S]*?)问题 :=/)[1];const clauses=source.split('\n').filter(x=>/^(必须|禁止)：/.test(x)).join('\n');s=s.replace('N3—N5共用输入 :=',clauses+'\n\nN3—N5共用输入 :=');}
 if(!checks.body_length_gate)s=s.replace('、body_length_gate','');
 if(!outputEnabled){
  s=s.replace(/STEP N5\.5 展示与记录[\s\S]*?(?=\nSTEP N5\.6)/,'STEP N5.5 普通交付\n输入 := $N5_正文、$N5_事件、来源展示要求、output。\n必须：按当前普通交付格式完成正文及确有要求的附属展示，保留已成立事实与未定事项的区别；本轮不生成结构化状态、变量或记忆载荷。\n问题 := "正文与附属展示是否满足本轮要求，候选是否仍保持未采纳状态？"\n答案 N5_载荷 := <待填：完整正文｜必要展示｜仍待定的事项>\n');
  s=s.replace('篇幅依据body的唯一范围核验','篇幅依据当前output的唯一范围核验');
 }
 const at=s.indexOf('<character_thinking');
 let protocol=s.slice(0,at).trim(),character=checks.character_mode?s.slice(at).trim():'';
 const entry=checks.character_mode?login:login.replace('CALL_AT(N4.2, character_thinking, 人物专属输入);\n','');
 protocol=protocol.replace('<protocol name="叙事鲜活思维链">','<protocol name="叙事鲜活思维链">\n'+entry);
 return {protocol,character};
}
module.exports={renderStepwise,STEP_CHECKS,bindingRules};
