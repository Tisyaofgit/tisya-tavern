import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountMatrixIdentity} from '../engine/identity-ui.mjs';
import {createIdentityService} from '../user-identity-service.js';
import {createConfiguration} from '../engine/config.mjs';

test('the current identity page does not expose or invoke retired origin adapters',async()=>{
 const window=new Window(),root=window.document.createElement('main');window.document.body.append(root);
 const ctx={chatId:'current-chat',characterId:0,characters:[{avatar:'card.png'}],chatMetadata:{},name1:'当前身份',extensionSettings:{},powerUserSettings:{personas:{current:'当前身份'},persona_descriptions:{current:{description:'当前心愿'}},persona_description:'当前心愿'}};
 let writes=0,legacyCalls=0;const before=structuredClone(ctx),config=createConfiguration({getContext:()=>ctx,persist:async()=>{writes++;return true;}}),identity=createIdentityService({getContext:()=>ctx,getAvatar:()=> 'current',applyActive:()=>{writes++;},persistSettings:async()=>{writes++;return true;},persistChat:async()=>{writes++;return true;}});
 const roles={database:true,ensureBook:async()=>{},list:async()=>({entries:[],schema:[]})},legacy=()=>{legacyCalls++;throw Error('retired adapter must not be called');};
 const view=mountMatrixIdentity(window.document,root,{identity,config,roles,initialOrigin:{book:'旧原点书',id:'old'},legacyOrigins:{list:legacy,preview:legacy,save:legacy,resume:legacy}});
 try{assert.equal(await view.ready,true);assert.equal(root.querySelector('[data-legacy-origins]'),null);assert.equal(root.querySelector('[data-origin-reviewed]'),null);assert(![...root.querySelectorAll('button')].some(node=>/原点绑定|旧档案|原点档案/.test(node.textContent)));assert.equal(await view.saveDraft(),true);assert.equal(writes,0);assert.equal(legacyCalls,0);assert.deepEqual(ctx,before);}finally{view.dispose();await window.happyDOM.abort();}
});

test('the current identity page rejects a book-only adapter before rendering any writable fallback',async()=>{
 const window=new Window(),root=window.document.createElement('main');let calls=0;try{assert.throws(()=>mountMatrixIdentity(window.document,root,{identity:{read:()=>{calls++;}},config:{read:()=>{calls++;}},roles:{database:false,list:async()=>{calls++;},create:async()=>{calls++;},bind:async()=>{calls++;}}}),/需要统一表单服务/);assert.equal(calls,0);assert.equal(root.childNodes.length,0);}finally{await window.happyDOM.abort();}
});
