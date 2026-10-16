import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountHomeArt} from '../home-art.js';

function fixture(){const w=new Window(),images=[],errors=[];w.document.body.innerHTML='<div></div>';w.Image=class{constructor(){images.push(this);this.naturalWidth=853;this.naturalHeight=1844;}set src(value){this.url=value;}};const view=mountHomeArt(w.document,w.document.querySelector('div'),{gender:'male',playing:false,onError:e=>errors.push(e)});return {w,view,images,errors};}
test('only chosen form loads and incorrect decoded dimensions are explicit',async()=>{
 const f=fixture();assert.equal(f.images.length,3);assert(f.images.every(i=>!i.url.includes('female')));f.images[0].naturalHeight=1800;for(const i of f.images)i.onload();await f.view.ready;assert.match(f.errors[0].message,/尺寸不匹配/);f.view.dispose();assert.equal(f.w.document.querySelector('canvas'),null);await f.w.happyDOM.abort();
});
test('missing art reports failure; disposal clears pending image work and late callbacks',async()=>{
 const f=fixture();f.images[0].onerror();for(const i of f.images.slice(1))i.onload();await f.view.ready;assert.match(f.errors[0].message,/素材缺失/);f.view.dispose();await f.w.happyDOM.abort();
 const g=fixture();g.view.dispose();await g.view.ready;assert.deepEqual(g.errors,[]);assert(g.images.every(i=>i.onload===null&&i.onerror===null&&i.url===''));assert.equal(g.w.document.querySelector('canvas'),null);await g.w.happyDOM.abort();
});
