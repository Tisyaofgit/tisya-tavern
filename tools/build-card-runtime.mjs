import fs from 'node:fs';import {createHash} from 'node:crypto';
const file=new URL('../vendor/display/card-display.cjs',import.meta.url),source=fs.readFileSync(file,'utf8');
if(createHash('sha256').update(source).digest('hex')!=="b246cb4d39e5974e90506dee5acf9aa4175961a59f7f998ba97a0cfbfb08ee48")throw Error('Original card display source changed');
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const boot=section('function cardBootstrap(', '\nfunction cardDocumentSource(');
const mount=section('function mountIsolatedCard(', '\nfunction mountDisplayDocuments(');
// Display-only realm from r243. No profile, action, MVU, or host API bridge.
const doc=`function cardDocumentSource(html,token){
 const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https: data:; img-src https: data: blob:; font-src https: data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
 const head='<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>html{background:transparent;color-scheme:dark}body{display:flow-root;margin:0;overflow-wrap:anywhere;color:#dce5d4;font:16px/1.8 serif}img{max-width:100%}'+CARD_MOTION_CSS+'</style><script>('+cardBootstrap.toString()+')('+JSON.stringify(token)+','+observeDisplaySize.toString()+',null,null);<'+ '/script>';
 const h=/^\\s*(?:<!doctype[^>]*>\\s*)?<html\\b[^>]*>\\s*(?:<head\\b[^>]*>)?/i.exec(html);
 if(h)return html.slice(0,h[0].length)+(/<head\\b/i.test(h[0])?head:'<head>'+head+'</head>')+html.slice(h[0].length);
 return '<!doctype html><html><head>'+head+'</head><body>'+html+'</body></html>';
}`;
const output="// Generated from verified r243 card-display.cjs with a display-only document adapter.\nimport {observeDisplaySize,CARD_MOTION_CSS} from './visual-core.js';\nconst fault=(code,details)=>Object.assign(new Error(code),{code,details});\nconst validCardFolds=v=>Array.isArray(v)&&v.length<=2048&&v.every(x=>typeof x==='boolean');\n"+boot+'\n'+doc+'\n'+mount+"\nexport {mountIsolatedCard};\n";
const target=new URL('../card-runtime.js',import.meta.url);if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==output)throw Error('Card runtime is stale');}else fs.writeFileSync(target,output);
console.log('Display-only card runtime verified against original r243 source');
