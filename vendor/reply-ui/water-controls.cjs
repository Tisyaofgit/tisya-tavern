'use strict';
// One material vocabulary, shared by message controls and the chat navigator.
// SVG artwork lives in the resource pack; this module only arranges controls.
const WATER_CONTROL_CSS=`
:is(.page-tools,.fold-head,.next-heading,.mode-control,#mode-menu) button.tisya-material-button{
 position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;
 box-sizing:border-box;min-height:40px;padding:4px 12px 4px 5px;border:1px solid #bca573a6;border-radius:10px 17px 10px 17px;
 color:#e8d6a5;background:radial-gradient(ellipse at 15% 0,#bdd5b826,transparent 65%),linear-gradient(155deg,#24473fee,#092c2bee 62%,#38564aee);
 box-shadow:inset 0 1px 1px #f1eac158,inset 0 -2px 3px #001b21c9,0 2px 4px #00141685;
 font:12px/1.4 "LXGW WenKai";letter-spacing:.03em;text-shadow:0 1px 2px #001718;cursor:pointer;
 -webkit-tap-highlight-color:transparent;touch-action:manipulation}
button.tisya-material-button::after{content:"";position:absolute;inset:3px;border:1px solid #d7cba326;border-radius:7px 14px 7px 14px;pointer-events:none}
button.tisya-material-button .tisya-material-icon{display:block;flex:0 0 auto;width:28px;height:28px;object-fit:contain;pointer-events:none;filter:drop-shadow(0 2px 2px #00171980)}
button.tisya-material-button:hover{filter:brightness(1.1)}button.tisya-material-button:active,button.tisya-material-button[data-tui-press]{box-shadow:inset 0 2px 5px #001a22cc;filter:brightness(1.18)}
button.tisya-material-button:disabled{opacity:.48;cursor:default;filter:saturate(.5)}
button.tisya-material-button:focus-visible{outline:2px solid #efdb9b;outline-offset:3px}
.task-masthead .page-tools{gap:7px;margin-top:12px;flex-wrap:wrap;margin-right:-45px}
.fold-head #task-toggle.tisya-material-button{font-size:15px;min-height:44px;padding-right:14px}
.next-heading #next-toggle.tisya-material-button{min-height:42px;font-size:14px;border-radius:18px 8px 18px 8px;letter-spacing:.04em}
.mode-control #mode-toggle.tisya-material-button{padding:2px;width:44px;height:46px;min-height:44px;border-radius:22px}
#mode-toggle.tisya-material-button .tisya-material-icon{width:38px;height:38px}#mode-toggle.tisya-material-button::after{border-radius:19px}
#mode-menu .tisya-material-button{width:100%;margin:3px 0;justify-content:flex-start}
@media(max-width:350px){.page-tools button.tisya-material-button{padding-right:8px;gap:3px;font-size:11px}.page-tools .tisya-material-button .tisya-material-icon{width:25px;height:25px}}
@media(prefers-reduced-motion:reduce){button.tisya-material-button{transition:none}}
`;
function decorateWaterControl(button,url){
 if(!url)throw Error('TISYA_CONTROL_ASSET_REQUIRED');
 button.classList.add('tisya-material-button');const icon=button.ownerDocument.createElement('img');icon.className='tisya-material-icon';icon.src=url;icon.alt='';icon.setAttribute('aria-hidden','true');button.prepend(icon);return icon;
}
module.exports={WATER_CONTROL_CSS,decorateWaterControl};
