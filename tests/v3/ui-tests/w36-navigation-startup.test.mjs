import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountWorkbench} from '../../../v3/workbench.mjs';

const snapshot={binding:{name:'测试会话'},capabilities:[],review:{items:[]},assistant:{config:false,chat:false}};
function starting(t,initialPage='settings'){
 const win=new Window({url:'http://localhost/'});let resolve,reject,emit;
 const first=new Promise((done,fail)=>{resolve=done;reject=fail;}),calls=[];
 const capabilities={getSnapshot:()=>first,subscribe:listener=>{emit=listener;return()=>{};},action:async(id,args)=>{calls.push({id,args});}};
 const view=mountWorkbench(win.document,win.document.body,{capabilities,initialPage,stylesheetURL:'http://localhost/workbench.css'});
 t.after(async()=>{view.dispose();await win.happyDOM.abort();});
 return {view,calls,resolve:()=>resolve(structuredClone(snapshot)),reject:()=>reject(Error('首次快照读取失败')),emit:()=>emit(structuredClone(snapshot)),click:page=>{const button=view.shadow.querySelector('nav [data-page="'+page+'"]');assert.ok(button);button.click();}};
}

test('a navigation click during the first snapshot read remains selected after startup finishes',async t=>{
 const f=starting(t);f.emit();assert.equal(f.view.shadow.querySelector('h1').textContent,'全部设置');
 f.click('home');await f.view.settled();assert.equal(f.view.getState().page,'home');assert.match(f.view.shadow.querySelector('main').textContent,/让故事继续向前/);
 f.resolve();await f.view.ready;assert.equal(f.view.getState().page,'home');assert.equal(f.view.shadow.querySelector('h1').textContent,'工作台');assert.match(f.view.shadow.querySelector('main').textContent,/让故事继续向前/);assert.equal(f.calls.length,0);
});

test('the most recent accepted startup tab click wins and an untouched initial page still opens',async t=>{
 const f=starting(t,'home');f.emit();f.click('settings');await f.view.settled();f.click('home');await f.view.settled();f.click('settings');await f.view.settled();f.resolve();await f.view.ready;assert.equal(f.view.getState().page,'settings');assert.equal(f.view.shadow.querySelector('h1').textContent,'全部设置');
 const untouched=starting(t,'settings');untouched.resolve();await untouched.view.ready;assert.equal(untouched.view.getState().page,'settings');assert.equal(untouched.view.shadow.querySelector('h1').textContent,'全部设置');
});

test('a failed first refresh stays visible without reverting the accepted page',async t=>{
 const f=starting(t);f.emit();f.click('home');await f.view.settled();f.reject();await f.view.ready;
 assert.equal(f.view.getState().page,'home');assert.match(f.view.shadow.querySelector('main').textContent,/让故事继续向前/);assert.match(f.view.shadow.querySelector('[role="alert"]').textContent,/首次快照读取失败/);assert.equal(f.view.getState().busy,false);
});

test('startup completion after disposal does not initiate the initial page reads',async t=>{
 const f=starting(t,'books');f.view.dispose();f.resolve();await f.view.ready;assert.equal(f.calls.length,0);
});
