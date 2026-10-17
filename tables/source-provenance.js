import {digest} from './books.js';
const KEY='tisyaSourceProvenance';
const identity=m=>({candidate:m.swipe_id??0,name:m.name??'',text:String(m.mes??'')});
export async function sourceKind(message){
 const map=message.extra?.[KEY];if(!map)return 'legacy';
 if(map.version!==1||!map.candidates||typeof map.candidates!=='object')throw Error('回复来源标记损坏，请核对后再归档');
 const row=map.candidates[await digest(identity(message))];
 if(!row)return 'unknown';
 if(!['story','utility'].includes(row.kind))throw Error('回复来源类型无效');return row.kind;
}
export async function recordSourceKind(message,{kind,mode},guard=()=>{}){
 if(message.is_user||message.is_system||message.role==='tool')return;
 if(!['story','utility'].includes(kind))throw Error('不能保存未知的回复来源类型');
 const before=JSON.stringify(identity(message)),hash=await digest(identity(message));guard();
 if(before!==JSON.stringify(identity(message)))throw Error('回复候选已变化，来源标记未保存');
 const old=message.extra?.[KEY];if(old&&old.version!==1)throw Error('回复来源标记版本不兼容');
 message.extra??={};message.extra[KEY]={version:1,candidates:{...(old?.candidates??{}),[hash]:{kind,mode}}};
}
