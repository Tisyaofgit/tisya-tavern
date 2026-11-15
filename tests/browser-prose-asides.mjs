import {formatProse,proseCSS} from '../prose.js';
import {mountMessageVisual} from '../message-ui.js';
import {mountMessageReader} from '../reader.js';
import fixtureTemplate from './fixtures/browser-prose-asides.json' with {type:'json'};
const fixture=({body})=>{
 const paragraphs=[];let part='',inside=false;
 for(const block of body.split(/\n\s*\n/)){part+=(part?'\n':'')+block;for(const ch of block)if(ch==='■')inside=!inside;if(!inside){paragraphs.push(part);part='';}}
 if(part)paragraphs.push(part);
 return fixtureTemplate.replace('ASIDE_BODY_PLACEHOLDER',paragraphs.map((p,i)=>(i+1)+'\n'+p).join('\n\n'));
};
const $=s=>document.querySelector(s),errors=[],fail=e=>{errors.push(String(e.stack??e));$('#errors').textContent=errors.join('\n');};
window.addEventListener('error',e=>fail(e.error??e.message));window.addEventListener('unhandledrejection',e=>fail(e.reason));
const short='雨落在檐下，他把伞往她那边偏了偏。\n\n“I will wait for you.”◆我会在这里等你。◆\n\n她没有立刻回答，只伸手拂去他肩头的水。\n\n■我本来想问，\n她还会不会回来。\n\n话到嘴边，却只剩下一句：\n别淋着雨。■\n\n“明天见。”她说。';
const long=short+'\n\n'+Array.from({length:5},(_,i)=>'“We still have time.”◆我们还有时间。'+('这是一段较长的译注，检查窄屏换行和句尾装饰。'.repeat(i+1))+'◆\n\n■'+('我记得门外的雨声，也记得她没有说出口的话。'.repeat(i+1))+'\n\n别急，慢慢说。■').join('\n\n')+'\n\n◆最后一条译注◆◆紧接着的译注◆\n\n■最后的短心声。■';
let source=short,mode='sample',view=null,renders=0,large=false;
const hostFormat=text=>text.split(/\n\s*\n/).map(p=>'<p>'+p.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</p>').join('');
const style=document.createElement('style');style.textContent=proseCSS;document.head.append(style);
function render(){view?.dispose();view=null;$('#sample').hidden=mode!=='sample';$('#mount').hidden=mode==='sample';$('#mount').replaceChildren();if(mode==='sample')$('#sample').innerHTML=formatProse(document,source,hostFormat);else{const options={source:fixture({body:source,taskExtra:'PRIVATE_CANARY'}),formatBody:hostFormat,onChooseAction(){},getMotion:()=>false};view=mode==='host'?mountMessageVisual(document,$('#mount'),options):mountMessageReader(document,$('#mount'),options);}renders++;}
function currentRoot(){return mode==='host'?view.host.shadowRoot:mode==='reader'?$('#mount'):$('#sample');}
function report(){const root=currentRoot(),nodes=[...root.querySelectorAll('[data-tisya-aside]')],stage=$('#stage'),rect=stage.getBoundingClientRect();return {mode,renders,width:Math.round(rect.width),font:getComputedStyle(nodes[0]).fontSize,translation:nodes.filter(n=>n.dataset.tisyaAside==='translation').length,thought:nodes.filter(n=>n.dataset.tisyaAside==='thought').length,overflow:stage.scrollWidth>stage.clientWidth+1,blocksInside:nodes.every(n=>{const r=n.getBoundingClientRect();return r.left>=rect.left&&r.right<=rect.right+1;}),sourceUnchanged:source===short||source===long,privateLeak:root.textContent.includes('PRIVATE_CANARY'),markersVisible:/[◆■]/.test(root.textContent),fontLoaded:document.fonts.check('20px TisyaReading'),protocolError:/TISYA_(?:PIPES|PARAGRAPH)_/.test(root.textContent),errors:[...errors]};}
for(const [id,fn] of Object.entries({narrow:()=>$('#stage').style.width='360px',wide:()=>$('#stage').style.width='709px',large:()=>{large=!large;$('#stage').style.fontSize=large?'27px':'20px';},long:()=>{source=long;render();},short:()=>{source=short;mode='sample';render();},host:()=>{mode='host';render();},reader:()=>{mode='reader';render();},refresh:render,inspect:()=>$('#report').textContent=JSON.stringify(report(),null,2)}))$('#'+id).onclick=()=>{try{fn();}catch(e){fail(e);}};
try{
 const parts=await Promise.all([1,2,3,4].map(async i=>{const r=await fetch('../font/reading.part'+i+'.bin');if(!r.ok)throw Error('Font part '+i+': '+r.status);return new Uint8Array(await r.arrayBuffer());}));
 const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
 const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const hash=hex(await crypto.subtle.digest('SHA-256',bytes));if(hash!=='b68d6b9e4f3607fad79ab20c744092139aa64590a0c82354d31361929aa3afcb')throw Error('Font hash mismatch');
 const font=await new FontFace('TisyaReading',bytes).load();document.fonts.add(font);
 const code=await(await fetch('../prose-asides.js',{cache:'no-store'})).text(),version=(await(await fetch('../package.json',{cache:'no-store'})).json()).version;
 $('#build').textContent='版本 '+version+'\nprose-asides SHA256 '+hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)))+'\n生产正文渲染／消息与阅读器挂载；隔离合成内容。';render();
}catch(e){fail(e);}
