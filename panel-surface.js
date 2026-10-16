// One viewport owner for the two persistent management documents. Keep sizing
// in a stylesheet as well as HTML dimensions: host iframe resets must not turn
// a console back into the browser's intrinsic 300 x 150 rectangle.
const owners=new WeakMap();
const STYLE=`
iframe[data-tisya-panel]{position:fixed!important;box-sizing:border-box!important;display:block!important;left:0!important;right:auto!important;top:auto!important;bottom:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;height:var(--tisya-panel-height,100vh)!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;margin:0!important;padding:max(var(--tt-inset-top,0px),env(safe-area-inset-top,0px)) 0 max(var(--tt-inset-bottom,0px),env(safe-area-inset-bottom,0px))!important;border:0!important;transform:none!important;opacity:1!important;visibility:visible!important;z-index:11000!important;background:#081713!important;color-scheme:dark;}
iframe[data-tisya-panel][data-mode="float"]{padding-top:0!important;height:52vh!important;height:52dvh!important;height:var(--tisya-panel-float,52vh)!important;border-radius:18px 18px 0 0!important;box-shadow:0 -8px 32px #0008!important;}
iframe[data-tisya-panel][data-mode="full"]{border-radius:0!important;}
iframe[data-tisya-panel][hidden]{display:none!important;pointer-events:none!important;}
`;
function registry(document){
 let state=owners.get(document);if(state)return state;
 const style=document.createElement('style');style.id='tisya-panel-surface-style';style.textContent=STYLE;document.head.append(style);
 state={panels:new Set(),style};owners.set(document,state);return state;
}
export function createPanelSurface(document,frame,{onMode=()=>{}}={}){
 const state=registry(document),win=document.defaultView;let mode='hidden',disposed=false;
 frame.addEventListener('load',()=>refreshPanelFonts(document));
 frame.dataset.tisyaPanel='';frame.dataset.ttMobileSurface='none';frame.hidden=true;frame.dataset.mode=mode;
 const resize=()=>{const width=Math.round(win.innerWidth||document.documentElement.clientWidth),height=Math.round(win.visualViewport?.height||win.innerHeight||document.documentElement.clientHeight);frame.width=String(width);frame.height=String(mode==='float'?Math.round(height*.52):height);frame.style.setProperty('--tisya-panel-height',height+'px');frame.style.setProperty('--tisya-panel-float',Math.round(height*.52)+'px');};
 const surface={frame,getMode:()=>mode,show(next){if(disposed)return;if(!['full','float','hidden'].includes(next))throw Error('面板状态无效');if(next!=='hidden')for(const other of state.panels)if(other!==surface)other.show('hidden');mode=next;frame.dataset.mode=next;frame.hidden=next==='hidden';resize();onMode(next);},dispose(){if(disposed)return;disposed=true;state.panels.delete(surface);win.removeEventListener('resize',resize);win.visualViewport?.removeEventListener('resize',resize);if(!state.panels.size){state.style.remove();owners.delete(document);}}};
 state.panels.add(surface);win.addEventListener('resize',resize);win.visualViewport?.addEventListener('resize',resize);resize();return surface;
}
// Half-screen workspaces intentionally coexist with ordinary host pages.
export function hideFullPanels(document){for(const panel of owners.get(document)?.panels??[])if(panel.getMode()==='full')panel.show('hidden');}
export function hideAllPanels(document){for(const panel of owners.get(document)?.panels??[])panel.show('hidden');}

export function refreshPanelFonts(document){for(const {frame} of owners.get(document)?.panels??[])for(const face of document.fonts??[])if(face.family==='TisyaReading'&&face.status==='loaded')frame.contentDocument?.fonts?.add(face);}
