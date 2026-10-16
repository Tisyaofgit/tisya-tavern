import test from 'node:test';
import assert from 'node:assert/strict';
import {createAtlas} from '../tables/atlas.js';
import {demoArchive} from '../preview/archive-atlas/demo.js';
const make=(data,authorizeField=()=>true)=>createAtlas({view:{registry:data.registry,rows:data.rows},context:{},authorizeRow:r=>r.access.readers.includes('读者'),authorizeField});
test('typed references preserve nested paths; reciprocal visible neighbors carry evidence without converting co-occurrence into relationship',()=>{
 const data=demoArchive(),a=make(data),d=a.detail('fanglu');assert(d.references.some(r=>JSON.stringify(r.path)==='["属性","身份细目","出身地",0]'&&r.target.id==='qingxi'));
 assert(d.neighbors.some(r=>r.id==='ahe'&&r.via.some(x=>x.id==='e-flood')));assert(a.detail('ahe').neighbors.some(r=>r.id==='fanglu'));assert(a.detail('bell').neighbors.some(r=>r.id==='fanglu'));assert(a.detail('e-flood').references.some(r=>r.target.id==='ahe'));
 assert(!JSON.stringify(d).includes('欠款'));assert.throws(()=>a.detail('secret'),/不可读取/);
});
test('hidden fields, rows and unavailable targets do not create edges, counts, path metadata or shared-record disclosures',()=>{
 const data=demoArchive();data.rows.find(r=>r.id==='bell').access={readers:[],knowers:[]};data.rows.find(r=>r.id==='fanglu').values.关联.push('not-loaded');
 // Missing targets are allowed in a projection; their IDs never become buttons.
 const a=make(data,(_r,p)=>p.join('.')!=='属性.身份细目.出身地'&&p[0]!=='参与者');const text=JSON.stringify(a.detail('fanglu'));assert(!text.includes('bell'));assert(!text.includes('not-loaded'));assert(!text.includes('e-flood'));assert(!a.detail('fanglu').references.some(r=>r.path.includes('出身地')));
});
