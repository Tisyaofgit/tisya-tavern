import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {Window} from 'happy-dom';

test('self-contained HTML keeps parser fixture script boundaries inside data URLs',()=>{
 const html=readFileSync(new URL('./preview.html',import.meta.url),'utf8');
 const window=new Window({settings:{disableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true}});
 window.document.write(html);
 const scripts=[...window.document.querySelectorAll('script')];
 assert.equal(scripts.length,2);
 for(const script of scripts){
  assert(script.src.startsWith('data:text/javascript;base64,'));
  const source=Buffer.from(script.src.split(',')[1],'base64').toString('utf8');
  assert.doesNotThrow(()=>new Script(source));
 }
 assert.equal(window.document.querySelectorAll('#backfill-dialog').length,1);
 assert.equal(window.document.querySelectorAll('#context-dialog').length,1);
 assert(!window.document.body.innerText.includes('function extractXMLBody'));
 assert.equal(window.document.querySelectorAll('script[src^="http"]').length,0);
 assert.equal(window.document.querySelectorAll('script[src="demo.js"]').length,0);
 window.happyDOM.abort();
});
