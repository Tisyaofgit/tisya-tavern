import {mountHome} from '../../home.js';
import {mountChatEffects} from '../../message-ui.js';
import {DISPLAY_DEFAULTS} from '../../display-settings.js';
const d=document,root=d.querySelector('#tisya-shell'),page=root.querySelector('.tisya-page'),status=d.querySelector('#preview-status');
let motion=true,effects={...DISPLAY_DEFAULTS},home=null;
const error=e=>{status.textContent=e.message;status.hidden=false;};
const chat=mountChatEffects(d,{getMotion:()=>motion,getDisplay:()=>effects,onError:error});
function showHome(){
 home?.dispose();root.classList.add('tisya-page-open');chat.refresh();
 home=mountHome(d,page,{cards:[{id:0,avatar:'demo',name:'示例角色'}],profile:{description:'性别：'+(d.querySelector('#form').value==='male'?'男':'女')},effects,playing:motion,
  thumbnail:()=> 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#103b3b"/><circle cx="40" cy="40" r="25" fill="none" stroke="#cbb980"/></svg>'),
  listChats:async()=>[{file_name:'观潮示例.jsonl',mes:'这是演示列表，不会读取或修改你的会话。'}],onSelect:()=>showChat(),onError:error});
}
function showChat(){home?.dispose();home=null;page.replaceChildren();root.classList.remove('tisya-page-open');chat.refresh();}
function refresh(){chat.refresh();home?.refreshMotion(motion,effects);d.querySelector('#motion').setAttribute('aria-pressed',String(motion));d.querySelector('#motion').textContent='动效：'+(motion?'开':'关');d.querySelector('#sound').setAttribute('aria-pressed',String(effects.点触音效));d.querySelector('#sound').textContent='音效：'+(effects.点触音效?'开':'关');}
d.querySelector('#form').onchange=showHome;d.querySelector('#home').onclick=showHome;d.querySelector('#reading').onclick=showChat;
d.querySelector('#motion').onclick=()=>{motion=!motion;refresh();};d.querySelector('#sound').onclick=()=>{effects.点触音效=!effects.点触音效;refresh();};
d.querySelector('#weather').onchange=e=>{effects={...effects,斜雨:['rain','both'].includes(e.target.value),落雪:['snow','both'].includes(e.target.value)};refresh();};
d.addEventListener('click',e=>{const action=e.target.closest('[data-tisya-action]')?.dataset.tisyaAction;if(!action)return;if(action==='chat')showChat();else if(action==='home')showHome();else {status.textContent='此处只演示外观；实际版本会打开原有功能。';status.hidden=false;}});
showHome();refresh();
window.addEventListener('pagehide',()=>{home?.dispose();chat.dispose();},{once:true});
