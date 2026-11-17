import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {acceptReply,parseReply} from '../engine/reply.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {describeReviewForms,editReviewDocument} from '../engine/review-form-document.mjs';
import {stripParagraphEvidence} from '../engine/paragraph-evidence.mjs';
import {PRE_EVIDENCE_LIST_REPLY_FORM_VERSION,replyFormDecoding} from '../engine/reply-form-ownership.mjs';
const fresh=()=>new Runtime(initializeState(catalog));
const form=(e,id,values,ref='P1；P3')=>{const t=prepareMatrixSheets({state:e.data},{task:'main',operationId:'fields'}).catalog.templates.find(t=>t.id===id);return '【'+t.label+'／1】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v+' | '+ref).join('\n');};
const reply=(cells,archive='')=>'<reply><body>1 信已交出。\n\n2 灯已点亮。\n\n3 沈川在棚中等候。</body><cells format="form">'+cells+'</cells><archive format="form">'+archive+'</archive></reply>';
function apply(e,text,op='test',opts={}){const c=prepareMatrixSheets({state:e.data},{task:'main',mode:'revise',operationId:op,...opts}),a=acceptMatrixSheets(c,{state:e.data},{blocks:{cells:text}});applyMatrixChanges(e,a.proposal.matrix.changes);return a;}
test('multiple evidence references stay in provenance, never business values; editor preserves suffix',()=>{
 const e=fresh(),cells=form(e,'T_DYN_SCENE_SPACE',{name:'候船',stage:'交信后等待'}),archive=form(e,'T_DYN_EVENTS',{spine_digest:'信已交出后沈川等候'}),raw=reply(cells,archive);
 const doc=describeReviewForms(e.data,{cells,archive}).cells,row=doc.groups[0].rows.find(r=>r.key==='stage');assert.equal(row.value,'交信后等待');assert.equal(row.evidence,'P1；P3');assert(editReviewDocument(doc,{[row.start]:'留棚等候'}).includes('留棚等候 | P1；P3'));
 const r=acceptReply(e,raw,'r1',1,'main',{manualConfirmed:true});assert.deepEqual(r.result.warnings,[]);const scene=Object.values(e.rows('T_DYN_SCENE_SPACE'))[0];assert.equal(scene.values.stage,'交信后等待');assert.equal(scene.metadata.stage.source_pointer.paragraph_reference,'P1；P3');assert.equal(Object.values(e.rows('T_DYN_EVENTS'))[0].values.spine_digest,'信已交出后沈川等候');assert.equal(e.data.runtime.sources['main/r1@1'].reply_raw,raw);
 assert.equal(stripParagraphEvidence('文字 | P1..P3，P5'),'文字');assert.equal(stripParagraphEvidence('文字 | P1 可能不是依据'),'文字 | P1 可能不是依据');
});
test('evidence list bounds are checked without converting disjoint references into a range; v5 replay is retained',()=>{
 const e=fresh(),cells=form(e,'T_DYN_SCENE_SPACE',{name:'等待'},'P1；P9'),p=parseReply(reply(cells),'x');assert(p.delta_ops[1].endsWith('P1；P3'));assert.equal(p.warnings[0].code,'PARAGRAPH_CLAMPED');
 const old=acceptReply(e,reply(form(e,'T_DYN_SCENE_SPACE',{name:'旧等待'})),'old',1,'main',{formOwnershipVersion:PRE_EVIDENCE_LIST_REPLY_FORM_VERSION});assert.equal(old.result.operations[0].status,'COMMITTED');assert.equal(Object.values(e.rows('T_DYN_SCENE_SPACE'))[0].values.name,'旧等待 | P1；P3');assert.equal(replyFormDecoding(PRE_EVIDENCE_LIST_REPLY_FORM_VERSION).narrativeIdentity,true);assert.equal(replyFormDecoding(PRE_EVIDENCE_LIST_REPLY_FORM_VERSION).multipleEvidence,false);
});
test('unique active unnamed-ID holdings continue by definition and explicit instance name, retaining holder',()=>{
 const e=fresh();apply(e,form(e,'T_DYN_HOLDINGS_INVENTORY',{item_ref:'蜡封信',instance_name:'沈川递交的蜡封信',holder_ref:'陆弥'}),'first');const first=Object.keys(e.rows('T_DYN_HOLDINGS_INVENTORY'))[0];apply(e,form(e,'T_DYN_HOLDINGS_INVENTORY',{item_ref:'蜡封信',instance_name:'沈川递交的蜡封信',physical_condition:'观察：是；依据：信封未拆'}),'next');assert.deepEqual(Object.keys(e.rows('T_DYN_HOLDINGS_INVENTORY')),[first]);assert(e.rows('T_DYN_HOLDINGS_INVENTORY')[first].values.holder_ref);
 apply(e,form(e,'T_DYN_HOLDINGS_INVENTORY',{item_ref:'蜡封信',instance_name:'另一封蜡封信'}),'copy');assert.equal(Object.keys(e.rows('T_DYN_HOLDINGS_INVENTORY')).length,2);
});
test('ambiguous physical holdings are not merged and ended holdings are not reused',()=>{
 const e=fresh();e.newRecord('T_STATIC_ITEMS_SKILLS',{name:'信'},'letter');for(const id of ['a','b'])e.newRecord('T_DYN_HOLDINGS_INVENTORY',{item_ref:'letter',instance_name:'蜡封信'},id);
 assert.throws(()=>apply(e,form(e,'T_DYN_HOLDINGS_INVENTORY',{item_ref:'信',instance_name:'蜡封信'})),/同一身份有多条旧记录/);
 e.newRecord('M_WORLD_TIME',{original_text:'昨夜'},'ended');for(const r of Object.values(e.rows('T_DYN_HOLDINGS_INVENTORY')))r.values.holding_end='ended';apply(e,form(e,'T_DYN_HOLDINGS_INVENTORY',{item_ref:'信',instance_name:'蜡封信'}),'new-holding');assert.equal(Object.keys(e.rows('T_DYN_HOLDINGS_INVENTORY')).length,3);
});
