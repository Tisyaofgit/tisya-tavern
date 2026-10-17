// Shared approved water / old-gold treatment for settings and task surfaces.
export const UTILITY_STYLE=`
:host{display:block;font:15px/1.75 TisyaReading,serif;color:#e2ddc8;min-width:0}
*{box-sizing:border-box}[hidden]{display:none!important}
button,input,select,textarea{font:inherit;color:inherit;max-width:100%;min-width:0}
button{min-height:44px;padding:10px 16px;background:#102d24;border:1px solid #b7a46f55;border-radius:8px;cursor:pointer}
button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:1px solid #d3c28c;outline-offset:3px}
button:active{background:#28503b}button,input,select,textarea{-webkit-tap-highlight-color:transparent}
input:not([type=checkbox]),select,textarea{width:100%;padding:12px;border:1px solid #bac29740;border-radius:7px;background:#041913;min-height:46px}
textarea{min-height:140px;line-height:1.8;resize:vertical}input[type=checkbox]{accent-color:#bea96f}
h1,h2,h3{font-weight:400;color:#d3c28c;letter-spacing:.08em}h1{font-size:30px}h2{font-size:24px}h3{font-size:20px}
small,.note{color:#9fb3a2}p{overflow-wrap:anywhere}label{display:block;margin:16px 0}
fieldset{min-width:0;padding:22px;margin:18px 0;border:1px solid #b7a46f44;border-radius:3px 20px 3px 20px;background:linear-gradient(130deg,#15372b99,#041410c9)}
legend{color:#d3c28c;padding:0 8px}details{margin:15px 0}summary{cursor:pointer;color:#d3c28c;min-height:44px;padding:9px 0}
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:42vh;overflow:auto;font:12px/1.7 monospace;background:#031611;padding:14px;border-radius:8px}
header,nav,footer{display:flex;gap:10px;flex-wrap:wrap;align-items:center}footer{position:sticky;bottom:0;padding:14px 0 max(14px,env(safe-area-inset-bottom));background:#071c17f5;z-index:3}
.tisya-run-view{padding:16px;border:1px solid #b7a46f55;border-radius:12px;background:#08251d}.tisya-run-actions{display:flex;gap:10px;flex-wrap:wrap}
.tisya-stage-track{display:flex;gap:6px;margin:16px 0 10px}.tisya-stage-track span{flex:1;height:4px;background:#b7a46f25}.tisya-stage-track .done{background:#c7b47d}.tisya-stage-track .current{background:linear-gradient(90deg,#c7b47d,#46604a)}
.tisya-stage-labels{display:flex;gap:6px;color:#9fb3a2;font-size:11px}.tisya-stage-labels span{flex:1;text-align:center}
.tisya-assistant-launch{width:100%;padding:24px;text-align:left;background:linear-gradient(130deg,#244734b0,#071c17);border:1px solid #b7a46f77;border-radius:3px 22px 3px 22px;margin:20px 0}.tisya-assistant-launch strong{display:block;font-size:25px;font-weight:400;color:#d3c28c}.tisya-assistant-launch small{display:block;margin-top:8px}
@media(max-width:430px){fieldset{padding:15px}h1{font-size:27px}header{gap:7px}button{padding:9px 12px}.tisya-stage-labels{font-size:10px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
export function scopedUtilityStyle(scope){return UTILITY_STYLE.replace(/([^{}]+)\{/g,(all,selectors)=>selectors.trim().startsWith('@')?all:selectors.split(',').map(s=>s.includes(':host')?s.replace(':host',scope):scope+' '+s.trim()).join(',')+'{');}
