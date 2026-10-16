import test from 'node:test';
import assert from 'node:assert/strict';
import {applyConditionTemplates} from '../tables/conditions.js';
import {PIPES_GUIDE,compactMaterial,pipeCell,registryFromPipes,registryToPipes,rowsFromPipes,rowsToPipes} from '../tables/pipes.js';

const acl={readers:['读者'],knowers:['a']};
const row=(id,table,values,extra={})=>({id,table,rev:0,source:null,values,access:structuredClone(acl),...extra});
const thin=(id,extra={})=>({id,table:'objects',rev:7,values:{名称:'远方档案'+id,类型:'rule',别名:['别名'+id]},referenceOnly:true,...extra});

test('PIPES rows retain types, explicit empty values, separators, multiline text, order and provenance',()=>{
 const values={名称:'示例',零:0,负数:-1.25,关闭:false,空:null,空串:'',空组:[],空映射:{},保留字:['~','null','false','true','0','01','-2','+2'],文字:'甲|乙\n丙\r\n丁\\尾',引号:'说：“原样。” "quoted"',空白:' 首尾 ',模板:'{{person}} <body>plain</body>',嵌套:{items:[0,false,null,'',[],{a:'x|y'}]}},rows=[row('b','facts',values,{source:'源|一',sourceFloor:2,lockedFields:['名称']}),row('a','events',{名称:'第二行',经过:'之后'}),row('c','facts',{名称:'第三行',零:0})],before=structuredClone(rows),encoded=rowsToPipes(rows),decoded=rowsFromPipes(encoded);
 assert.deepEqual(decoded,rows);assert.deepEqual(rows,before);assert(!encoded.includes('{{person}}'));assert(!encoded.includes('<body>'));assert.match(encoded,/\[PIPES.ROWS\/1\]/);
 decoded[0].access.knowers.push('changed');assert.deepEqual(rows,before);assert.deepEqual(decoded[1].access,acl);
 assert.equal(pipeCell(undefined),'~');assert.notEqual(pipeCell('~'),'~');assert.notEqual(pipeCell('null'),'null');
});

test('mixed full and reference-only rows preserve absent ACL as absent, never public or full',()=>{
 const rows=[row('actor','objects',{名称:'阿遥',类型:'character',描述:'完整档案'}),thin('rule'),thin('known',{access:{readers:[],knowers:['owner']}})],before=structuredClone(rows),encoded=rowsToPipes(rows),decoded=rowsFromPipes(encoded);
 assert.deepEqual(decoded,rows);assert.deepEqual(rows,before);assert.equal(decoded[1].referenceOnly,true);assert(!Object.hasOwn(decoded[1],'access'));assert(!Object.hasOwn(decoded[1].values,'描述'));assert.deepEqual(decoded[2].access,{readers:[],knowers:['owner']});
 const permissionLines=encoded.split('\n').filter(s=>s.startsWith('权限：'));assert.equal(permissionLines.length,2);assert(PIPES_GUIDE.includes('referenceOnly'));
});

test('identity-only transport refuses undeclared content and missing full-row permissions',()=>{
 assert.throws(()=>rowsToPipes([{id:'bad',table:'objects',values:{名称:'无权限',类型:'character'}}]),/权限/);
 assert.throws(()=>rowsToPipes([thin('bad',{access:null})]),/权限/);
 assert.throws(()=>rowsToPipes([thin('bad',{values:{名称:'薄行',类型:'rule',描述:'不应携带全文'}})]),/引用/);
 const encoded=rowsToPipes([thin('rule')]);assert.throws(()=>rowsFromPipes(encoded.replace('"referenceOnly":true','"referenceOnly":false')),/权限/);
});

test('linked parent, child and thin identities keep independent readers and knowers',()=>{
 const rows=[row('parent','events',{名称:'旧事',参与者:['a']},{access:{readers:[],knowers:['a']}}),row('child','experiences',{名称:'单方理解',主体:'b',锚点事件:['parent'],默契层次:'单方联想'},{access:{readers:['读者'],knowers:['b']}}),thin('r',{access:{readers:[],knowers:[]}})],encoded=rowsToPipes(rows),decoded=rowsFromPipes(encoded);
 assert.deepEqual(decoded,rows);assert.deepEqual(decoded[0].access.knowers,['a']);assert.deepEqual(decoded[1].access.knowers,['b']);assert.deepEqual(decoded[2].access.knowers,[]);
});

test('row sequence validation rejects duplicate or missing indices, unknown permissions and malformed cells',()=>{
 const encoded=rowsToPipes([row('a','facts',{名称:'先'}),row('b','facts',{名称:'后'})]);
 for(const bad of [encoded.replace('档：1|','档：0|'),encoded.replace('档：1|','档：2|'),encoded.replace('档：1|','档：1000000000|'),encoded.replace('档：1|','档：-1|'),encoded.replaceAll('|a0|','|missing-acl|'),encoded.replace('列：facts|名称','列：facts|名称|名称'),encoded.replace('档：0|a|','档：0|"unfinished|')])assert.throws(()=>rowsFromPipes(bad));
 assert.throws(()=>rowsFromPipes(encoded.replace('[/PIPES.ROWS/1]','')));
});

test('registry roundtrip retains nested templates, inherited types, conditions and reference policies',()=>{
 const registry=applyConditionTemplates({
  tables:[{id:'objects',name:'常量档案',version:1,aliases:[],owner:'archive',fields:{
   名称:{type:'text',required:true},类型:{type:'type'},关联:{type:'refs'},
   属性:{type:'object',fields:{标志:{type:'boolean',include:{op:'not',arg:{op:'text',source:'user',terms:['隐藏标志']}}}}}
  }}],
  types:[{id:'rule',name:'规则',version:1,aliases:[],parent:null,fields:{效果:{type:'text',include:{op:'any',args:[{op:'cue'},{op:'context'}]}}}},
   {id:'law',name:'制度',version:2,aliases:['法度'],parent:'rule',fields:{条文:{type:'array',items:{type:'object',fields:{编号:{type:'text'},关联:{type:'ref',follow:'identity'}}}}}}
  ]
 }),before=structuredClone(registry),encoded=registryToPipes(registry);
 assert.deepEqual(registryFromPipes(encoded),registry);assert.deepEqual(registry,before);assert.equal(encoded.split('录入：identity|').length-1,1);
 const inherited=registryFromPipes(encoded).types[1];assert.equal(inherited.parent,'rule');assert.equal(inherited.fields.条文.items.fields.关联.follow,'identity');
});

test('compact material keeps mixed rows tabular and preserves empty rows, metadata and generic row payloads',()=>{
 const rows=[row('a','facts',{名称:'事实'}),thin('r')],material=compactMaterial({rows,pending:[],phase:'archive'});
 assert(material.includes('[PIPES.ROWS/1]'));assert.deepEqual(rowsFromPipes(material.slice(material.indexOf('[PIPES.ROWS/1]'))),rows);
 const empty=compactMaterial({rows:[],pending:[]});assert(empty.includes('[PIPES.ROWS/1]'));assert.deepEqual(rowsFromPipes(empty.slice(empty.indexOf('[PIPES.ROWS/1]'))),[]);
 const registry={tables:[],types:[]};assert(compactMaterial({rows:null,registry}).includes('"rows":null'));
 assert.equal(compactMaterial({rows:[{message:'ordinary data'}]}),JSON.stringify({rows:[{message:'ordinary data'}]}));
});

test('repeated mixed identities and full rows reduce transport size without loss',()=>{
 const rows=Array.from({length:300},(_,i)=>i%5===0?row('r'+i,'objects',{名称:'角色'+i,类型:'character',描述:'确认的中性描述'}):thin('r'+i)),encoded=rowsToPipes(rows);
 assert.deepEqual(rowsFromPipes(encoded),rows);assert(encoded.length<JSON.stringify(rows).length*0.75);
});
