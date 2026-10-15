// Public Android bridge used by TauriTavern's mobile-system-ui.js.
// Native bridge ownership stays with the host; no CSS pretends to hide OS bars.
export function immersiveState(window){
 const bridge=window.TauriTavernAndroidSystemUiBridge;
 if(typeof bridge?.setImmersiveFullscreenEnabled!=='function')return null;
 return typeof bridge.isImmersiveFullscreenEnabled==='function'?Boolean(bridge.isImmersiveFullscreenEnabled()):null;
}
export function immersiveSupported(window){return typeof window.TauriTavernAndroidSystemUiBridge?.setImmersiveFullscreenEnabled==='function';}
