import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createPanelSurface,hideFullPanels,hideAllPanels} from '../panel-surface.js';
test('management surfaces share one visible owner, preserve drafts and keep a half-screen console on ordinary page changes',()=>{
 const w=new Window({width:390,height:844}),d=w.document;
 const a=d.createElement('iframe'),b=d.createElement('iframe');d.body.append(a,b);a.dataset.draft='unsaved';
 const modes=[],one=createPanelSurface(d,a,{onMode:m=>modes.push(m)}),two=createPanelSurface(d,b);
 one.show('full');assert(!a.hidden);two.show('full');assert(a.hidden);assert(!b.hidden);assert.equal(a.dataset.draft,'unsaved');assert.equal(d.querySelectorAll('#tisya-panel-surface-style').length,1);
 hideFullPanels(d);assert(b.hidden);one.show('float');hideFullPanels(d);assert(!a.hidden);assert.equal(a.dataset.mode,'float');assert.equal(Number(a.height),439);
 hideAllPanels(d);assert(a.hidden);one.show('full');assert.equal(a.dataset.draft,'unsaved');assert.equal(a.dataset.ttMobileSurface,'none');
 one.dispose();assert(d.getElementById('tisya-panel-surface-style'));two.dispose();assert.equal(d.getElementById('tisya-panel-surface-style'),null);w.happyDOM.abort();
});
