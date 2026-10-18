import {applyMemoryOutputContract} from './memory-output.js';
import {heartRule,titleRule} from '../heart-contract.js';
// The compact permission spelling is user-facing wire syntax. Scoped policies
// remain supported for explicit audience/field overrides, never required merely
// to make a compact record parse. Keep the frozen upstream source unchanged.
function once(text,from,to){if(text.split(from).length!==2)throw Error('回复格式来源锚点不匹配');return text.replace(from,to);}
export function applyWireContract(entries){
 let registry=entries.tisya_registry;
 registry=once(registry,
  '@PERM := [level,read_auth,emit_auth,knowers];level=A/B/C/D/E/null;other cells=bracketed lists of scoped audience/subject names or null;names need no quotation marks;[]=known none,null=unresolved;never treat unresolved as public',
  '@PERM := one compact grade A/B/C/D/E or ~;A and ~ mean public;B/C/D/E retain story knowledge classification;reply-local reader records are separately authorized by @READER_LAYER;grades never grant knowledge to other characters;lowercase grades are readable;~ means public only in a permission cell. Explicit scoped form [level,read_auth,emit_auth,knowers] remains available for source-established audiences: level=A/B/C/D/E/null,other cells=bracketed name lists or null;[]=known none,null=unresolved;never invent a scope or treat unresolved as public');
 registry=once(registry,
  'grade alone grants neither read nor emit;no evidence→retain null+@GAP for dependent use',
  'compact A/~ require established public availability;compact B–E preserve story knowledge classification;reader records follow @READER_LAYER and do not grant character knowledge;use explicit scopes only for actual source-recipient restrictions;no evidence→[null,null,null,null]+@GAP');
 registry=once(registry,'public field requires "读者" in emit_auth plus authorized fragment/context','public field requires compact A/~ or explicit "读者" in emit_auth plus authorized fragment/context');
 registry=once(registry,'internal stage requires its purpose in read_auth','internal stage requires compact-grade internal-purpose access or its purpose in explicit read_auth');
 entries.tisya_registry=registry;
 let inner=entries.tisya_inner_chain;
 inner=once(inner,'@EXTENSION Only supplied triggered components may be displayed;display grants no state write','@TITLE '+titleRule+'\n@EXTENSION Only supplied triggered components may be displayed;display grants no state write');
 inner=once(inner,'D record organization never grants reader access','D records follow the separately authorized reader layer;record organization never grants character knowledge');
 inner=once(inner,'status/memory:serialize authorized records with full permissions;public presentation excludes unauthorized fields;character reuse rechecks read permission+contact+understanding','status/memory:serialize actual records with story permissions;reader presentation follows @READER_LAYER and the psychology display switch;character reuse independently rechecks source permission+actual contact+understanding');
 inner=inner.replace('reader visibility follows C.1','reader presentation follows @READER_LAYER;new narrative writing follows C.1');
 inner=inner.replace('@ACCESS {',`@READER_LAYER 已交付回复中的事件、状态、人物认知与心理可供用户作为读者回看；A–E是故事信息等级，不是读者显示开关，不要求再填读者授权名单。自己的认识与获准心理不得因个人私有而消失。角色心理显示由用户开关控制；不得据此删除已记录心理或扩张人物知情。未完待续、倒计时与未来推演伏笔不展示。角色复用始终按其实际接触与主观理解；新正文仍遵守已选视角、代演及秘密揭示设置。
@ACCESS {`);
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
 inner=inner.replace('@OPTION permission rows require actual targets;', '@OPTION 按 @MEMORY_WRITE 第9条生成匹配注记。无原生状态行→省略全部status注记；<vars/>→省略全部vars注记。permission rows require actual targets;');
 const top=inner.match(/<task format="pipes">([\s\S]*?)<\/task>/)?.[1];
 if(top===undefined)throw Error('回复格式来源锚点不匹配：task');
 const count=(top.match(/^心声：有内容\|/gm)??[]).length;
 // Define hearts once; templates carry data slots, not another rule set.
 inner=inner.replace(/@HEART \{\n([\s\S]*?)\n\}/,(_,body)=>{
  if(!count)return '@HEART {\n心声关闭。\n}';
  const lines=body.split('\n'),voice=lines[0].replace('缇斯亚的场外表达沿用 @self_voice，内容服从 @self_known。',''),directions=lines.filter(x=>/^(输入评价|回应用户评价|剧情吐槽)：/.test(x));
  const moods=body.match(/mood must be one of (\[[^\n]+?\])/);if(!moods)throw Error('心声表情来源不匹配');
  return '@HEART {\n'+voice+'\n'+directions.join('\n')+'\n'+heartRule(count,JSON.parse(moods[1]))+'\n}';
 });
 inner=inner.replaceAll('{mood或null}','{mood}');
 inner=inner.replace('@OPTION omit absent unlock/person/material/pending/delivered/candidate rows;heart per @HEART','@OPTION omit absent unlock/person/material/pending/delivered/candidate rows;heart per @HEART。没有解锁则省略整行，不输出“解锁：~|~|~”。');
 // The closing writer must consume the finished story and opening comments;
 // an audit-only input cannot support a new, evidence-bound closing response.
 inner=inner.replace(/(\[CALL blk\.next\]\n@INPUT [^\n]+)/,'$1+@BLOCK.body+@BLOCK.task.heart');
 for(const part of ['task','next'])inner=inner.replace(new RegExp('(<'+part+' format="pipes"[^>]*>)([\\s\\S]*?)(</'+part+'>)'),(_,a,b,z)=>a+b.replace(/^(心声：有内容\|[^|]+\|[^|]+\|).*$/gm,'$1{'+(part==='task'?'开篇短评':'收篇短评')+'}')+z);
 inner=inner.replace('@EXTENSION Only supplied triggered components may be displayed;display grants no state write', '@BRIEF 任务摘要只点明本轮目标；七项审计各给一句实际核验结论及必要字段/段号，不复述剧情、输入清单或自夸；已交付只写尚未表达的新增结果，无则省略。辅助字段删去同义叠加、空泛修辞和无依据的极端评价。\n@EXTENSION Only supplied triggered components may be displayed;display grants no state write');
 entries.tisya_inner_chain=applyMemoryOutputContract(inner);
}
