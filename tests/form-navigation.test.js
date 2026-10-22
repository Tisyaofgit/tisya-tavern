import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {formUI} from '../tables/form-ui.js';
import {renderRuleReview} from '../tables/rule-review-ui.js';
const byLabel=(root,label)=>[...root.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===label);
const button=(root,text)=>[...root.querySelectorAll('button')].find(n=>n.textContent===text);
const change=(w,n,value)=>{assert(n);n.value=value;n.dispatchEvent(new w.Event('input'));};
const open=(root,name)=>{const b=byLabel(root,'编辑 '+name);assert(b,name);b.click();};
const back=root=>byLabel(root,'返回上一级字段').click();
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));
test('deep JSON uses sibling pages, keeps typed values, and Back preserves edits and type drafts',async()=>{
 const w=new Window(),root=w.document.body,initial={include:{flag:false,count:0,empty:null,list:[{label:'原文'},false,0]}};
 const read=formUI(w.document).value(root,'设置',{type:'json',required:true},initial),nav=root.querySelector('.tisya-field-editor');assert.deepEqual(read(),initial);
 open(nav,'include');assert.equal(nav.dataset.currentPage,'include');open(nav,'flag');const flag=byLabel(nav,'flag · 内容 · 值');assert.equal(flag.checked,false);
 change(w,byLabel(nav,'flag · 数据类型'),'number');change(w,byLabel(nav,'flag · 内容 · 值'),'7');back(nav);back(nav);assert.equal(read().include.flag,7);
 open(nav,'include');open(nav,'flag');change(w,byLabel(nav,'flag · 数据类型'),'boolean');assert.equal(byLabel(nav,'flag · 内容 · 值'),flag);assert.equal(read().include.flag,false);
 change(w,byLabel(nav,'flag · 数据类型'),'number');assert.equal(read().include.flag,7);back(nav);open(nav,'empty');change(w,byLabel(nav,'empty · 填写状态'),'missing');assert(!Object.hasOwn(read().include,'empty'));change(w,byLabel(nav,'empty · 填写状态'),'null');assert.equal(read().include.empty,null);
 for(const page of nav.querySelectorAll('.tisya-field-editor-page'))assert.equal(page.parentElement,nav.lastElementChild,'each value page shares one outlet');
 const depths=[...root.querySelectorAll('fieldset')].map(n=>{let depth=0;for(let p=n;p;p=p.parentElement)if(p.tagName==='FIELDSET')depth++;return depth;});assert(Math.max(...depths)<=3,'data depth cannot grow visual fieldset depth');assert.equal(read().include.count,0);assert.deepEqual(read().include.list,[{label:'原文'},false,0]);await w.happyDOM.abort();
});
test('deleting list items removes their peer editor pages without reindexing or dropping other values',async()=>{
 const w=new Window(),root=w.document.body,read=formUI(w.document).value(root,'列表',{type:'array',items:{type:'object',fields:{值:{type:'number',required:true}}},required:true},[{值:0},{值:2}]),nav=root.querySelector('.tisya-field-editor');
 open(nav,'列表 · 列表项 1');open(nav,'值');change(w,byLabel(nav,'值 · 值'),'8');back(nav);back(nav);button(nav,'移除列表项').click();assert.deepEqual(read(),[{值:2}]);assert.equal(nav.querySelector('[data-editor-page="列表 · 列表项 1"]'),null);assert.equal(byLabel(nav,'值 · 值').value,'2');await w.happyDOM.abort();
});
test('existing schema fields remain readonly but their full-width child pages can be browsed',async()=>{
 const w=new Window(),root=w.document.body,registry={tables:[{id:'t',name:'测试表',version:1,aliases:[],owner:'archive',fields:{名称:{type:'text',required:true},配置:{type:'object',fields:{include:{type:'boolean'},count:{type:'number'}}}}}],types:[]};
 const read=formUI(w.document).registryEditor(root,registry);open(root,'测试表');open(root,'配置');const sub=byLabel(root,'编辑 include');assert(sub&&!sub.disabled);sub.click();const kind=byLabel(root,'type · 数据类型');assert(kind?.disabled);assert.deepEqual(read(),registry);assert([...root.querySelectorAll('.tisya-field-editor')].every(nav=>nav.querySelector('[aria-label="返回上一级字段"]')?.disabled===false));await w.happyDOM.abort();
});
function reviewFixture(){return {fingerprint:'same-source',issues:[{id:'one',title:'第一项',problem:'问题一',sources:[{sourceId:'s',quote:'原文一'}],options:[]},{id:'two',title:'第二项',problem:'问题二',sources:[{sourceId:'s',quote:'原文二'}],options:[]}],decisions:{}};}
test('rule review keeps one question, advances only after saved state, and revisits previous decisions',async()=>{
 const w=new Window(),root=w.document.body;let review=reviewFixture(),calls=0,finished=0;
 const render=()=>renderRuleReview(w.document,root,{review,onComplete:()=>finished++,onChoose:async choice=>{calls++;review=structuredClone(review);if(choice.action==='reopen')delete review.decisions[choice.issueId];else review.decisions[choice.issueId]={action:choice.action};render();}});render();assert.equal(root.querySelectorAll('[data-rule-issue]').length,1);assert.equal(root.querySelector('[data-rule-issue]').dataset.ruleIssue,'one');
 button(root,'保留原规则并静默').click();await turn();assert.equal(root.querySelector('[data-rule-issue]').dataset.ruleIssue,'two');button(root,'‹ 上一项').click();assert.match(root.textContent,/已保留原规则/);button(root,'重新选择此项').click();await turn();assert.equal(root.querySelector('[data-rule-issue]').dataset.ruleIssue,'one');button(root,'保留原规则并静默').click();await turn();button(root,'保留原规则并静默').click();await turn();assert.equal(root.querySelectorAll('[data-rule-issue]').length,0);assert.equal(calls,4);button(root,'继续生成表格').click();assert.equal(finished,1);await w.happyDOM.abort();
});
test('failed or unacknowledged rule saves do not advance or invent a selected decision',async()=>{
 const w=new Window(),root=w.document.body,review=reviewFixture();let calls=0,release;
 renderRuleReview(w.document,root,{review,onChoose:async()=>{calls++;await new Promise(resolve=>release=resolve);throw Error('保存失败');}});const keep=button(root,'保留原规则并静默');keep.click();keep.click();assert.equal(calls,1);assert.match(root.textContent,/正在保存/);release();await turn();assert.equal(root.querySelector('[data-rule-issue]').dataset.ruleIssue,'one');assert.match(root.textContent,/保存失败/);assert.deepEqual(review.decisions,{});await w.happyDOM.abort();
});
test('formula parameters remain peer pages and retain the complete expression across Back',async()=>{
 const w=new Window(),root=w.document.body,node={op:'add',args:[{op:'field',field:'a'},0,{op:'subtract',args:[{op:'field',field:'b'},2]}]},read=formUI(w.document).formulaEditor(root,node),nav=root.querySelector('.tisya-field-editor');assert.deepEqual(read(),node);
 open(nav,'参数 1');change(w,byLabel(nav,'取值字段'),'updated');back(nav);assert.equal(read().args[0].field,'updated');assert.equal(read().args[1],0);
 for(const page of nav.querySelectorAll('.tisya-field-editor-page'))assert.equal(page.parentElement,nav.lastElementChild);await w.happyDOM.abort();
});
