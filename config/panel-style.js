// Shared, dependency-free settings and table application primitives.
export const PANEL_CSS = `
:host{display:block;min-width:0;max-width:100%;color:#e7e9df;font:15px/1.65 sans-serif;color-scheme:dark}
*,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
header,nav,footer{display:flex;gap:8px;flex-wrap:wrap;padding:12px;background:#15332e}
header{align-items:center;border-bottom:1px solid #47675e}
header h1{flex:1 1 160px;margin:0;font-size:20px;line-height:1.4}
header>select{flex:1 1 100%;width:100%}
header>button{flex:1 1 120px}
nav{padding-top:8px;padding-bottom:8px;border-bottom:1px solid #47675e}
nav>label{width:100%;margin:0}
nav select{border-color:#bbaa79}
footer{position:sticky;bottom:0;z-index:2;border-top:1px solid #47675e;padding-bottom:max(12px,env(safe-area-inset-bottom));box-shadow:0 -6px 16px #0002}
footer>button{flex:1 1 120px}
footer p{flex-basis:100%;margin:0}
main,.tisya-tables{min-width:0;max-width:100%}
main{padding:12px}
h2{font-size:22px;line-height:1.4;margin:10px 0 16px}
p,legend,summary,strong,small,span{overflow-wrap:anywhere}
fieldset{min-width:0;max-width:100%;margin:12px 0;border:1px solid #526f65;border-radius:10px;padding:12px;background:#10292333}
legend{max-width:100%;padding:0 6px;color:#e6d6a8;font-weight:600}
label{display:flex;flex-direction:column;gap:6px;margin:12px 0;min-width:0}
label:has(>input[type=checkbox]){display:grid;grid-template-columns:minmax(0,1fr) 28px;align-items:center;min-height:44px;padding:8px 0;border-bottom:1px solid #52716544}
strong{font-weight:500}
button,input,select,textarea{max-width:100%;min-width:0;min-height:44px;background:#132d28;color:inherit;border:1px solid #738d82;border-radius:7px;padding:9px 10px;font:inherit;line-height:1.5}
input,select,textarea{width:100%}
input[type=checkbox]{width:24px;height:24px;min-height:24px;margin:0;accent-color:#bfd29b}
input[type=number]{font-variant-numeric:tabular-nums}
textarea{min-height:116px;resize:vertical;overflow-wrap:anywhere}
button{cursor:pointer;white-space:normal;overflow-wrap:anywhere;margin:4px 4px 4px 0;touch-action:manipulation}
button:hover{background:#25483c}
button:active:not(:disabled){background:#365844}
button:focus:not(:focus-visible){outline:none}
:focus-visible{outline:2px solid #d9c786;outline-offset:3px}
button:disabled,input:disabled,select:disabled{opacity:.55;cursor:default}
details{margin:10px 0;padding:10px;border:1px solid #45655a;border-radius:8px;min-width:0;max-width:100%}
summary{cursor:pointer;min-height:36px;line-height:1.6;color:#d7e4d0}
details[open]>summary{margin-bottom:10px;color:#efe0b8}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}
th,td{border:1px solid #45655a;padding:8px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}
th{text-align:left;color:#e5d5aa;background:#173930}
.tisya-value{border-color:#47675e;padding:8px;background:transparent}
.tisya-value>legend{font-size:13px}
.tisya-inline{display:flex;gap:6px;align-items:end;min-width:0}
.tisya-inline label{flex:1;min-width:0}
.tisya-inline button{flex:0 1 110px}
.tisya-tables nav{position:static;padding:10px 0;margin-bottom:12px;background:transparent}
.tisya-tables nav label{margin:0;width:100%}
.tisya-draft-note{padding:9px 12px;border-left:3px solid #c5b583;background:#a99b6920;color:#ead8a6}
.tisya-table-wrap{width:100%;min-width:0;max-width:100%;overflow-x:auto;overscroll-behavior-x:contain}
.tisya-card-meta{color:#becfc4;font-size:13px;margin:4px 0 10px}
.tisya-run-view{margin:10px 12px;background:#102923}
.tisya-run-view pre{max-height:18rem;overflow:auto;overscroll-behavior:contain}
.tisya-run-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.tisya-run-actions button{flex:1 1 160px}
[role=status],[role=alert]{overflow-wrap:anywhere}
[role=alert]{padding:10px;border-left:3px solid #e28e80;background:#913d2d22;color:#ffd5cd}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 monospace;max-width:100%}
small,.note{font-size:13px;color:#bbcbc2}
.note{margin:8px 12px}
[hidden]{display:none!important}
@media(max-width:420px){main{padding:8px}header,nav,footer{padding-left:8px;padding-right:8px}fieldset{padding:9px}fieldset fieldset{padding:6px}details{padding:8px}button{max-width:100%}table.tisya-wide-table,table.tisya-wide-table tbody,table.tisya-wide-table tr,table.tisya-wide-table td{display:block;width:100%}table.tisya-wide-table thead{display:none}table.tisya-wide-table tr{margin:8px 0;border:1px solid #45655a;border-radius:6px;overflow:hidden}table.tisya-wide-table td{border:0;border-bottom:1px solid #45655a66}table.tisya-wide-table td:last-child{border-bottom:0}table.tisya-wide-table td::before{content:attr(data-label);display:block;font-size:12px;color:#cfbe8f}.tisya-inline{flex-wrap:wrap}.tisya-inline label{flex-basis:100%;margin-bottom:0}.tisya-inline button{flex:1 1 auto}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;
