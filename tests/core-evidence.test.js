import test from 'node:test';
import assert from 'node:assert/strict';
import {hasCoreEvidence,validateBundle} from '../tables/core-assets.js';
import {formatSimpleSheet,parseSimpleSheet} from '../tables/simple-sheet.js';

const raw='第一行“原话”\r\n第二行包含 \\ 路径\n  末行空白  ';
const row={id:'private-metadata-id',rev:19,table:'objects',access:{readers:['metadata-reader'],knowers:[]},values:{名称:'甲',描述:raw,另一个字段:'独立文字',嵌套:{原句:'嵌套原文'},数字:123}};
test('core evidence matches original multiline quote and backslash text after sheet decoding',()=>{
 const decoded=parseSimpleSheet(formatSimpleSheet(row));assert.deepEqual(decoded,row);
 for(const evidence of [raw,'第二行包含 \\ 路径','嵌套原文','独立文字'])assert(hasCoreEvidence([decoded],evidence));
 for(const evidence of ['描述','private-metadata-id','metadata-reader','123','第一行“原话”\\r\\n第二行','末行空白  \n独立文字','甲独立文字'])assert.equal(hasCoreEvidence([decoded],evidence),false,evidence);
 assert.equal(hasCoreEvidence([decoded],'用户追加原话','用户追加原话'),true);
 assert.equal(hasCoreEvidence([decoded],'独立文字\n用户追加原话','用户追加原话'),false);
});
test('bundle traits growth and links require continuous text from their own authorized source',()=>{
 const other={...structuredClone(row),id:'other',values:{名称:'乙',描述:'另一个人的原文'}};
 const growth={id:'g',table:'growth',values:{内容:'成长原文\n仍保留换行'}};
 const link={id:'l',table:'relations',values:{描述:'联系原文“原句”\\尾'}};
 const source={objects:[{row,growth:[growth]},{row:other,growth:[]}],links:[{row:link,members:[row.id,other.id]}],instructions:''};
 const item=evidence=>({name:'核心',value:'有来源的表达',evidence});
 const proposal={name:'组',members:[{sourceObject:row.id,name:'甲',traits:[item(raw)],growth:[item(growth.values.内容)]},{sourceObject:other.id,name:'乙',traits:[item(other.values.描述)],growth:[]}],links:[{sourceRow:link.id,members:[row.id,other.id],...item(link.values.描述)}]};
 const accepted=validateBundle(parseSimpleSheet(formatSimpleSheet(proposal)),source,{assignIds:true});assert.equal(accepted.members[0].traits[0].evidence,raw);
 for(const mutate of [p=>p.members[0].traits[0].evidence=other.values.描述,p=>p.members[0].growth[0].evidence=raw,p=>p.links[0].evidence=row.id,p=>p.members[0].traits[0].evidence='描述']){const p=structuredClone(proposal);mutate(p);assert.throws(()=>validateBundle(p,source,{assignIds:true}),/连续原文/);}
});
