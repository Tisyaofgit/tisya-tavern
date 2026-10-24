import {emotionCatalog} from './emotion-catalog.js';
import {readV3Details} from './v3/reply.mjs';
export const readReplyDetails=readV3Details;
export function mountHeartBlock(document,container,value,{label}={}){
 const host=document.createElement('div');host.className='heart-host';host.setAttribute('aria-label',label??'缇斯亚心声');host.dataset.status=value.status;
 if(!value.items.length)return null;
 const line=document.createElement('div'),bubble=document.createElement('button'),text=document.createElement('span'),dots=document.createElement('span'),mood=document.createElement('span');
 line.className='heart-line';bubble.className='heart-bubble';bubble.type='button';dots.className='heart-dots';mood.className='emotion heart-mood';let index=0,revision=0,alive=true;
 function bindMood(name){const current=++revision;mood.replaceChildren();mood.hidden=name===null;if(name===null)return;mood.textContent='表情加载中…';emotionCatalog(document).resolve(name).then(row=>{if(!alive||current!==revision||!host.isConnected)return;const img=document.createElement('img');img.src=row.url;img.alt=row.name;img.className='heart-emotion';mood.replaceChildren(img);},()=>{if(!alive||current!==revision||!host.isConnected)return;mood.textContent='表情不可用：'+name;mood.setAttribute('role','status');});}
 function render(){const item=value.items[index];text.textContent=item.text;host.dataset.direction=item.type;host.dataset.mood=item.mood??'';mood.textContent=item.mood&&item.mood!=='无'?item.mood:'';mood.hidden=!mood.textContent;bubble.setAttribute('aria-label',item.text+(value.items.length>1?'；第'+(index+1)+'条，共'+value.items.length+'条，点击下一条':''));bubble.dataset.index=String(index);dots.replaceChildren();dots.hidden=value.items.length<2;for(let i=0;i<value.items.length;i++){const dot=document.createElement('i');if(i===index)dot.className='active';dots.append(dot);}}
 const renderText=render;function update(){renderText();bindMood(value.items[index].mood);}
 bubble.onclick=()=>{if(!alive||!host.isConnected)return;index=(index+1)%value.items.length;update();};bubble.append(text,dots);line.append(bubble,mood);host.append(line);container.append(host);host.captureHeart=()=>index;host.restoreHeart=saved=>{if(alive&&Number.isInteger(saved)&&saved>=0&&saved<value.items.length){index=saved;update();}};host.disposeHeart=()=>{alive=false;revision++;bubble.onclick=null;};update();return host;
}
export function mountAuditBlock(document,container,rows){
 if(!rows.length)return null;const wrapper=document.createElement('div');wrapper.className='fold-content reply-checks';const fold=document.createElement('details'),title=document.createElement('summary'),body=document.createElement('div');fold.className='ledger-section audit-ledger';title.textContent='核验 · '+rows.length;body.className='ledger-body';
 for(const row of rows){const item=document.createElement('details'),head=document.createElement('summary'),orb=document.createElement('span'),label=document.createElement('span'),text=document.createElement('p');item.className='audit-bead';orb.className='status-orb';orb.textContent=row.status==='符合'?'✓':'·';orb.setAttribute('aria-hidden','true');label.textContent=row.kind;head.append(orb,label);head.setAttribute('aria-label',row.kind+'：'+row.status);text.textContent=row.status+' · '+row.evidence;item.append(head,text);body.append(item);}
 fold.append(title,body);wrapper.append(fold);container.append(wrapper);return wrapper;
}
export const replyControlsCSS=`
.round-empty{box-sizing:border-box;align-self:start;margin:0;padding:14px 18px;border:1px solid #a8c7ad80;border-radius:30px 25px 32px 24px;background:linear-gradient(145deg,#456b5660,#0b342c9c);box-shadow:inset 0 2px 3px #e5e8be25,0 5px 12px #001c1830;color:#cbdac7;font:14px/1.8 var(--tisya-global-font,TisyaReading),TisyaReading,serif;overflow-wrap:anywhere;min-width:0}

.action-mode-control{position:relative;display:flex;justify-content:flex-end;margin:-44px 0 12px;min-height:44px}
.action-mode-toggle{display:flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--gold,#ffedbf);font:13px/1.6 var(--tisya-global-font,TisyaReading),TisyaReading,serif;padding:3px 6px;min-height:44px}
.action-mode-toggle img{width:27px;height:35px;object-fit:contain}
.action-mode-menu{position:absolute;right:0;top:100%;z-index:10;width:175px;padding:7px;background:#092b26;border:1px solid #c9bb87;border-radius:12px;box-shadow:0 12px 28px #001818b0}
.action-mode-menu[hidden]{display:none!important}.action-mode-menu button{display:block;width:100%;text-align:left;border:0;background:none;color:inherit;font:15px/1.6 var(--tisya-global-font,TisyaReading),TisyaReading,serif;min-height:46px;padding:8px}
.action-mode-menu [aria-checked=true]{color:#f5dca0;background:#a5b18822;border-radius:8px}
.action-feedback{margin:8px 2px 0;font:12px/1.65 var(--tisya-global-font,TisyaReading),TisyaReading,serif;min-height:18px;color:var(--muted,#e8f0ea)}
.action-heading{padding-right:80px}.action.selected{outline:1px solid #dfc88d}
.heart-bubble{white-space:normal;overflow-wrap:anywhere;text-align:left}.heart-mood[hidden]{display:none!important}.heart-mood[role=status]{height:auto;max-width:5em;font-size:11px;overflow-wrap:anywhere}.heart-emotion{display:block;width:100%;height:100%;object-fit:contain}.reply-checks{margin:12px 0;min-width:0}.reply-checks>.ledger-section>summary{font-size:14px;min-height:44px;padding:10px 8px}.reply-checks .audit-bead summary{white-space:normal!important}.reply-checks p{overflow-wrap:anywhere}
`;
