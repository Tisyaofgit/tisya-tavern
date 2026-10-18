// Shared reading surface for assistant prose and user messages. No message rewriting.
const rules=[
  [
    "",
    "box-sizing:border-box;min-width:0;padding:16px clamp(12px,3vw,22px);border:1px solid #c5c7a4a1;border-radius:18px 22px 20px 24px / 28px 34px 30px 36px;background-color:var(--tisya-reading-fill,rgba(7,29,31,.75));background-image:var(--tisya-bubble-glaze);box-shadow:inset 0 1px 2px #e0e9cd42,inset 0 -1px 2px #001b1df0,0 3px 5px #001d1633"
  ],
  [
    ">:last-child",
    "margin-bottom:0"
  ],
  [
    "",
    "position:relative;isolation:isolate;border:1px solid #d5c397bd;background-color:var(--tisya-reading-fill,rgba(7,29,31,.75));background-image:linear-gradient(140deg,#acc4a61a,transparent 28%,#020f1317 72%,#bac7a60b);box-shadow:inset 0 1px 1px #fff0c88c,inset 1px 0 1px #dbe2bb38,inset 0 -3px 5px #000e16a8,0 1px 0 #e2c88b45,0 4px 0 -1px #102d2d,0 5px 0 -1px #a894645c,0 9px 16px -8px #000e18c7"
  ],
  [
    "::before",
    "content:\"\";position:absolute;inset:5px;border:1px solid #c0b78b4f;border-top-color:#dfd3a66e;border-bottom-color:#7d987c70;border-radius:inherit;box-shadow:0 1px 0 #031b216b,inset 0 1px 0 #f4e5b90f;pointer-events:none;z-index:-1"
  ],
  [
    "::after",
    "content:\"\";position:absolute;inset:1px;border-radius:inherit;pointer-events:none;z-index:-1;background-image:url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22180%22%20height%3D%22180%22%20viewBox%3D%220%200%20180%20180%22%3E%3Cfilter%20id%3D%22p%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%22.72%20.46%22%20numOctaves%3D%223%22%20stitchTiles%3D%22stitch%22%2F%3E%3CfeColorMatrix%20type%3D%22saturate%22%20values%3D%220%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url%28%23p%29%22%20opacity%3D%22.18%22%2F%3E%3C%2Fsvg%3E\");background-size:180px 180px;opacity:.18;mix-blend-mode:soft-light"
  ],
  [
    "",
    "padding:20px clamp(15px,3.5vw,25px) 23px;border-radius:21px 23px 14px 14px"
  ]
];
export function readingFrameStyle(selector,{important=false}={}){return rules.map(([suffix,body])=>`${selector}${suffix}{${important?body.split(";").filter(Boolean).map(declaration=>declaration+"!important").join(";"):body}}`).join("\n");}
