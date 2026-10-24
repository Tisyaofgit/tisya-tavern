import test from 'node:test';
import assert from 'node:assert/strict';
import {TAG_CATALOG,TAG_TYPES,getTagTemplate,listTagTemplates,prepareTagSelection} from '../../../v3/tag-catalog.mjs';

test('catalog has stable unique IDs and complete creative uses, with no implicit scoring state',()=>{
 assert.equal(TAG_CATALOG.length,65);
 assert.equal(new Set(TAG_CATALOG.map(x=>x.id)).size,65);
 assert.equal(new Set(TAG_CATALOG.map(x=>x.label)).size,65);
 assert.deepEqual(TAG_TYPES.map(x=>x.id),['character','plot']);
 assert.deepEqual(TAG_TYPES.map(x=>listTagTemplates({type:x.id}).length),[29,36]);
 for(const item of TAG_CATALOG){
  assert.match(item.id,/^(character|plot)\.[a-z]+(?:-[a-z]+)*$/);
  assert.equal(item.type,item.id.split('.')[0]);
  assert.deepEqual(Object.keys(item).sort(),['aliases','description','id','label','sourceIds','type','usage'].sort());
  assert.deepEqual(Object.keys(item.usage).sort(),['trigger','expression','contrast','progression'].sort());
  for(const value of [item.label,item.description,...Object.values(item.usage),...item.aliases,...item.sourceIds])assert.equal(typeof value==='string'&&value.trim().length>0,true,item.id);
  assert.equal(new Set(item.aliases).size,item.aliases.length);
  assert(Object.isFrozen(item)&&Object.isFrozen(item.usage)&&Object.isFrozen(item.aliases));
 }
});

test('catalog searches aliases and returns independent editable copies',()=>{
 assert.deepEqual(listTagTemplates({query:'动物塑'}).map(x=>x.id),['character.animal-image']);
 assert.deepEqual(listTagTemplates({query:'傲娇',type:'character'}).map(x=>x.id),['character.guarded-care']);
 assert.deepEqual(listTagTemplates({query:'双关 谐音'}).map(x=>x.id),['plot.cultural-wordplay']);
 assert.equal(listTagTemplates({query:'动物塑',type:'plot'}).length,0);
 assert.equal(getTagTemplate('unknown'),null);
 assert.throws(()=>listTagTemplates({type:'constructor'}));
 assert.throws(()=>listTagTemplates({query:null}));
 const copy=getTagTemplate('character.control');copy.usage.progression='changed';copy.aliases.push('changed');
 const second=getTagTemplate('character.control');assert.notEqual(second.usage.progression,'changed');assert(!second.aliases.includes('changed'));
 const listed=listTagTemplates();listed[0].description='changed';assert.notEqual(TAG_CATALOG[0].description,'changed');
});

test('template preparation requires deliberate direction, weight and character target',()=>{
 const good={tagId:'character.control',polarity:'encourage',weight:3,targetId:'object:mikhail'};
 for(const patch of [{weight:undefined},{weight:0},{weight:-1},{weight:1.2},{weight:Infinity},{weight:'3'},{polarity:undefined},{polarity:'ban'},{targetId:undefined},{targetId:''},{tagId:'character.fake'}])assert.throws(()=>prepareTagSelection({...good,...patch}));
 const a=prepareTagSelection(good),b=prepareTagSelection({...good,polarity:'avoid'});
 assert.equal(a.weight,3);assert.equal(b.weight,3);assert.equal(b.polarity,'avoid');assert.notEqual(a.description,b.description);
 assert.equal(a.targetId,'object:mikhail');assert.equal(a.catalogId,'character.control');
 assert.deepEqual(Object.keys(a).sort(),['catalogId','label','type','description','polarity','weight','targetId'].sort());
 assert.match(a.description,/触发：.+\n表现：.+\n反差：.+\n推进：/);
 const plot=prepareTagSelection({tagId:'plot.misreading',polarity:'encourage',weight:2});assert(!Object.hasOwn(plot,'targetId'));
});

test('creative coverage preserves animal imagery, distinct aims and limited knowledge',()=>{
 assert(getTagTemplate('character.animal-image').aliases.includes('动物塑'));
 assert.match(getTagTemplate('character.loyal-backbone').description,/自己的判断/);
 assert.match(getTagTemplate('plot.ensemble').description,/独立目标/);
 assert.match(getTagTemplate('plot.misreading').description,/错误判断/);
 assert.match(getTagTemplate('plot.offstage').usage.trigger,/时间推进/);
 assert.match(getTagTemplate('character.endearing-contrast').usage.contrast,/经历、习惯/);
 assert.match(getTagTemplate('plot.callback').usage.progression,/改变人物认识/);
 assert(!JSON.stringify(TAG_CATALOG).includes('米哈伊尔'));
});
