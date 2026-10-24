import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountWorkbench} from '../../../v3/workbench.mjs';
test('home initialization opens the existing reviewed design flow without writing or generating',async()=>{
 const win=new Window({url:'http://localhost/'}),calls=[];
 const capabilities={getSnapshot:async()=>({binding:{name:'现有故事'},review:{items:[]},capabilities:[]}),action:async(id,args)=>{calls.push([id,args]);if(id==='archives.inspect')return {registry:{tables:[],types:[]},rows:[]};if(id==='books.list')return [];}};
 const view=mountWorkbench(win.document,win.document.body,{capabilities,stylesheetURL:'http://localhost/workbench.css'});await view.ready;
 const entry=[...view.shadow.querySelectorAll('button')].find(b=>b.textContent.startsWith('初始化／从资料提炼'));assert.ok(entry);entry.click();await view.settled();
 assert.ok(view.shadow.querySelector('[aria-label="待整理的资料"]'));
 assert.equal(view.shadow.querySelector('[aria-label="资料来源"]').value,'native');
 assert.ok([...view.shadow.querySelectorAll('button')].some(b=>b.textContent==='读取角色卡和绑定世界书'));
 assert.ok([...view.shadow.querySelectorAll('button')].some(b=>b.textContent==='生成初始化草案'));
 assert.equal(view.shadow.querySelector('[aria-label="待整理的资料"]').closest('details').open,false);
 assert.match(view.shadow.textContent,/不会清空当前存档/);
 assert.deepEqual(calls.map(x=>x[0]),['archives.inspect','books.list']);
 view.dispose();await win.happyDOM.abort();
});
