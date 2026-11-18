import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {formatProse} from '../prose.js';
import {dialogueBlocks} from '../prose-dialogue.js';
import {compilePrompts,baseline} from '../engine/config.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';
import {appearanceValues,withAppearanceOverrides} from '../appearance-settings.js';
async function scenario(fn){const w=new Window();try{await fn(w.document);}finally{await w.happyDOM.abort();}}
const render=(d,source,options={})=>{const root=d.createElement('div');root.innerHTML=formatProse(d,source,x=>x,options);return root;};
const source='<p>旁白。【守门人#平静】“欢迎回来。”</p><p>【旅人#迟疑】■我该再问一句吗。■</p><p>■旧心声照常保留。■</p>';
test('production prose projects named dialogue and thought with approved structure and preserves old thoughts',()=>scenario(d=>{
 const root=render(d,source);assert.equal(root.querySelectorAll('[data-tisya-block=dialogue]').length,1);assert.equal(root.querySelector('.tisya-dialogue-heading strong').textContent,'守门人');assert.equal(root.querySelector('.tisya-dialogue-mood').textContent,'平静');assert.equal(root.querySelector('.tisya-dialogue-text').textContent,'“欢迎回来。”');assert.equal(root.querySelector('.tisya-thought-name').textContent,'旅人');assert.equal(root.querySelector('.tisya-thought-mood').textContent,'迟疑');assert.equal(root.querySelectorAll('[data-tisya-aside=thought]').length,1);assert(root.textContent.includes('旁白。'));
 const again=render(d,root.innerHTML);assert.equal(again.querySelectorAll('[data-tisya-block]').length,2);
}));
test('independent display switches keep the complete disabled wire and authored DOM stays untouched',()=>scenario(d=>{
 const off=render(d,source,{角色对白框:false,署名心声:false});assert.equal(off.querySelectorAll('[data-tisya-block]').length,0);assert.match(off.textContent,/【旅人#迟疑】■我该再问一句吗。■/);assert.equal(off.querySelectorAll('[data-tisya-aside=thought]').length,1);
 const protectedHTML='<pre><code>【守门人#平静】“代码”</code></pre><section class="authored">【旅人#迟疑】■原卡■</section>';
 const root=render(d,protectedHTML);assert.equal(root.querySelectorAll('[data-tisya-block]').length,0);assert.equal(root.querySelector('.authored').outerHTML,'<section class="authored">【旅人#迟疑】■原卡■</section>');
 for(const raw of ['【旅人#迟疑】■未完成','【守门人#平静】“未完成'])assert.equal(render(d,raw).querySelectorAll('[data-tisya-block]').length,0);
}));
test('bound speaker avatar is exact; ambiguous names do not borrow an image',()=>scenario(d=>{
 const characters=dialogueBlocks.characterRegistry(()=>({scope:{},characters:[{id:'a',name:'守门人',avatar:'/avatar.png'}],media:{}}));
 assert.equal(render(d,source,{dialogueCharacters:characters}).querySelector('.tisya-dialogue-avatar').getAttribute('src'),'/avatar.png');
 const ambiguous=dialogueBlocks.characterRegistry(()=>({scope:{},characters:[{id:'a',name:'守门人',avatar:'/a.png'},{id:'b',name:'守门人',avatar:'/b.png'}],media:{}}));assert.equal(render(d,source,{dialogueCharacters:ambiguous}).querySelector('img'),null);
}));
test('format selections enter upper preset once and closing the group removes both directives',()=>{
 const config={tags:structuredClone(DEFAULT_TAGS),prompts:{},story:{userName:'旅人',play:{choices:{'S09-Blocks':['S09-Dialogue','S09-Thought']}}}},source={prompts:baseline.prompts,order:baseline.prompt_order[1].order};
 const compiled=compilePrompts(source,config,{}),style=compiled.prompts.find(p=>p.identifier==='tisya_pref_style').content;assert.match(style,/@BODY.NAMED_DIALOGUE/);assert.match(style,/【角色名#当下情绪】■第一人称心声■/);assert.equal((style.match(/@BODY.NAMED_DIALOGUE/g)||[]).length,1);
 config.story.play.choices['S09-Blocks']=[];const off=compilePrompts(source,config,{}).prompts.find(p=>p.identifier==='tisya_pref_style').content;assert.doesNotMatch(off,/@BODY.NAMED_(?:DIALOGUE|THOUGHT)/);
 const display=withAppearanceOverrides({},'body',{角色对白框:false,署名心声:true});assert.equal(appearanceValues(display,'body').角色对白框,false);assert.equal(appearanceValues(display,'body').署名心声,true);
});

test('the stock opponent lens follows the scene on an ensemble card and leaves custom lenses alone',()=>{
 const source={prompts:baseline.prompts,order:baseline.prompt_order[1].order};
 const config={tags:structuredClone(DEFAULT_TAGS),prompts:{},story:{play:{choices:{N02:'N02-C'}}}};
 const row=()=>compilePrompts(source,config,{}).prompts.find(p=>p.identifier==='tisya_pref_narrative').content;
 for(const selection of [undefined,'N03-A']){
  if(selection)config.story.play.choices.N03=selection;
  const text=row(),lens=text.split('\n').find(line=>line.startsWith('@POV.LENS'));
  assert.match(lens,/场上人物/);assert.doesNotMatch(lens,/\{\{char\}\}/);assert.match(text,/叙述本轮玩家所扮人物/);
 }
 config.story.play.choices.N03='N03-B';assert.match(row(),/镜头与感知范围锁定主控/);
 delete config.story.play.choices.N03;
 config.prompts.tisya_pref_narrative='<Pref_Narrative>\n@POV.LENS := 只随记录者。\n</Pref_Narrative>';
 assert.match(row(),/@POV.LENS := 只随记录者。/);
});

test('the reply template mirrors only enabled unmodified named formats',()=>{
 const source=structuredClone(baseline);
 const config={tags:structuredClone(DEFAULT_TAGS),prompts:{},story:{play:{choices:{'S09-Blocks':['S09-Dialogue','S09-Thought']}}}};
 const registry=()=>compilePrompts(source,config,{}).prompts.find(p=>p.identifier==='tisya_registry').content;
 assert.match(registry(),/【人物姓名#当下情绪】“所说的话”/);assert.match(registry(),/【人物姓名#当下情绪】■我心里此刻的话■/);
 config.story.play.choices['S09-Blocks']=['S09-Thought'];
 assert.doesNotMatch(registry(),/所说的话/);assert.match(registry(),/我心里此刻的话/);
 source.prompt_order.find(row=>row.character_id===100001).order.find(row=>row.identifier==='tisya_pref_style').enabled=false;
 assert.doesNotMatch(registry(),/本轮正文按所选人称/);
});

test('selected named dialogue renders complete unquoted speech and keeps other labels and incomplete thoughts literal',()=>scenario(d=>{
 const text='<p>【守门人#迟疑】听见了。</p><p>【旅人】你也听见了？</p><p>【场景】雨后的路。</p><p>【旅人#惊讶】■没说完</p><p>旁白里【旅人#平静】举个例。</p>';
 const root=render(d,text,{namedDialogue:true,playerDialogueNames:['旅人']});
 assert.deepEqual([...root.querySelectorAll('.tisya-dialogue-text')].map(x=>x.textContent),['“听见了。”','“你也听见了？”']);
 assert.equal(root.querySelectorAll('.tisya-dialogue-mood').length,1);
 assert.match(root.textContent,/【场景】雨后的路/);assert.match(root.textContent,/■没说完/);assert.match(root.textContent,/旁白里【旅人#平静】/);
 assert.equal(render(d,text,{}).querySelectorAll('[data-tisya-block]').length,0);
 assert.equal(render(d,text,{namedDialogue:true,角色对白框:false}).querySelectorAll('[data-tisya-block]').length,0);
}));
