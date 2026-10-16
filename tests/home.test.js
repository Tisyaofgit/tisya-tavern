import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountHome,waterForm} from '../home.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const cards=n=>Array.from({length:n},(_,id)=>({id,avatar:`avatar-${id}.png`,name:id<2?'同名角色':`角色 ${id}`}));
const chats=n=>Array.from({length:n},(_,i)=>({file_name:`会话-${i}.jsonl`,mes:`摘要-${i}`}));
function fixture(options={}){
 const w=new Window({url:'http://localhost'}),d=w.document;d.body.innerHTML='<main></main>';const root=d.querySelector('main'),errors=[],selected=[],art=[];
 const view=mountHome(d,root,{cards:cards(2),listChats:async()=>chats(2),thumbnail:avatar=>`/thumbnail?file=${encodeURIComponent(avatar)}`,onError:e=>errors.push(e),onSelect:async(...args)=>selected.push(args),mountArt:(d,c,o)=>{art.push(o);return {ready:Promise.resolve(),setPlaying:value=>art.push(value),dispose:()=>art.push('disposed')};},...options});
 return {w,d,root,view,errors,selected,art,close:async()=>{view.dispose();await w.happyDOM.abort();}};
}
test('persona form reads only explicit fields, rejects ambiguous or contextual mentions',()=>{
 for(const text of ['性别：男','姓名：青鸟\n性别: 男性','gender: male'])assert.deepEqual(waterForm(text),{gender:'male',explicit:true});
 for(const text of ['性别：女','Gender: Female'])assert.deepEqual(waterForm(text),{gender:'female',explicit:true});
 for(const text of ['','他是一位男性','喜欢性别：男','性别：男\n性别：女','朋友的性别：男','性别：非二元'])assert.deepEqual(waterForm(text),{gender:'female',explicit:false});
});
test('homepage uses native routes and real card thumbnails, escapes all user content',async()=>{
 const f=fixture({cards:[{id:4,name:'<img src=x onerror=alert(1)>',avatar:'safe & name.png'}],profile:{name:'<script>x</script>',description:'性别：男'}});await f.view.ready;
 assert.equal(f.art[0].gender,'male');assert.equal(f.root.querySelectorAll('script').length,0);assert.equal(f.root.querySelector('.tisya-home-portrait img').src,'http://localhost/thumbnail?file=safe%20%26%20name.png');
 for(const action of ['drawer:persona-management-button','drawer:WI-SP-button','drawer:ai-config-button','menu','contacts','groups'])assert(f.root.querySelector(`[data-tisya-action="${action}"]`));
 assert.equal(f.root.querySelector('[data-tisya-action=menu]').textContent,'设置');assert.equal(f.root.querySelector('.tisya-home-profile small').textContent,'用户入口 ↗');assert.match(f.root.querySelector('.tisya-home-dedication img').alt,/Svāti/);assert.equal(f.root.querySelector('.tisya-home-form-note'),null);
 f.view.refreshMotion(false);assert.equal(f.art.at(-1),false);await f.close();assert.equal(f.art.at(-1),'disposed');
});
test('slow metadata does not hold up another role; only four reads run at once',async()=>{
 const reads=[];const f=fixture({cards:cards(9),listChats:(card,signal)=>{const pending=deferred();reads.push({card,signal,...pending});return pending.promise;}});
 assert.equal(reads.length,4);assert.equal(f.root.querySelectorAll('.tisya-home-role').length,9);assert.equal(f.root.querySelectorAll('[data-home-chat]').length,0);
 reads[1].resolve(chats(1));await new Promise(r=>setTimeout(r,0));assert.equal(reads.length,5);assert.equal(f.root.querySelectorAll('[data-home-chat]').length,1);assert.equal(f.root.querySelector('[data-home-chat]').dataset.homeCard,'1');
 f.view.dispose();assert(reads.filter(r=>r.card.id!==1).every(r=>r.signal.aborted));const before=f.root.innerHTML;
 for(const read of reads)read.resolve(chats(9));await f.view.ready;assert.equal(f.root.innerHTML,before);assert.equal(reads.length,5);await f.close();
});
test('large histories render six rows per open role; search reaches unrendered rows and all roles',async()=>{
 const f=fixture({cards:cards(30),listChats:async()=>chats(200)});await f.view.ready;
 assert.equal(f.root.querySelectorAll('.tisya-home-role').length,24);assert.equal(f.root.querySelectorAll('[data-home-chat]').length,12);
 f.root.querySelector('[data-more="0"]').click();assert.equal(f.root.querySelectorAll('[data-home-card="0"]').length,12);
 const input=f.root.querySelector('input');input.value='会话-199';input.dispatchEvent(new f.w.Event('input'));await new Promise(r=>setTimeout(r,160));await f.w.happyDOM.whenAsyncComplete();
 assert.equal(f.root.querySelectorAll('[data-home-chat]').length,24);f.root.querySelector('.tisya-home-more-roles').click();assert.equal(f.root.querySelectorAll('[data-home-chat]').length,30);
 const button=f.root.querySelector('[data-home-card="29"]');button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.selected[0][0].avatar,'avatar-29.png');assert.equal(f.selected[0][1].file_name,'会话-199.jsonl');await f.close();
});
test('late metadata does not replace another role button during a press',async()=>{
 const pending=deferred();const f=fixture({listChats:card=>card.id===0?Promise.resolve(chats(2)):pending.promise});await new Promise(r=>setTimeout(r,0));
 const button=f.root.querySelector('[data-home-chat]');button.focus();pending.resolve(chats(5));await f.view.ready;
 assert.equal(f.root.querySelector('[data-home-chat]'),button);assert.equal(f.d.activeElement,button);await f.close();
});
test('timeouts, failed thumbnails and selection failures remain explicit and recoverable',async()=>{
 const f=fixture({requestTimeout:5,listChats:(card,signal)=>card.id===0?new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))):Promise.resolve(chats(1)),onSelect:async()=>{throw Error('宿主未切换');}});await f.view.ready;
 assert.match(f.root.querySelector('[role=alert]').textContent,/超时/);const image=f.root.querySelector('.tisya-home-portrait img');image.dispatchEvent(new f.w.Event('error'));assert.equal(image.hidden,true);assert.equal(image.nextElementSibling.hidden,false);
 const button=f.root.querySelector('[data-home-chat]');button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.errors[0].message,'宿主未切换');assert.equal(button.disabled,false);await f.close();
});
test('repeated selection is blocked until the first switch settles, and disposed handlers do nothing',async()=>{
 const pending=deferred();let selected=0;const f=fixture({onSelect:async()=>{selected++;await pending.promise;}});await f.view.ready;
 const button=f.root.querySelector('[data-home-chat]');button.click();button.click();assert.equal(selected,1);f.view.dispose();pending.resolve();await f.w.happyDOM.whenAsyncComplete();button.click();assert.equal(selected,1);await f.close();
});
test('recent metadata ordering preserves the exact selected file and never invents missing dates',async()=>{
 const f=fixture({cards:cards(1),listChats:async()=>[{file_name:'old.jsonl',last_mes:1},{file_name:'unknown.jsonl'},{file_name:'new.jsonl',last_mes:3}],chatDate:value=>value?{timestamp:value,day:'10/12',time:'02:18'}:null});await f.view.ready;
 const buttons=[...f.root.querySelectorAll('[data-home-chat]')];assert.match(buttons[0].textContent,/new/);assert.match(buttons[2].textContent,/unknown/);assert.equal(buttons[2].querySelector('time'),null);
 buttons[0].click();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.selected[0][1].file_name,'new.jsonl');await f.close();
});
