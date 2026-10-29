import test from 'node:test';
import assert from 'node:assert/strict';
import {BEFORE_ROWS,AFTER_ROWS,parseV3Reply} from '../six/reply.mjs';
import {onePassEntries} from '../onepass/preset.mjs';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';
import {parsePipeBlock,PIPE_ROWS} from '../onepass/pipes.mjs';
import {parseOnePassReply} from '../onepass/reply.mjs';
import {onePassReply} from './fixtures/onepass-reply.js';
import {isOnePassReply} from '../onepass/source.mjs';

test('every emitted public skeleton row has a literal registered key and exact parser column count',()=>{
 const text=onePassEntries(fullDefaultConfiguration(),DEFAULT_MOODS).tisya_registry;
 for(const [phase,spec] of Object.entries({before:BEFORE_ROWS,after:AFTER_ROWS})){
  const body=new RegExp('<think phase="'+phase+'">([\\s\\S]*?)</think>').exec(text)[1];
  for(const line of body.split('\n').filter(x=>x.trim())){
   const [label,...cells]=line.split('|');assert(Object.hasOwn(spec,label),phase+': '+label);assert.equal(cells.length,spec[label],label);
  }
 }
 for(const [block,rows] of Object.entries(PIPE_ROWS)){
  const body=new RegExp('<'+block+' format="pipes">([\\s\\S]*?)</'+block+'>').exec(text)[1];
  for(const [kind,fields] of Object.entries(rows)){const line=body.split('\n').find(x=>x.startsWith(kind+'：'));assert(line);assert.equal(line.slice(kind.length+1).split('|').length,fields.length,block+'.'+kind);}
 }
 assert.doesNotMatch(text,/<Which source class|EXACT.ROW.KEYS/);assert.equal(PIPE_ROWS.status.共用.length,5);assert.equal(PIPE_ROWS.memory.共用.length,6);
 assert.match(onePassEntries(fullDefaultConfiguration(),DEFAULT_MOODS).tisya_task_start,/the next user message starts another generation/);
});
test('known public keys tolerate a trailing category colon without inventing unknown labels',()=>{
 const source=onePassReply(),changed=source.replace('用户偏好|','用户偏好：|').replace('世界动向|','世界动向:|').replace('偏好：','偏好:');
 const a=parseOnePassReply(source),b=parseOnePassReply(changed);assert.deepEqual(b.publicReply.before,a.publicReply.before);assert.deepEqual(b.publicReply.after,a.publicReply.after);
 const note=parseOnePassReply(source.replace('用户偏好|','自创类别|')).publicReply.before[0];assert.equal(note.kind,'自创类别');assert.equal(note.wireVariant,'supplemental-public-note');
});
test('shifted common columns identify the evidence field and preserve all source text',()=>{
 const status='\n共用:~|P1、P2|读者|[]\n',memory='\n共用:[]|[]|P1、P2|读者|[]\n';
 assert.throws(()=>parsePipeBlock(status,'status'),/共用.证据.*1.生效时间.*2.对象.*3.证据/);
 assert.throws(()=>parsePipeBlock(memory,'memory'),/共用.证据.*2.地点.*3.对象.*4.证据/);
 assert.equal(parsePipeBlock('共用:~|~|P1、P2|读者|[]','status').rows.length,0);
 assert.equal(parsePipeBlock('共用:~|[]|~|P1、P2|读者|[]','memory').rows.length,0);
 assert.equal(status,'\n共用:~|P1、P2|读者|[]\n');
});
test('explicit absent outcomes normalize only known categories and never create pending work',()=>{
 const source=onePassReply();
 const canonical=parseOnePassReply(source.replace(/世界动向\|[^\n]+/,'留白|世界动向|雨只作为背景'));
 const variant=parseOnePassReply(source.replace(/世界动向\|[^\n]+/,'世界动向|留白|雨只作为背景'));
 const a=canonical.publicReply.after.find(x=>x.kind==='留白'),b=variant.publicReply.after.find(x=>x.kind==='留白');
 assert.deepEqual(b.cells,a.cells);assert.equal(b.wireVariant,'outcome-first-blank');
 const repeated=parseOnePassReply(source.replace(/世界动向\|[^\n]+/,'世界动向|留白|世界动向|雨只作为背景')).publicReply.after.find(x=>x.kind==='留白');assert.deepEqual(repeated.cells,a.cells);assert.equal(repeated.wireVariant,'repeated-category-blank');
 const qualified=parseOnePassReply(source.replace(/世界动向\|[^\n]+/,'世界动向|留白|关系位移|原因')).publicReply.after;assert.deepEqual(qualified.find(x=>x.kind==='留白').cells,['世界动向','关系位移 · 原因']);assert.equal(qualified.filter(x=>x.kind==='关系位移').length,1);
 const empty=parseOnePassReply(source.replace('</think>\n<status','留白|系统任务|无待办\n</think>\n<status'));
 assert(empty.publicReply.after.some(x=>x.kind==='留白'&&x.cells[0]==='系统任务'));
 assert(!empty.publicReply.after.some(x=>x.kind==='系统任务'));
 assert.throws(()=>parseOnePassReply(source.replace(/世界动向\|[^\n]+/,'留白|自创类别|无')),/OUTCOME/);
 const splitText=parseOnePassReply(source.replace(/语言亮点\|[^\n]+/,'语言亮点|原话|具体效果')).publicReply.after.find(x=>x.kind==='语言亮点');assert.equal(splitText.cells[0],'原话 · 具体效果');assert.equal(splitText.wireVariant,'text-cell-join');
 assert.throws(()=>parseOnePassReply(source.replace(/语言亮点\|[^\n]+/,'语言亮点|原话||具体效果')),/EMPTY/);
});
test('numeric reply identifiers retain raw identity and still require the exact complete one-pass grammar',()=>{
 const source=onePassReply().replace('id="tisya-onepass-1"','id="tisya-onepass-2"');
 assert(isOnePassReply(source));const parsed=parseOnePassReply(source);assert.equal(parsed.rootId,'tisya-onepass-2');assert.equal(parsed.wireCompatibility,'numeric-reply-id');assert.equal(parsed.source,source);
 assert.throws(()=>parseOnePassReply(source.replace('<memory format="json">','<unknown format="json">')),/ORDER/);
 for(const id of ['foreign','tisya-onepass-v2','tisya-onepass-1-other','tisya-onepass-0'])assert(!isOnePassReply(source.replace('tisya-onepass-2',id)));
});
