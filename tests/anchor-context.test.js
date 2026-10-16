import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegistry} from '../tables/schema.js';
import {retrieval} from '../tables/ledger.js';
import {assembleTableRows} from '../tables/assembly.js';
import {anchorContext,phraseMatch,referenceClosure} from '../tables/anchor-context.js';

const access={readers:['读者'],knowers:[]};
const row=(id,table,values,knowers=[])=>({id,table,rev:1,values,access:{...access,knowers}});
const person=(id,name)=>row(id,'objects',{名称:name,类型:'character'});
function assembledContext(view,options){
 const found=retrieval(view,options);
 const assembled=assembleTableRows(view,{userText:options.query,strict:true,retrieved:[...found.mandatory,...found.optional].map(row=>row.id)});
 return {...found,mandatory:assembled.rows};
}

test('scene-linked experience survives unrelated wording across mystery, war and domestic scenes',()=>{
 const cases=[
  {name:'林谨',before:'暴雨中的证人以折角书签约定求救',meaning:'书页向内折角是本人求助，不是认罪',cue:'折角书签',input:'我合上那一页，推到他手边，指腹停在纸边。'},
  {name:'Ada',before:'撤离时两人约定敲三下表示仍有人活着',meaning:'三声是求援，不能当作解除封锁',cue:'敲三下',input:'I let the rhythm travel through the bulkhead again.'},
  {name:'阿遥',before:'告别前他把第二只杯子留下，约好周末回来',meaning:'空杯承载尚未兑现的见面约定',cue:'第二只杯子',input:'我照旧把对面的位置留着，没有再问日期。'},
 ];
 for(const c of cases){
  const rows=[person('a',c.name),person('b','来访者'),person('other','远方陌生人'),row('scene','scene',{名称:'当前',参与者:['a','b']}),row('origin','events',{名称:'转折',经过:c.before,参与者:['a','b']},['a','b']),row('experience','experiences',{名称:'往事的含义',主体:'a',相关对象:['b'],类别:'回忆',内容:c.meaning,触发线索:[c.cue],锚点事件:['origin'],默契层次:'明确约定',有效性:'有效'},['a','b']),row('unrelated','experiences',{名称:'另一人的故事',主体:'other',类别:'回忆',内容:'与当前人物无关'},['other'])];
  const found=assembledContext({registry:defaultRegistry(),rows},{query:c.input,topK:0}),ids=new Set(found.mandatory.map(r=>r.id));
  assert(!phraseMatch(c.input,c.cue));assert(ids.has('experience'));assert(ids.has('origin'));assert(ids.has('a'));assert(ids.has('b'));assert(!ids.has('unrelated'));assert(!ids.has('other'));assert.equal(found.optional.length,0);
 }
});

test('similar fragments and word substrings cannot force unrelated private anchors',()=>{
 const rows=[person('a','Ada'),row('private','experiences',{名称:'未说出的联想',主体:'a',类别:'回忆',触发线索:['倒转铜杯','star'],默契层次:'单方联想',内容:'私人的联想'},['a'])];
 for(const query of ['我把铜杯洗净放回厨房','restart the engine','Canada is distant'])assert.deepEqual(anchorContext({registry:defaultRegistry(),rows},{query}).records,[]);
 assert.equal(anchorContext({registry:defaultRegistry(),rows},{query:'I turn toward the star.'}).records[0].id,'private');
 assert(phraseMatch('АДА сказала: «ЗВЕЗДА»','звезда'));assert(!phraseMatch('звездами','звезда'));assert(phraseMatch('他说“倒转铜杯”。','倒转铜杯'));
});

test('recalled broken agreements and one-sided meanings retain validity and knowledge instead of becoming mutual rules',()=>{
 const rows=[person('a','林谨'),person('b','阿遥'),row('scene','scene',{名称:'多年后',参与者:['b']}),row('e','events',{名称:'旧约定',经过:'约定已解除',参与者:['a','b']},['a','b']),row('old','experiences',{名称:'旧暗语',主体:'a',相关对象:['b'],类别:'回忆',内容:'旧日含义',锚点事件:['e'],默契层次:'单方联想',回应边界:'仅本人赋予此含义，对方没有听到解释',有效性:'已改变'},['a'])];
 const before=structuredClone(rows),found=assembledContext({registry:defaultRegistry(),rows},{query:'我重复了那个动作。',topK:0});
 const recalled=found.mandatory.find(r=>r.id==='old');assert.equal(recalled.values.有效性,'已改变');assert.deepEqual(recalled.access.knowers,['a']);assert.equal(recalled.values.默契层次,'单方联想');assert.deepEqual(rows,before);
});

test('optional recall carries its evidence and actors, terminates cycles and respects the provided view',()=>{
 const registry=defaultRegistry(),rows=[person('a','林谨'),row('event','events',{名称:'门前',参与者:['a'],关联事件:['other']}),row('other','events',{名称:'后来',关联事件:['event']}),row('anchor','experiences',{名称:'习惯',主体:'a',类别:'习惯',锚点事件:['event']})];
 assert.deepEqual(new Set(referenceClosure(rows,registry,['anchor']).map(r=>r.id)),new Set(['anchor','a','event','other']));
 assert.deepEqual(referenceClosure(rows.filter(r=>r.id!=='anchor'),registry,['anchor']),[]);
});
