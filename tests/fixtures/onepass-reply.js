import {fullReply} from './six-reply.js';
import {defaultRegistry} from '../../tables/schema.js';
export function onePassReply({basis='test-basis',vars=[],memory=[],world=null,focus=[],pending=[],coverage=null}={}){
 const enc=v=>JSON.stringify(v).replaceAll('<','\\u003c');
 const changed=new Set([...vars,...memory].map(x=>x.table));
 return fullReply.replace('<reply>','<reply id="tisya-onepass-1">\n<task format="pipes">\n偏好：明确要求|本轮|用户要求延续当前互动|以具体邀请推进\n</task>')
 .replace('<extra>','<status format="json">'+enc(world??{from:null,to:null,events:[],focus,pending:['剧情时间尚未明确']})+'</status>\n<extra>')
 .replace('</extra>','</extra>\n<vars format="json">'+enc({changes:vars,pending})+'</vars>\n<archive format="json">'+enc({basis,coverage:coverage??defaultRegistry().tables.map(t=>({table:t.id,status:changed.has(t.id)?'updated':'unchanged',reason:changed.has(t.id)?'本轮正文发生变化':'本轮无有依据的新变化'})),pending:[]})+'</archive>\n<memory format="json">'+enc({changes:memory,pending:[]})+'</memory>');
}
