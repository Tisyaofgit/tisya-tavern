import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountArchiveAtlas} from '../preview/archive-atlas/ui.js';
import {demoArchive} from '../preview/archive-atlas/demo.js';
const textButton=(doc,text)=>{const b=[...doc.querySelectorAll('button')].find(b=>b.textContent===text);assert(b,'missing '+text);b.click();};
test('actual preview renders safe text, preserves query and separates reader and author details',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);const data=demoArchive();data.rows.find(r=>r.id==='bell').values.描述='<img src=x onerror=alert(1)>';const ui=mountArchiveAtlas(root,data);assert.equal(root.querySelectorAll('.archive-card').length,8);assert.equal(root.querySelector('img'),null);
 root.querySelector('[aria-label="打开方鹿"]').click();assert.match(root.textContent,/尚待提炼/);textButton(doc,'关联');assert(!root.textContent.includes('欠款凭据'));textButton(doc,'返回图鉴');textButton(doc,'读者视图');root.querySelector('[aria-label="打开方鹿"]').click();textButton(doc,'关联');assert(root.textContent.includes('铜铃夹层欠款凭据'));textButton(doc,'返回图鉴');textButton(doc,'作者视图');assert(!root.textContent.includes('欠款凭据'));
 const search=root.querySelector('input');search.value='根本没有这个名字';search.dispatchEvent(new win.Event('input'));assert.equal(root.querySelectorAll('.archive-card').length,0);assert.match(root.textContent,/没有找到/);ui.dispose();await win.happyDOM.close();
});
test('all preview pages are reachable; demo export is explicitly not a runtime archive package',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);let output=null;const ui=mountArchiveAtlas(root,demoArchive(),{download:(name,text)=>output={name,text}});
 const nav=id=>{const b=[...root.querySelectorAll('nav button')].find(b=>b.textContent.endsWith(id));assert(b);b.click();};nav('总览');assert.match(root.textContent,/身份|核心/);nav('基点');textButton(doc,'查看原点表达 →');assert.equal(ui.state().layer,'origin');assert.equal(ui.state().selected,'fanglu');nav('存档');textButton(doc,'导出演示存档');assert.equal(JSON.parse(output.text).format,'tisya.atlas-ui-demo/1');textButton(doc,'查看这个时点 →');assert.equal(ui.state().layer,'save');textButton(doc,'夜读');assert.equal(root.dataset.theme,'dark');ui.dispose();await win.happyDOM.close();
});

test('object links, child records and nested subobjects open by identity and restore exact navigation context',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);const ui=mountArchiveAtlas(root,demoArchive());
 let y=0;Object.defineProperty(win,'scrollY',{get:()=>y});win.scrollTo=(_x,n)=>{y=n;};
 const open=name=>{const b=root.querySelector('[aria-label="打开'+name+'"]');assert(b,'missing object '+name);b.focus();b.click();};
 const search=root.querySelector('input');search.value='方鹿';search.dispatchEvent(new win.Event('input'));y=180;open('方鹿');assert.equal(y,0);
 textButton(doc,'履历');y=275;open('白沙滩洪水救援');assert.equal(ui.state().selected,'e-flood');assert.equal(root.querySelector('h1').textContent,'白沙滩洪水救援');
 open('阿禾');assert.equal(ui.state().selected,'ahe');textButton(doc,'关联');open('方鹿');assert.equal(ui.state().selected,'fanglu');
 textButton(doc,'← 返回上一层');assert.equal(ui.state().selected,'ahe');assert.equal(ui.state().tab,'links');textButton(doc,'← 返回上一层');assert.equal(ui.state().selected,'e-flood');textButton(doc,'← 返回上一层');assert.equal(ui.state().tab,'history');assert.equal(y,275);assert.equal(doc.activeElement.dataset.navKey,'record:e-flood');
 textButton(doc,'档案');root.querySelector('[aria-label="打开子项：身份细目"]').click();assert.deepEqual(ui.state().path,['属性','身份细目']);open('青溪渡');assert.equal(ui.state().selected,'qingxi');textButton(doc,'← 返回上一层');assert.deepEqual(ui.state().path,['属性','身份细目']);
 textButton(doc,'返回图鉴');assert.equal(root.querySelector('input').value,'方鹿');assert.equal(y,180);assert.equal(ui.state().trail.length,0);
 ui.dispose();await win.happyDOM.close();
});

test('breadcrumbs truncate cycles, all linked records are readable and audience/layer changes discard trails',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);const data=demoArchive(),ui=mountArchiveAtlas(root,data);
 const open=name=>{const b=root.querySelector('[aria-label="打开'+name+'"]');assert(b);b.click();};
 open('方鹿');textButton(doc,'关联');open('阿禾');textButton(doc,'关联');open('方鹿');assert.equal(ui.state().trail.length,3);root.querySelector('[aria-label="返回路径：方鹿"]').click();assert.equal(ui.state().selected,'fanglu');assert.equal(ui.state().tab,'links');assert.equal(ui.state().trail.length,1);
 open('洪水之后的老朋友');assert.equal(ui.state().selected,'r-fang-ahe');assert.match(root.textContent,/不因交情放行/);textButton(doc,'返回图鉴');textButton(doc,'读者视图');open('方鹿');textButton(doc,'关联');open('铜铃夹层欠款凭据');assert.equal(ui.state().selected,'secret');open('旧铜铃');assert.equal(ui.state().selected,'bell');textButton(doc,'返回图鉴');textButton(doc,'作者视图');assert.equal(ui.state().trail.length,0);open('方鹿');textButton(doc,'关联');assert(!root.textContent.includes('欠款凭据'));
 textButton(doc,'返回图鉴');const select=root.querySelector('select');select.value='origin';select.dispatchEvent(new win.Event('change'));open('方鹿');textButton(doc,'履历');assert.match(root.textContent,/尚未记录/);assert.equal(ui.state().trail.length,1);
 ui.dispose();await win.happyDOM.close();
});

test('structured array subitems remain expandable; plain text matching an ID is not a guessed link',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);const data=demoArchive();
 data.registry.types.find(t=>t.id==='character').fields.部件={type:'array',items:{type:'object',fields:{说明:{type:'text'},参照:{type:'ref'}}}};
 data.rows.find(r=>r.id==='fanglu').values.属性.部件=[{说明:'bell',参照:'bell'}];
 const ui=mountArchiveAtlas(root,data);root.querySelector('[aria-label="打开方鹿"]').click();textButton(doc,'档案');root.querySelector('[aria-label="打开子项：第 1 项"]').click();assert.deepEqual(ui.state().path,['属性','部件',0]);assert.match(root.textContent,/bell/);assert.equal(root.querySelectorAll('[aria-label="打开旧铜铃"]').length,1);root.querySelector('[aria-label="打开旧铜铃"]').click();assert.equal(ui.state().selected,'bell');
 ui.dispose();await win.happyDOM.close();
});
