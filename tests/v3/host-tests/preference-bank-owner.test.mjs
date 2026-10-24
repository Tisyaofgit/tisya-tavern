import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,sheet,wrap,newBody,xml} from './installer-harness.mjs';
import {parseSimpleSheet,formatSimpleSheet} from '../../../v3/host-runtime.mjs';
test('actual host runner records the selected preference bank on a model-generated pending candidate',async()=>{
 const feedback='今后请多写自然对白。',h=await createInstallerHarness({mvu:false,currentUser:feedback,provider:({stage,messages})=>{
  if(stage==='b')return wrap(newBody);const result=parseSimpleSheet(sheet(messages)),source=xml(messages,'TISYA.DATA.SOURCE').preferenceSources.find(s=>s.text===feedback);assert.ok(source);
  result.preferenceCandidates.changes.push({id:'new:natural',table:'preferences',expected:0,values:{名称:'自然对白',核心标签:'自然对白',偏好维度:'其他',内容:'多写自然对白',性质:'明确要求',强度:'喜爱',赋分:1,证据:feedback,作用域:{全局:true},启用:true},access:{readers:['读者'],knowers:[]},evidence:feedback,preferenceSource:source.key});return formatSimpleSheet(result);
 }});
 try{await h.intercept('normal');assert.equal(h.errors.length,0,h.errors[0]?.stack);const session=await h.api.getSession(),draft=(await session.storage.read()).preferenceDrafts[0];assert.ok(draft);assert.equal(draft.preferenceBankId,session.binding.books.preferences);assert.equal((await session.preferences.list()).drafts[0].id,draft.id);assert.equal((await session.preferences.project()).rows.length,0);await session.preferences.confirm(draft.id);assert.equal((await session.preferences.project()).groups[0].net,1);}finally{h.api.dispose();}
});
