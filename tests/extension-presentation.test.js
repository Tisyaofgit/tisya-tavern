import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
import {renderPresentation,resolveRecordReference,presentationReferenceParameter,parsePresentationReference,projectPresentationMarks} from '../extension-presentation.mjs';
import {formatProse} from '../prose.js';
const ref={tableId:'T_DYN_TRANSFERS',recordId:'receipt-1',revision:7};
const projection=(kind,value,reference=ref)=>({reference,kind,value,contextKey:'chat-A/branch-1',allowed:true});
const opts=(kind,value,extra={})=>({projections:[projection(kind,value)],contextKey:'chat-A/branch-1',...extra});
const parse=(w,html)=>{const n=w.document.createElement('div');n.innerHTML=html;return n;};
test('transfer card preserves zero/unknown and performs no settlement or external call',()=>{
 const values={amount:0,currencyLabel:'银两',sender:'甲',recipient:'乙',status:'已记录',at:'景龙三年五月初二'},options=opts('transfer',values),before=structuredClone(options);
 const html=renderPresentation({kind:'transfer',reference:ref},options);assert.match(html,/>0 银两</);assert.match(html,/已记录/);assert.ok(!html.includes('button'));assert.deepEqual(options,before);
 const unknown=renderPresentation({kind:'transfer',reference:ref},opts('transfer',{amount:null}));assert.match(unknown,/金额未提供/);assert.ok(!unknown.includes('>0'));
});
test('historical references read the exact old revision despite a newer row',()=>{
 const options=opts('text',{text:'旧一刻'});options.projections.push(projection('text',{text:'后来改变'}, {...ref,revision:8}));const html=renderPresentation({kind:'text',reference:ref},options);assert.match(html,/旧一刻/);assert.ok(!html.includes('后来改变'));
 assert.throws(()=>renderPresentation({kind:'text',reference:{...ref,revision:6}},options),/不可读取/);
 assert.throws(()=>renderPresentation({kind:'text',reference:{tableId:ref.tableId,recordId:ref.recordId}},options),/历史呈现/);
});
test('snapshot identity and revision must both match when both are requested',()=>{
 const r={...ref,snapshotId:'source-1'};const options=opts('text',{text:'visible'},{projections:[projection('text',{text:'visible'},r)]});assert.match(renderPresentation({kind:'text',reference:r},options),/visible/);
 assert.throws(()=>renderPresentation({kind:'text',reference:{...r,snapshotId:'source-2'}},options),/不可读取/);
 assert.throws(()=>renderPresentation({kind:'text',reference:{...r,revision:8}},options),/不可读取/);
});
test('different branch, forbidden record and wrong subtype never expose content',()=>{
 const options=opts('text',{text:'PRIVATE_CANARY'});for(const patch of [{contextKey:'chat-B/branch-1'},{allowed:false}]){const o={...options,projections:[{...options.projections[0],...patch}]};assert.throws(()=>renderPresentation({kind:'text',reference:ref},o),e=>!e.message.includes('PRIVATE_CANARY')&&e.code==='TISYA_PRESENTATION_UNAVAILABLE');}
 assert.throws(()=>renderPresentation({kind:'news',reference:ref},options),/类型不一致/);
});
test('ambiguous duplicate projections fail rather than choose a latest row',()=>{
 const options=opts('text',{text:'one'});options.projections.push(projection('text',{text:'two'}));assert.throws(()=>resolveRecordReference(ref,options),/重复投影/);
});
test('voice transcript without audio is visibly a transcript, not fake playback',()=>{
 const html=renderPresentation({kind:'voice',reference:ref},opts('voice',{transcript:'晚点见。'}));assert.match(html,/语音文稿 · 未提供音源/);assert.match(html,/晚点见/);assert.ok(!html.includes('<audio'));assert.ok(!html.includes('progress'));
});
test('registered actual audio and image have native controls and escaped labels',async()=>{
 const w=new Window();try{const media=[{id:'voice-1',kind:'audio',url:'blob:https://local.test/actual-object',allowed:true,contextKey:'chat-A/branch-1'}];const root=parse(w,renderPresentation({kind:'voice',reference:ref},opts('voice',{resourceId:'voice-1',transcript:'<img src=x onerror=bad()>'},{media})));const audio=root.querySelector('audio');assert.ok(audio.hasAttribute('controls'));assert.equal(audio.preload,'none');assert.ok(!audio.autoplay);assert.equal(root.querySelectorAll('img').length,0);assert.match(root.textContent,/<img/);
 const images=[{id:'photo',kind:'image',url:'https://example.test/image.png',allowed:true,contextKey:'chat-A/branch-1'}],img=parse(w,renderPresentation({kind:'image',reference:ref},opts('image',{resourceId:'photo',alt:'<secret>'},{media:images}))).querySelector('img');assert.equal(img.alt,'<secret>');assert.equal(img.getAttribute('src'),'https://example.test/image.png');}finally{await w.happyDOM.abort();}
});
test('resource privacy and URL protocol checks do not fall back to unavailable URLs',()=>{
 const base={id:'audio',kind:'audio',url:'https://example.test/audio.mp3',allowed:true,contextKey:'chat-A/branch-1'};
 for(const patch of [{allowed:false},{contextKey:'other'},{kind:'image'},{url:'javascript:alert(1)'},{url:'data:text/html,<script>bad</script>'},{url:'https://user:pass@example.test/a'}])assert.throws(()=>renderPresentation({kind:'voice',reference:ref},opts('voice',{resourceId:'audio'},{media:[{...base,...patch}]})));
});
test('news includes source and stored corrections, never claims independent verification',async()=>{
 const w=new Window();try{const value={title:'海港开放',publisher:'海港公报',summary:'<script>bad()</script>',paragraphs:['第一段','第二段'],sourceLabel:'原公告',sourceUrl:'https://example.test/notice',corrections:[{at:'五月初三',text:'补正开放时段'}]};const root=parse(w,renderPresentation({kind:'news',reference:ref},opts('news',value)));assert.equal(root.querySelectorAll('script').length,0);assert.match(root.textContent,/<script>/);assert.equal(root.querySelector('a').rel,'noopener noreferrer');assert.match(root.querySelector('details').textContent,/补正开放时段/);assert.ok(!root.textContent.includes('已核实'));}finally{await w.happyDOM.abort();}
});
test('forum keeps stable floors, visible quote jumps, deleted history and display limit',async()=>{
 const w=new Window();try{const value={title:'潮声',items:[{id:'a',floor:1,author:'甲',text:'开帖'},{id:'b',floor:5,author:'乙',text:'回复',quote:{floor:1}},{id:'c',floor:7,deleted:true,text:'DELETED_CANARY'}]};const before=structuredClone(value),root=parse(w,renderPresentation({kind:'forum',reference:ref},opts('forum',value,{displayLimit:2})));assert.deepEqual([...root.querySelectorAll('li')].map(n=>n.dataset.floor),['1','5']);assert.ok(root.querySelector('a').hash.includes('-1'));assert.match(root.textContent,/2 \/ 3/);assert.deepEqual(value,before);const all=renderPresentation({kind:'forum',reference:ref},opts('forum',value));assert.match(all,/该层已删除/);assert.ok(!all.includes('DELETED_CANARY'));}finally{await w.happyDOM.abort();}
});
test('forum never rewrites duplicate floors and does not emit a broken quote control',()=>{
 assert.throws(()=>renderPresentation({kind:'forum',reference:ref},opts('forum',{items:[{id:'a',floor:1,text:'a'},{id:'b',floor:1,text:'b'}]})),/楼层/);
 const html=renderPresentation({kind:'forum',reference:ref},opts('forum',{items:[{id:'a',floor:2,text:'a',quote:{floor:9}}]}));assert.ok(!html.includes('<a '));assert.match(html,/当前未展示/);
});
test('danmaku respects real player cursor and explicit zero time window',()=>{
 const v={items:[{id:'a',author:'甲',text:'早',atSeconds:5},{id:'b',author:'乙',text:'现在',atSeconds:10},{id:'c',author:'丙',text:'未来',atSeconds:11}]};const html=renderPresentation({kind:'danmaku',reference:ref},opts('danmaku',v,{playbackSeconds:10,windowSeconds:0}));assert.match(html,/现在/);assert.ok(!html.includes('未来'));assert.ok(!html.includes('>早<'));assert.ok(!html.includes('animation'));
});
test('display zero and disabled configuration do not read records or remove history',()=>{
 const req={kind:'forum',reference:ref};assert.equal(renderPresentation(req,{config:{display:{enabled:false}}}),'');assert.equal(renderPresentation(req,{config:{display:{limit:0}}}),'');
 const p=opts('theater',{items:[{id:'a',speaker:'甲',text:'hi'}]});assert.match(renderPresentation({kind:'theater',reference:ref},p),/hi/);
});
test('new record parameter grammar roundtrips exact identities and rejects execution fields',()=>{
 const request={kind:'voice',reference:ref},parameter=presentationReferenceParameter(request);assert.deepEqual(parsePresentationReference(parameter),request);assert.equal(parsePresentationReference('普通标题'),null);assert.throws(()=>parsePresentationReference('@record{"kind":"voice","tableId":"T","recordId":"r","revision":7,"action":"pay"}'),/未登记/);assert.throws(()=>parsePresentationReference('@record bad'),/须为/);
});
test('prose opts in to records without changing unregistered reference labels',async()=>{
 const w=new Window();try{const d=w.document,p=presentationReferenceParameter({kind:'transfer',reference:ref}),source='〔消息:'+p+'〕转账〔/消息〕';const root=parse(w,formatProse(d,source,x=>x,{presentation:opts('transfer',{amount:12,currencyLabel:'银两'})}));assert.ok(root.querySelector('[data-tisya-presentation=transfer]'));assert.match(root.textContent,/12 银两/);
 const legacy=parse(w,formatProse(d,'〔引用:unregistered〕普通标签〔/引用〕',x=>x,{presentation:opts('transfer',{amount:12})}));assert.equal(legacy.textContent,'普通标签');assert.equal(legacy.querySelector('button'),null);}finally{await w.happyDOM.abort();}
});
test('authored cards and code do not gain record access during prose formatting',async()=>{
 const w=new Window();try{const p=presentationReferenceParameter({kind:'transfer',reference:ref}),mark='〔消息:'+p+'〕标签〔/消息〕',source='<section class="authored">'+mark+'</section><pre><code>'+mark+'</code></pre>',root=parse(w,formatProse(w.document,source,x=>x,{presentation:opts('transfer',{amount:123,currencyLabel:'PRIVATE_CANARY'})}));assert.equal(root.querySelectorAll('[data-tisya-presentation]').length,0);assert.ok(!root.textContent.includes('PRIVATE_CANARY'));assert.match(root.querySelector('code').textContent,/@record/);}finally{await w.happyDOM.abort();}
});
test('media records keep the real audio path through the host sanitizer entry',async()=>{
 const w=new Window();try{const p=presentationReferenceParameter({kind:'voice',reference:ref}),media=[{id:'a',kind:'audio',url:'https://example.test/a.mp3',allowed:true,contextKey:'chat-A/branch-1'}];let seen='';const root=parse(w,formatProse(w.document,'〔媒体:'+p+'〕语音〔/媒体〕',x=>(seen=x,x),{presentation:opts('voice',{resourceId:'a'},{media})}));assert.ok(seen.includes('<audio'));assert.ok(root.querySelector('audio'));assert.equal(root.querySelector('button'),null);}finally{await w.happyDOM.abort();}
});
