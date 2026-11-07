import test from 'node:test';
import assert from 'node:assert/strict';
import {configureTags} from '../engine/tags.mjs';
import {parseReply} from '../engine/reply.mjs';
import {runReplyDisplay} from '../reply-protocol.js';

const marker='<StatusPlaceHolderImpl/>';
const update='<UpdateVariable><JSONPatch>[{"op":"delta","path":"/count","value":1}]</JSONPatch></UpdateVariable>';
const reply=(vars=update,extra='')=>'<reply><task/><anchor phase="before"/><title>门前|夜间|屋内|验证</title><body>1 门把手转动。</body><anchor phase="after"/><extra>'+extra+'</extra><cells/><vars format="xml"><![CDATA['+vars+']]></vars><archive/><actions>观察|我听一听。|等待。</actions></reply>';
const rule={id:'native',name:'原卡状态栏',enabled:true,placements:['char'],timing:'display',findRegex:'<StatusPlaceHolderImpl\\s*/>',replaceString:'<section>原卡状态栏</section>',trimStrings:[],substitution:'none'};
const render=source=>runReplyDisplay({source,groups:[{id:'native',entries:[rule]}]});

test('matrix native appended status reaches the original display rule exactly once without changing source or variables',()=>{
 const source=reply()+'\n'+marker,parsed=parseReply(source,'native'),display=render(source);
 assert.equal(display.rules[0].matches,1);
 assert.match(display.extra,/原卡状态栏/);
 assert.doesNotMatch(display.body,/原卡状态栏|JSONPatch/);
 assert.equal(parseReply(source,'native').native_vars,parsed.native_vars);
 assert.equal(parsed.reply_raw,source);
 assert.equal(display.extraPanels.length,1);
});

test('matrix status projection supports punctuation tags and historical mixed native vars',()=>{
 configureTags({reply:'scene.',body:'story-',cells:'ledger.'});
 try{
  for(const raw of [reply()+'\n'+marker,reply(update+'\n'+marker),reply(update,marker)+'\n'+marker]){
   const source=raw.replaceAll('<reply>','<scene.>').replaceAll('</reply>','</scene.>').replaceAll('<body>','<story->').replaceAll('</body>','</story->').replaceAll('<cells/>','<ledger./>');
   const before=parseReply(source,'custom'),display=render(source);
   assert.equal(display.rules[0].matches,1);
   assert.equal(display.extraPanels.length,1);
   assert.equal(parseReply(source,'custom').native_vars,before.native_vars);
  }
 }finally{configureTags();}
});

test('matrix native display does not expose a marker literal from variables or accept malformed mixed updates',()=>{
 const literal='<UpdateVariable><JSONPatch>[{"op":"replace","path":"/text","value":"<StatusPlaceHolderImpl/>"}]</JSONPatch></UpdateVariable>';
 const display=render(reply(literal));
 assert.equal(display.rules[0]?.matches??0,0);
 assert.doesNotMatch(display.extra,/原卡状态栏/);
 const withTail=render(reply(literal)+'\n'+marker);
 assert.equal(withTail.rules[0].matches,1);
 assert.equal(withTail.extraPanels.length,1);
 for(const vars of [update+update+marker,'<UpdateVariable><JSONPatch>[bad]</JSONPatch></UpdateVariable>'+marker])assert.throws(()=>render(reply(vars)));
 assert.throws(()=>render(reply()+'\nunknown tail\n'+marker));
});
