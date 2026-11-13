import test from 'node:test';
import assert from 'node:assert/strict';
import {baseline,compilePrompts} from '../engine/config.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';
import {readMatrixDetails,readMatrixPublic,displayProjection} from '../engine/display.mjs';
import {parseV3Reply} from '../six/reply.mjs';

const prompt=(preset,id)=>preset.prompts.find(row=>row.identifier===id).content;
const stop=text=>text.match(/^@STOP\.GATE :=[^\n]*/gm)??[];
const config=(choices={})=>({tags:{...DEFAULT_TAGS},prompts:{},playDefaults:{choices:{N06:'N06-A'}},story:{userName:'阿青',play:{choices}}});
const reply=(after,actions='查看目录|我翻看借阅目录。|了解现有书目。')=>
 '<reply id="tisya-onepass-1"><task/><anchor phase="before">构想|完成归还登记。</anchor><title>归还|午后|书库|中性测试</title><body>1 管理员核对登记，接过书，将它放回书架。</body><anchor phase="after">'+after+'</anchor><extra><cells/><vars/></extra><archive/><actions min="1" max="1">'+actions+'</actions></reply>';

test('all three stop settings reach compilation, override an older stop and retain the selected settings',()=>{
 const original=structuredClone(baseline),source=structuredClone(baseline);
 const narrative=source.prompts.find(row=>row.identifier==='tisya_pref_narrative');
 narrative.content=narrative.content.replace(/^@STOP\.GATE :=[^\n]*/m,'@STOP.GATE := OLD_REQUIRED_QUESTION');
 const expected={
  'N06-A':/走完当前局部交锋与获准动作后.*遇未经授权的重大分支.*拍板前自然停笔/,
  'N06-B':/顺着当前场面呼吸.*完整动作落定.*静默余温处直接收尾/,
  'N06-C':/将本轮授权剧情片段及其直接因果余波一口气写透.*动作上收尾/,
 };
 const compiledStops=[];
 for(const choice of Object.keys(expected)){
  const selected=config({N06:choice}),saved=structuredClone(selected);
  const result=compilePrompts(source,selected,{}),effective=stop(prompt(result,'tisya_pref_narrative'));
  assert.equal(effective.length,1);
  assert.match(effective[0],expected[choice]);
  assert.doesNotMatch(effective[0],/OLD_REQUIRED_QUESTION|\{\{user\}\}/);
  assert.doesNotMatch(effective[0],/短场景.*优先.*篇幅下限/);
  assert.match(prompt(result,'tisya_history_open'),/未被玩家选中的 `<actions>` 备选行.*严禁当作已发生事件/,'unselected action candidates remain separate from completed scene history');
  assert.deepEqual(selected,saved,'compilation must not replace saved selections or defaults');
  assert.deepEqual(result.prompt_order,source.prompt_order);
  assert.deepEqual(result.prompts.map(({content,...row})=>row),source.prompts.map(({content,...row})=>row));
  assert.equal(prompt(result,'main'),prompt(original,'main'));
  compiledStops.push(effective[0]);
 }
 assert.equal(new Set(compiledStops).size,3,'natural beat, decision boundary and full segment remain distinct settings');
 assert.match(prompt(source,'tisya_pref_narrative'),/OLD_REQUIRED_QUESTION/,'source must remain untouched');
 assert.deepEqual(baseline,original);
});

test('default compilation retains body min/max, configured bounds and action ranges',()=>{
 const result=compilePrompts(baseline,config(),{}),registry=prompt(result,'tisya_registry');
 const bodyTag=text=>text.match(/^<body\b[^>]*>$/m)?.[0];
 const actions=/<actions\s+min="(\d+)"\s+max="(\d+)"/.exec(registry);
 assert.equal(bodyTag(registry),'<body min="2000" max="5000" unit="字">','the user explicitly requires both bounds');
 for(const [values,expected] of [
  [{min_length:2400,max_length:6200},'<body min="2400" max="6200" unit="字">'],
  [{min_length:0,max_length:1800},'<body min="0" max="1800" unit="字">'],
  [{min_length:900},'<body min="900" max="5000" unit="字">'],
  [{max_length:8000},'<body min="2000" max="8000" unit="字">'],
 ]){
  const configured=compilePrompts(baseline,config(),{tisya_output_configuration:JSON.stringify(values)});
  assert.equal(bodyTag(prompt(configured,'tisya_registry')),expected,'explicit user bounds, including zero and single-sided bounds, must survive compilation');
 }
 assert.deepEqual(actions.slice(1),['4','6']);
 assert.match(prompt(result,'tisya_pref_plot'),/65%–95%/);
 assert.doesNotMatch(prompt(result,'tisya_pref_plot'),/短场景优先于篇幅下限/);
 assert.doesNotMatch(registry,/最终停笔交还点|live playable opening|下轮基础任务\|/);
 assert.match(registry,/末段严格按 `<Pref_Narrative> @STOP.GATE`/);
 assert.match(prompt(result,'tisya_creative_guide'),/行序并非正文段落大纲/);
 assert.match(prompt(result,'tisya_creative_guide'),/声口自然发挥，其字数不计入 `<body>` 篇幅区间/);
 const before=registry.match(/<anchor phase="before">([\s\S]*?)<\/anchor>/)[1];
 for(const name of ['构想','情节','人物','运镜','用语','余韵'])assert.match(before,new RegExp('^'+name+'\\|','m'));
 const scaffoldStart=registry.search(/^<reply id="tisya-onepass-1">$/m);
 assert(scaffoldStart>=0,'the actual reply scaffold must remain present');
 const scaffold=registry.slice(scaffoldStart);
 const ordered=[/^<task /m,/^<anchor phase="before">$/m,/^<title /m,/^<body\b[^>]*>$/m,/^<anchor phase="after">$/m,/^<extra>$/m,/^<archive /m,/^<actions /m].map(tag=>scaffold.search(tag));
 assert(ordered.every((at,i)=>at>=0&&(i===0||at>ordered[i-1])));
});

test('new complementary after rows survive the real display parser alongside a completed scene and independent optional actions',()=>{
 const names=['余波','错位','牵连','惯性','生长','余地'];
 const texts=names.map((name,i)=>name+'：'+('书已归还，读者仍在安静整理书签。'.repeat(i===0?50:1)));
 const comments=['输入评价|@rendering{emotion.开心}|归还的动作已经完成。','与用户互动|@rendering{emotion.促狭}|这张旧书签倒还在。','剧情吐槽|@rendering{emotion.憋笑}|登记簿又添了一行。'];
 const raw=reply([...names.map((name,i)=>name+'|'+texts[i]),...comments].join('\n')),unchanged=raw;
 const strict=parseV3Reply(displayProjection(raw));
 assert.deepEqual(strict.after.slice(0,6).map(row=>[row.kind,row.cells[0]]),names.map((name,i)=>[name,texts[i]]));
 const details=readMatrixDetails(raw),view=readMatrixPublic(raw);
 assert.deepEqual(details.diagnostics,[]);
 assert.deepEqual(details.audit.map(row=>[row.kind,row.evidence]),names.map((name,i)=>[name,texts[i]]));
 assert.equal(details.nextHeart.items.length,3);
 assert.deepEqual(details.rounds.pending,[],'complementary reflections must not become next-turn obligations');
 assert.deepEqual(details.rounds.delivered,[],'after is not a compliance checklist');
 assert.equal(view.v3.paragraphs.length,1);
 assert.equal(view.v3.paragraphs[0].raw,'管理员核对登记，接过书，将它放回书架。');
 assert.deepEqual(view.v3.actions,[{type:'查看目录',text:'我翻看借阅目录。',possibility:'了解现有书目。'}]);
 assert.equal(raw,unchanged,'display must not rewrite saved story text');
});

test('historical after rows remain readable while malformed new rows still report an error',()=>{
 const oldNames=['立住了','变局','骨相','主动','世界','关系','余钩'];
 const mapped=['语言亮点','本轮变化','人物厚度','角色主动','世界动向','关系位移','下一步张力'];
 const oldRows=[...oldNames.map((name,i)=>name+'|历史记录'+i),'下轮基础任务|已经约定|明日归还借阅证。','候选|也可以查看目录。','已交付|书已归还。'];
 const raw=reply(oldRows.join('\n')),details=readMatrixDetails(raw);
 assert.deepEqual(details.diagnostics,[]);
 assert.deepEqual(details.audit.map(row=>row.kind),mapped);
 assert.deepEqual(details.rounds.pending,[{label:'下轮基础任务',status:'已经约定',text:'明日归还借阅证。'}]);
 assert.deepEqual(details.rounds.candidates,[{text:'也可以查看目录。'}]);
 assert.deepEqual(details.rounds.delivered,[{text:'书已归还。'}]);
 const invalid=readMatrixDetails(reply('余波|书已归还。\n余波|重复栏目。\n未登记栏目|不会静默接纳。'));
 assert.equal(invalid.after.length,1);
 assert.equal(invalid.diagnostics.length,2);
 assert.match(invalid.diagnostics[0].code,/DUPLICATE_ROW/);
 assert.match(invalid.diagnostics[1].code,/LABEL/);
});
