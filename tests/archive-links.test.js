import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {initializeState} from '../engine/materials.mjs';
import {matrixArchiveLinkIndex,archiveLinkTextIndex} from '../archive-links.mjs';
import {formatProse} from '../prose.js';
import {ARCHIVE_LINK_CSS} from '../extension-presentation.mjs';
import {mountMessageAppearance} from '../message-ui.js';
import {createExtensionPresentationService} from '../extension-host.mjs';
import {databaseSnapshotAtMessage} from '../engine/database-snapshot.mjs';
import {chatKey} from '../engine/controller.mjs';
import {digest,sha256} from '../engine/common.mjs';
import {messageSignature} from '../engine/message-identity.mjs';

const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
const row=(values,derived=[])=>{const states=Object.fromEntries(Object.keys(values).map(key=>[key,derived.includes(key)?'derived':'known']));if(!('row_uuid' in values)){values={row_uuid:values.name??values.title??'row',...values};states.row_uuid='known';}return {values,states};};
const entry=(title,names,extra={})=>({reference:{tableId:'T_SYS_ENTITIES',recordId:title,snapshotId:'snapshot-1'},kind:'人物',title,names,fields:[['公开身份','河口旅人']],contextKey:'ctx',allowed:true,...extra});

test('canonical link index uses aliases, rejects ambiguity and projects only declared summary fields',()=>{
 const state=initializeState(catalog,{session_ref:'session',branch_ref:'main'});
 Object.assign(state.tables,{
  T_CHAR_DOSSIER:{'dossier-a':row({name:'阿青',public_identity:'河口旅人',aliases:['alias-a']})},
  M_LIST_VALUES:{'alias-a':row({owner_table:'T_CHAR_DOSSIER',owner_row_uuid:'dossier-a',owner_field:'aliases',narrative:'青姐'})},
  M_FIELD_REFERENCES:{'origin-a':row({owner_table:'T_SYS_ENTITIES',owner_row_uuid:'entity-a',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'dossier-a',reference_kind:'record',resolution_status:'resolved'})},
  T_SYS_ENTITIES:{
   'entity-a':row({name:'阿青',kind:'character',origin_record_ref:'origin-a',description:'渡口点灯的人'},['name']),
   'entity-b':row({name:'阿青',kind:'character',description:'另一个同名人物'},['name'])
  },
  T_DYN_CLUES:{'clue-a':row({name:'旧船票',stage:'已出现',shown_content:'票根留在门缝',hidden_remainder:'PRIVATE_HIDDEN_REMAINDER'})},
  T_DYN_EVENTS:{'event-a':row({title:'渡口交信',short_code:'E02',spine_digest:'信已送达',result:'船夫收信',impact:'约定继续',full_process:'PRIVATE_FULL_PROCESS'})}
 });
 const snapshot={state,contextKey:'ctx',snapshotId:'snapshot-1',revision:3},before=JSON.stringify(state);
 const index=matrixArchiveLinkIndex(snapshot,{sourceId:'snapshot-1',contextKey:'ctx'});
 const person=index.entries.find(item=>item.reference.recordId==='entity-a');
 assert(person);assert.deepEqual(person.names,['青姐']);assert(!index.entries.some(item=>item.reference.recordId==='entity-b'));
 assert(!index.entries.some(item=>item.reference.tableId==='T_CHAR_DOSSIER'),'a linked entity already represents its origin dossier');
 assert(person.fields.some(([label,value])=>label==='公开身份'&&value==='河口旅人'));
 assert(index.entries.some(item=>item.reference.recordId==='clue-a'));
 assert(index.entries.find(item=>item.reference.recordId==='event-a').names.includes('E02'));
 const serialized=JSON.stringify(index);assert(!serialized.includes('PRIVATE_HIDDEN_REMAINDER'));assert(!serialized.includes('PRIVATE_FULL_PROCESS'));
 assert.equal(JSON.stringify(state),before);
 assert.deepEqual(archiveLinkTextIndex({entries:[entry('甲',['重名']),entry('乙',['重名'])]}),[]);
});

test('an origin dossier without an entity instance reaches native beauty through the real snapshot service',async()=>{
 const w=new Window({url:'http://localhost'}),d=w.document;d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"><div class="card-beauty"><p>阿青推门，青姐随后抵达。</p></div></div></div></div></div>';
 const node=d.querySelector('.mes'),native=d.querySelector('.mes_text'),ctx={chatId:'chat-1',characterId:'character-1',groupId:null},key=chatKey(ctx),raw='阿青推门，青姐随后抵达。',message={mes:raw,name:'角色',extra:{tisya_engine:{uid:'dossier-only'}}},opened=[];
 const state=initializeState(catalog,{session_ref:'session',branch_ref:'main'});state.tables.T_SYS_ENTITIES={};Object.assign(state.tables,{
  T_CHAR_DOSSIER:{'dossier-only':row({name:'阿青',public_identity:'河口旅人',aliases:['alias-only']})},
  M_LIST_VALUES:{'alias-only':row({owner_table:'T_CHAR_DOSSIER',owner_row_uuid:'dossier-only',owner_field:'aliases',narrative:'青姐'})}
 });
 const bundle={state,journal:{entries:[{uid:'dossier-only',role:'assistant',signature:digest({role:'assistant',text:raw,uid:'dossier-only'}),revision:1,settlement_status:'APPLIED',pre_turn_snapshot:{inverse_patch:[]}}]}};
 const service=createExtensionPresentationService({document:d,getContext:()=>ctx,database:{peek:async()=>({state,revision:1,contextKey:key}),snapshot:input=>databaseSnapshotAtMessage(bundle,input,key)}});w.Tisya={archive:{open:reference=>opened.push(reference)}};
 const ui=mountMessageAppearance(d,{getMessage:()=>message,getPhoneContext:()=>key,getPresentation:message=>service.forMessage(message),preferNative:()=>true,formatBody:text=>text,getMotion:()=>false});ui.sync(node);await new Promise(resolve=>setTimeout(resolve,50));
 try{
  const links=[...native.querySelectorAll('[data-tisya-archive-link]')];assert.deepEqual(links.map(link=>link.textContent),['阿青','青姐']);
  links[0].click();const anchor=links[0].closest('[data-tisya-archive-anchor]');anchor.querySelector('[data-tisya-archive-open]').click();assert.deepEqual(opened,[{tableId:'T_CHAR_DOSSIER',recordId:'dossier-only'}]);
 }finally{ui.dispose();await w.happyDOM.abort();}
});

test('the original host message of a reviewed reply produces tooltips from its historical snapshot',async()=>{
 const w=new Window({url:'http://localhost'}),d=w.document;d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"><div class="card-beauty"><p>阿青推门。</p></div></div></div></div></div>';
 const node=d.querySelector('.mes'),native=d.querySelector('.mes_text'),ctx={chatId:'chat-reviewed',characterId:'character-1',groupId:null},key=chatKey(ctx),raw='阿青推门。',reply='阿青在复核后推门。',message={mes:raw,name:'角色',extra:{tisya_engine:{uid:'reviewed-links'}}};
 const state=initializeState(catalog,{session_ref:'session',branch_ref:'main'});state.tables.T_SYS_ENTITIES={};state.tables.T_CHAR_DOSSIER={'dossier-reviewed':row({name:'阿青',public_identity:'河口旅人'})};
 const bundle={state,turn_review:{decisions:[{uid:'reviewed-links',sourceHash:sha256(raw),reply}],legacy:[]},journal:{entries:[{uid:'reviewed-links',role:'assistant',signature:messageSignature({uid:'reviewed-links',role:'assistant',text:reply}),revision:1,settlement_status:'APPLIED',pre_turn_snapshot:{inverse_patch:[]}}]}};
 const service=createExtensionPresentationService({document:d,getContext:()=>ctx,database:{peek:async()=>({state,revision:1,contextKey:key}),snapshot:input=>databaseSnapshotAtMessage(bundle,input,key)}});w.Tisya={archive:{open(){}}};
 const ui=mountMessageAppearance(d,{getMessage:()=>message,getPhoneContext:()=>key,getPresentation:message=>service.forMessage(message),preferNative:()=>true,formatBody:text=>text,getMotion:()=>false});ui.sync(node);await new Promise(resolve=>setTimeout(resolve,50));
 try{assert.deepEqual([...native.querySelectorAll('[data-tisya-archive-link]')].map(link=>link.textContent),['阿青']);}
 finally{ui.dispose();await w.happyDOM.abort();}
});

test('canonical accepted source restores native tooltips without requiring duplicated review metadata',async()=>{
 const w=new Window({url:'http://localhost'}),d=w.document;d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"><div class="card-beauty"><p>阿青推门。</p></div></div></div></div></div>';
 const node=d.querySelector('.mes'),native=d.querySelector('.mes_text'),ctx={chatId:'chat-source',characterId:'character-1',groupId:null},key=chatKey(ctx),raw='阿青推门。',reply='阿青在保存后推门。',message={mes:raw,name:'角色',extra:{tisya_engine:{uid:'source-links'}}};
 const state=initializeState(catalog,{session_ref:'session',branch_ref:'main'});state.tables.T_SYS_ENTITIES={};state.tables.T_CHAR_DOSSIER={'dossier-source':row({name:'阿青',public_identity:'河口旅人'})};state.runtime.sources={'main/source-links@1':{entry_id:'source-links',revision:1,reply_raw:reply,reply_sha256:sha256(reply),host_message_sha256:sha256(raw)}};
 const bundle={state,journal:{entries:[{uid:'source-links',role:'assistant',signature:messageSignature({uid:'source-links',role:'assistant',text:reply}),revision:1,settlement_status:'APPLIED',pre_turn_snapshot:{inverse_patch:[]}}]}};
 const service=createExtensionPresentationService({document:d,getContext:()=>ctx,database:{peek:async()=>({state,revision:1,contextKey:key}),snapshot:input=>databaseSnapshotAtMessage(bundle,input,key)}});w.Tisya={archive:{open(){}}};
 const ui=mountMessageAppearance(d,{getMessage:()=>message,getPhoneContext:()=>key,getPresentation:message=>service.forMessage(message),preferNative:()=>true,formatBody:text=>text,getMotion:()=>false});ui.sync(node);await new Promise(resolve=>setTimeout(resolve,50));
 try{assert.deepEqual([...native.querySelectorAll('[data-tisya-archive-link]')].map(link=>link.textContent),['阿青']);}
 finally{ui.dispose();await w.happyDOM.abort();}
});

test('natural prose gains longest-match links without touching code, links, controls or existing anchors',async()=>{
 const w=new Window();try{
  const opened=[];w.Tisya={archive:{open:reference=>{opened.push(reference);}}};
  const options={presentation:{contextKey:'ctx',archiveLinks:{entries:[entry('阿青',['阿青','青姐']),entry('阿青姐',['阿青姐'],{reference:{tableId:'T_SYS_ENTITIES',recordId:'sister',snapshotId:'snapshot-1'}})]}}};
  const source='<p>阿青姐与阿青谈起青姐。</p><pre><code>阿青</code></pre><a href="#existing">青姐</a><button>青姐</button><strong>青姐</strong>';
  const root=w.document.createElement('div');root.innerHTML=formatProse(w.document,source,text=>text,options);w.document.body.append(root);
  assert.equal(root.querySelectorAll('[data-tisya-archive-link]').length,4);
  assert.equal(root.querySelector('code [data-tisya-archive-link]'),null);assert.equal(root.querySelector('a [data-tisya-archive-link]'),null);
  assert.equal(root.querySelector('button [data-tisya-archive-link]'),null);
  const first=root.querySelector('[data-tisya-archive-link]');assert.equal(first.textContent,'阿青姐');first.click();
  const anchor=first.closest('[data-tisya-archive-anchor]');assert.equal(anchor.dataset.archiveOpen,'true');assert.equal(first.getAttribute('aria-expanded'),'true');
  anchor.querySelector('[data-tisya-archive-open]').click();assert.deepEqual(opened,[{tableId:'T_SYS_ENTITIES',recordId:'sister'}]);
  first.click();anchor.querySelector('[data-tisya-archive-close]').click();assert.equal(anchor.dataset.archiveOpen,'false');assert.equal(w.document.activeElement,first);
  first.click();first.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,composed:true}));assert.equal(anchor.dataset.archiveOpen,'false');
  const again=w.document.createElement('div');again.innerHTML=formatProse(w.document,root.innerHTML,text=>text,options);assert.equal(again.querySelectorAll('[data-tisya-archive-link]').length,4);assert.equal(again.querySelectorAll('[data-tisya-archive-anchor] [data-tisya-archive-anchor]').length,0);
 }finally{await w.happyDOM.abort();}
});

test('archive anchors preserve exact prose text and add no default gap or underline',async()=>{
 const w=new Window();try{
  const root=w.document.createElement('div');root.innerHTML=formatProse(w.document,'门前，阿青推门。',text=>text,{presentation:{contextKey:'ctx',archiveLinks:{entries:[entry('阿青',['阿青'])]}}});
  const clean=root.cloneNode(true);clean.querySelectorAll('[data-tisya-archive-tooltip]').forEach(node=>node.remove());assert.equal(clean.textContent,'门前，阿青推门。');
  const paragraph=root.querySelector('p'),textNodes=[...paragraph.childNodes].filter(node=>node.nodeType===3).map(node=>node.nodeValue);
  assert(textNodes.length>=2&&textNodes.every(value=>!/^\s|\s$/u.test(value)),'projection must not insert whitespace text around the anchor');
  assert.match(ARCHIVE_LINK_CSS,/\.tisya-archive-anchor\{position:relative;display:inline\}/);
  assert.match(ARCHIVE_LINK_CSS,/\.tisya-archive-link\{[^}]*padding:0;[^}]*border:0;/);
  assert.doesNotMatch(ARCHIVE_LINK_CSS,/\.tisya-archive-link\{[^}]*border-bottom:/);
  assert.match(ARCHIVE_LINK_CSS,/\.tisya-archive-link:hover,\.tisya-archive-link:focus-visible\{[^}]*text-decoration:underline/);
 }finally{await w.happyDOM.abort();}
});

test('synthetic viewport events place tooltips away from edges and retain desktop and touch styles',async()=>{
 const w=new Window();try{
  Object.defineProperty(w,'innerWidth',{value:360,configurable:true});const root=w.document.createElement('div');root.innerHTML=formatProse(w.document,'阿青',text=>text,{presentation:{contextKey:'ctx',archiveLinks:{entries:[entry('阿青',['阿青'])]}}});w.document.body.append(root);
  const trigger=root.querySelector('[data-tisya-archive-link]'),anchor=trigger.closest('[data-tisya-archive-anchor]');let rect={top:100,left:8,right:30};anchor.getBoundingClientRect=()=>rect;
  trigger.dispatchEvent(new w.Event('pointerover',{bubbles:true,composed:true}));assert.equal(anchor.dataset.archivePlace,'below');assert.equal(anchor.dataset.archiveAlign,'left');
  rect={top:500,left:300,right:350};trigger.dispatchEvent(new w.Event('pointerover',{bubbles:true,composed:true}));assert.equal(anchor.dataset.archivePlace,'above');assert.equal(anchor.dataset.archiveAlign,'right');
  trigger.click();assert.equal(anchor.querySelector('.tisya-archive-tooltip').getAttribute('role'),'tooltip');
  assert.match(ARCHIVE_LINK_CSS,/@media \(hover:hover\) and \(pointer:fine\)/);assert.match(ARCHIVE_LINK_CSS,/@media \(pointer:coarse\)/);assert.match(ARCHIVE_LINK_CSS,/\.tisya-archive-tooltip-close\{flex-basis:44px;width:44px;height:44px\}/);
 }finally{await w.happyDOM.abort();}
});

test('wrong-context or unauthorized link projections never reach the DOM',async()=>{
 const w=new Window();try{const root=w.document.createElement('div'),secret=entry('秘密',['秘密'],{contextKey:'other',fields:[['内容','PRIVATE_CANARY']]});root.innerHTML=formatProse(w.document,'秘密',text=>text,{presentation:{contextKey:'ctx',archiveLinks:{entries:[secret]}}});assert.equal(root.querySelector('[data-tisya-archive-link]'),null);assert(!root.innerHTML.includes('PRIVATE_CANARY'));}finally{await w.happyDOM.abort();}
});

test('native beauty receives archive links without replacing live nodes and unwraps them on disposal',async()=>{
 const w=new Window({url:'http://localhost'}),d=w.document;d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"><div class="card-beauty"><button>原生按钮</button><p>阿青推门。</p></div></div></div></div></div>';
 const node=d.querySelector('.mes'),native=d.querySelector('.mes_text'),button=d.querySelector('.card-beauty>button'),message={mes:'阿青推门。',name:'角色',extra:{tisya_engine:{uid:'native-links'}}},opened=[];let clicks=0,lookups=0,disposals=0;button.onclick=()=>clicks++;w.Tisya={archive:{open:reference=>opened.push(reference)}};
 const getPresentation=async()=>{lookups++;return {contextKey:'ctx',projections:[],archiveLinks:{entries:[entry('阿青',['阿青'])]},dispose:()=>{disposals++;}};},pause=()=>new Promise(resolve=>setTimeout(resolve,30));
 const ui=mountMessageAppearance(d,{getMessage:()=>message,getPhoneContext:()=>'ctx',getPresentation,preferNative:()=>true,formatBody:text=>text,getMotion:()=>false});ui.sync(node);await pause();
 try{
  assert.equal(lookups,1);assert.equal(native.querySelectorAll('[data-tisya-archive-link]').length,1);assert.equal(d.querySelector('.card-beauty>button'),button);assert(d.querySelector('style[data-tisya-native-archive-links]'));
  const trigger=native.querySelector('[data-tisya-archive-link]');trigger.click();const anchor=trigger.closest('[data-tisya-archive-anchor]');assert.equal(anchor.dataset.archiveOpen,'true');anchor.querySelector('[data-tisya-archive-open]').click();assert.deepEqual(opened,[{tableId:'T_SYS_ENTITIES',recordId:'阿青'}]);
  ui.sync(node);ui.sync(node);await pause();assert.equal(lookups,1,'native DOM mutations must not restart the presentation request');assert.equal(native.querySelectorAll('[data-tisya-archive-link]').length,1);
  ui.refresh();await pause();assert.equal(lookups,2,'archive completion can explicitly refresh the link projection');assert.equal(native.querySelectorAll('[data-tisya-archive-link]').length,1);
  ui.dispose();assert.equal(native.querySelector('[data-tisya-archive-link]'),null);assert.equal(d.querySelector('style[data-tisya-native-archive-links]'),null);assert.equal(d.querySelector('.card-beauty>button'),button);assert.match(native.textContent,/阿青推门/);button.click();assert.equal(clicks,1);assert.equal(disposals,2);
 }finally{ui.dispose();await w.happyDOM.abort();}
});

test('a disposed native view cannot receive a late archive projection',async()=>{
 const w=new Window(),d=w.document;d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text">阿青</div></div></div>';const node=d.querySelector('.mes'),message={mes:'阿青',extra:{tisya_engine:{uid:'late-native'}}};let release;
 const ui=mountMessageAppearance(d,{getMessage:()=>message,getPhoneContext:()=>'ctx',getPresentation:()=>new Promise(resolve=>release=resolve),preferNative:()=>true,formatBody:text=>text});ui.sync(node);await Promise.resolve();ui.dispose();release({contextKey:'ctx',projections:[],archiveLinks:{entries:[entry('阿青',['阿青'])]}});await new Promise(resolve=>setTimeout(resolve,20));
 try{assert.equal(node.querySelector('[data-tisya-archive-link]'),null);assert.equal(d.querySelector('style[data-tisya-native-archive-links]'),null);}finally{await w.happyDOM.abort();}
});

test('native beauty rewrites reuse the resolved archive projection instead of leaving no tooltips',async()=>{
 const w=new Window({url:'http://localhost'}),d=w.document;d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"><p>阿青第一次出现。</p></div></div></div></div>';
 const node=d.querySelector('.mes'),native=d.querySelector('.mes_text'),message={mes:'阿青第一次出现。',name:'角色',extra:{tisya_engine:{uid:'rewrite-links'}}};let lookups=0;
 const getPresentation=async()=>{lookups++;return {contextKey:'ctx',projections:[],archiveLinks:{entries:[entry('阿青',['阿青'])]}};};
 const ui=mountMessageAppearance(d,{getMessage:()=>message,getPhoneContext:()=>'ctx',getPresentation,preferNative:()=>true,formatBody:text=>text,getMotion:()=>false});ui.sync(node);await new Promise(resolve=>setTimeout(resolve,40));
 try{
  assert.equal(native.querySelectorAll('[data-tisya-archive-link]').length,1);
  native.innerHTML='<div class="card-beauty"><p>阿青被后续原生美化覆盖。</p></div>';await new Promise(resolve=>setTimeout(resolve,70));
  assert.equal(native.querySelectorAll('[data-tisya-archive-link]').length,1,'host overwrite must be repaired from the existing projection');assert.equal(lookups,1,'repair must not start another snapshot read');
 }finally{ui.dispose();await w.happyDOM.abort();}
});
