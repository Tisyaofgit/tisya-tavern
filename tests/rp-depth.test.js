import test from 'node:test';
import assert from 'node:assert/strict';
import {baseline,compilePrompts,applyCompiledMessages} from '../engine/config.mjs';
import {resolveProseStyleText} from '../engine/prose-style-policy.mjs';
import {envelope} from '../engine/reply.mjs';
import {readMatrixDetails} from '../engine/display.mjs';
import previous from '../docs/validation/rp-depth-20261115/previous-prompts.json' with {type:'json'};
import fixture from './fixtures/returned-prose-stock.json' with {type:'json'};
const content=(p,id)=>p.prompts.find(row=>row.identifier===id).content;
const config=()=>({tags:{},prompts:{},story:{userName:'阿青',play:{choices:{R01:'R01-A',R04:'R04-A','S08-Look':'S08-Look-D','S08-Mind':'S08-Mind-D','S08-MindVoice':'S08-MindVoice-B'}}}});

test('installed stock receives RP analysis in the actual merged outgoing request; historical messages stay literal',()=>{
 const source=structuredClone(baseline);
 for(const [id,text]of Object.entries(previous.installed))source.prompts.find(row=>row.identifier===id).content=text;
 const before=structuredClone(source),c=config(),compiled=compilePrompts(source,c,{}),enabled=new Set(source.prompt_order.find(g=>g.character_id===100001).order.filter(r=>r.enabled).map(r=>r.identifier));
 const input=[];for(const row of source.prompts){if(row.marker||row.enabled===false||!enabled.has(row.identifier)||!row.content.trim())continue;if(input.at(-1)?.role===row.role)input.at(-1).content+='\n\n'+row.content;else input.push({role:row.role,content:row.content});}
 const history={role:'assistant',content:previous.installed.tisya_registry};input.push(history);
 const sent=applyCompiledMessages(input,source,compiled),text=sent.slice(0,-1).map(r=>r.content).join('\n');
 for(const tag of ['言下之意|','可深化点|','@RP.DEPTH '])assert.equal(text.split(tag).length-1,1,tag);
 assert.doesNotMatch(text,/信号\|<明确要求|凭观察看穿/);
 for(const phrase of ['替代解释','继续手头正事','平实表达按本义理解','候选','主控心理','STOP.GATE'])assert.ok(text.includes(phrase),phrase);
 for(const key of ['@APPEARANCE.RATIO :=','@PSYCHOLOGY.RATIO :=','@PSYCHOLOGY.VOICE :='])assert.equal(text.split(key).length-1,1,key);
 assert.deepEqual(sent.at(-1),history);assert.deepEqual(source,before);
});

test('the RP update keeps authored prompt bytes and every unrelated stock line',()=>{
 for(const [id,text]of Object.entries(previous.stock)){
  assert.notEqual(resolveProseStyleText(id,text),text,id);
  assert.equal(resolveProseStyleText(id,text+'\n自写补充'),text+'\n自写补充');
  const c=config();c.prompts[id]=text;
  const custom=compilePrompts(baseline,c,{});
  if(id==='tisya_registry')assert.ok(content(custom,id).includes('信号|<明确要求'));
  if(id==='tisya_creative_guide')assert.equal(content(custom,id),text);
 }
 const old=previous.stock.tisya_registry.split('\n').filter(s=>!s.startsWith('信号|'));
 const now=content(baseline,'tisya_registry').split('\n').filter(s=>!s.startsWith('言下之意|')&&!s.startsWith('可深化点|'));
 assert.deepEqual(now,old);
 const strip=s=>s.split('\n').filter(l=>!/^@CHAR\.(AUTONOMY|SUBTEXT_AND_COERCION) :=/.test(l));
 assert.deepEqual(strip(content(baseline,'tisya_pref_portrayal')),strip(previous.stock.tisya_pref_portrayal));
 for(const id of ['tisya_pref_style','tisya_pref_narrative','tisya_pref_plot'])assert.equal(content(baseline,id),fixture.returned[id]);
});

test('new analysis labels parse without becoming state writes or replacing the separate heart comments',()=>{
 const comments=['输入评价','与用户互动','剧情吐槽'].map((s,i)=>s+'|@rendering{emotion.开心}|中性评论'+i).join('\n');
 const source='<reply><task format="pipes">言下之意|甲收起账本|可能不愿公开欠款，尚待验证\n可深化点|公开场合与私人困难的落差|候选：换到安静处说明来意</task><anchor phase="before">'+comments+'</anchor><title>账本|夜|门厅|示例</title><body>1 甲把账本收进抽屉，仍站在柜台后。</body><anchor phase="after">'+comments+'</anchor><extra><cells/><vars/></extra><archive/><actions/></reply>';
 const result=envelope(source),details=readMatrixDetails(source);
 assert.match(result.blocks.task,/言下之意\|/);assert.equal(result.blocks.cells,'');assert.equal(result.blocks.archive,'');
 assert.equal(details.taskHeart.items.length,3);assert.equal(details.nextHeart.items.length,3);
});
