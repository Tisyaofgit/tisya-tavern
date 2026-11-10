import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createPhoneService} from '../phone-core.mjs';
import {communicationAccounts,communicationDocuments} from '../social-communication.mjs';
import {publicAccounts,publicDocuments} from '../social-public.mjs';
import {mediaAccounts,mediaDocuments} from '../social-media.mjs';
const seed={accounts:{...communicationAccounts,...publicAccounts,...mediaAccounts},documents:[...communicationDocuments,...publicDocuments,...mediaDocuments]};
test('iframe realm plain data is normalized; accessors are refused before execution',async()=>{
 let saved=null,n=0;const service=createPhoneService({seed,contextKey:'realm-test',idFactory:()=>`realm-${++n}`,storage:{load:async()=>saved,save:async value=>{saved=structuredClone(value);}}});await service.init();
 const foreign=vm.runInNewContext('({blocks:[{type:"weibo",thread:"wb-encore",meta:{readerState:{me:{followed:true}}}}]})');
 assert.notEqual(Object.getPrototypeOf(foreign),Object.prototype);
 await service.applyLocal(foreign,'关注');assert.equal(service.getState().suite.documents['wb-encore'].meta.readerState.me.followed,true);
 const before=service.export();let invoked=0;const hostile={};Object.defineProperty(hostile,'blocks',{enumerable:true,get(){invoked++;return [];}});
 await assert.rejects(service.applyLocal(hostile),e=>e.code==='PHONE_DATA');assert.equal(invoked,0);assert.equal(service.export(),before);
});
