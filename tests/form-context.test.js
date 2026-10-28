import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFormContext,FORM_CONTEXT_GUIDE} from '../onepass/context.mjs';
import {defaultRegistry} from '../tables/schema.js';
const access={readers:['读者'],knowers:[]};
const row=(id,table,values)=>({id,table,rev:1,source:'source:'+id,values,access:structuredClone(access)});
const view=rows=>({registry:defaultRegistry(),rows});
test('complete forms survive low retrieval settings, have one owner and retain the source branch and permissions',()=>{
 const v=view([row('event','events',{名称:'约定',时间:'2001-01-01 10:00',经过:'答应归还书'}),row('person','objects',{名称:'陆舟',类型:'character',属性:{性格:'守信'}}),row('secret','cognition',{名称:'秘密',主体:'person',认识:'只知道北门'}),row('scene','scene',{名称:'城门'}),row('rule','objects',{名称:'门规',类型:'rule'}),row('fact','facts',{名称:'年代',命题:'冬季'})]);
 v.rows[2].access.knowers=['person'];const before=structuredClone(v);
 for(const topK of [0,1,8]){
  const out=compileFormContext({...v,topK},{origin:{id:'origin',revision:2},session:{id:'branch-A',revision:3},sourceKeys:['old','selected'],focus:['person','missing']});
  assert.deepEqual(out.context.order,['world','global','objects','timeline']);
  assert.deepEqual(out.rows.map(r=>r.id),['rule','fact','scene','person','secret','event']);
  assert.deepEqual(out.context.layers.flatMap(l=>l.ids),out.rows.map(r=>r.id));
  assert.equal(new Set(out.context.layers.flatMap(l=>l.ids)).size,v.rows.length);
  assert.deepEqual(out.rows.find(r=>r.id==='secret'),v.rows[2]);
  assert.equal(out.context.basis.session.id,'branch-A');assert.equal(out.context.basis.sourceHead,'selected');
  assert.deepEqual(out.context.focus,['person']);assert.deepEqual(v,before);
 }
});
test('shared state and object state stay separate while type inheritance routes world rules correctly',()=>{
 const v=view([row('state','state',{名称:'体力',对象:'person',字段:'体力',值:5}),row('global','scene',{名称:'时局',阶段:'平静'}),row('law','objects',{名称:'门禁',类型:'local-rule'})]);
 v.registry.types.push({id:'local-rule',name:'本地法则',aliases:[],parent:'rule',version:1,fields:{说明:{type:'text'}}});
 const x=compileFormContext(v);assert.deepEqual(x.context.layers.map(l=>l.ids),[['law'],['global'],['state'],[]]);
});
test('known event times sort chronologically without rewriting historical records; mixed eras keep journal order',()=>{
 const a=row('later','events',{名称:'后来',时间:'2001-01-02 10:00'}),b=row('earlier','events',{名称:'此前',时间:'2001-01-01 10:00'}),v=view([a,b]);
 assert.deepEqual(compileFormContext(v).rows.map(r=>r.id),['earlier','later']);
 b.values.时间='武周年间';const x=compileFormContext(v);assert.equal(x.context.timelineOrder,'journal-order');assert.deepEqual(x.rows.map(r=>r.id),['later','earlier']);
 assert.equal(b.values.时间,'武周年间');
});
test('duplicate identities and unknown tables fail visibly; compiler never mutates source or returned records back into it',()=>{
 const a=row('person','objects',{名称:'陆舟',类型:'character'}),v=view([a]);
 const x=compileFormContext(v);x.rows[0].values.名称='改稿';assert.equal(a.values.名称,'陆舟');
 assert.throws(()=>compileFormContext(view([a,a])),/重复/);
 assert.throws(()=>compileFormContext(view([row('x','missing',{名称:'未知'})])),/未登记/);
 assert.match(FORM_CONTEXT_GUIDE,/not occurred events/);
});
