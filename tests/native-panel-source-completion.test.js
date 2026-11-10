import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {prepareNativePanelSource,nativePanelContentProcessor} from '../native-panel-source.js';
import {createNativeDisplayPipeline} from '../native-display.js';
import {fixture} from './fixtures/journey-r4.cjs';

const documentFor=id=>'<!doctype html><html><body><button id="'+id+'">'+id+'</button><script>window.neutralInit=(window.neutralInit||0)+1;</script></body></html>';
const fence=id=>'```html\n'+documentFor(id)+'\n```';
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const code=id=>'<pre><code class="language-html">'+escape(documentFor(id))+'</code></pre>';
function pipeline(){return createNativeDisplayPipeline({enabled:()=>true,scripts:()=>['A','B','C'].map(id=>({scriptName:'neutral-'+id,findRegex:'CARD_'+id,replaceString:fence(id),placement:[2],markdownOnly:true})),regexProvider:{get:source=>new RegExp(source,'g')}});}
const sources=(d,html)=>{const root=d.createElement('div');root.innerHTML=html;return [...root.querySelectorAll('pre code')].map(node=>node.textContent.trim());};

test('one already parsed body runtime does not prevent recovery of a missing extra runtime',async()=>{
 const w=new Window(),d=w.document,p=pipeline(),source=fixture({body:'1\nCARD_A',extra:'CARD_B'}),message={mes:source},processor=nativePanelContentProcessor({document:d,project:s=>p.project(s)}),base='<p id="original">原生正文</p>'+code('A')+'<img src="/kept.png">';
 try{const output=await processor.prepare({message,mesid:0},async()=>base);assert.deepEqual(sources(d,output),[documentFor('A'),documentFor('B')]);assert.equal(message.mes,source);assert.match(output,/<p id="original">原生正文<\/p>/);assert.match(output,/<img src="\/kept.png">/);const rendered=d.createElement('div');rendered.innerHTML=output;assert.equal(rendered.querySelector('script,iframe'),null);assert.equal(w.neutralInit,undefined);assert.equal(prepareNativePanelSource(d,output,p.project(source)),output);}
 finally{await w.happyDOM.abort();}
});

test('missing runtime sources are inserted around known sources in original public order',async()=>{
 const w=new Window(),d=w.document,p=pipeline(),source=fixture({body:'1\nCARD_A\n\n2\nCARD_B',extra:'CARD_C'}),display=p.project(source);
 try{for(const base of [code('B'),code('C'),code('A')+code('C')]){const output=prepareNativePanelSource(d,base,display);assert.deepEqual(sources(d,output),['A','B','C'].map(documentFor));assert.equal(prepareNativePanelSource(d,output,display),output);}}
 finally{await w.happyDOM.abort();}
});

test('unidentified or already hosted runtimes cannot gain another source during completion',async()=>{
 const w=new Window(),d=w.document,display=pipeline().project(fixture({body:'1\nCARD_A',extra:'CARD_B'}));
 try{for(const base of [code('A')+code('unknown'),'<div class="TH-render">'+code('A')+'</div>','<iframe></iframe>'+code('A')])assert.equal(prepareNativePanelSource(d,base,display),base);}
 finally{await w.happyDOM.abort();}
});

test('ambiguous duplicate source identities and contradictory existing order remain unchanged',async()=>{
 const w=new Window(),d=w.document,p=pipeline(),display=p.project(fixture({body:'1\nCARD_A',extra:'CARD_B'}));
 try{for(const base of [code('A')+code('A'),code('B')+code('A')])assert.equal(prepareNativePanelSource(d,base,display),base);const duplicate=p.project(fixture({body:'1\nCARD_A',extra:'CARD_A'}));for(const base of ['<p>原生正文</p>',code('A')])assert.equal(prepareNativePanelSource(d,base,duplicate),base);}
 finally{await w.happyDOM.abort();}
});
