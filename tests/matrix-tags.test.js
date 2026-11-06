import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_TAGS,validateTags,normalizeEnvelope} from '../engine/tags.mjs';

test('literal dots in custom envelope and block names never match a different closing tag',()=>{
 const tags=validateTags({...DEFAULT_TAGS,reply:'scene.wrap',body:'story.part'});
 const invalidBody='<scene.wrap><story.part>1 原文。</storyXpart></scene.wrap>';
 const invalidRoot='<scene.wrap><story.part>1 原文。</story.part></sceneXwrap>';
 assert(!normalizeEnvelope(invalidBody,tags).includes('<body>1 原文。</body>'));
 assert.equal(normalizeEnvelope(invalidRoot,tags),invalidRoot);
});

test('every allowed punctuation ending survives custom-tag normalization',()=>{
 for(const ending of ['.','-','_']){
  const tags=validateTags({...DEFAULT_TAGS,reply:'scene'+ending,body:'story'+ending,cells:'ledger'+ending});
  const raw=`<${tags.reply}><${tags.body}>1 原文。</${tags.body}><${tags.cells}/><archive/></${tags.reply}>`;
  assert.equal(normalizeEnvelope(raw,tags),'<reply><body>1 原文。</body><cells/><archive/></reply>');
 }
});

test('custom tag names are case-insensitive while nested data and prose remain exact',()=>{
 const tags=validateTags({...DEFAULT_TAGS,reply:'scene.wrap',body:'story.part'});
 const inner='1 原文 <script>"</storyXpart>"</script> <body>嵌套数据</body>';
 assert.equal(normalizeEnvelope(`<SCENE.WRAP><STORY.PART>${inner}</STORY.PART><cells/></SCENE.WRAP>`,tags),`<reply><body>${inner}</body><cells/></reply>`);
});
