// Personal list labels and pins. Native character identity and chat contents stay canonical.
export const directoryToken=(card,chat)=>JSON.stringify({avatar:card.avatar,...(chat?{file:chat.file_name.replace(/\.jsonl$/i,'')}:{})});
export function directoryState(settings={}){
 const value=settings.会话目录??{};
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('会话目录配置损坏');
 for(const [key,row] of Object.entries(value)){
  let token;try{token=JSON.parse(key);}catch{throw Error('会话目录标识损坏');}
  if(!token||typeof token.avatar!=='string'||(token.file!==undefined&&typeof token.file!=='string')||!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!['名称','置顶'].includes(k))||(row.名称!==undefined&&(typeof row.名称!=='string'||row.名称.length>120))||(row.置顶!==undefined&&(!Number.isFinite(row.置顶)||row.置顶<0)))throw Error('会话目录条目损坏');
 }
 return value;
}
export function directoryEntry(settings,card,chat){return settings.会话目录?.[directoryToken(card,chat)]??{};}
export function changeDirectory(settings,token,patch){
 const rows=directoryState(settings),next={...rows};
 const row={...(rows[token]??{}),...patch};
 for(const key of Object.keys(row))if(row[key]===null)delete row[key];
 if(Object.keys(row).length)next[token]=row;else delete next[token];
 const result={...settings,会话目录:next};directoryState(result);return result;
}
// Long press cancels on scrolling, multi-touch, pointer loss, and page disposal.
export function mountDirectoryHold(root,{onMenu,onError=()=>{},delay=520}={}){
 const window=root.ownerDocument.defaultView;let held=null,timer=0,suppressed=null;
 const clear=()=>{window.clearTimeout(timer);timer=0;held=null;};
 const down=e=>{if(held){clear();return;}if(e.isPrimary===false||e.button>0)return;const row=e.target.closest('[data-directory]');if(!row||!root.contains(row))return;held={row,id:e.pointerId,x:e.clientX,y:e.clientY};timer=window.setTimeout(()=>{const h=held;clear();if(!h?.row.isConnected)return;suppressed={row:h.row,until:Date.now()+900};try{onMenu(h.row.dataset.directory);}catch(error){onError(error);}},delay);};
 const move=e=>{if(held&&(e.pointerId!==held.id||Math.hypot(e.clientX-held.x,e.clientY-held.y)>9))clear();};
 const click=e=>{if(suppressed&&Date.now()<suppressed.until&&suppressed.row.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();suppressed=null;}};
 const menu=e=>{const row=e.target.closest('[data-directory]');if(!row||!root.contains(row))return;e.preventDefault();clear();if(suppressed?.row===row&&Date.now()<suppressed.until)return;try{onMenu(row.dataset.directory);}catch(error){onError(error);}};
 root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move);root.addEventListener('pointerup',clear);root.addEventListener('pointerleave',clear);root.addEventListener('pointercancel',clear);root.addEventListener('lostpointercapture',clear);root.addEventListener('scroll',clear,true);root.addEventListener('click',click,true);root.addEventListener('contextmenu',menu);
 return ()=>{clear();suppressed=null;root.removeEventListener('pointerdown',down);root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',clear);root.removeEventListener('pointerleave',clear);root.removeEventListener('pointercancel',clear);root.removeEventListener('lostpointercapture',clear);root.removeEventListener('scroll',clear,true);root.removeEventListener('click',click,true);root.removeEventListener('contextmenu',menu);};
}
