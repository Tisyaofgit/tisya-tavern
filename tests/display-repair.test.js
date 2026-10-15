import test from 'node:test';
import assert from 'node:assert/strict';
import {displayReplySource} from '../display-repair.js';
import {fixture} from './fixtures/journey-r4.cjs';
import {parseDisplayEnvelope} from '../reader-core.js';
import {revisionParagraphs} from '../revision.js';
test('display-only repair leaves body and variable escaped strings untouched',()=>{
 const good=fixture({body:'1\n引号 \\" 与文本',memory:'',extra:''});
 const broken=good.replace(/<actions([^>]*)>/,(_,a)=>'<actions'+a.replaceAll('"','\\"')+'>');
 assert.throws(()=>parseDisplayEnvelope(broken));assert.equal(displayReplySource(broken),good);assert.equal(revisionParagraphs(broken)[0].raw,'引号 \\" 与文本');assert.equal(displayReplySource(good),good);
 const arbitrary='<reply><body>代码 <actions format=\\"pipes\\"></body></reply>';assert.equal(displayReplySource(arbitrary),arbitrary);
});
