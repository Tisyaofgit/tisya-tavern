import test from 'node:test';
import assert from 'node:assert/strict';
import {currentNarrativeInput,projectNarrativeMaterial} from '../../../v3/host-projection.mjs';

test('B uses post-A scene participants for dossier presence and knowledge projection',()=>{
 const publicAccess={readers:['读者'],knowers:[]};const snapshot={rows:[
  {id:'scene',table:'scene',values:{参与者:['arrived']},access:publicAccess},
  {id:'past-secret',table:'cognition',values:{内容:'离场人物私有信息'},access:{readers:[],knowers:['left']}},
  {id:'current-secret',table:'cognition',values:{内容:'到场人物已知信息'},access:{readers:[],knowers:['arrived']}}
 ]};const input={onstageObjects:['left'],playerObjects:[],focusObjects:[]};
 assert.deepEqual(currentNarrativeInput(snapshot,input).onstageObjects,['arrived']);
 assert.deepEqual(projectNarrativeMaterial(snapshot,input).rows.map(r=>r.id),['scene','current-secret']);
 assert.deepEqual(currentNarrativeInput({rows:[]},input).onstageObjects,['left']);
 assert.deepEqual(currentNarrativeInput({rows:[{table:'scene',values:{参与者:[]}}]},input).onstageObjects,[]);
});
