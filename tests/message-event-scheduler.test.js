import test from 'node:test';
import assert from 'node:assert/strict';
import {createMessageEventScheduler,messageEventId} from '../message-event-scheduler.js';
import {createMessageCacheScheduler} from '../message-cache-scheduler.js';

function manualTimer(){let id=0;const jobs=new Map();return {jobs,window:{setTimeout(fn){jobs.set(++id,fn);return id;},clearTimeout(key){jobs.delete(key);}},run(){const batch=[...jobs.values()];jobs.clear();for(const fn of batch)fn();}};}

test('message events coalesce by floor and preserve full-refresh fallbacks',()=>{
 const timer=manualTimer(),calls=[],nodes=new Map([['2',{id:2}],['4',{id:4}]]);let checked=0;
 const scheduler=createMessageEventScheduler({decorate:node=>calls.push(node?.id??'all'),findById:id=>nodes.get(id),onBefore:()=>checked++,schedule:timer.window.setTimeout,cancel:timer.window.clearTimeout});
 scheduler.notify('MESSAGE_UPDATED',['2']);scheduler.notify('MESSAGE_EDITED',[4]);scheduler.notify('MESSAGE_RECEIVED',['2']);timer.run();
 assert.equal(checked,3);assert.deepEqual(calls,[2,4]);
 scheduler.notify('MESSAGE_SWIPED',[{messageId:2}]);timer.run();assert.deepEqual(calls,[2,4,'all'],'unknown host payload must not skip changes');
 scheduler.notify('MESSAGE_RECEIVED',['2']);scheduler.notify('GENERATION_ENDED',[]);timer.run();assert.deepEqual(calls,[2,4,'all','all']);
 scheduler.notify('MESSAGE_EDITED',[4]);scheduler.dispose();timer.run();assert.deepEqual(calls,[2,4,'all','all']);
 assert.equal(messageEventId('MESSAGE_UPDATED',['07']),'07');assert.equal(messageEventId('MESSAGE_DELETED',[2]),null);
});

test('cache cleanup is deferred, superseded and validated against its chat generation',async()=>{
 const timer=manualTimer(),jobs=[];let scope='A',messages=[{mes:'a'}];
 const schedule=createMessageCacheScheduler({...timer,getScope:()=>scope,getMessages:()=>messages,reconcile:(...args)=>{jobs.push(args);return Promise.resolve();},delay:5});
 schedule();schedule();timer.run();await Promise.resolve();assert.equal(jobs.length,1);assert.equal(jobs[0][0],'A');
 const stale=jobs[0][2].isCurrent;assert.equal(stale(),true);schedule();assert.equal(stale(),false);timer.run();await Promise.resolve();assert.equal(jobs.length,2);
 scope='B';messages=[{mes:'b'}];schedule();const current=jobs[1][2].isCurrent;assert.equal(current(),false);timer.run();await Promise.resolve();assert.equal(jobs.length,3);assert.equal(jobs[2][0],'B');
 schedule();schedule.dispose();timer.run();await Promise.resolve();assert.equal(jobs.length,3);
});
