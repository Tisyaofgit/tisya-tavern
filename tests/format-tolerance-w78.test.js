import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fullReply} from './fixtures/six-reply.js';
import {parseV3Reply} from '../six/reply.mjs';
import {parsePipeBlock} from '../onepass/pipes.mjs';
import {onePassEntries} from '../onepass/preset.mjs';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';
import {FAST_RESPONSE_BLOCK,QUALITY_PRESET_SETTINGS} from '../config/response-speed.js';
test('public digest accepts table decoration, aliases and supplementary notes without changing the original',()=>{
 const raw=fullReply.replace('用户偏好|把承诺落在一个能回应的邀请上','| **Preference** |把承诺落在一个能回应的邀请上|\n补充设计|保留一个可拒绝的邀请').replace('设计|宋遥|想把日程说清|留下可以拒绝的空隙','人物设计｜宋遥｜想把日程说清');
 const reply=parseV3Reply(raw);assert.equal(reply.source,raw);assert.equal(reply.before[0].kind,'用户偏好');assert(reply.before.some(r=>r.kind==='补充设计'&&r.wireVariant==='supplemental-public-note'));assert.equal(reply.before.find(r=>r.kind==='设计').cells[2],'');
});
test('action notes tolerate missing or extra text cells while preserving all visible text',()=>{
 const raw=fullReply.replace('交流|问她想几点出发|她可能拿出早已留好的车次','交谈|问她想几点出发').replace('操作|把零件带到库房|偶遇同事，得知另一件待办','赠礼|把零件带到库房|偶遇同事|得知另一件待办');
 const reply=parseV3Reply(raw);assert.equal(reply.actions[0].type,'交流');assert.equal(reply.actions[0].possibility,'');assert.equal(reply.actions[1].type,'其他');assert.equal(reply.actions[1].originalType,'赠礼');assert.equal(reply.actions[1].possibility,'偶遇同事 · 得知另一件待办');assert.throws(()=>parseV3Reply(fullReply.replace('交流|问她想几点出发|她可能拿出早已留好的车次','交流||无行动正文')));
});
test('named common fields avoid positional shifts; paragraph spelling normalization never infers missing fields',()=>{
 const named=parsePipeBlock('共用：读者=读者|证据=[p1, P2]|对象=1|知情者=[]\n描述：1|objects.描述|整理工具','status').rows[0];
 assert.deepEqual(named.common,{生效时间:'~',对象:'1',证据:'P1、P2',读者:'读者',知情者:'[]'});
 assert.throws(()=>parsePipeBlock('共用：对象=1|证据=P1|对象=2','status'),/重复/);
 assert.throws(()=>parsePipeBlock('共用：对象=1|P1','status'),/混用/);
 assert.throws(()=>parsePipeBlock('共用：~|P1|读者|[]','status'),/共用.证据/);
 assert.throws(()=>parsePipeBlock('共用：证据=P1-P3','status'),/共用.证据/);
});
test('quality is the shipped default and speed is an isolated explicit opt-in',()=>{
 const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya.json',import.meta.url))),c=fullDefaultConfiguration(),normal=onePassEntries(c,DEFAULT_MOODS);
 for(const [key,value]of Object.entries(QUALITY_PRESET_SETTINGS))assert.equal(preset[key],value);
 assert.doesNotMatch(normal.tisya_new_chat,/RESPONSE SPEED|SILENT THINKING|FAST.RESPONSE/);
 assert(preset.prompt_order.every(g=>g.order.find(p=>p.identifier==='tisya_fast_response')?.enabled!==true));
 c.world.modes.narrative.极速模式=true;const fast=onePassEntries(c,DEFAULT_MOODS);assert(fast.tisya_new_chat.endsWith(FAST_RESPONSE_BLOCK));
 for(const key of Object.keys(normal))if(key!=='tisya_new_chat')assert.equal(fast[key],normal[key],key);
 c.world.modes.narrative.极速模式=false;assert.equal(onePassEntries(c,DEFAULT_MOODS).tisya_new_chat,normal.tisya_new_chat);
});


test('actual OpenAI-shaped cat failure retains a qualified empty outcome without changing the source',()=>{
 const raw=fullReply.replace('世界动向|检修暂停，访客改走侧门','世界动向|留白|独立事务|雨声只在场景中变化，没有另一个已确立的事务推进');
 const reply=parseV3Reply(raw),row=reply.after.find(r=>r.kind==='留白');assert.equal(reply.source,raw);assert.deepEqual(row.cells,['世界动向','独立事务 · 雨声只在场景中变化，没有另一个已确立的事务推进']);assert.equal(row.wireVariant,'qualified-outcome-blank');
});
