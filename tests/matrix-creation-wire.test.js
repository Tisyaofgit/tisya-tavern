import test from 'node:test';
import assert from 'node:assert/strict';
import {taskSlots,preprocessTask} from '../tables/slots.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {defaultWorld} from '../config/core.js';

test('actual task envelope retains unified schema, template, contract and stable references',()=>{
 const input={databaseContract:'tisya.matrix-creation/1',kind:'character',mode:'extend',goal:'创建角色',source:{uid:81},schema:{T_CHAR_DOSSIER:{fields:[{key:'name',type:'TEXT'}]}},valueStates:['known','unknown'],currentRows:[{tableId:'T_CHAR_DOSSIER',recordId:'existing'}],template:'仅新内容用的骨架',output:{matrix:{changes:[]}}};
 const slots=taskSlots('tableGenesis',input);assert.equal(slots.source.databaseContract,input.databaseContract);assert.deepEqual(slots.state.schema,input.schema);assert.equal(slots.source.template,input.template);assert.deepEqual(slots.genesis.output,input.output);
 const text=preprocessTask('tableGenesis',input);for(const value of ['tisya.matrix-creation/1','T_CHAR_DOSSIER','existing','仅新内容用的骨架'])assert.ok(text.includes(value),value);
 const preset=pairedPreset({task:'tableGenesis',configuration:{world:defaultWorld()}}),wire=taskMessages({preset,task:'tableGenesis',input}).map(x=>x.content).join('\n');
 assert.ok(wire.includes('STATE.schema'));assert.ok(wire.includes('tisya.matrix-creation/1'));assert.ok(wire.includes('仅新内容用的骨架'));assert.match(wire,/matrix\.changes/);
});
