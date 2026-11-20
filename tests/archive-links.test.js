import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {initializeState} from '../engine/materials.mjs';
import {matrixArchiveLinkIndex,archiveLinkTextIndex} from '../archive-links.mjs';
import {formatProse} from '../prose.js';
import {ARCHIVE_LINK_CSS} from '../extension-presentation.mjs';

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
 assert(person.fields.some(([label,value])=>label==='公开身份'&&value==='河口旅人'));
 assert(index.entries.some(item=>item.reference.recordId==='clue-a'));
 assert(index.entries.find(item=>item.reference.recordId==='event-a').names.includes('E02'));
 const serialized=JSON.stringify(index);assert(!serialized.includes('PRIVATE_HIDDEN_REMAINDER'));assert(!serialized.includes('PRIVATE_FULL_PROCESS'));
 assert.equal(JSON.stringify(state),before);
 assert.deepEqual(archiveLinkTextIndex({entries:[entry('甲',['重名']),entry('乙',['重名'])]}),[]);
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
