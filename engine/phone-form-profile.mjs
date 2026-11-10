import {clone,fail} from './common.mjs';
import {WorldClock} from './math.mjs';
import {PHONE_WORLD_FORMAT,PHONE_CHARACTER_FORMAT} from '../phone-life-config.mjs';
const required=(yes,message)=>{if(!yes)fail('PHONE_FORM_INITIALIZATION',message);};
const minor=value=>{if(value==null)return null;const n=Math.round(value*100);required(Number.isSafeInteger(n)&&Math.abs(n/100-value)<1e-8,'金额无法按两位小数无损转换');return n;};
const coordinateFields=new Set(['row_uuid','dictionary_key','collection_ref','parent_ref','collection_field','ordinal','world_ref','owner_ref']);
export function phoneProfileFromForms(state,{worldId,entityId,dossierId,calendar=null,recordChildren}={}){
 // A stored value whose state is unknown is not a current fact. Defaults below
 // belong to this read projection; the encoder uses formDefaults to avoid
 // turning them into authored values during an unrelated phone action.
 const formDefaults={},pendingCalendar=[],layoutRecords=new Map(),holdingOrigins={};
 // Canonical values remain in their registered tables. The saved layout holds
 // their coordinates; an extension row is not required to duplicate them.
 const collect=node=>{if(!node||typeof node!=='object')return;if(node.record)layoutRecords.set(node.record.join('#'),node);for(const child of Object.values(node.children??{}))collect(child);for(const child of node.array??[])collect(child);};
 collect(state.tables?.X_PHONE_BINDINGS?.['phone-current']?.values?.layout);
 const available=(row,key)=>Object.hasOwn(row?.values??{},key)&&(!row.states?.[key]||['known','derived'].includes(row.states[key]));
 const clean=row=>Object.fromEntries(Object.entries(row.values).filter(([key])=>!coordinateFields.has(key)&&available(row,key)));
 const values=(table,id)=>{const row=state.tables?.[table]?.[id];return row?Object.fromEntries(Object.entries(row.values).filter(([key])=>available(row,key))):undefined;};
 const projected=(table,rid,row,defaults={})=>{
  const value={...clean(row),...clone(recordChildren?.get(table+'#'+rid)??{})},node=layoutRecords.get(table+'#'+rid);
  for(const [key,field]of Object.entries(node?.fields??{}))if(field.at){const [sourceTable,sourceId,sourceKey]=field.at;if(sourceTable===table&&sourceId===rid&&sourceKey===key)continue;const source=state.tables?.[sourceTable]?.[sourceId];if(available(source,sourceKey)){const raw=source.values[sourceKey];value[key]=field.unit==='minor100'?minor(raw):clone(raw);}}
  for(const [key,fallback]of Object.entries(defaults))if(!Object.hasOwn(value,key)||value[key]===null){value[key]=clone(fallback);formDefaults[JSON.stringify(node?.fields?.[key]?.at??[table,rid,key])]=clone(fallback);}
  return {id:available(row,'id')?row.values.id:rid,...value};
 };
 const worldRow=values('T_STATIC_WORLDS',worldId),entity=values('T_SYS_ENTITIES',entityId);if(!worldRow||!entity)return null;
 const origin=values('M_FIELD_REFERENCES',entity.origin_record_ref);dossierId??=origin?.target_table==='T_CHAR_DOSSIER'?origin.target_row_uuid:entityId;const dossier=values('T_CHAR_DOSSIER',dossierId);if(!dossier?.name||!worldRow.name)return null;
 const order=row=>available(row,'ordinal')&&Number.isSafeInteger(row.values.ordinal)?row.values.ordinal:Number.MAX_SAFE_INTEGER;
 const rows=(table,allOwners=false)=>Object.entries(state.tables?.[table]??{}).filter(([,r])=>(r.values.world_ref==null||r.values.world_ref===worldId)&&(allOwners||r.values.owner_ref==null||r.values.owner_ref===entityId)).sort((a,b)=>order(a[1])-order(b[1]));
 const records=(table,allOwners=false,defaults={})=>rows(table,allOwners).map(([rid,row])=>projected(table,rid,row,defaults));
 const one=table=>{const list=rows(table);required(list.length<=1,'当前人物或世界有多份'+(state.schema?.[table]?.label??table)+'，请明确选择');return list[0]?[list[0][0],{...clean(list[0][1]),...clone(recordChildren?.get(table+'#'+list[0][0])??{})}]:[null,{}];};
 const [,config]=one('X_PHONE_WORLD_CONFIG');
 const balanceRows=Object.entries(state.tables?.T_DYN_CURRENCY_BALANCES??{}).filter(([,r])=>available(r,'owner_ref')&&r.values.owner_ref===entityId&&Object.hasOwn(r.values,'balance'));
 let currencyId=config.currency_ref;if(!currencyId){const ids=[...new Set(balanceRows.map(([,r])=>r.values.currency_ref).filter(Boolean))];required(ids.length<=1,'人物有多币种资产，请选择手机使用的货币原点');currencyId=ids[0]??null;}
 const currencyAsset=values('T_STATIC_ITEMS_SKILLS',currencyId);required(!currencyId||currencyAsset,'所选货币原点不存在');const currency=currencyAsset?.name!=null?{name:currencyAsset.name,symbol:config.currency_symbol??'',minorUnits:2}:null;
 required(config.currency_minor_units==null||config.currency_minor_units===2,'当前手机金额精度仅支持货币小数位2，未改写原资产');
 const balance=(id,field)=>{const row=values('T_DYN_CURRENCY_BALANCES',id);if(!row||row.owner_ref!==entityId||currencyId!=null&&row.currency_ref!==currencyId)fail('PHONE_ACCOUNT_BINDING','账户原点不存在或属于另一人物／币种');if(row[field]==null)formDefaults[JSON.stringify(['T_DYN_CURRENCY_BALANCES',id,field])]=null;return minor(row[field]);};
 const accounts=records('X_FIN_ACCOUNTS',false,{name:null}).map(row=>({...row,balance:row.balance_ref==null?null:balance(row.balance_ref,'balance')}));
 if(!accounts.length)for(const [id,row]of balanceRows.filter(([,r])=>available(r,'currency_ref')&&r.values.currency_ref===currencyId))accounts.push({id,name:available(row,'name')?row.values.name:null,balance_ref:id,balance:balance(id,'balance')});
 const social=rows('X_SOCIAL_ACCOUNTS',true).map(([rid,source])=>{
  const row=projected('X_SOCIAL_ACCOUNTS',rid,source,{name:null,handle:null,personId:null,bio:null,color:null,label:null,following:[],owned:false});
  required(row.personId==null||values('T_SYS_ENTITIES',row.personId),'网络账号关联的人物原点不存在');
  const owned=row.personId===entityId&&row.owned===true;
  // Denying control of an unconfirmed or another person's account must not
  // turn that current-user permission into an authored ownership fact.
  if(row.owned!==owned)formDefaults[JSON.stringify(['X_SOCIAL_ACCOUNTS',rid,'owned'])]=owned;
  return {...row,owned};
 });
 const places=records('X_PLACE_MAP_POINTS',false,{description:'',x:null,y:null,kind:null,known:false}).map(row=>{const id=row.place_ref??row.id,p=values('T_STATIC_PLACES',id);required(p,'地图地点原点不存在');return {...row,id,name:p.name};});
 const entityState=values('T_DYN_ENTITY_STATE',entity.runtime_state_ref??Object.entries(state.tables?.T_DYN_ENTITY_STATE??{}).find(([,r])=>available(r,'entity_id')&&r.values.entity_id===entityId)?.[0]),position=entityState?.location_ref??entity.place_ref??null;
 if(position&&!places.some(p=>p.id===position)){const p=values('T_STATIC_PLACES',position);required(p,'人物当前位置引用不存在');places.push({id:position,name:p.name,description:'',x:null,y:null,kind:null,known:false});}
 const details=records('X_SHOP_PRODUCT_DETAILS'),options=records('X_SHOP_PRODUCT_OPTIONS'),seenProducts=new Set();
 const catalog=rows('X_SHOP_OFFERS').map(([,r])=>r.values).filter(r=>r.currency_ref===currencyId).map(offer=>{
  const itemId=offer.asset_ref,item=values('T_STATIC_ITEMS_SKILLS',itemId);required(item,'商户报价尚未关联规范物品原点');required(!seenProducts.has(itemId),'同一商品有多份报价，请先明确当前商城采用的报价');seenProducts.add(itemId);
  const matched=details.filter(d=>d.item_ref===itemId||d.id===itemId);required(matched.length<=1,'商品扩展重复');const extra=matched[0]??{};
  return {name:item.name,description:item.identified_full_desc??'',price:minor(offer.buy_price),stock:offer.stock??null,kind:['food','食品'].includes(item.category)?'food':'physical',shopId:offer.merchant_ref??null,placeId:null,image:'',tags:[],...extra,id:itemId,options:options.filter(o=>o.product_ref===itemId)};
 });
 const loanRow=one('X_PHONE_LOAN_RULES')[1],loan=Object.keys(loanRow).length?loanRow:null;
 const investments=records('X_FIN_INVESTMENT_PRODUCTS'),speeds=Object.fromEntries([['walk','walk_speed'],['bike','bike_speed'],['transit','transit_speed']].filter(([,key])=>config[key]!=null).map(([key,field])=>[key,config[field]]));
 const world={format:PHONE_WORLD_FORMAT,id:worldId,name:worldRow.name,apps:clone(config.apps??[]),appNames:clone(config.appNames??{}),theme:Object.fromEntries(['background','panel','text','accent','radius'].filter(key=>config['theme_'+key]!=null).map(key=>[key,config['theme_'+key]])),phoneEpoch:null,settlementOwner:'tables',currency,economy:{loan,investments,deliveryFees:{shop:config.delivery_shop??null,food:config.delivery_food??null},...(config.quote_minutes!=null?{quoteMinutes:config.quote_minutes}:{}),minimumOrders:{...(config.minimum_shop!=null?{shop:config.minimum_shop}:{}),...(config.minimum_food!=null?{food:config.minimum_food}:{})}},catalog,places,travel:Object.keys(speeds).length?{speeds}:config.travel??null};
 const children=(table,parent,field,explicit)=>rows(table).filter(([,r])=>r.values[explicit]===parent||r.values.parent_ref===parent&&r.values.collection_field===field).sort((a,b)=>(a[1].values.ordinal??0)-(b[1].values.ordinal??0)).map(([rid,r])=>({id:r.values.id??rid,...clean(r)}));
 const [cardId,cardRow]=one('X_FIN_CREDIT_CARDS');let card=null;if(cardId){const charges=children('X_FIN_CREDIT_CHARGES',cardId,'charges','card_ref');card={enabled:true,refundBalance:0,...cardRow,id:cardRow.id??cardId,used:cardRow.debt_ref?balance(cardRow.debt_ref,'debt'):charges.reduce((n,c)=>n+c.remaining,0),charges,statements:[]};}
 const loans=rows('X_FIN_LOANS').map(([rid,r])=>{const row=clean(r),installments=children('X_FIN_LOAN_INSTALLMENTS',rid,'installments','loan_ref').map(x=>({...x,amount:x.principal+x.interest}));return {...row,id:row.id??rid,remainingPrincipal:balance(row.debt_ref,'debt'),installments};});
 const positions=records('X_FIN_INVESTMENTS');
 const asset=(row,kind)=>{if(!row.asset_ref)return row;const a=values('T_SYS_MEDIA_ASSETS',row.asset_ref);required(a&&a.asset_locator,'所选实际媒体原件尚未登记文件定位');if(a.entity_ref)required(a.entity_ref===entityId,'所选媒体原件属于另一人物');return {...row,[kind==='audio'?'audioId':'assetId']:a.asset_locator};};
 const photos=records('X_MEDIA_PHOTOS',false,{name:null,ownerId:entityId,visibility:'private',source:'art',art:'',mime:''}).map(row=>asset(row,'photo'));
 const songs=records('X_MEDIA_SONGS',false,{title:null,ownerId:entityId,visibility:'private',audience:[],artist:null,album:null,cover:null,audioId:null,duration:null}).map(row=>asset(row,'audio'));
 const eventRows=[];
 for(const [rid,sourceRow]of rows('X_CALENDAR_EVENTS')){
  const row=projected('X_CALENDAR_EVENTS',rid,sourceRow,{title:null,placeId:null,participantId:null,status:'personal',notified:false});
  if(row.at!=null)required(Number.isSafeInteger(row.at)&&row.at>=0,'日程须填写非负故事分钟');
  const missing=[...(row.at==null?['故事时点']:[]),...(!calendar?['世界时间']:[])];
  if(missing.length){pendingCalendar.push({id:row.id,title:row.title,missing,reference:{tableId:'X_CALENDAR_EVENTS',recordId:rid}});continue;}
  const time=new WorldClock(calendar);time.advance(row.at);eventRows.push({...row,day:time.c.day,minute:time.c.hour*time.c.hour_minutes+time.c.minute});
 }
 const listRefs=value=>(Array.isArray(value)?value:[value]).filter(Boolean).flatMap(id=>{const r=values('M_LIST_VALUES',id);return r?.target_row_uuid?[r.target_row_uuid]:[id];});
 const holdingDetails=rows('X_HOLDING_DETAILS').map(([rid,row])=>({rid,node:layoutRecords.get('X_HOLDING_DETAILS#'+rid),value:projected('X_HOLDING_DETAILS',rid,row)}));
 const inventory=Object.entries(state.tables?.T_DYN_HOLDINGS_INVENTORY??{}).filter(([,r])=>listRefs(r.values.owner_ref).includes(entityId)).map(([rid,r])=>{const item=values('T_STATIC_ITEMS_SKILLS',r.values.item_ref),details=holdingDetails.filter(x=>x.node?.fields?.qty?.at?.[0]==='T_DYN_HOLDINGS_INVENTORY'&&x.node.fields.qty.at[1]===rid);required(details.length<=1,'持有物原点对应了重复手机记录');const detail=details[0]?.value??{},id=detail.id??rid;holdingOrigins[id]=rid;return {consumed:0,storage:'carried',...detail,id,productId:r.values.item_ref,name:r.values.instance_name??item?.name??'',kind:detail.kind??(['food','食品'].includes(item?.category)?'food':'physical'),qty:r.values.quantity,ownerId:entityId,holderId:listRefs(r.values.holder_ref)[0]??entityId,placeId:r.values.location_ref??position};});
 const [themeId,theme]=one('X_MEDIA_THEME'),[playbackId,playback]=one('X_MEDIA_PLAYBACK');
 const character={format:PHONE_CHARACTER_FORMAT,id:entityId,name:dossier.name,accounts:social,activeAccountId:config.active_account_ref??social.find(a=>a.owned)?.id??null,wallet:{accounts,defaultAccountId:config.default_account_ref??null,fundingAccountId:config.funding_account_ref??null,card,loans,investments:positions},contacts:records('X_SOCIAL_CONTACTS'),posts:records('X_SOCIAL_POSTS').map(row=>({mediaIds:[],mediaGrants:[],repostOf:null,songId:null,likesBase:null,...row})),photos,songs,playlists:records('X_MEDIA_PLAYLISTS'),calendar:eventRows,position,inventory,comments:records('X_SOCIAL_COMMENTS'),mediaExtras:{albums:records('X_MEDIA_ALBUMS').map(row=>({ownerId:entityId,...row})),...(themeId?{theme}:{}),...(playbackId?{playback}:{})},commerceExtras:{coupons:records('X_SHOP_COUPONS').map(row=>({ownerId:entityId,...row}))}};
 return {database:true,worldId,entityId,world,character,calendar,formDefaults,holdingOrigins,formReadiness:{pendingCalendar},binding:{world:{database:true,worldId},character:{database:true,entityId,dossierId},subjectId:entityId}};
}
