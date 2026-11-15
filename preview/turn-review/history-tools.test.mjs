import test from 'node:test';
import assert from 'node:assert/strict';
import {archivedUnits,demoHistoryMessages,seedHistoryTools} from './history-tools.mjs';
import {projectHistoryLayers,sourceVersion} from '../../engine/history-layers.mjs';

test('same entity field at different historical floors is not mistaken for a conflicting fact',()=>{
 const tools=seedHistoryTools();
 tools.receipts=demoHistoryMessages.filter(m=>m.role==='assistant').map((m,i)=>({key:'receipt-'+i,channel:'archive',state:'known',table:'gauge',recordId:'energy',fieldKey:'value',label:'体力',value:[86,82,78,72][i],messageId:m.id,version:sourceVersion(m),scope:m.scope,source:{messageId:m.id,version:sourceVersion(m)}}));
 const archives=archivedUnits(tools);
 assert.equal(new Set(archives.map(a=>a.factId)).size,archives.length);
 const result=projectHistoryLayers({messages:demoHistoryMessages,archives,scope:demoHistoryMessages[0].scope,historyCount:0});
 assert.equal(result.archiveUnits.filter(a=>a.id.startsWith('receipt-')).length,4);
});
