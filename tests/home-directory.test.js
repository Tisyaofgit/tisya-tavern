import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {directoryState,directoryToken,directoryEntry,changeDirectory,mountDirectoryHold} from '../home-directory.js';
import {mountHome} from '../home.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('personal labels and pins separate same-name roles and chats without changing sources',()=>{
 const a={avatar:'a.png',name:'同名'},b={avatar:'b.png',name:'同名'},chat={file_name:'一个名字.jsonl',mes:'原文'};
 let settings={联系人分组:{}};settings=changeDirectory(settings,directoryToken(a,chat),{名称:'我的名字',置顶:17});settings=changeDirectory(settings,directoryToken(b),{名称:'另一个'});
 assert.equal(directoryEntry(settings,a,chat).名称,'我的名字');assert.deepEqual(directoryEntry(settings,b,chat),{});assert.deepEqual(directoryEntry(settings,a),{});assert.equal(chat.file_name,'一个名字.jsonl');assert.equal(chat.mes,'原文');assert.equal(a.name,'同名');
 settings=changeDirectory(settings,directoryToken(a,chat),{名称:null,置顶:null});assert.deepEqual(directoryEntry(settings,a,chat),{});assert.equal(directoryEntry(settings,b).名称,'另一个');
 for(const bad of [{会话目录:[]},{会话目录:{oops:{}}},{会话目录:{[directoryToken(a)]:{置顶:-1}}}])assert.throws(()=>directoryState(bad),/损坏/);
});
test('long press opens once, swallows release-click, and cancels scroll or detached targets',async()=>{
 const w=new Window(),d=w.document;d.body.innerHTML='<main><div data-directory="role"><button>打开</button></div></main>';const root=d.querySelector('main'),button=root.querySelector('button'),calls=[];let clicks=0;button.onclick=()=>clicks++;
 const off=mountDirectoryHold(root,{delay:15,onMenu:t=>calls.push(t)}),pointer=(name,x=1)=>button.dispatchEvent(new w.PointerEvent(name,{bubbles:true,pointerId:1,clientX:x,clientY:1,button:0,isPrimary:true}));
 pointer('pointerdown');await sleep(25);pointer('pointerup');button.click();assert.deepEqual(calls,['role']);assert.equal(clicks,0);button.click();assert.equal(clicks,1);
 pointer('pointerdown');pointer('pointermove',30);await sleep(25);assert.equal(calls.length,1);
 pointer('pointerdown');root.dispatchEvent(new w.Event('scroll'));await sleep(25);assert.equal(calls.length,1);
 pointer('pointerdown');button.parentElement.remove();await sleep(25);assert.equal(calls.length,1);
 off();await w.happyDOM.abort();
});
test('pinned role and chat order uses stable native identities and chevron never selects chat',async()=>{
 const w=new Window(),d=w.document;d.body.innerHTML='<main></main>';const cards=[{id:0,avatar:'a',name:'甲'},{id:1,avatar:'b',name:'乙'}],rows=[{file_name:'old.jsonl',last_mes:1},{file_name:'new.jsonl',last_mes:2}];let prefs={};prefs=changeDirectory(prefs,directoryToken(cards[1]),{置顶:1});prefs=changeDirectory(prefs,directoryToken(cards[1],rows[0]),{置顶:2,名称:'置顶旧聊'});const selected=[];
 const view=mountHome(d,d.querySelector('main'),{cards,preferences:prefs,listChats:async()=>rows,thumbnail:()=>'',chatDate:n=>({timestamp:n,day:'',time:''}),onSelect:(...x)=>selected.push(x),mountArt:()=>({ready:Promise.resolve(),setPlaying(){},dispose(){}})});await view.ready;
 assert.match(d.querySelector('.tisya-home-role-name').textContent,/乙/);assert.match(d.querySelector('[data-home-chat]').textContent,/置顶旧聊/);d.querySelector('.tisya-home-chat-row .tisya-home-menu').click();assert.equal(selected.length,0);
 d.querySelector('[data-home-chat]').click();assert.equal(selected[0][0].avatar,'b');assert.equal(selected[0][1].file_name,'old.jsonl');view.dispose();await w.happyDOM.abort();
});
