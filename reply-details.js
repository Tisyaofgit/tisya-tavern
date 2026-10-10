import {parseDisplayEnvelope,strictJSON} from './reader-core.js';

const fail=()=>{throw Object.assign(Error('TISYA_READER_DETAILS_INVALID'),{code:'TISYA_READER_DETAILS_INVALID'});};
function heart(value){
 if(!value||!['有内容','沉默','关闭'].includes(value.status)||!Array.isArray(value.items)||value.items.length>3||(value.status==='有内容')!==(value.items.length>0))fail();
 const items=value.items.map(row=>{if(!row||typeof row.type!=='string'||!row.type.trim()||typeof row.text!=='string'||row.text.length>1000||!(row.mood===null||typeof row.mood==='string'))fail();return {type:row.type,text:row.text,mood:row.mood};});
 return {status:value.status,items};
}
// Task organization, machine memory and reasoning remain outside this public
// projection. These are the explicit user-facing comments and short checks.
export function readReplyDetails(source){
 const envelope=parseDisplayEnvelope(source),task=strictJSON(envelope.blocks.task),next=strictJSON(envelope.blocks.next);
 if(!Array.isArray(task.audit))fail();
 const audit=task.audit.map(row=>{if(!row||['kind','status','evidence'].some(k=>typeof row[k]!=='string'||!row[k].trim()))fail();return {kind:row.kind,status:row.status,evidence:row.evidence};});
 return {taskHeart:heart(task.heart),nextHeart:heart(next.heart),audit};
}
export function mountHeartBlock(document,container,value,{label}={}){
 const host=document.createElement('section');host.className='heart-host';host.setAttribute('aria-label',label??'缇斯亚心声');host.dataset.status=value.status;
 if(!value.items.length)return null;
 const line=document.createElement('div'),bubble=document.createElement('button'),text=document.createElement('span'),dots=document.createElement('span'),mood=document.createElement('span');
 line.className='heart-line';bubble.className='heart-bubble';bubble.type='button';dots.className='heart-dots';mood.className='heart-mood';let index=0;
 function render(){const item=value.items[index];text.textContent=item.text;host.dataset.direction=item.type;host.dataset.mood=item.mood??'';mood.textContent=item.mood&&item.mood!=='无'?item.mood:'';mood.hidden=!mood.textContent;bubble.setAttribute('aria-label',item.text+(value.items.length>1?'；第'+(index+1)+'条，共'+value.items.length+'条，点击下一条':''));bubble.dataset.index=String(index);dots.replaceChildren();dots.hidden=value.items.length<2;for(let i=0;i<value.items.length;i++){const dot=document.createElement('i');if(i===index)dot.className='active';dots.append(dot);}}
 bubble.onclick=()=>{index=(index+1)%value.items.length;render();};bubble.append(text,dots);line.append(bubble,mood);host.append(line);container.append(host);render();return host;
}
export function mountAuditBlock(document,container,rows){
 if(!rows.length)return null;const wrapper=document.createElement('div');wrapper.className='fold-content reply-checks';const fold=document.createElement('details'),title=document.createElement('summary'),body=document.createElement('div');fold.className='ledger-section audit-ledger';title.textContent='核验 · '+rows.length;body.className='ledger-body';
 for(const row of rows){const item=document.createElement('details'),head=document.createElement('summary'),orb=document.createElement('span'),label=document.createElement('span'),text=document.createElement('p');item.className='audit-bead';orb.className='status-orb';orb.textContent=row.status==='符合'?'✓':'·';orb.setAttribute('aria-hidden','true');label.textContent=row.kind;head.append(orb,label);head.setAttribute('aria-label',row.kind+'：'+row.status);text.textContent=row.status+' · '+row.evidence;item.append(head,text);body.append(item);}
 fold.append(title,body);wrapper.append(fold);container.append(wrapper);return wrapper;
}
export const replyControlsCSS=`
.action-mode-control{position:relative;display:flex;justify-content:flex-end;margin:-44px 0 12px;min-height:44px}
.action-mode-toggle{display:flex;align-items:center;gap:5px;border:0;background:transparent;color:#dfc88d;font:13px/1.6 TisyaReading,serif;padding:3px 6px;min-height:44px}
.action-mode-toggle img{width:27px;height:35px;object-fit:contain}
.action-mode-menu{position:absolute;right:0;top:100%;z-index:10;width:175px;padding:7px;background:#092b26;border:1px solid #c9bb87;border-radius:12px;box-shadow:0 12px 28px #001818b0}
.action-mode-menu[hidden]{display:none!important}.action-mode-menu button{display:block;width:100%;text-align:left;border:0;background:none;color:inherit;font:15px/1.6 TisyaReading,serif;min-height:46px;padding:8px}
.action-mode-menu [aria-checked=true]{color:#f5dca0;background:#a5b18822;border-radius:8px}
.action-feedback{margin:8px 2px 0;font:12px/1.65 TisyaReading,serif;min-height:18px;color:#a8baa0}
.action-heading{padding-right:80px}.action.selected{outline:1px solid #dfc88d}
.heart-host{position:relative;margin:16px 0 20px;padding-top:8px;min-width:0}.heart-host>.visual-creature{position:absolute!important;top:-26px!important;right:-3px!important;left:auto!important;width:42px!important;height:42px!important;z-index:1}
.heart-host .heart-bubble{text-align:left;font-size:14px;padding:12px 30px 10px 15px;white-space:normal;overflow-wrap:anywhere;max-width:100%}.heart-mood{font-size:12px;color:#dfc88d;flex:0 0 auto;max-width:4em;overflow-wrap:anywhere}
.reply-checks{margin:12px 0;min-width:0}.reply-checks>.ledger-section>summary{font-size:14px;min-height:44px;padding:10px 8px}.reply-checks .audit-bead summary{white-space:normal!important}.reply-checks p{overflow-wrap:anywhere}
`;
