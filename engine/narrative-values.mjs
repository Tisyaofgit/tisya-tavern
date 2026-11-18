// Presentation only: canonical values, IDs and form-writing contracts stay intact.
const labels={hour:'时',minute:'分',month:'月',day:'日',season:'季节',platform:'平台',pinned:'置顶',unread:'未读条数',muted:'免打扰',draft:'未发送草稿',draft_sent:'草稿已发送',read:'已读',source:'来源',date:'日期',kind:'类别',returnDays:'可退货天数',openedReturn:'已开封可退',coordinateUnit:'坐标单位',speedUnit:'速度单位'};
const visibleValues={public:'公开',private:'私密',contacts:'联系人可见',followers:'关注者可见',confirmed:'已确认',personal:'个人安排',invited:'待回应邀请',cancelled:'已取消',active:'有效',redeemed:'已赎回',identified:'已鉴定',unidentified:'未鉴定',partial:'部分鉴定',night:'夜色',world:'跟随世界',mist:'薄雾',paper:'纸页',forest:'森林',cover:'铺满',contain:'完整显示',single:'单曲循环',loop:'列表循环',shuffle:'随机播放',physical:'实物',digital:'数字内容',private_chat:'私聊',group_chat:'群聊',art:'插画内容设定',file:'媒体文件',day:'精确到日',minute:'精确到分钟',year:'精确到年'};
const displayKeys=new Set(['visibility','status','identified_status','preset','fit','mode','fulfillment','kind','source','birth_precision','time_precision']);
const appNames={contacts:'通讯录',social:'社交',photos:'相册',weibo:'微博',wallet:'钱包',shop:'商城',food:'外卖',album:'相册',music:'音乐',map:'地图',calendar:'日历'};
export function narrativeValue(value){
 if(value==null)return '无';
 if(typeof value==='boolean')return value?'是':'否';
 if(Array.isArray(value))return value.map(narrativeValue).join('、')||'无';
 if(typeof value==='object')return Object.entries(value).map(([key,v])=>(labels[key]??key)+'：'+narrativeValue(v)).join('；')||'无';
 return String(value);
}
export function narrativeFieldValue(table,key,value,{epoch}={}){
 if(table==='T_DYN_SCENE_SPACE'&&value&&typeof value==='object'&&!Array.isArray(value)){
  if(key==='time_of_day'&&Number.isInteger(value.hour)&&Number.isInteger(value.minute)&&Object.keys(value).every(k=>['hour','minute'].includes(k)))return String(value.hour).padStart(2,'0')+':'+String(value.minute).padStart(2,'0');
  if(key==='date_day'&&Object.keys(value).every(k=>['month','day'].includes(k)))return (value.month==null?'':value.month+'月')+(value.day==null?'':value.day+'日');
  if(key==='season_cycle'&&Object.keys(value).length===1&&('season' in value||'季节' in value))return narrativeValue(value.season??value.季节);
 }
 if(table==='X_PHONE_WORLD_CONFIG'&&key==='apps'&&Array.isArray(value))return value.map(v=>appNames[v]??v).join('、');
 if(table==='X_PHONE_WORLD_CONFIG'&&key==='appNames'&&value&&typeof value==='object')return Object.entries(value).map(([k,v])=>appNames[k]===v?v:(appNames[k]??k)+'：'+v).join('、');
 if(table.startsWith('X_')&&['createdAt','settledAt','redeemedAt','at','expiresAt'].includes(key)&&typeof value==='number'){
  if(typeof epoch==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(epoch)){
   const date=new Date(Date.parse(epoch.slice(0,19)+'Z')+value*60000);
   if(Number.isFinite(date.getTime()))return date.toISOString().slice(0,16).replace('T',' ');
  }
  return value+' 故事分钟';
 }
 if(table==='X_MEDIA_SONGS'&&key==='duration'&&typeof value==='number')return Math.floor(value/60)+'分'+value%60+'秒';
 if(table==='X_MEDIA_PLAYBACK'&&key==='volume'&&typeof value==='number')return value*100+'%';
 if(table==='X_MEDIA_PLAYBACK'&&key==='position'&&typeof value==='number')return value+'秒';
 if(displayKeys.has(key)&&typeof value==='string')return visibleValues[value]??value;
 return narrativeValue(value);
}
export const labeledNarrativeField=({label,key,text})=>(label||key)+'：'+String(text).replace(/\r?\n/g,'\n  ');
