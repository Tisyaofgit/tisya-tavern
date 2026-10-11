import {renderProtocol,NARRATIVE as N} from '../settings-core.js';
import {KEY,registry,worldKey,defaultWorld,emptyConfig,compileSelected,validateConfig} from './core.js';
export function modularSource(source){return source.prompts.some(p=>p.content?.includes('{{tisya_config_selected}}'));}
export function currentConfiguration(context,legacy={}){const d=context.extensionSettings[KEY]===undefined?emptyConfig():validateConfig(context.extensionSettings[KEY]);return {data:d,world:d.worlds[worldKey(context)]??defaultWorld(typeof legacy==='function'?legacy():legacy)};}
export function refineCompiled(c,{data,world},source){
 if(world.mode!=='narrative'){const mode=registry.modes.get(world.mode);if(typeof mode?.compile!=='function')throw Error('该模式的编译接口尚未接入');return mode.compile({compiledBase:c,configuration:{data,world},source});}
 const m=world.modes[world.mode],r=c.stepwiseRules;
 // Main style is an open resource slot, never a built-in style choice.
 r.C01='';if(!m.actions)c.actionRange={下限:0,上限:0};const actor={难度:world.switches.difficulty,中心化:world.switches.centrality};
 c.rest=renderProtocol(c,{actor});const entries=c.rest.entries,I=entries.tisya_inner_chain;
 if(!c.prose)return c;
 const block=id=>{const a=I.indexOf('['+id+']'),b=I.indexOf('[/'+id+']',a);if(a<0||b<0)throw Error('固定协议区块缺失：'+id);return I.slice(a,b+id.length+3);};
 const cleanBlock=id=>block(id).split('\n').filter(l=>!l.startsWith('@REQUIRE ')&&!l.startsWith('@USE @')&&!l.startsWith('@DONE ')).join('\n');
 const steps=new Set(m.narrative.缇斯亚叙事步序),on=name=>steps.has(name),lines=[];
 const add=(name,text)=>{if(on(name))lines.push(name+'：'+text);};
 add('身份复核','核对实际世界、user 主控、人物身份与来源。'+r.A01+r.A02+r.A04);
 add('资料承接','承接已发生事实与后果；区分事实、传闻、推测、计划和未执行事项。'+r.A03);
 add('视角认知',[r.B01,r.B02,r.B03,r.B04,r.B05,r.B06].join(''));
 add('人物反应','每名有关人物依据自身所知、经历、意愿和当前目标作出反应。'+r.D02+r.C10);
 add('行动与剧情','沿实际能力、资源、意愿和因果判断结果；未执行计划不能写成既成事实。'+r.A05+r.C03+r.C04+'中心化：'+actor.中心化+'；行动难度：'+actor.难度+'，不改动既定事实与规则。');
 add('正文组织',[r.C02?.split('场外的缇斯亚')[0],r.C05,r.C06,r.C08,r.C09].filter(Boolean).join('')+'依已发生事件展开动作、对白和过程，按本轮正文范围完成完整段落。');
 add('成稿总检','复核草稿的身份、事实、知情、授权、篇幅及输出格式，修正后一次交付；只展示结论，不输出内部推理。');
 const featureRules={角色自主:'人物保有独立目标、意愿与已有事务，按实际接触决定是否回应及主动行动。',防绝望:'依据人物现有资源保留改变可能，困难不预设必败，也不强制治愈或救赎。',防神化:'人物对主控的态度以实际互动为依据，不无因崇拜、依附或贬低。',防八股:'删除套话、预总结、无新增作用的重复和定义式旁白。',防名词堆砌:'用具体可感知的过程和后果表达，不以抽象术语替代行动。',文风鲜活:'使用符合场景的物件、声音、动作痕迹与生活化语言，避免灌水。',角色鲜活:'依据已知档案呈现个人习惯和差异化声口，不虚构人物旧经历为事实。'};
 for(const [name,text]of Object.entries(featureRules))if(m.narrative['缇斯亚叙事'+name])lines.push(text);
 const selected=compileSelected(data,world); // Validates the selection; content has one material slot.
 const control=[r.A01,r.A02,r.A03,r.A04,r.A05,r.B01,r.B02,r.B03,r.B04,r.B05,r.B06].join('');
 const output=[cleanBlock('C.2'),cleanBlock('D.1'),cleanBlock('D.3')].join('\n');
 entries.tisya_internal_login=entries.tisya_internal_login.replace(/^@FLOW .*$/m,'@FLOW narrative:WORKFLOW→C.2→D.1→D.3→INNER_END→COMMIT.READY→PREPARE_STEP');
 entries.tisya_inner_chain='[INNER]\n@INPUT actual current input and supplied materials; source knowledge and public-release boundaries remain binding.\n@AUTH '+control+'\n[WORKFLOW]\n'+lines.join('\n')+'\n@RESULT bind @P.control_limits from selected authorization; @P.update only actual authorized player changes; @POV and @POV.authorized_secret_fragments from source permissions and selected viewpoint; @OUTLINE.title_anchor from actual scene; @BODY complete public prose with paragraph_refs; settled event/character results and actual state changes from supplied sources; audit evidence from performed checks only. Unresolved facts remain unresolved; disabled optional work has no fabricated result.\n[/WORKFLOW]\n@FORMAT '+(c.outputEnabled?'Preserve the fixed reply root and ten blocks in task/title/body/next/status/extra/vars/archive/memory/actions order.\n'+output:c.plainOutput)+'\n@CHECK correct the complete unsent draft against actual sources and the selected requirements. Never output private reasoning.\n@DONE INNER_END; @DRAFT:=complete verified payload; @LOCK:=READY; @SENT:=false\n[/INNER]';
 // The outer delivery trigger and fixed wire definitions are retained.
 if(!m.actions&&c.outputEnabled)entries.tisya_inner_chain=entries.tisya_inner_chain.replace(/\[CALL blk\.actions\][\s\S]*?\[\/CALL blk\.actions\]/,'[CALL blk.actions]\n<actions/>\n[/CALL blk.actions]');
 for(const key of Object.keys(entries))entries[key]=entries[key].replace(/\b(?:P\.[1-9]|A\.[1-9]|B\.[1-9]|C\.[13456789]|D\.[2456789]|E\.[1-9])\b/g,'WORKFLOW');
 pruneRegistry(entries,m.narrative);c.selectedIds=selected.ids;return c;
}

function pruneRegistry(entries,settings){
 if(!settings.缇斯亚叙事防神化)entries.tisya_registry=entries.tisya_registry.replace('/!deify player or grant unconditional worship/submission','');
 const text=entries.tisya_registry,rows=text.split(/(?=^@(?:M|F)\.\d{2} )/m),header=rows.shift(),tail='\n[/REGISTRY]';const enabled=new Set(['F.01','F.02','F.03','F.04','F.05','F.06','F.07','F.12']);
 if(settings.缇斯亚叙事防绝望)enabled.add('F.08');if(settings.缇斯亚叙事防八股){enabled.add('F.09');enabled.add('F.10');}if(settings.缇斯亚叙事防名词堆砌)enabled.add('F.11');
 const removed=[];entries.tisya_registry=header+rows.filter(row=>{const id=/^@((?:M|F)\.\d{2}) /.exec(row)?.[1];const keep=id?.startsWith('M.')||enabled.has(id);if(!keep)removed.push(id);return keep;}).map(s=>s.replace(/\[\/REGISTRY\]\s*$/,'')).join('')+tail;
 for(const id of removed)for(const key of Object.keys(entries))if(key!=='tisya_registry')entries[key]=entries[key].replaceAll('/@'+id,'').replaceAll('@'+id+'/','').replaceAll('@'+id,'');
}
