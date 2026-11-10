import {clone,fail} from './common.mjs';
import {WorldClock} from './math.mjs';
import {PHONE_WORLD_FORMAT,PHONE_CHARACTER_FORMAT} from '../phone-life-config.mjs';
const required=(yes,message)=>{if(!yes)fail('PHONE_FORM_INITIALIZATION',message);};
const minor=value=>{if(value==null)return null;const n=Math.round(value*100);required(Number.isSafeInteger(n)&&Math.abs(n/100-value)<1e-8,'金额无法按两位小数无损转换');return n;};
const coordinateFields=new Set(['row_uuid','dictionary_key','collection_ref','parent_ref','collection_field','ordinal','world_ref','owner_ref']);
export function phoneProfileFromForms(state,{worldId,entityId,dossierId,calendar=null}={}){
 const values=(table,id)=>state.tables?.[table]?.[id]?.values;
 const worldRow=values('T_STATIC_WORLDS',worldId),entity=values('T_SYS_ENTITIES',entityId);if(!worldRow||!entity)return null;
 const origin=values('M_FIELD_REFERENCES',entity.origin_record_ref);dossierId??=origin?.target_table==='T_CHAR_DOSSIER'?origin.target_row_uuid:entityId;const dossier=values('T_CHAR_DOSSIER',dossierId);if(!dossier?.name||!worldRow.name)return null;
 const rows=table=>Object.entries(state.tables?.[table]??{}).filter(([,r])=>(r.values.world_ref==null||r.values.world_ref===worldId)&&(r.values.owner_ref==null||r.values.owner_ref===entityId));
 const clean=row=>Object.fromEntries(Object.entries(row.values).filter(([key])=>!coordinateFields.has(key)&&(!row.states?.[key]||['known','derived'].includes(row.states[key]))));
 const records=table=>rows(table).map(([rid,row])=>({id:row.values.id??rid,...clean(row)}));
 const one=table=>{const list=rows(table);required(list.length<=1,'当前人物或世界有多份'+(state.schema?.[table]?.label??table)+'，请明确选择');return list[0]?[list[0][0],clean(list[0][1])]:[null,{}];};
 const [,config]=one('X_PHONE_WORLD_CONFIG');
 const balanceRows=Object.entries(state.tables?.T_DYN_CURRENCY_BALANCES??{}).filter(([,r])=>r.values.owner_ref===entityId&&Object.hasOwn(r.values,'balance'));
 let currencyId=config.currency_ref;if(!currencyId){const ids=[...new Set(balanceRows.map(([,r])=>r.values.currency_ref).filter(Boolean))];required(ids.length<=1,'人物有多币种资产，请选择手机使用的货币原点');currencyId=ids[0]??null;}
 const currencyAsset=values('T_STATIC_ITEMS_SKILLS',currencyId),currency=currencyAsset?{name:currencyAsset.name,symbol:config.currency_symbol??'',minorUnits:2}:null;
 required(config.currency_minor_units==null||config.currency_minor_units===2,'当前手机金额精度仅支持货币小数位2，未改写原资产');
 const balance=(id,field)=>{const row=values('T_DYN_CURRENCY_BALANCES',id);if(!row||row.owner_ref!==entityId||currencyId!=null&&row.currency_ref!==currencyId)fail('PHONE_ACCOUNT_BINDING','账户原点不存在或属于另一人物／币种');return minor(row[field]);};
 const accounts=records('X_FIN_ACCOUNTS').map(row=>({...row,balance:balance(row.balance_ref,'balance')}));
 if(!accounts.length)for(const [id,row]of balanceRows.filter(([,r])=>r.values.currency_ref===currencyId))accounts.push({id,name:row.values.name??id,balance_ref:id,balance:minor(row.values.balance)});
 const social=records('X_SOCIAL_ACCOUNTS').map(row=>({handle:'',personId:null,owned:false,bio:'',color:null,label:'',following:[],...row}));
 const places=records('X_PLACE_MAP_POINTS').map(row=>{const id=row.place_ref??row.id,p=values('T_STATIC_PLACES',id);required(p,'地图地点原点不存在');return {description:'',x:null,y:null,kind:null,known:false,...row,id,name:p.name};});
 const entityState=entity.runtime_state_ref?values('T_DYN_ENTITY_STATE',entity.runtime_state_ref):Object.values(state.tables?.T_DYN_ENTITY_STATE??{}).find(r=>r.values.entity_id===entityId)?.values,position=entityState?.location_ref??entity.place_ref??null;
 if(position&&!places.some(p=>p.id===position)){const p=values('T_STATIC_PLACES',position);required(p,'人物当前位置引用不存在');places.push({id:position,name:p.name,description:'',x:null,y:null,kind:null,known:false});}
 const details=records('X_SHOP_PRODUCT_DETAILS'),options=records('X_SHOP_PRODUCT_OPTIONS'),seenProducts=new Set();
 const catalog=rows('X_SHOP_OFFERS').map(([,r])=>r.values).filter(r=>r.currency_ref===currencyId).map(offer=>{
  const itemId=offer.asset_ref??(values('T_STATIC_ITEMS_SKILLS',offer.item_ref)?offer.item_ref:values('X_ITEM_SPECS',offer.item_ref)?.asset_ref),item=values('T_STATIC_ITEMS_SKILLS',itemId);required(item,'商户报价尚未关联规范物品原点');required(!seenProducts.has(itemId),'同一商品有多份报价，请先明确当前商城采用的报价');seenProducts.add(itemId);
  const matched=details.filter(d=>d.item_ref===itemId||d.id===itemId);required(matched.length<=1,'商品扩展重复');const extra=matched[0]??{};
  return {id:itemId,name:item.name,description:item.identified_full_desc??'',price:minor(offer.buy_price),stock:offer.stock??null,kind:['food','食品'].includes(item.category)?'food':'physical',shopId:offer.merchant_ref??null,placeId:null,image:'',tags:[],...extra,id:itemId,options:options.filter(o=>o.product_ref===itemId)};
 });
 const oldLoan=one('X_PHONE_LIFE_WORLD_ECONOMY_LOAN')[1],newLoan=one('X_PHONE_LOAN_RULES')[1];required(!Object.keys(oldLoan).length||!Object.keys(newLoan).length,'旧贷款机制和新表单规则同时存在，请先核对归属');const loan=Object.keys(newLoan).length?newLoan:Object.keys(oldLoan).length?oldLoan:null;
 const investments=records('X_FIN_INVESTMENT_PRODUCTS'),speeds=Object.fromEntries([['walk','walk_speed'],['bike','bike_speed'],['transit','transit_speed']].filter(([,key])=>config[key]!=null).map(([key,field])=>[key,config[field]]));
 const world={format:PHONE_WORLD_FORMAT,id:worldId,name:worldRow.name,apps:clone(config.apps??[]),appNames:clone(config.appNames??{}),theme:Object.fromEntries(['background','panel','text','accent','radius'].filter(key=>config['theme_'+key]!=null).map(key=>[key,config['theme_'+key]])),phoneEpoch:null,settlementOwner:'tables',currency,economy:{loan,investments,deliveryFees:{shop:config.delivery_shop??null,food:config.delivery_food??null},...(config.quote_minutes!=null?{quoteMinutes:config.quote_minutes}:{}),minimumOrders:{...(config.minimum_shop!=null?{shop:config.minimum_shop}:{}),...(config.minimum_food!=null?{food:config.minimum_food}:{})}},catalog,places,travel:Object.keys(speeds).length?{speeds}:config.travel??null};
 const children=(table,parent,field,explicit)=>rows(table).filter(([,r])=>r.values[explicit]===parent||r.values.parent_ref===parent&&r.values.collection_field===field).sort((a,b)=>(a[1].values.ordinal??0)-(b[1].values.ordinal??0)).map(([rid,r])=>({id:r.values.id??rid,...clean(r)}));
 const [cardId,cardRow]=one('X_FIN_CREDIT_CARDS');let card=null;if(cardId){const charges=children('X_FIN_CREDIT_CHARGES',cardId,'charges','card_ref');card={enabled:true,refundBalance:0,...cardRow,id:cardRow.id??cardId,used:cardRow.debt_ref?balance(cardRow.debt_ref,'debt'):charges.reduce((n,c)=>n+c.remaining,0),charges,statements:[]};}
 const loans=rows('X_FIN_LOANS').map(([rid,r])=>{const row=clean(r),installments=children('X_FIN_LOAN_INSTALLMENTS',rid,'installments','loan_ref').map(x=>({...x,amount:x.principal+x.interest}));return {...row,id:row.id??rid,remainingPrincipal:balance(row.debt_ref,'debt'),installments};});
 const positions=records('X_FIN_INVESTMENTS');
 const asset=(row,kind)=>{if(!row.asset_ref)return row;const a=values('T_SYS_MEDIA_ASSETS',row.asset_ref);required(a&&a.asset_locator,'所选实际媒体原件尚未登记文件定位');if(a.entity_ref)required(a.entity_ref===entityId,'所选媒体原件属于另一人物');return {...row,[kind==='audio'?'audioId':'assetId']:a.asset_locator};};
 const photos=records('X_MEDIA_PHOTOS').map(row=>asset({ownerId:entityId,visibility:'private',source:'art',art:'',mime:'',...row},'photo'));
 const songs=records('X_MEDIA_SONGS').map(row=>asset({artist:'',album:'',cover:'',audioId:null,duration:null,...row},'audio'));
 const eventRows=records('X_CALENDAR_EVENTS').map(row=>{required(Number.isSafeInteger(row.at)&&row.at>=0,'日程须填写非负故事分钟');required(calendar,'有日程时须先确定同一世界历法和当前时刻');const time=new WorldClock(calendar);time.advance(row.at);return {placeId:null,participantId:null,status:'personal',notified:false,...row,day:time.c.day,minute:time.c.hour*time.c.hour_minutes+time.c.minute};});
 const listRefs=value=>(Array.isArray(value)?value:[value]).filter(Boolean).flatMap(id=>{const r=values('M_LIST_VALUES',id);return r?.target_row_uuid?[r.target_row_uuid]:[id];});
 const inventory=Object.entries(state.tables?.T_DYN_HOLDINGS_INVENTORY??{}).filter(([,r])=>listRefs(r.values.owner_ref).includes(entityId)).map(([id,r])=>{const item=values('T_STATIC_ITEMS_SKILLS',r.values.item_ref);return {id,productId:r.values.item_ref,name:r.values.instance_name??item?.name??'',kind:['food','食品'].includes(item?.category)?'food':'physical',qty:r.values.quantity,consumed:0,ownerId:entityId,holderId:listRefs(r.values.holder_ref)[0]??entityId,placeId:r.values.location_ref??position,storage:'carried'};});
 const [themeId,theme]=one('X_MEDIA_THEME'),[playbackId,playback]=one('X_MEDIA_PLAYBACK');
 const character={format:PHONE_CHARACTER_FORMAT,id:entityId,name:dossier.name,accounts:social,activeAccountId:config.active_account_ref??social.find(a=>a.owned)?.id??null,wallet:{accounts,defaultAccountId:config.default_account_ref??null,fundingAccountId:config.funding_account_ref??null,card,loans,investments:positions},contacts:records('X_SOCIAL_CONTACTS'),posts:records('X_SOCIAL_POSTS').map(row=>({mediaIds:[],mediaGrants:[],repostOf:null,songId:null,likesBase:null,...row})),photos,songs,playlists:records('X_MEDIA_PLAYLISTS'),calendar:eventRows,position,inventory,comments:records('X_SOCIAL_COMMENTS'),mediaExtras:{albums:records('X_MEDIA_ALBUMS').map(row=>({ownerId:entityId,...row})),...(themeId?{theme}:{}),...(playbackId?{playback}:{})},commerceExtras:{coupons:records('X_SHOP_COUPONS').map(row=>({ownerId:entityId,...row}))}};
 return {database:true,worldId,entityId,world,character,calendar,binding:{world:{book:'@forms/T_STATIC_WORLDS',uid:worldId},character:{book:'@forms/T_CHAR_DOSSIER',uid:dossierId},subjectId:entityId}};
}
