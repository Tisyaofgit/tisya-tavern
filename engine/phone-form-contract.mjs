// Author-facing phone fields extend the existing tables. The runtime codec and
// form parser share this contract; no second initialization store is created.
import {digest} from './common.mjs';
export const PHONE_FORM_FIELDS=Object.freeze({
 X_PHONE_WORLD_CONFIG:{active_account_ref:['当前本人账号','REF','X_SOCIAL_ACCOUNTS'],default_account_ref:['默认付款账户','REF','X_FIN_ACCOUNTS'],funding_account_ref:['默认收支账户','REF','X_FIN_ACCOUNTS'],walk_speed:['步行速度','NUMBER'],bike_speed:['骑行速度','NUMBER'],transit_speed:['公共交通速度','NUMBER'],quote_minutes:['报价有效故事分钟','INTEGER'],minimum_shop:['商城起送金额','INTEGER'],minimum_food:['外卖起送金额','INTEGER']},
 X_PHONE_LOAN_RULES:{annualRateBps:['年利率基点','INTEGER'],terms:['可选期数','ARRAY'],periodDays:['每期故事天数','INTEGER'],periodsPerYear:['每年计息期数','INTEGER'],minAmount:['最低本金','INTEGER'],maxAmount:['最高本金','INTEGER']},
 X_FIN_INVESTMENT_PRODUCTS:{minAmount:['最低申购金额','INTEGER'],maxAmount:['最高申购金额','INTEGER'],termMinutes:['期限故事分钟','INTEGER'],allowEarlyRedemption:['允许提前赎回','BOOLEAN']},
 X_FIN_CREDIT_CHARGES:{card_ref:['所属信用卡','REF','X_FIN_CREDIT_CARDS']},
 X_FIN_LOAN_INSTALLMENTS:{loan_ref:['所属贷款合同','REF','X_FIN_LOANS']},
 X_SHOP_OFFERS:{asset_ref:['商品原点','REF','T_STATIC_ITEMS_SKILLS']},
 X_ITEM_SPECS:{asset_ref:['物品原点','REF','T_STATIC_ITEMS_SKILLS']},
 X_SHOP_PRODUCT_DETAILS:{item_ref:['商品原点','REF','T_STATIC_ITEMS_SKILLS'],deliveryPlaceIds:['可配送地点','ARRAY'],availableFrom:['开始售卖故事分钟','INTEGER'],availableUntil:['结束售卖故事分钟','INTEGER'],fulfillment:['交付形式','TEXT'],entitlement:['数字权益定义','JSON'],policy:['售后规则','JSON'],version:['报价版本','INTEGER']},
 X_SHOP_PRODUCT_OPTIONS:{product_ref:['所属商品','REF','T_STATIC_ITEMS_SKILLS'],name:['规格名称','TEXT'],price:['规格附加价','INTEGER']},
 X_SHOP_COUPONS:{name:['优惠券名称','TEXT'],amount:['优惠金额','INTEGER'],minimum:['最低消费金额','INTEGER'],kind:['适用商城或外卖','TEXT'],expiresAt:['到期故事分钟','INTEGER']},
 X_SOCIAL_ACCOUNTS:{following:['关注账号','ARRAY']},
 X_SOCIAL_CONTACTS:{id:['业务编号','TEXT'],name:['名称','TEXT'],personId:['关联人物','REF','T_SYS_ENTITIES'],accountId:['关联账号','REF','X_SOCIAL_ACCOUNTS']},
 X_MEDIA_ALBUMS:{id:['业务编号','TEXT'],name:['相簿名称','TEXT'],ownerId:['所属人物或账号','REF']},
 X_MEDIA_PHOTOS:{asset_ref:['实际媒体原件','REF','T_SYS_MEDIA_ASSETS'],albumId:['所属相簿','REF','X_MEDIA_ALBUMS']},
 X_MEDIA_SONGS:{entitlementProductId:['所需购买商品','REF','T_STATIC_ITEMS_SKILLS'],ownerId:['歌曲所属人物或账号','REF'],visibility:['歌曲可见范围','TEXT'],audience:['授权收听账号','ARRAY'],asset_ref:['实际音源原件','REF','T_SYS_MEDIA_ASSETS'],lyrics:['导入歌词','LONG_TEXT']},
 X_MEDIA_THEME:{preset:['主题','TEXT'],backgroundId:['背景图片','REF','X_MEDIA_PHOTOS'],fit:['图片铺放方式','TEXT'],overlay:['遮罩百分比','NUMBER']},
 X_MEDIA_PLAYBACK:{songId:['当前歌曲','REF','X_MEDIA_SONGS'],position:['实际播放秒数','NUMBER'],volume:['音量','NUMBER'],mode:['播放模式','TEXT'],queue:['播放队列','ARRAY'],history:['实际收听记录','ARRAY']},
 X_CALENDAR_EVENTS:{duration:['时长故事分钟','INTEGER'],reminderMinutes:['提前提醒分钟','INTEGER'],repeat:['重复规则','JSON'],visibility:['可见范围','TEXT'],source:['关联来源','JSON']},
 X_PLACE_MAP_POINTS:{place_ref:['地点原点','REF','T_STATIC_PLACES']}
});
const labels={X_PHONE_LOAN_RULES:'手机贷款规则',X_SHOP_PRODUCT_OPTIONS:'商品规格与附加价',X_SHOP_COUPONS:'已有优惠券',X_MEDIA_ALBUMS:'相簿',X_MEDIA_THEME:'手机主题',X_MEDIA_PLAYBACK:'实际播放状态'};
export const PHONE_FORM_SCHEMAS=Object.entries(PHONE_FORM_FIELDS).map(([id,fields])=>({id,label:labels[id]??id,phone_internal:true,fields:[{key:'row_uuid',label:'记录编号',type:'ID'},{key:'world_ref',label:'所属世界',type:'REF',ref:'T_STATIC_WORLDS'},{key:'owner_ref',label:'所属主体',type:'REF',ref:'T_SYS_ENTITIES'},...Object.entries(fields).map(([key,[label,type,ref]])=>({key,label,type,...(ref?{ref}:{})}))]}));
export function extendPhoneFormCatalog(catalog){
 if(!catalog?.tables?.some(t=>t.id==='X_PHONE_WORLD_CONFIG'))return catalog;
 const copy=structuredClone(catalog);for(const add of PHONE_FORM_SCHEMAS){const old=copy.tables.find(t=>t.id===add.id);if(!old)copy.tables.push(structuredClone(add));else for(const field of add.fields)if(!old.fields.some(f=>f.key===field.key))old.fields.push(structuredClone(field));}return copy;
}
export async function ensurePhoneFormSchema(database){
 const current=await database.read();if(!current)return null;
 const missing=PHONE_FORM_SCHEMAS.filter(t=>!current.state.schema[t.id]||t.fields.some(f=>!current.state.schema[t.id].fields.some(x=>x.key===f.key)));
 if(!missing.length)return current;
 return database.commit({operationId:'phone-form-schema:'+digest(missing),contextKey:current.contextKey,expectedRevision:current.revision,changes:[],schema:missing,source:{kind:'form-schema',purpose:'phone-initialization'}});
}
const refs={
 X_PHONE_WORLD_CONFIG:{currency_ref:'T_STATIC_ITEMS_SKILLS',active_account_ref:'X_SOCIAL_ACCOUNTS',default_account_ref:'X_FIN_ACCOUNTS',funding_account_ref:'X_FIN_ACCOUNTS'},
 X_SHOP_OFFERS:{asset_ref:'T_STATIC_ITEMS_SKILLS',currency_ref:'T_STATIC_ITEMS_SKILLS'},X_ITEM_SPECS:{asset_ref:'T_STATIC_ITEMS_SKILLS'},
 X_FIN_ACCOUNTS:{balance_ref:'T_DYN_CURRENCY_BALANCES'},X_FIN_CREDIT_CARDS:{debt_ref:'T_DYN_CURRENCY_BALANCES'},X_FIN_LOANS:{debt_ref:'T_DYN_CURRENCY_BALANCES',accountId:'X_FIN_ACCOUNTS'},X_FIN_INVESTMENTS:{productId:'X_FIN_INVESTMENT_PRODUCTS'},
 X_SOCIAL_ACCOUNTS:{personId:'T_SYS_ENTITIES'},X_SOCIAL_CONTACTS:{personId:'T_SYS_ENTITIES',accountId:'X_SOCIAL_ACCOUNTS'},
 X_SOCIAL_POSTS:{authorId:'X_SOCIAL_ACCOUNTS',repostOf:'X_SOCIAL_POSTS',songId:'X_MEDIA_SONGS'},X_SOCIAL_COMMENTS:{postId:'X_SOCIAL_POSTS',authorId:'X_SOCIAL_ACCOUNTS'},
 X_MEDIA_ALBUMS:{ownerId:['T_SYS_ENTITIES','X_SOCIAL_ACCOUNTS']},X_MEDIA_PHOTOS:{ownerId:['T_SYS_ENTITIES','X_SOCIAL_ACCOUNTS'],albumId:'X_MEDIA_ALBUMS',asset_ref:'T_SYS_MEDIA_ASSETS'},X_MEDIA_SONGS:{ownerId:['T_SYS_ENTITIES','X_SOCIAL_ACCOUNTS'],asset_ref:'T_SYS_MEDIA_ASSETS',entitlementProductId:'T_STATIC_ITEMS_SKILLS'},X_MEDIA_THEME:{backgroundId:'X_MEDIA_PHOTOS'},X_MEDIA_PLAYBACK:{songId:'X_MEDIA_SONGS'},
 X_PLACE_MAP_POINTS:{place_ref:'T_STATIC_PLACES'},X_CALENDAR_EVENTS:{placeId:'T_STATIC_PLACES',participantId:'X_SOCIAL_CONTACTS'},X_SHOP_PRODUCT_DETAILS:{item_ref:'T_STATIC_ITEMS_SKILLS',placeId:'T_STATIC_PLACES'},X_SHOP_PRODUCT_OPTIONS:{product_ref:'T_STATIC_ITEMS_SKILLS'}
};
export function phoneFormReference(table,key){return refs[table]?.[key]??(key==='world_ref'&&table.startsWith('X_')?'T_STATIC_WORLDS':key==='owner_ref'&&table.startsWith('X_')?'T_SYS_ENTITIES':null);}
// The phone's authored business IDs are distinct from row UUIDs. Only fields
// registered above may resolve such an ID, and only in their declared table and
// world. Ordinary REF fields still require the exact canonical record ID.
export function phoneFormReferenceCandidates(state,{tableId,recordId,field,target,value}){
 const declared=phoneFormReference(tableId,field)??PHONE_FORM_LIST_REFERENCES[tableId]?.[field],targets=Array.isArray(declared)?declared:[declared];
 if(!target?.startsWith('X_')||!targets.includes(target))return null;
 const world=state.tables?.[tableId]?.[recordId]?.values?.world_ref;
 return Object.entries(state.tables?.[target]??{}).filter(([id,row])=>(id===value||row.values?.id===value)&&(!world||!row.values?.world_ref||row.values.world_ref===world)).map(([id])=>id);
}
export const PHONE_FORM_LIST_REFERENCES=Object.freeze({X_SOCIAL_ACCOUNTS:{following:'X_SOCIAL_ACCOUNTS'},X_SOCIAL_POSTS:{mediaIds:'X_MEDIA_PHOTOS',mediaGrants:'X_MEDIA_PHOTOS'},X_MEDIA_SONGS:{audience:'X_SOCIAL_ACCOUNTS'},X_MEDIA_PLAYLISTS:{songIds:'X_MEDIA_SONGS'},X_MEDIA_PLAYBACK:{queue:'X_MEDIA_SONGS',history:'X_MEDIA_SONGS'},X_SHOP_PRODUCT_DETAILS:{deliveryPlaceIds:'T_STATIC_PLACES'}});
export const PHONE_FORM_INTERNAL_FIELDS=new Set(['id','format','sourceDigest','phoneEpoch','settlementOwner','dictionary_key','collection_ref','parent_ref','collection_field','ordinal']);
export function normalizePhoneFormValue(table,key,value){
 const apps={微博:'weibo',钱包:'wallet',商城:'shop',外卖:'food',相册:'album',音乐:'music',地图:'map',日历:'calendar'};
 if(value===null||value===undefined)return value;
 if(table==='X_CALENDAR_EVENTS'&&['repeat','source'].includes(key)&&value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0)return null;
 if(table==='X_PHONE_WORLD_CONFIG'&&key==='apps')return value.map(x=>apps[x]??x);
 if(table==='X_PHONE_WORLD_CONFIG'&&key==='appNames'&&value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[apps[k]??k,v]));
 const map=key==='visibility'?{公开:'public',私密:'private',关注者:'followers'}:table==='X_CALENDAR_EVENTS'&&key==='status'?{个人:'personal',待确认:'invited',已确认:'confirmed',已取消:'cancelled',取消:'cancelled'}:table==='X_MEDIA_PHOTOS'&&key==='source'?{文件:'file',插画:'art'}:table==='X_MEDIA_THEME'&&key==='preset'?{世界:'world',薄雾:'mist',夜色:'night',纸页:'paper',森林:'forest'}:table==='X_MEDIA_THEME'&&key==='fit'?{铺满:'cover',完整显示:'contain'}:table==='X_SHOP_PRODUCT_DETAILS'&&key==='fulfillment'?{实物:'physical',数字:'digital'}:null;
 return map?.[value]??value;
}
