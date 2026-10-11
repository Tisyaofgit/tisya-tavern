'use strict';

/** Presentation only. No click synthesis, pointer capture, storage or routing.
 * Mount once per UI owner; nested owners handle their own controls. Drag owners
 * call press()/clear() after accepting a gesture through their existing guard. */
function mountInteractionFeedback(root) {
  if (!root?.ownerDocument || root.hasAttribute('data-tui-feedback')) throw new Error('TUI_FEEDBACK_OWNER_INVALID');
  const doc=root.ownerDocument, win=doc.defaultView, cleanup=[];
  let active=null, pointer=null, origin=null, alive=true;
  root.setAttribute('data-tui-feedback','');
  root.setAttribute('data-tui-input','pointer');
  on(doc,'pointerdown',()=>root.setAttribute('data-tui-input','pointer'));
  on(doc,'keydown',e=>{if(['Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))root.setAttribute('data-tui-input','keyboard');});
  function on(target,type,fn) { target.addEventListener(type,fn,true); cleanup.push(()=>target.removeEventListener(type,fn,true)); }
  function clear() {
    if(active)active.removeAttribute('data-tui-press');
    root.removeAttribute('data-tui-action');active=null;pointer=null;origin=null;
  }
  function enabled(n) { return alive && n && root.contains(n) && !n.disabled && !n.closest('[hidden],[aria-disabled="true"]'); }
  function press(n) {
    clear();if(!enabled(n))return false;
    active=n;n.setAttribute('data-tui-press','true');
    root.setAttribute('data-tui-action',n.getAttribute('data-action')||'control');return true;
  }
  function control(e) {
    const n=e.target?.closest?.('button,a[href],[role="button"]');
    return enabled(n) && n.closest('[data-tui-feedback]')===root ? n : null;
  }
  on(root,'pointerdown',e=>{
    const n=control(e);
    if(!n||n.hasAttribute('data-drag')||!e.isPrimary||e.button!==0)return;
    if(press(n)){pointer=e.pointerId;origin={x:e.clientX,y:e.clientY};}
  });
  on(doc,'pointermove',e=>{
    // Ordinary controls yield their feedback when a gesture becomes scrolling.
    if(pointer===e.pointerId && origin && Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>10)clear();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(doc,type,e=>{if(pointer===e.pointerId)clear();});
  on(root,'keydown',e=>{if(!e.repeat && ['Enter',' '].includes(e.key)){const n=control(e);if(n)press(n);}});
  on(doc,'keyup',e=>{if(['Enter',' '].includes(e.key))clear();});
  on(root,'focusout',clear);on(win,'blur',clear);
  const observer=new win.MutationObserver(()=>{if(active&&!enabled(active))clear();});
  observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','aria-disabled','hidden']});
  cleanup.push(()=>observer.disconnect());
  return Object.freeze({press,clear,dispose(){if(!alive)return;clear();alive=false;while(cleanup.length)cleanup.pop()();root.removeAttribute('data-tui-feedback');root.removeAttribute('data-tui-input');}});
}
module.exports={mountInteractionFeedback};
