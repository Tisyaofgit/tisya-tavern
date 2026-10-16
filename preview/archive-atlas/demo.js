import {defaultRegistry,copy} from '../../tables/schema.js';
import {FOUNDATION_DEFINITIONS} from '../../tables/foundation-definitions.js';
export function demoArchive(){
 const registry=defaultRegistry();for(const c of FOUNDATION_DEFINITIONS.schemaChanges){const table=(c.kind==='type'?registry.types:registry.tables).find(t=>t.id===c.id);if(table)table.fields={...table.fields,...copy(c.fields)};}
 const access={readers:['读者'],knowers:[]};
 const row=(id,type,name,description,tags,attributes={})=>({id,table:'objects',rev:1,source:null,access,values:{名称:name,类型:type,描述:description,标签:tags,属性:attributes}});
 const rows=[
 row('fanglu','character','方鹿','一位总把难活揽到自己身上的修船匠。',['修船匠','青溪渡'],{人物核心:{性格核心标签:['认真负责','固执自揽','知错公开纠正'],欲望双螺旋:[],核心矛盾:'坚持自己全做、迟迟不肯求助，与工期和承诺冲突；即使因此少收工钱，下一次难活来了仍下意识揽过去。'},面具层:{面具呈现:'',面具作用:'',面具裂隙:''},身份细目:{名称:'方鹿'},生活:{长期目标:'造一条能安全穿过北峡暗流的小船；目前尚未成功。'}}),
 row('ahe','character','阿禾','白沙滩救援中的同行者，也是方鹿信赖的老朋友。',['渡工','老朋友']),
 row('sheny','character','沈砚〔船匠〕','八年前收方鹿为徒，让他为自己选错的木料负责。',['船匠','师父']),
 row('guhuai','character','顾槐','负责渡船验收，与方鹿已有数年的固定协作。',['验船人']),
 row('qingxi','place','青溪渡','修船、验船与渡工船歌交汇的地方。',['渡口']),
 row('beixia','place','北峡','方鹿反复绘在船图上的暗流峡谷。',['暗流','造船目标']),
 row('bell','item','旧铜铃','船匠师父传下的旧物，如今佩在方鹿腰间。',['随身物','师承']),
 row('listen','rule','听木辨裂','轻敲木料、靠耳听回声，在可疑位置做记号。',['技艺','木料'])
 ];
 // Demo values are sourced from the supplied Fanglu material; no invented second
 // desire or mask. A blank is visibly pending, never an automatic diagnosis.
 rows[0].values.关联=['sheny','qingxi','beixia','bell','listen'];
 rows[0].values.属性.身份细目={出身地:['qingxi'],生命阶段:'成年'};
 rows[0].values.属性.本领={定义引用:['listen']};
 rows.push({id:'r-fang-ahe',table:'relations',rev:1,source:null,access,values:{名称:'洪水之后的老朋友',主体:'fanglu',对象:'ahe',证据:'从白沙滩救援和此后多次合作中形成；不因交情放行不安全的船。'}});
 rows.push({id:'e-flood',table:'events',rev:1,source:null,access,values:{名称:'白沙滩洪水救援',时间:'三年前',地点:'白沙滩',经过:'方鹿留下加固船板，让阿禾先带乘客撤离。乘客全部脱险，方鹿搬木料时伤了右腕。',参与者:['fanglu','ahe'],影响:'右腕留下连续用力就疼痛的旧伤。'}});
 rows.push({id:'e-late',table:'events',rev:1,source:null,access,values:{名称:'误期交货',时间:'去年秋天',经过:'顾槐劝他把难修的船板分给别家，他坚持自己全做，迟迟不肯求助，最终误期并少收工钱。',参与者:['fanglu','guhuai'],影响:'如今难活来了仍会下意识揽过去。'}});
 rows.push({id:'secret',table:'facts',rev:1,source:null,access:{readers:[],knowers:['fanglu']},values:{名称:'铜铃夹层欠款凭据',命题:'方鹿曾替不愿留名的人偿债而借钱，欠款至今未还清。',对象:['fanglu','bell']}});
 const originRows=copy(rows.filter(r=>r.table==='objects'));const savedRows=copy(rows);savedRows.find(r=>r.id==='fanglu').values.描述='清晨，方鹿在青溪渡收拾好修船工具。';
 return {registry,rows,originRows,savedRows,world:'青溪渡',branch:'渡口清晨',cores:[{id:'core-fanglu',name:'方鹿',version:1,traits:[{name:'性格底色',value:'认真负责；固执自揽；知错公开纠正'},{name:'价值取舍',value:'乘客安全优先，不为亲近者掩盖危险。'},{name:'欲望双螺旋',value:'？'},{name:'面具层',value:'？'}]}],saves:[{id:'save-dawn',name:'渡口清晨',time:'开局',note:'当前分支的起点',objects:8}],demo:true};
}
