import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountRunView,runDiagnostic} from '../tables/run-view.js';

test('failed run UI shows content beside error and export retains it across retries',async()=>{
 const window=new Window(),document=window.document;let state={busy:false,progress:{task:'ruleReview',stage:'error',text:'{"note":"partial","api_key":"credential-123"}',characters:49,startedAt:1,finishedAt:2,responseDiagnostic:{httpStatus:200,finishReason:'length'}},jobs:[{task:'ruleReview',status:'失败',detail:'达到长度限制',at:'first',response:{text:'old failed reply',accepted:false}}]};
 const view=mountRunView(document,document.body,{service:{state:()=>state}});
 assert(view.root.textContent.includes('partial'));assert(view.root.textContent.includes('达到长度限制'));assert(view.root.textContent.includes('诊断用，不代表已保存'));assert(!view.root.textContent.includes('credential-123'));assert(view.root.querySelectorAll('details')[0].open);
 const report=JSON.parse(view.text());assert(report.response.text.includes('partial'));assert(!view.text().includes('credential-123'));assert.equal(report.response.finishReason,'length');assert.equal(report.jobs[0].response.text,'old failed reply');assert.equal(report.response.accepted,false);
 state={...state,busy:true,progress:{stage:'preparing',text:'',characters:0,startedAt:1}};view.tick();assert(view.text().includes('old failed reply'));
 window.navigator.clipboard.writeText=async()=>{throw Error('permission denied')};const copy=[...view.root.querySelectorAll('button')].find(x=>x.textContent==='复制运行记录');await copy.onclick();assert(JSON.parse(view.root.querySelector('textarea').value).jobs[0].response.text==='old failed reply');assert(view.root.textContent.includes('导出脱敏诊断'));
 const original=URL.createObjectURL,oldClick=window.HTMLAnchorElement.prototype.click;let file,filename;try{URL.createObjectURL=blob=>{file=blob;return 'blob:test'};window.HTMLAnchorElement.prototype.click=function(){filename=this.download};[...view.root.querySelectorAll('button')].find(x=>x.textContent==='导出脱敏诊断').onclick();const exported=JSON.parse(await file.text());assert.equal(exported.jobs[0].response.text,'old failed reply');assert.equal(filename,'缇斯亚-运行诊断.json');}finally{URL.createObjectURL=original;window.HTMLAnchorElement.prototype.click=oldClick}
 window.happyDOM.abort();
});

test('empty response UI exposes finish and reasoning presence rather than inventing a reply',()=>{
 const window=new Window(),document=window.document;const state={busy:false,jobs:[{task:'ruleReview',status:'失败',detail:'没有文本',at:'x'}],progress:{stage:'error',text:'',characters:0,startedAt:1,finishedAt:2,responseDiagnostic:{httpStatus:200,contentType:'text/event-stream',done:true,reasoningDetected:true}}};
 const view=mountRunView(document,document.body,{service:{state:()=>state}});assert(view.root.textContent.includes('没有提取到可用正文'));assert(view.root.textContent.includes('reasoningDetected'));assert.equal(runDiagnostic(state).response.text,'');window.happyDOM.abort();
});
