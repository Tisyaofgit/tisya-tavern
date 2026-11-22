import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {renderMediaAtlas} from '../media-atlas-ui.js';

function fixture(){
 const window=new Window({url:'https://tisya.test/'}),document=window.document;
 const el=(tag,text=null,className='')=>{const node=document.createElement(tag);if(text!==null)node.textContent=text;if(className)node.className=className;return node;};
 const field=(label,control)=>{const row=el('label');row.append(el('span',label),control);return row;};
 const input=(value,onchange)=>{const control=el('input');control.value=value;control.oninput=()=>onchange(control.value);return control;};
 const button=(label,run)=>{const control=el('button',label);control.run=run;return control;};
 const rows=[];let imported=null,requestCount=0;
 const atlas={view:()=>({targets:[{entity:'a',group:'人物',label:'守门人'},{entity:'lamp',group:'物品',label:'月灯'}],cards:[{id:'card-a',name:'原生角色卡'}],rows}),request:async()=>{requestCount++;},importImage:async value=>{imported=value;rows.push({id:'media-a',entity_ref:value.target.entity,purpose:'头像',url:'blob:preview',target:value.target});return 'media-a';},remove:async()=>{}};
 return {window,document,el,field,input,button,atlas,rows,getImported:()=>imported,getRequestCount:()=>requestCount};
}

test('atlas form waits for image decoding and binds exact target, use, mood and dimensions',async()=>{
 const env=fixture(),body=env.document.body;let decode;
 env.window.createImageBitmap=()=>new Promise(resolve=>{decode=resolve;});
 const view=renderMediaAtlas(env.document,body,{atlas:env.atlas,button:env.button,field:env.field,input:env.input,el:env.el});
 const fileControl=body.querySelector('input[type=file]'),target=body.querySelector('select[aria-label="绑定对象"]'),use=body.querySelector('select[aria-label="图片用途"]'),mood=body.querySelector('input[aria-label="情绪或媒体名称"]'),submit=[...body.querySelectorAll('button')].find(x=>x.textContent==='上传并绑定');
 assert.equal(body.querySelectorAll('optgroup').length,2);assert.equal(env.getRequestCount(),1);
 Object.defineProperty(fileControl,'files',{configurable:true,value:[new Blob(['image'],{type:'image/png'})]});fileControl.onchange();
 target.value='a';use.value='expression';use.onchange();mood.value='开心';mood.oninput();
 assert.equal(mood.closest('label').hidden,false);const saving=submit.run();await Promise.resolve();assert.equal(env.getImported(),null);
 decode({width:120,height:160,close(){}});await saving;
 assert.equal(env.getImported().target.entity,'a');assert.equal(env.getImported().scope,'chat');assert.equal(env.getImported().use,'expression');assert.equal(env.getImported().variant,'开心');assert.equal(env.getImported().width,120);assert.equal(env.getImported().height,160);
 assert.equal(env.rows.length,1);assert.equal(body.querySelectorAll('.tisya-media-card').length,1);assert.match(body.textContent,/图片已保存/);
 view.dispose();await env.window.happyDOM.close();
});

test('only the latest selected image may update decode state after a slow earlier read',async()=>{
 const env=fixture(),body=env.document.body,pending=[];
 env.window.createImageBitmap=file=>new Promise(resolve=>pending.push({file,resolve}));
 const view=renderMediaAtlas(env.document,body,{atlas:env.atlas,button:env.button,field:env.field,input:env.input,el:env.el}),fileControl=body.querySelector('input[type=file]');
 const first=new Blob(['first'],{type:'image/png'}),second=new Blob(['second'],{type:'image/png'});
 Object.defineProperty(fileControl,'files',{configurable:true,value:[first]});fileControl.onchange();
 Object.defineProperty(fileControl,'files',{configurable:true,value:[second]});fileControl.onchange();
 pending[1].resolve({width:200,height:100,close(){}});await Promise.resolve();await Promise.resolve();
 pending[0].resolve({width:999,height:999,close(){}});await Promise.resolve();await Promise.resolve();
 assert.match(body.querySelector('[role=status]').textContent,/200 × 100/);assert.doesNotMatch(body.querySelector('[role=status]').textContent,/999/);
 view.dispose();await env.window.happyDOM.close();
});

test('card scope selects an active native card and global scope needs no card',async()=>{
 const env=fixture(),body=env.document.body;env.window.createImageBitmap=async()=>({width:80,height:90,close(){}});
 const view=renderMediaAtlas(env.document,body,{atlas:env.atlas,button:env.button,field:env.field,input:env.input,el:env.el}),fileControl=body.querySelector('input[type=file]'),target=body.querySelector('select[aria-label="绑定对象"]'),scope=body.querySelector('select[aria-label="绑定范围"]'),card=body.querySelector('select[aria-label="绑定角色卡"]'),submit=[...body.querySelectorAll('button')].find(x=>x.textContent==='上传并绑定');
 scope.value='card';scope.onchange();assert.equal(card.closest('label').hidden,false);assert.equal(card.value,'card-a');
 Object.defineProperty(fileControl,'files',{configurable:true,value:[new Blob(['image'],{type:'image/png'})]});fileControl.onchange();target.value='a';await submit.run();
 assert.equal(env.getImported().scope,'card');assert.equal(env.getImported().card.id,'card-a');assert.match(body.textContent,/角色卡/);
 scope.value='global';scope.onchange();assert.equal(card.closest('label').hidden,true);
 view.dispose();await env.window.happyDOM.close();
});
