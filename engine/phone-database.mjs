import {PHONE_FORM_SCHEMAS} from './phone-form-contract.mjs';
import {phoneProfileFromForms} from './phone-form-profile.mjs';
// Phone views are hydrated from the forms database. The layout contains only
// coordinates and shape; every current business scalar lives in a typed row.
// Seed/envelopes/frame snapshots are immutable history, never current authority.
import {clone,digest,stable,stableId,fail} from './common.mjs';
import {WorldClock} from './math.mjs';
import {worldClockConfiguration} from './world-clock.mjs';
import {importPhone,exportPhone,attachPhoneDatabaseSnapshot,mergePhoneHistory} from '../phone-core.mjs';
import {Runtime} from './runtime.mjs';
import {PRESENTATION_SCHEMAS} from '../extension-presentation.mjs';
import {PHONE_WORLD_FORMAT,PHONE_CHARACTER_FORMAT} from '../phone-life-config.mjs';
import {EXTENSION_PREFERENCE_SCHEMA} from '../extension-preferences.mjs';

export const PHONE_BINDING_TABLE='X_PHONE_BINDINGS';
export const phoneDatabaseRecordId=path=>stableId('phone:'+JSON.stringify(Array.isArray(path)?path:String(path).split('/')));
const currentId='phone-current';
const FIELD_LABELS={"id": "业务编号", "name": "名称", "title": "标题", "text": "正文", "description": "说明", "owner_ref": "所属主体", "world_ref": "所属世界", "parent_ref": "上级记录", "collection_ref": "所属集合", "collection_field": "关联栏目", "ordinal": "显示顺序", "dictionary_key": "稳定索引", "balance_ref": "余额原点", "debt_ref": "负债原点", "amount": "金额（最小单位）", "principal": "本金（最小单位）", "remainingPrincipal": "剩余本金", "interest": "利息（最小单位）", "paid": "已还金额", "refunded": "已退款金额", "prepaid": "预付金额", "total": "合计金额", "subtotal": "商品小计", "totalPayable": "总应还金额", "totalInterest": "总利息", "monthlyPayment": "首期应还金额", "price": "单价（最小单位）", "qty": "数量", "stock": "库存", "status": "当前状态", "type": "业务类型", "kind": "类别", "accountId": "账户编号", "to": "收款对象", "enabled": "启用", "owned": "本人账号", "limit": "信用额度", "refundBalance": "溢缴款", "billDay": "账单日", "dueDay": "还款日", "dueAt": "到期故事分钟", "statementAt": "出账故事分钟", "createdAt": "建立时点", "updatedAt": "更新时点", "settledAt": "结算时点", "redeemedAt": "赎回时点", "at": "故事时点", "months": "分期期数", "number": "期号", "apr": "年化利率", "annualRateBps": "年化利率基点", "periodDays": "每期故事天数", "periodsPerYear": "每年计息期数", "quoteId": "已确认报价", "productId": "商品或产品编号", "orderId": "订单编号", "placeId": "地点编号", "payment": "付款方式", "deliveryFee": "配送费", "note": "备注", "accrued": "已结算收益", "risk": "风险说明", "liquidity": "赎回规则", "authorId": "作者账号", "postId": "所属帖子", "handle": "账号标识", "personId": "人物编号", "bio": "简介", "color": "账号颜色", "label": "标签", "visibility": "可见范围", "mediaIds": "引用相片", "mediaGrants": "本条公开授权", "repostOf": "转发来源", "songId": "引用歌曲", "likesBase": "已知初始点赞数", "ownerId": "所属人物或账号", "source": "原件来源", "art": "插画", "mime": "媒体格式", "artist": "作者", "album": "专辑", "cover": "封面", "audioId": "音源原件", "duration": "时长", "songIds": "歌曲清单", "day": "故事日期", "minute": "当日分钟", "participantId": "邀请对象", "notified": "已提醒", "x": "横坐标", "y": "纵坐标", "known": "当前已知", "apps": "启用应用", "appNames": "应用显示名称", "currency_ref": "货币资产原点", "currency_symbol": "货币符号", "currency_minor_units": "货币小数位", "theme_background": "背景色", "theme_panel": "面板色", "theme_text": "文字色", "theme_accent": "强调色", "theme_radius": "圆角", "delivery_shop": "商城配送费", "delivery_food": "外卖配送费", "author": "作者账号", "by": "发言账号", "floor": "楼层", "audience": "可见对象", "meta": "页面结构参数"};
const TABLE_LABELS={"X_PHONE_WORLD_CONFIG": "世界手机设置", "X_FIN_ACCOUNTS": "资金账户", "X_FIN_TRANSACTIONS": "资金流水", "X_FIN_CREDIT_CARDS": "信用卡", "X_FIN_CREDIT_CHARGES": "信用消费明细", "X_FIN_CREDIT_STATEMENTS": "信用卡账单", "X_FIN_LOANS": "贷款合同", "X_FIN_LOAN_INSTALLMENTS": "贷款分期", "X_FIN_INVESTMENTS": "理财持仓", "X_FIN_INVESTMENT_PRODUCTS": "理财产品定义", "X_SHOP_ORDERS": "购物与外卖订单", "X_SHOP_ORDER_ITEMS": "订单商品明细", "X_SHOP_CART_ITEMS": "购物车条目", "X_SHOP_PRODUCT_DETAILS": "商城商品扩展", "X_HOLDING_DETAILS": "持有物扩展", "X_SOCIAL_ACCOUNTS": "网络账号", "X_SOCIAL_POSTS": "微博帖子", "X_SOCIAL_COMMENTS": "微博评论", "X_SOCIAL_NOTIFICATIONS": "社交通知", "X_SOCIAL_OUTBOX": "待发社交操作", "X_SOCIAL_CONTACTS": "手机联系人", "X_MEDIA_PHOTOS": "相片与可见范围", "X_MEDIA_SONGS": "歌曲资料", "X_MEDIA_PLAYLISTS": "歌单", "X_CALENDAR_EVENTS": "日程与邀请", "X_PLACE_MAP_POINTS": "地图已知地点", "X_JOURNEY_DETAILS": "出行进度", "X_NETWORK_DOCUMENTS": "网络页面", "X_NETWORK_ITEMS": "网络消息与条目", "X_NETWORK_ACCOUNTS": "网络页面账号"};
const field=(key,type='TEXT')=>({key,label:FIELD_LABELS[key]??key,type});
export const PHONE_DATABASE_SCHEMAS=[{id:PHONE_BINDING_TABLE,phone_internal:true,label:'手机表单视图绑定',fields:[field('row_uuid','ID'),field('context_key'),field('world_ref','REF'),field('owner_ref','REF'),field('revision','INTEGER'),field('layout','JSON'),field('archive_digest')]},EXTENSION_PREFERENCE_SCHEMA,...PRESENTATION_SCHEMAS];
const tableNames={
 'life/world/economy/loan':'X_PHONE_LOAN_RULES','life/state/media/albums/*':'X_MEDIA_ALBUMS','life/state/media/theme':'X_MEDIA_THEME','life/state/media/playback':'X_MEDIA_PLAYBACK','life/state/commerce/coupons/*':'X_SHOP_COUPONS','life/state/commerce/products/*/options/*':'X_SHOP_PRODUCT_OPTIONS',
 'life/world':'X_PHONE_WORLD_CONFIG','life/state/wallet/accounts/*':'X_FIN_ACCOUNTS','life/state/wallet/card':'X_FIN_CREDIT_CARDS','life/state/wallet/card/charges/*':'X_FIN_CREDIT_CHARGES','life/state/wallet/card/statements/*':'X_FIN_CREDIT_STATEMENTS','life/state/wallet/loans/*':'X_FIN_LOANS','life/state/wallet/loans/*/installments/*':'X_FIN_LOAN_INSTALLMENTS','life/state/wallet/investments/*':'X_FIN_INVESTMENTS','life/world/economy/investments/*':'X_FIN_INVESTMENT_PRODUCTS','life/state/wallet/ledger/*':'X_FIN_TRANSACTIONS','life/state/commerce/orders/*':'X_SHOP_ORDERS','life/state/commerce/orders/*/items/*':'X_SHOP_ORDER_ITEMS','life/state/commerce/cart/*':'X_SHOP_CART_ITEMS','life/state/commerce/products/*':'X_SHOP_PRODUCT_DETAILS','life/state/inventory/*':'X_HOLDING_DETAILS','life/state/social/accounts/*':'X_SOCIAL_ACCOUNTS','life/state/social/posts/*':'X_SOCIAL_POSTS','life/state/social/comments/*':'X_SOCIAL_COMMENTS','life/state/social/notifications/*':'X_SOCIAL_NOTIFICATIONS','life/state/social/pending/*':'X_SOCIAL_OUTBOX','life/state/media/photos/*':'X_MEDIA_PHOTOS','life/state/media/songs/*':'X_MEDIA_SONGS','life/state/media/playlists/*':'X_MEDIA_PLAYLISTS','life/state/calendar/events/*':'X_CALENDAR_EVENTS','life/state/map/places/*':'X_PLACE_MAP_POINTS','life/state/map/journey':'X_JOURNEY_DETAILS','life/state/contacts/*':'X_SOCIAL_CONTACTS','suite/documents/*':'X_NETWORK_DOCUMENTS','suite/documents/*/items/*':'X_NETWORK_ITEMS','suite/accounts/*':'X_NETWORK_ACCOUNTS','actions/*':'X_PHONE_ACTIONS','requests/*':'X_PHONE_REQUESTS','frames/*':'X_PHONE_FRAMES','lifeEventLog/*':'X_PHONE_LIFE_EVENTS'};
const entityFields={
 X_FIN_ACCOUNTS:{id:'TEXT',name:'TEXT',balance_ref:'REF'},X_FIN_TRANSACTIONS:{id:'TEXT',at:'INTEGER',type:'TEXT',description:'TEXT',amount:'INTEGER',accountId:'TEXT',to:'TEXT'},
 X_SOCIAL_ACCOUNTS:{owned:'BOOLEAN',id:'TEXT',name:'TEXT',handle:'TEXT',personId:'REF',bio:'TEXT',color:'TEXT',label:'TEXT'},
 X_SOCIAL_POSTS:{id:'TEXT',authorId:'TEXT',text:'LONG_TEXT',visibility:'TEXT',mediaIds:'ARRAY',mediaGrants:'ARRAY',repostOf:'TEXT',songId:'TEXT',likesBase:'INTEGER',createdAt:'JSON'},
 X_SOCIAL_COMMENTS:{id:'TEXT',postId:'TEXT',authorId:'TEXT',text:'LONG_TEXT',createdAt:'JSON'},
 X_SHOP_ORDERS:{id:'TEXT',kind:'TEXT',subtotal:'INTEGER',deliveryFee:'INTEGER',total:'INTEGER',payment:'TEXT',accountId:'TEXT',placeId:'TEXT',note:'LONG_TEXT',status:'TEXT',createdAt:'INTEGER',updatedAt:'INTEGER',refunded:'INTEGER'},
 X_SHOP_ORDER_ITEMS:{productId:'TEXT',name:'TEXT',qty:'INTEGER',price:'INTEGER',kind:'TEXT'},
 X_PHONE_WORLD_CONFIG:{apps:'ARRAY',appNames:'JSON',currency_ref:'REF',currency_symbol:'TEXT',currency_minor_units:'INTEGER',delivery_shop:'INTEGER',delivery_food:'INTEGER',theme_background:'TEXT',theme_panel:'TEXT',theme_text:'TEXT',theme_accent:'TEXT',theme_radius:'INTEGER'},
 X_NETWORK_DOCUMENTS:{id:'TEXT',kind:'TEXT',title:'TEXT',author:'TEXT',text:'LONG_TEXT',at:'TEXT',visibility:'TEXT',audience:'ARRAY',meta:'JSON'},
 X_NETWORK_ITEMS:{id:'TEXT',floor:'INTEGER',by:'TEXT',author:'TEXT',text:'LONG_TEXT',at:'TEXT',kind:'TEXT'},
};
Object.assign(entityFields,{
 X_FIN_CREDIT_CARDS:{id:'TEXT',enabled:'BOOLEAN',name:'TEXT',limit:'INTEGER',refundBalance:'INTEGER',billDay:'INTEGER',dueDay:'INTEGER',debt_ref:'REF'},
 X_FIN_CREDIT_CHARGES:Object.fromEntries('id:TEXT orderId:TEXT amount:INTEGER originalDebt:INTEGER remaining:INTEGER paid:INTEGER refunded:INTEGER prepaid:INTEGER statementAt:INTEGER dueAt:INTEGER createdAt:INTEGER status:TEXT'.split(' ').map(x=>x.split(':'))),
 X_FIN_CREDIT_STATEMENTS:Object.fromEntries('id:TEXT statementAt:INTEGER dueAt:INTEGER total:INTEGER remaining:INTEGER status:TEXT'.split(' ').map(x=>x.split(':'))),
 X_FIN_LOANS:Object.fromEntries('id:TEXT amount:INTEGER months:INTEGER apr:NUMBER annualRateBps:INTEGER periodDays:INTEGER periodsPerYear:INTEGER totalInterest:INTEGER totalPayable:INTEGER monthlyPayment:INTEGER quoteId:TEXT paid:INTEGER accountId:TEXT status:TEXT createdAt:INTEGER debt_ref:REF'.split(' ').map(x=>x.split(':'))),
 X_FIN_LOAN_INSTALLMENTS:Object.fromEntries('number:INTEGER principal:INTEGER interest:INTEGER amount:INTEGER paid:INTEGER dueAt:INTEGER'.split(' ').map(x=>x.split(':'))),
 X_FIN_INVESTMENTS:Object.fromEntries('id:TEXT productId:TEXT principal:INTEGER accrued:INTEGER createdAt:INTEGER settledAt:INTEGER redeemedAt:INTEGER status:TEXT'.split(' ').map(x=>x.split(':'))),
 X_FIN_INVESTMENT_PRODUCTS:{id:'TEXT',name:'TEXT',annualRateBps:'INTEGER',description:'LONG_TEXT',risk:'TEXT',liquidity:'TEXT'},
 X_SHOP_CART_ITEMS:{productId:'TEXT',qty:'INTEGER'},X_PLACE_MAP_POINTS:{id:'TEXT',x:'NUMBER',y:'NUMBER',kind:'TEXT',known:'BOOLEAN'},X_CALENDAR_EVENTS:{id:'TEXT',title:'TEXT',day:'INTEGER',minute:'INTEGER',at:'INTEGER',placeId:'TEXT',participantId:'TEXT',status:'TEXT',notified:'BOOLEAN'},
 X_MEDIA_PHOTOS:{id:'TEXT',name:'TEXT',ownerId:'TEXT',visibility:'TEXT',source:'TEXT',art:'TEXT',mime:'TEXT',createdAt:'JSON'},X_MEDIA_SONGS:{id:'TEXT',title:'TEXT',artist:'TEXT',album:'TEXT',cover:'TEXT',audioId:'TEXT',duration:'NUMBER'},X_MEDIA_PLAYLISTS:{id:'TEXT',name:'TEXT',songIds:'ARRAY'}
});
const relationFields={dictionary_key:'TEXT',collection_ref:'TEXT',parent_ref:'REF',collection_field:'TEXT',ordinal:'INTEGER',world_ref:'REF',owner_ref:'REF'};
for(const id of new Set(Object.values(tableNames)))PHONE_DATABASE_SCHEMAS.push({id,label:TABLE_LABELS[id]??id,phone_internal:true,fields:[field('row_uuid','ID'),...Object.entries({...relationFields,...(entityFields[id]??{})}).map(([k,t])=>field(k,t))]});
for(const extra of PHONE_FORM_SCHEMAS){const existing=PHONE_DATABASE_SCHEMAS.find(t=>t.id===extra.id);if(existing){if(existing.label===existing.id)existing.label=extra.label;for(const f of extra.fields)if(!existing.fields.some(x=>x.key===f.key))existing.fields.push(clone(f));}else PHONE_DATABASE_SCHEMAS.push(clone(extra));}
const maps=new Set(['suite/accounts','suite/documents','suite/branches','requests','frames','rejectedSources','drafts','life/state/receipts','life/state/social/drafts','life/state/social/follows','life/state/social/likes','life/state/social/bookmarks','life/state/social/acceptedLikes']);
const history=p=>p==='suite/seed'||p==='lifeInitial'||/^suite\/branches\/[^/]+\/envelopes\/\d+$/.test(p)||/^lifeEventLog\/\d+$/.test(p)||/^frames\/[^/]+$/.test(p)||/^requests\/[^/]+$/.test(p);
const historyTable=p=>p.startsWith('frames/')?'X_PHONE_FRAMES':p.startsWith('requests/')?'X_PHONE_REQUESTS':p.startsWith('lifeEventLog/')?'X_PHONE_LIFE_EVENTS':p==='lifeInitial'?'X_PHONE_INITIAL_SNAPSHOTS':p==='suite/seed'?'X_NETWORK_SEEDS':'X_NETWORK_ENVELOPES';
function entityPath(path,root){let at=root;return path.map(k=>{const value=at?.[k],next=Array.isArray(at)&&value&&typeof value==='object'?(value.id!=null?'@'+value.id:value.number!=null?'#'+value.number:value.productId!=null?'product:'+value.productId:k):k;at=value;return String(next);});}
const pathId=p=>phoneDatabaseRecordId(p);
const immutableTables=new Set(['X_PHONE_FRAMES','X_PHONE_REQUESTS','X_PHONE_LIFE_EVENTS','X_PHONE_INITIAL_SNAPSHOTS','X_NETWORK_SEEDS','X_NETWORK_ENVELOPES']);
function namedTable(semantic){const p=semantic.join('/');return tableNames[p]??'X_PHONE_'+semantic.filter(x=>x!=='*').map(x=>x.replace(/[^A-Za-z0-9]/g,'_').toUpperCase()).join('_');}
const typeOf=(v,key)=>key==='uid'?'JSON':['world_ref','owner_ref','balance_ref','debt_ref'].includes(key)?'REF':v===null?'JSON':typeof v==='number'?'NUMBER':typeof v==='boolean'?'BOOLEAN':typeof v==='string'?'TEXT':'JSON';
const rowValue=(s,t,r,k)=>s.tables?.[t]?.[r]?.values?.[k];
const known=(s,t,r,k)=>['known','derived'].includes(s.tables?.[t]?.[r]?.states?.[k]);
const cents=v=>{if(v===null||v===undefined)return null;const c=Math.round(v*100);if(!Number.isSafeInteger(c)||Math.abs(c/100-v)>1e-8)fail('PHONE_MONEY_PRECISION','现有余额精度不能无损映射为分');return c;};
function accountBalanceValues(state,recordId,ownerId,currencyId,{allowMissing=false}={}){const value=state.tables?.T_DYN_CURRENCY_BALANCES?.[recordId]?.values;if(!value){if(allowMissing)return null;fail('PHONE_ACCOUNT_BINDING','账户余额引用不存在',{recordId});}if(value.owner_ref!==ownerId||currencyId!=null&&value.currency_ref!==currencyId)fail('PHONE_ACCOUNT_BINDING','账户余额引用属于另一主体或币种',{recordId});return value;}

// A persisted clock reference is authoritative; a broken one is not repaired
// by selecting another row. Runtime-wide selectors may belong to other worlds.
function phoneWorldClock(state,worldId,binding){
 const validId=value=>typeof value==='string'&&value.trim().length>0;
 if(!validId(worldId))fail('PHONE_DATABASE_CLOCK_SCOPE','手机世界标识缺失，不能选择世界时钟');
 const rows=state.tables?.X_WORLD_CLOCKS??{};
 if(!rows||typeof rows!=='object'||Array.isArray(rows))fail('PHONE_DATABASE_CLOCK','世界时钟表格式无效');
 let recordId;
 if(binding!==undefined){
  if(!binding||binding.tableId!=='X_WORLD_CLOCKS'||!validId(binding.recordId))fail('PHONE_DATABASE_CLOCK','手机时钟必须绑定统一世界时钟表中的有效记录');
  if(!Number.isSafeInteger(binding.origin))fail('PHONE_DATABASE_CLOCK','世界时钟起点绑定无效');
  recordId=binding.recordId;
 }else{
  const matches=Object.entries(rows).filter(([,row])=>row?.values?.world_ref===worldId);
  if(matches.length>1)fail('CALENDAR_BINDING','同一世界有多个时钟，请先明确选择');
  recordId=matches[0]?.[0]??'world-clock:'+worldId;
  if(!Object.hasOwn(rows,recordId))return {recordId,row:null,configuration:null};
 }
 const row=Object.hasOwn(rows,recordId)?rows[recordId]:null;
 if(!row?.values||typeof row.values!=='object'||Array.isArray(row.values))fail('PHONE_DATABASE_CLOCK','世界时钟绑定不存在',{recordId});
 const available=key=>row.states?.[key]===undefined||['known','derived'].includes(row.states[key]);
 if(row.values.world_ref!==worldId||!available('world_ref'))fail('PHONE_DATABASE_CLOCK_SCOPE','世界时钟不属于当前手机世界或所属世界尚未确认',{recordId,worldId,clockWorld:row.values.world_ref??null,state:row.states?.world_ref??null});
 // A newly authored, incomplete clock is optional for opening the phone. A
 // clock already pinned by saved business history remains a strict reference.
 const season=row.values.mode==='SEASON_FIXED'||Object.values(state.tables?.M_CALENDAR_RULES??{}).some(r=>r.values.world_ref===worldId&&r.values.mode==='SEASON_FIXED');
 const missing=['year',season?'season':'month','day','hour','minute'].filter(key=>!available(key)||row.values[key]==null);
 if(binding===undefined&&missing.length)return {recordId,row,configuration:null,missing};
 const configuration=worldClockConfiguration(state,recordId);
 for(const key of ['year',configuration.mode==='SEASON_FIXED'?'season':'month','day','hour','minute'])if(!available(key)||!Number.isSafeInteger(configuration[key]))fail('PHONE_DATABASE_CLOCK_UNKNOWN','世界时钟位置尚未完整确认',{recordId,field:key,state:row.states?.[key]??null});
 return {recordId,row,configuration};
}

export function encodePhoneDatabase(archive,databaseState,{initializing=false}={}){
 const phone=importPhone(archive),scope=phone.contextKey,changes=new Map(),schemas=new Map(PHONE_DATABASE_SCHEMAS.map(t=>[t.id,clone(t)]));
 if(phone.life){phone.life.world.settlementOwner='tables';phone.life.state.config.settlementOwner='tables';phone.life.state.config.database=true;}
 const life=phone.life,person=life?.state?.identity?.personId,world=life?.world?.id;
 const projection=life?phoneProfileFromForms(databaseState,{worldId:world,entityId:person,dossierId:life.binding?.character?.dossierId,calendar:life.state.config.calendar??null}):null;
 const formDefaults=projection?.formDefaults??{},optionalCoordinates=new Map();
 const worldConfigs=life?Object.entries(databaseState.tables?.X_PHONE_WORLD_CONFIG??{}).filter(([,r])=>(r.values.world_ref==null||r.values.world_ref===world)&&(r.values.owner_ref==null||r.values.owner_ref===person)):[],configuredCurrency=worldConfigs[0]?.[1]?.values?.currency_ref;
 const configRecordId=worldConfigs[0]?.[0]??phoneDatabaseRecordId(['life','world']);
 // Detect an actual selection change, including when the author has not yet
 // filled a default. A projected fallback alone must not create a new fact.
 const previousLife=life&&!initializing&&databaseState.tables?.[PHONE_BINDING_TABLE]?.[currentId]?.values?.layout?.children?.life?decodePhoneDatabase(databaseState).life:null;
 const currencies=Object.entries(databaseState.tables?.T_STATIC_ITEMS_SKILLS??{}).filter(([,r])=>r.values.category==='currency'&&r.values.name===life?.world?.currency?.name);
 if(currencies.length>1&&!configuredCurrency)fail('PHONE_CURRENCY_BINDING','同名币种有多条记录，请明确选择币种引用');const currency=configuredCurrency??currencies[0]?.[0]??(world&&life?.world?.currency?world+':currency':null);
 const recordFor=(path,table,obj)=>{if(path.join('/')==='life/world'&&worldConfigs.length===1)return worldConfigs[0][0];if(obj?.id){const rows=Object.entries(databaseState.tables?.[table]??{}).filter(([,r])=>(r.values.id===obj.id||r.values.row_uuid===obj.id||table==='X_SHOP_PRODUCT_DETAILS'&&r.values.item_ref===obj.id||table==='X_PLACE_MAP_POINTS'&&r.values.place_ref===obj.id)&&(table==='X_SOCIAL_ACCOUNTS'||r.values.owner_ref==null||r.values.owner_ref===person)&&(r.values.world_ref==null||r.values.world_ref===world));if(rows.length>1)fail('PHONE_ENTITY_DUPLICATE','同一主体有重复业务实体ID',{table,id:obj.id});if(rows.length===1)return rows[0][0];}return phoneDatabaseRecordId(entityPath(path,phone));};
 const ensure=(t,k,v)=>{let spec=schemas.get(t);if(!spec){spec={id:t,label:TABLE_LABELS[t]??t,phone_internal:true,fields:[field('row_uuid','ID')]};schemas.set(t,spec);}const existing=databaseState.schema?.[t]?.fields?.find(f=>f.key===k);if(!spec.fields.some(f=>f.key===k))spec.fields.push(existing?clone(existing):field(k,typeOf(v,k)));};
 const write=(t,r,k,v,{canonical=false}={})=>{
  const existing=databaseState.schema?.[t]?.fields?.find(f=>f.key===k);if(canonical&&!existing)fail('PHONE_DATABASE_SCHEMA','既有表字段不存在',{table:t,field:k});if(!canonical){ensure(t,k,v);if(!['row_uuid','world_ref','owner_ref'].includes(k)){ensure(t,'world_ref',world??null);ensure(t,'owner_ref',person??null);}}
  const coordinate=JSON.stringify([t,r,k]);if(Object.hasOwn(formDefaults,coordinate)&&stable(formDefaults[coordinate])===stable(v)){
   optionalCoordinates.set(coordinate,clone(v));return [t,r,k];
  }
  if(initializing&&canonical&&known(databaseState,t,r,k)&&stable(rowValue(databaseState,t,r,k))!==stable(v))fail('PHONE_INITIALIZATION_CONFLICT','初始化与既有表单数值冲突，未写入',{table:t,record:r,field:k,existing:rowValue(databaseState,t,r,k),incoming:v});
  const key=t+'#'+r;let c=changes.get(key);if(!c){c={tableId:t,recordId:r,values:{},metadata:{phone_scope:scope}};changes.set(key,c);}const valueSpec=databaseState.schema?.[t]?.fields?.find(f=>f.key===k)??schemas.get(t)?.fields?.find(f=>f.key===k);c.values[k]=valueSpec?.type==='JSON'&&typeof v==='string'?JSON.stringify(v):v;if(!canonical){c.values.world_ref??=world??null;c.values.owner_ref??=rowValue(databaseState,t,r,'owner_ref')??person??null;}return [t,r,k];
 };
 function canonical(path,obj,key,value){
  const p=path.join('/');let target=null,unit=null;
  const selectionField=p==='life/state/social'&&key==='activeAccountId'?'active_account_ref':p==='life/state/wallet'?({defaultAccountId:'default_account_ref',fundingAccountId:'funding_account_ref'})[key]:null;
  if(selectionField){
   const social=selectionField==='active_account_ref',group=social?'social':'wallet',table=social?'X_SOCIAL_ACCOUNTS':'X_FIN_ACCOUNTS',configuration=worldConfigs[0]?.[1];
   const declared=configuration&&Object.hasOwn(configuration.values,selectionField)&&(!configuration.states?.[selectionField]||['known','derived'].includes(configuration.states[selectionField]));
   const projected=social?projection?.character?.activeAccountId:projection?.character?.wallet?.[key];
   const previous=previousLife?.state?.[group]?.[key],changed=previousLife&&value!==previous;
   if(!declared&&!changed)return null;
   const at=['X_PHONE_WORLD_CONFIG',configRecordId,selectionField];
   if(declared&&value===projected)return {at,unavailable:value};
   if(value===null){write(...at,null);return {at,unavailable:null};}
   const list=social?life.state.social.accounts:life.state.wallet.accounts;
   if(!list.some(a=>a.id===value)||social&&!life.state.social.ownedAccountIds.includes(value))fail('PHONE_ACCOUNT_BINDING','所选账户不属于当前人物',{field:selectionField,accountId:value});
   // Here value is a business ID from the validated phone view, not an
   // author-entered REF. Resolve it as such before writing the canonical UUID.
   const matches=Object.entries(databaseState.tables?.[table]??{}).filter(([rid,row])=>{
    const available=field=>Object.hasOwn(row.values,field)&&(!row.states?.[field]||['known','derived'].includes(row.states[field]));
    return (available('id')?row.values.id:rid)===value&&(row.values.world_ref==null||row.values.world_ref===world)&&(row.values.owner_ref==null||available('owner_ref')&&row.values.owner_ref===person)&&(!social||available('personId')&&row.values.personId===person&&available('owned')&&row.values.owned===true);
   });
   if(matches.length!==1)fail('PHONE_ACCOUNT_BINDING','所选账户没有当前范围内唯一的规范记录',{field:selectionField,accountId:value});
   write(...at,matches[0][0]);return {at,unavailable:value};
  }
  if(p==='life/world/theme'||p==='life/world/currency'&&['symbol','minorUnits'].includes(key)||p==='life/world/economy/deliveryFees'){const prefix=p.endsWith('theme')?'theme_':p.endsWith('currency')?'currency_':'delivery_',suffix=key==='minorUnits'?'minor_units':key;const at=write('X_PHONE_WORLD_CONFIG',worldConfigs[0]?.[0]??phoneDatabaseRecordId(['life','world']),prefix+suffix,value);return {at,empty:value===''?'string':null};}
  if(p==='life/world/travel/speeds'&&['walk','bike','transit'].includes(key)){const at=write('X_PHONE_WORLD_CONFIG',worldConfigs[0]?.[0]??phoneDatabaseRecordId(['life','world']),({walk:'walk_speed',bike:'bike_speed',transit:'transit_speed'})[key],value);return {at};}
  if(p==='life/world/economy'&&key==='quoteMinutes'||p==='life/world/economy/minimumOrders'&&['shop','food'].includes(key)){const at=write('X_PHONE_WORLD_CONFIG',worldConfigs[0]?.[0]??phoneDatabaseRecordId(['life','world']),key==='quoteMinutes'?'quote_minutes':'minimum_'+key,value);return {at};}
  if(p==='life/state/social/follows'){const index=life.state.social.accounts.findIndex(a=>a.id===key);if(index>=0){const a=life.state.social.accounts[index],rid=recordFor(['life','state','social','accounts',String(index)],'X_SOCIAL_ACCOUNTS',a);const at=write('X_SOCIAL_ACCOUNTS',rid,'following',value);return {at};}}
  if(p==='life/world/currency'&&key==='name'){if(!known(databaseState,'T_STATIC_ITEMS_SKILLS',currency,'category'))write('T_STATIC_ITEMS_SKILLS',currency,'category','currency',{canonical:true});target=['T_STATIC_ITEMS_SKILLS',currency,'name'];}
  if(p==='life/world'&&['id','name'].includes(key))target=['T_STATIC_WORLDS',world,key==='id'?'world_id':'name'];
  if(p==='life/state/identity'&&['personId','name'].includes(key)){
   const ref=rowValue(databaseState,'T_SYS_ENTITIES',person,'origin_record_ref'),link=typeof ref==='string'?databaseState.tables?.M_FIELD_REFERENCES?.[ref]?.values:null,dossier=link?.target_table==='T_CHAR_DOSSIER'?link.target_row_uuid:person;
   if(!databaseState.tables?.T_SYS_ENTITIES?.[person]?.values?.kind)write('T_SYS_ENTITIES',person,'kind','character',{canonical:true});target=key==='personId'?['T_SYS_ENTITIES',person,'entity_id']:['T_CHAR_DOSSIER',dossier,'name'];
   if(!ref){const rid='origin:'+person;for(const [k,v]of Object.entries({owner_table:'T_SYS_ENTITIES',owner_row_uuid:person,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:dossier,reference_kind:'record',resolution_status:'resolved'}))write('M_FIELD_REFERENCES',rid,k,v,{canonical:true});write('T_SYS_ENTITIES',person,'origin_record_ref',rid,{canonical:true});}
  }
  if(/^life\/state\/wallet\/accounts\/\d+$/.test(p)&&key==='balance'){
   const accountRows=Object.values(databaseState.tables?.X_FIN_ACCOUNTS??{}).filter(r=>r.values.id===obj.id&&r.values.owner_ref===person),explicit=obj.balance_ref??accountRows[0]?.values.balance_ref,expected='account:'+person+':'+obj.id,existing=Object.entries(databaseState.tables?.T_DYN_CURRENCY_BALANCES??{}).filter(([,r])=>r.values.owner_ref===person&&r.values.currency_ref===currency&&Object.hasOwn(r.values,'balance'));
   if(value===null&&!explicit&&!databaseState.tables?.T_DYN_CURRENCY_BALANCES?.[expected]&&!existing.length)return {unavailable:null};
   let r=explicit??(databaseState.tables?.T_DYN_CURRENCY_BALANCES?.[expected]?expected:null);
   if(!r&&existing.length){if(life.state.wallet.accounts.length===1&&existing.length===1)r=existing[0][0];else fail('PHONE_ACCOUNT_BINDING','已有多账户余额无法唯一对应手机账户，请在账户子表明确balance_ref，未另开重复钱包');}r??=expected;
   accountBalanceValues(databaseState,r,person,currency,{allowMissing:!explicit});if(databaseState.tables?.T_DYN_CURRENCY_BALANCES?.[r]?.values?.native_ref)fail('PHONE_NATIVE_BALANCE','该余额由原生变量拥有，手机不能复制结算');write('T_DYN_CURRENCY_BALANCES',r,'owner_ref',person,{canonical:true});write('T_DYN_CURRENCY_BALANCES',r,'currency_ref',currency,{canonical:true});write('X_FIN_ACCOUNTS',recordFor(path,'X_FIN_ACCOUNTS',obj),'balance_ref',r);target=['T_DYN_CURRENCY_BALANCES',r,'balance'];value=value===null?null:value/100;unit='minor100';
  }
  if((p==='life/state/wallet/card'&&key==='used'&&obj.enabled!==false)||(/^life\/state\/wallet\/loans\/\d+$/.test(p)&&key==='remainingPrincipal')){
   const r=obj.debt_ref??('debt:'+person+':'+(obj.id??'card'));write('T_DYN_CURRENCY_BALANCES',r,'owner_ref',person,{canonical:true});write('T_DYN_CURRENCY_BALANCES',r,'currency_ref',currency,{canonical:true});target=['T_DYN_CURRENCY_BALANCES',r,'debt'];value=value/100;unit='minor100';write(namedTable(path.map(k=>/^\d+$/.test(k)?'*':k)),recordFor(path,namedTable(path.map(k=>/^\d+$/.test(k)?'*':k)),obj),'debt_ref',r);
  }
  if(/^life\/state\/map\/places\/\d+$/.test(p)&&['id','name'].includes(key))target=['T_STATIC_PLACES',obj.id,key==='id'?'place_id':'name'];
  if(/^life\/state\/commerce\/products\/\d+$/.test(p)){
   if(['id','name'].includes(key))target=['T_STATIC_ITEMS_SKILLS',obj.id,({id:'asset_id',name:'name'})[key]];
   if(['price','stock'].includes(key)){const matches=Object.entries(databaseState.tables?.X_SHOP_OFFERS??{}).filter(([,r])=>r.values.asset_ref===obj.id&&r.values.currency_ref===currency);if(matches.length>1)fail('PHONE_OFFER_BINDING','商品有多份报价，须明确所选商户报价');const rid=matches[0]?.[0]??('offer:'+world+':'+obj.id);write('X_SHOP_OFFERS',rid,'asset_ref',obj.id,{canonical:true});write('X_SHOP_OFFERS',rid,'currency_ref',currency,{canonical:true});target=['X_SHOP_OFFERS',rid,key==='price'?'buy_price':'stock'];if(key==='price'){value=value===null?null:value/100;unit='minor100';}}
  }
  if(/^life\/state\/inventory\/\d+$/.test(p)&&['qty','productId','name','placeId'].includes(key))target=['T_DYN_HOLDINGS_INVENTORY',projection?.holdingOrigins?.[obj.id]??'holding:'+person+':'+obj.id,({qty:'quantity',productId:'item_ref',name:'instance_name',placeId:'location_ref'})[key]];
  if(/^life\/state\/inventory\/\d+$/.test(p)&&['ownerId','holderId'].includes(key)){
   const holding=projection?.holdingOrigins?.[obj.id]??'holding:'+person+':'+obj.id,field=key==='ownerId'?'owner_ref':'holder_ref',ref=holding+':'+field;
   for(const [k,v]of Object.entries({owner_table:'T_DYN_HOLDINGS_INVENTORY',owner_row_uuid:holding,owner_field:field,sequence:0,item_type:'reference',target_table:'T_SYS_ENTITIES',target_row_uuid:value}))write('M_LIST_VALUES',ref,k,v,{canonical:true});write('T_DYN_HOLDINGS_INVENTORY',holding,field,ref,{canonical:true});target=['M_LIST_VALUES',ref,'target_row_uuid'];
  }
  if(p==='life/state/map'&&key==='position'){
   if(value===null)return {unavailable:null};
   const states=Object.entries(databaseState.tables?.T_DYN_ENTITY_STATE??{}).filter(([,r])=>r.values.entity_id===person);if(states.length>1)fail('PHONE_LOCATION_BINDING','人物有多个当前地点状态，须明确绑定');const rid=rowValue(databaseState,'T_SYS_ENTITIES',person,'runtime_state_ref')??states[0]?.[0]??'state:'+person;write('T_DYN_ENTITY_STATE',rid,'entity_id',person,{canonical:true});write('T_SYS_ENTITIES',person,'runtime_state_ref',rid,{canonical:true});target=['T_DYN_ENTITY_STATE',rid,'location_ref'];
  }
  if(/^life\/state\/media\/(photos|songs)\/\d+$/.test(p)){
   const rid=obj.asset_ref??'media:'+person+':'+obj.id;
   if(key==='ownerId'){
    // Media privacy is scoped to a social account (or the person directly),
    // while the canonical asset points to a registered entity. Keep these
    // distinct identities so a cold load does not widen account visibility.
    const account=life.state.social.accounts.find(a=>a.id===value),entity=account?account.personId:value;
    if(!entity||entity!==person&&!databaseState.tables?.T_SYS_ENTITIES?.[entity])fail('PHONE_MEDIA_OWNER','媒体所属账号没有可核对的人物实体',{ownerId:value,entityId:entity??null});
    write('T_SYS_MEDIA_ASSETS',rid,'entity_ref',entity,{canonical:true});
    return null;
   }
   if(['audioId','assetId'].includes(key))target=['T_SYS_MEDIA_ASSETS',rid,'asset_locator'];
   if(key==='checksum')target=['T_SYS_MEDIA_ASSETS',rid,'checksum'];
  }
  if(!target)return null;write(...target,value,{canonical:true});return {at:target,...(unit?{unit}:{}),empty:value===''?'string':null};
 }
 function pack(value,path=[],semantic=[],relation=null){
  const p=path.join('/');
  if(history(p)){const t=historyTable(p),r=pathId(path);write(t,r,'snapshot',clone(value));return {snapshot:[t,r,'snapshot']};}
  if(Array.isArray(value)){
   const mapped=tableNames[[...semantic,'*'].join('/')],table=immutableTables.has(mapped)?null:mapped,collectionRef=phoneDatabaseRecordId(entityPath(path,phone)),parentRef=phoneDatabaseRecordId(entityPath(path.slice(0,-1),phone));
   const nodes=value.map((v,i)=>pack(v,[...path,String(i)],[...semantic,'*'],table?{table,collectionRef,parentRef,field:path.at(-1),ordinal:i}:null));
   return {array:nodes,...(table?{collection:{tableId:table,collectionRef,parentRef,field:path.at(-1)}}:{})};
  }
  if(value===null||typeof value!=='object'){
   const t=namedTable(semantic.length?semantic:['ROOT_VALUE']),r=phoneDatabaseRecordId(entityPath(path,phone));write(t,r,'value',value);return {scalar:[t,r,'value'],empty:value===''?'string':null};
  }
  const table=namedTable(semantic.length?semantic:['SESSION']),rid=recordFor(path,table,value),fields={},children={};
  if(path.join('/')==='life/world'&&currency)write(table,rid,'currency_ref',currency);if(/^life\/state\/social\/accounts\/\d+$/.test(path.join('/')))write(table,rid,'owned',life.state.social.ownedAccountIds.includes(value.id));
  if(value.meta?.lifeProjection){const key=table+'#'+rid;let c=changes.get(key);if(!c){c={tableId:table,recordId:rid,values:{},metadata:{phone_scope:scope}};changes.set(key,c);}c.metadata.phone_projection=clone(value.meta.lifeProjection);}
  if(relation?.dictionaryKey!==undefined)write(table,rid,'dictionary_key',relation.dictionaryKey);
  if(relation)for(const [k,v]of Object.entries({collection_ref:relation.collectionRef,parent_ref:relation.parentRef,collection_field:relation.field,ordinal:relation.ordinal}))write(table,rid,k,v);
  for(const [key,v]of Object.entries(value)){
   if(v===undefined)continue;
   if(path.length===0&&key==='life'){} // life is the current normalized view.
   const next=[...path,key],sem=[...semantic,maps.has(p)?'*':key],mapTable=maps.has(p)?tableNames[[...semantic,'*'].join('/')]:null;
   if(p==='life/world'&&key==='appNames'||v===null||typeof v!=='object'||Array.isArray(v)&&v.every(x=>x===null||typeof x!=='object')&&!tableNames[[...sem,'*'].join('/')]){
    if(Array.isArray(v)){ensure(table,key,v);schemas.get(table).fields.find(x=>x.key===key).type='ARRAY';}
    const special=canonical(path,value,key,v);fields[key]=special??{at:write(table,rid,key,v),empty:v===''?'string':null};
    if(fields[key].at&&optionalCoordinates.has(JSON.stringify(fields[key].at)))fields[key].unavailable=clone(optionalCoordinates.get(JSON.stringify(fields[key].at)));
   }else children[key]=pack(v,next,sem,mapTable&&!immutableTables.has(mapTable)?{table:mapTable,collectionRef:rid,parentRef:rid,field:path.at(-1),ordinal:Object.keys(value).indexOf(key),dictionaryKey:key}:null);
  }
  const mappedTable=maps.has(p)?tableNames[[...semantic,'*'].join('/')]:null;return {record:[table,rid],fields,children,...(mappedTable&&!immutableTables.has(mappedTable)?{mapCollection:{tableId:mappedTable,collectionRef:rid}}:{})};
 }
 // Avoid two editable copies of shared configuration/catalogs in current rows.
 const aliases=[];
 if(life){delete phone.life.databaseRefs;delete phone.life.formReadiness;delete phone.life.state.config.calendar;delete phone.life.state.config.calendarOrigin;for(const key of ['apps','appNames','theme','currency','economy','travel','settlementOwner']){aliases.push({path:['life','state','config',key],source:['life','world',key]});delete phone.life.state.config[key];}
  for(const [path,source]of [[['life','world','catalog'],['life','state','commerce','products']],[['life','world','places'],['life','state','map','places']],[['life','state','wallet','investmentProducts'],['life','world','economy','investments']]]){aliases.push({path,source});let at=phone;for(const k of path.slice(0,-1))at=at[k];delete at[path.at(-1)];}
 }
 const layout=pack(phone);layout.aliases=aliases;
 if(life){
  const savedClock=databaseState.tables?.[PHONE_BINDING_TABLE]?.[currentId]?.values?.layout?.clock;
  const {recordId:clockId,row:existing,configuration}=phoneWorldClock(databaseState,world,savedClock);
  let clockConfig=configuration;
  if(clockConfig){
   const existingRules=Object.entries(databaseState.tables?.M_CALENDAR_RULES??{}).filter(([,r])=>r.values.world_ref===world);
   if(!existingRules.length){const calendarId='calendar:'+world,mode=clockConfig.mode==='MONTH_FIXED'?'FIXED':clockConfig.mode;for(const [k,v]of Object.entries({calendar_id:calendarId,world_ref:world,mode,year_numbering:'astronomical',value_state:'known',epoch_year:clockConfig.year,hours_per_day:clockConfig.day_hours,minutes_per_hour:clockConfig.hour_minutes,...(mode==='SEASON_FIXED'?{seasons_per_year:clockConfig.seasons_per_year,days_per_season:clockConfig.days_per_season}:mode==='FIXED'?{months_per_year:clockConfig.months_per_year,days_per_month:clockConfig.days_per_month}:{})}))if(v!==undefined)write('M_CALENDAR_RULES',calendarId,k,v,{canonical:true});
    if(mode==='MONTH_TABLE'){for(const [i,days]of (clockConfig.month_lengths??[]).entries())for(const [k,v]of Object.entries({calendar_ref:calendarId,month:i+1,days}))write('M_CALENDAR_MONTHS',calendarId+':month:'+(i+1),k,v,{canonical:true});if(clockConfig.leap_rule==='GREGORIAN')for(const rule of [{cycle_years:4,remainder:0,except_cycle_years:100,month:2,extra_days:1},{cycle_years:400,remainder:0,month:2,extra_days:1}])for(const [k,v]of Object.entries({calendar_ref:calendarId,...rule}))write('M_CALENDAR_EXCEPTIONS',calendarId+':leap:'+rule.cycle_years,k,v,{canonical:true});}
   }
   const clock=new WorldClock(clockConfig),origin=life.state.config.calendarOrigin??new WorldClock({...clockConfig,year:life.state.clock.year,month:life.state.clock.month,season:life.state.clock.season,day:life.state.clock.day,hour:Math.floor(life.state.clock.minute/clockConfig.hour_minutes),minute:life.state.clock.minute%clockConfig.hour_minutes}).ordinal()-life.state.clock.totalMinutes;
   if(initializing&&existing&&clock.ordinal()!==origin+life.state.clock.totalMinutes)fail('PHONE_INITIALIZATION_CLOCK','初始化时刻与表单世界时钟不同，未自动选择或叠加');
   clock.setOrdinal(origin+life.state.clock.totalMinutes);for(const [k,v]of Object.entries(clock.c))if(databaseState.schema?.X_WORLD_CLOCKS?.fields.some(f=>f.key===k))write('X_WORLD_CLOCKS',clockId,k,v,{canonical:true});
   layout.clock={tableId:'X_WORLD_CLOCKS',recordId:clockId,origin};
   // Clock fields in phone rows are deleted: hydrate derives them from X_WORLD_CLOCKS.
   const discard=node=>{if(node?.fields)for(const x of Object.values(node.fields)){const [t,r,k]=x.at;changes.get(t+'#'+r)&&delete changes.get(t+'#'+r).values[k];}};
   discard(layout.children.life.children.state.children.clock);delete layout.children.life.children.state.children.clock;
  }
 }
 const bind={context_key:scope,world_ref:world??null,owner_ref:person??null,revision:phone.revision,layout,archive_digest:digest(archive)};
 // An authored appointment may temporarily lack its time. Its absence from
 // the schedulable projection is not a deletion request from an unrelated app.
 const pendingRecords=new Set((projection?.formReadiness?.pendingCalendar??[]).map(({reference:r})=>r.tableId+'#'+r.recordId));
 for(const [t,rows]of Object.entries(databaseState.tables??{}))if(databaseState.schema?.[t]?.phone_internal&&!immutableTables.has(t)&&t!==PHONE_BINDING_TABLE)for(const [rid,row]of Object.entries(rows))if(row.metadata?.phone_scope===scope&&!changes.has(t+'#'+rid)&&!pendingRecords.has(t+'#'+rid))changes.set(t+'#'+rid,{tableId:t,recordId:rid,remove:true});
 changes.set(PHONE_BINDING_TABLE+'#'+currentId,{tableId:PHONE_BINDING_TABLE,recordId:currentId,values:bind});
 return {changes:[...changes.values()].filter(c=>c.remove||Object.keys(c.values).length),schema:[...schemas.values()]};
}

function readCoordinate(state,at,empty,unit,projection){
 const [t,r,k]=at,row=state.tables?.[t]?.[r];
 if(projection&&Object.hasOwn(projection,'unavailable')&&row&&(!Object.hasOwn(row.values,k)||row.states?.[k]&&!['known','derived'].includes(row.states[k])))return clone(projection.unavailable);
 if(!row||!Object.hasOwn(row.values,k))fail('PHONE_DATABASE_REFERENCE','手机引用的表单字段不存在',{table:t,record:r,field:k});
 let v=clone(row.values[k]);if(v===null&&empty==='string')v='';if(unit==='minor100')v=cents(v);return v;
}

// Re-read authored records by their actual world/person scope. Collection
// coordinates are layout metadata, not a second membership register that a
// normal form writer must know. Business receipts, drafts and action history
// still come from the saved layout and are never rebuilt from initial values.
function refreshPhoneFormProjection(state,life,clockBinding,recordChildren){
 const worldId=life.world.id,entityId=life.state.identity.personId;
 const clockSource=phoneWorldClock(state,worldId,clockBinding),configuration=clockSource.configuration;
 let calendar=null;
 if(configuration){
  const clock=new WorldClock(configuration),origin=clockBinding?.origin??life.state.config.calendarOrigin??clock.ordinal();
  const initial=new WorldClock(configuration);initial.setOrdinal(origin);calendar=initial.c;
  life.state.config.calendar=clone(configuration);life.state.config.calendarOrigin=origin;
  life.state.clock={year:clock.c.year,month:clock.c.month??clock.c.season,day:clock.c.day,minute:clock.c.hour*clock.c.hour_minutes+clock.c.minute,totalMinutes:clock.ordinal()-origin,...(clock.c.mode==='SEASON_FIXED'?{season:clock.c.season}:{})};
 }
 const profile=phoneProfileFromForms(state,{worldId,entityId,dossierId:life.binding?.character?.dossierId,calendar,recordChildren});
 if(!profile)return;
 const c=profile.character,s=life.state,oldSocial=s.social;
 life.world={...life.world,...clone(profile.world)};s.identity.name=c.name;
 for(const key of ['apps','appNames','theme','currency','economy','travel','settlementOwner'])s.config[key]=clone(life.world[key]);
 s.wallet.accounts=clone(c.wallet.accounts);s.wallet.investmentProducts=clone(profile.world.economy.investments);
 const configurationRow=Object.values(state.tables.X_PHONE_WORLD_CONFIG??{}).find(row=>(row.values.world_ref==null||row.values.world_ref===worldId)&&(row.values.owner_ref==null||row.values.owner_ref===entityId));
 const declared=key=>configurationRow&&Object.hasOwn(configurationRow.values,key)&&(!configurationRow.states?.[key]||['known','derived'].includes(configurationRow.states[key]));
 for(const [key,field]of [['defaultAccountId','default_account_ref'],['fundingAccountId','funding_account_ref']]){
  if(declared(field))s.wallet[key]=c.wallet[key];
  else if(s.wallet[key]!=null&&!s.wallet.accounts.some(a=>a.id===s.wallet[key]))s.wallet[key]=null;
 }
 s.contacts=clone(c.contacts);s.commerce.products=clone(profile.world.catalog);s.inventory=clone(c.inventory);
 s.map.places=clone(profile.world.places);s.map.position=c.position;s.calendar.events=clone(c.calendar);
 const owned=c.accounts.filter(a=>a.owned).map(a=>a.id);
 oldSocial.accounts=c.accounts.map(({owned,following,...account})=>clone(account));oldSocial.ownedAccountIds=owned;
 oldSocial.activeAccountId=declared('active_account_ref')?c.activeAccountId:owned.includes(oldSocial.activeAccountId)?oldSocial.activeAccountId:owned[0]??null;
 oldSocial.follows=Object.fromEntries(c.accounts.map(a=>[a.id,clone(a.following)]));
 for(const key of ['likes','bookmarks','acceptedLikes'])oldSocial[key]=Object.fromEntries(owned.map(id=>[id,clone(oldSocial[key]?.[id]??[])]));
 oldSocial.drafts=Object.fromEntries(owned.map(id=>[id,clone(oldSocial.drafts?.[id]??{text:'',visibility:'public'})]));
 oldSocial.posts=c.posts.map(p=>({...clone(p),createdAt:p.createdAt??{year:null,month:null,day:null,minute:null,totalMinutes:null}}));oldSocial.comments=clone(c.comments);
 for(const key of ['photos','songs','playlists'])s.media[key]=clone(c[key]);
 Object.assign(s.media,clone(c.mediaExtras));Object.assign(s.commerce,clone(c.commerceExtras));
 life.formReadiness=clone(profile.formReadiness);
}
export function decodePhoneDatabase(state,{contextKey,revision,allowedOriginContextKeys=[]}={}){
 const binding=state.tables?.[PHONE_BINDING_TABLE]?.[currentId]?.values;if(!binding)return null;const configRef=binding.layout?.children?.life?.children?.world?.record?.[1],currencyRef=state.tables?.X_PHONE_WORLD_CONFIG?.[configRef]?.values?.currency_ref;
 // Reuse children freshly read by this same decoder. Ordinary row discovery
 // must not drop timestamps, media derivations or other linked child records.
 const recordChildren=new Map();
 const unpack=n=>{if(n.snapshot)return readCoordinate(state,n.snapshot);if(n.scalar)return readCoordinate(state,n.scalar,n.empty);if(n.array){if(!n.collection)return n.array.map(unpack);const c=n.collection,existing=new Map(n.array.filter(x=>x.record).map(x=>[x.record[1],x]));return Object.entries(state.tables?.[c.tableId]??{}).filter(([,r])=>r.values.collection_ref===c.collectionRef||r.values.parent_ref===c.parentRef&&r.values.collection_field===c.field).sort((a,b)=>(a[1].values.ordinal??0)-(b[1].values.ordinal??0)||a[0].localeCompare(b[0])).map(([rid,row])=>existing.has(rid)?unpack(existing.get(rid)):hydrateNew(c.tableId,rid,row.values));}const out={};for(const [k,f]of Object.entries(n.fields??{}))out[k]=f.at?readCoordinate(state,f.at,f.empty,f.unit,f):clone(f.unavailable);if(n.mapCollection){const c=n.mapCollection,existing=new Map(Object.values(n.children??{}).filter(x=>x.record).map(x=>[x.record[1],x]));for(const [rid,row]of Object.entries(state.tables?.[c.tableId]??{}))if(row.values.collection_ref===c.collectionRef){const key=row.values.dictionary_key??row.values.id??rid;out[key]=existing.has(rid)?unpack(existing.get(rid)):hydrateNew(c.tableId,rid,row.values);}}else for(const [k,v]of Object.entries(n.children??{}))out[k]=unpack(v);
  if(n.record?.[0]==='X_FIN_ACCOUNTS'){const row=state.tables.X_FIN_ACCOUNTS[n.record[1]].values;if(row.balance_ref!=null){const target=accountBalanceValues(state,row.balance_ref,binding.owner_ref,currencyRef);out.balance=known(state,'T_DYN_CURRENCY_BALANCES',row.balance_ref,'balance')?cents(target.balance):null;out.balance_ref=row.balance_ref;}else out.balance=null;}
  if(n.record)recordChildren.set(n.record.join('#'),Object.fromEntries(Object.keys(n.children??{}).map(key=>[key,clone(out[key])])));
  return out;};
 function hydrateNew(table,rid,values){const value=Object.fromEntries(Object.entries(values).filter(([k])=>k!=='row_uuid'&&!Object.hasOwn(relationFields,k)&&!['balance_ref','debt_ref'].includes(k)).map(([k,v])=>[k,clone(v)]));value.id??=rid;
  if(table==='X_FIN_ACCOUNTS'){value.balance=values.balance_ref==null?null:known(state,'T_DYN_CURRENCY_BALANCES',values.balance_ref,'balance')?cents(accountBalanceValues(state,values.balance_ref,binding.owner_ref,currencyRef).balance):(accountBalanceValues(state,values.balance_ref,binding.owner_ref,currencyRef),null);}
  if(table==='X_SOCIAL_POSTS'){value.mediaIds??=[];value.mediaGrants??=[];value.repostOf??=null;value.songId??=null;value.likesBase??=null;}
  if(table==='X_NETWORK_DOCUMENTS'){value.items??=[];value.at??=null;value.audience??=[];value.meta??={};}
  for(const [field,child]of Object.entries(table==='X_SHOP_ORDERS'?{items:'X_SHOP_ORDER_ITEMS'}:table==='X_FIN_LOANS'?{installments:'X_FIN_LOAN_INSTALLMENTS'}:table==='X_NETWORK_DOCUMENTS'?{items:'X_NETWORK_ITEMS'}:{}))value[field]=Object.entries(state.tables?.[child]??{}).filter(([,r])=>r.values.parent_ref===rid&&r.values.collection_field===field).sort((a,b)=>(a[1].values.ordinal??0)-(b[1].values.ordinal??0)).map(([id,r])=>hydrateNew(child,id,r.values));return value;
 }
 const result=unpack(binding.layout),at=path=>path.reduce((v,k)=>v[k],result);
 for(const alias of binding.layout.aliases??[])at(alias.path.slice(0,-1))[alias.path.at(-1)]=clone(at(alias.source));
 if(result.life){const configId=binding.layout.children?.life?.children?.world?.record?.[1],cfg=state.tables.X_PHONE_WORLD_CONFIG?.[configId]?.values??{};for(const key of ['background','panel','text','accent','radius'])if(Object.hasOwn(cfg,'theme_'+key))result.life.world.theme[key]=cfg['theme_'+key];if(cfg.appNames!=null)result.life.world.appNames=clone(cfg.appNames);for(const key of ['apps','appNames','theme','currency','economy','travel','settlementOwner'])result.life.state.config[key]=clone(result.life.world[key]);}
 if(binding.layout.clock&&result.life){const c=binding.layout.clock,{configuration}=phoneWorldClock(state,result.life.world?.id,c);const clock=new WorldClock(configuration),s=result.life.state;s.clock={year:clock.c.year,month:clock.c.month??clock.c.season,day:clock.c.day,minute:clock.c.hour*clock.c.hour_minutes+clock.c.minute,totalMinutes:clock.ordinal()-c.origin,...(clock.c.mode==='SEASON_FIXED'?{season:clock.c.season}:{})};s.config.calendar=clone(clock.c);delete s.config.calendar.row_uuid;delete s.config.calendar.name;delete s.config.calendar.world_ref;s.config.calendarOrigin=c.origin;}
 if(result.life)refreshPhoneFormProjection(state,result.life,binding.layout.clock,recordChildren);
 if(contextKey&&result.contextKey!==contextKey&&allowedOriginContextKeys.includes(result.contextKey))result.contextKey=contextKey;
 if(contextKey&&result.contextKey!==contextKey)fail('PHONE_DATABASE_SCOPE','手机表单属于另一会话，需通过已验证的原生分支继承');
 if(result.life){result.life.databaseRefs={};for(const [table,rows]of Object.entries(state.tables??{}))for(const [rid,row]of Object.entries(rows))if(row.values.id&&row.values.owner_ref===result.life.state.identity.personId&&row.values.world_ref===result.life.world.id)result.life.databaseRefs[table+'#'+row.values.id]={tableId:table,recordId:rid};}
 return attachPhoneDatabaseSnapshot(result,{revision:revision??state.runtime?.revision??0});
}
export function readPhoneDatabaseProfile(state,{worldId,entityId,dossierId}={}){
 const archive=decodePhoneDatabase(state);if(archive?.life){const life=archive.life;if(worldId&&life.world.id!==worldId||entityId&&life.state.identity.personId!==entityId)return null;return {database:true,worldId:life.world.id,entityId:life.state.identity.personId,binding:clone(life.binding),life:clone(life)};}
 if(!state.tables?.T_STATIC_WORLDS?.[worldId]||!state.tables?.T_SYS_ENTITIES?.[entityId])return null;
 const {configuration:calendar}=phoneWorldClock(state,worldId);return phoneProfileFromForms(state,{worldId,entityId,dossierId,calendar});
}
export function restorePhoneDatabaseHistory(current,saved,{contextKey,allowedOriginContextKeys=[]}={}){
 if(!current.tables?.[PHONE_BINDING_TABLE]?.[currentId]||!saved.tables?.[PHONE_BINDING_TABLE]?.[currentId])return current;
 const origin=saved.tables[PHONE_BINDING_TABLE][currentId].values.context_key;if(contextKey&&origin!==contextKey&&!allowedOriginContextKeys.includes(origin))return current;
 const options={contextKey,allowedOriginContextKeys},present=decodePhoneDatabase(current,options),previous=decodePhoneDatabase(saved,options),merged=JSON.parse(exportPhone(mergePhoneHistory(present,previous)));
 if(stable(present)===stable(merged))return current;
 // Compare the two projections so that only recovered history coordinates and
 // their shape change. Existing canonical money, clocks and owner rows are not
 // copied from the earlier bundle into the current branch.
 const base=encodePhoneDatabase(present,current),next=encodePhoneDatabase(merged,current),baseRows=new Map(base.changes.map(c=>[c.tableId+'#'+c.recordId,c])),runtime=new Runtime(current);
 for(const spec of next.schema){if(!runtime.data.schema[spec.id]){runtime.data.schema[spec.id]=clone(spec);runtime.data.tables[spec.id]={};}else for(const field of spec.fields)if(!runtime.data.schema[spec.id].fields.some(f=>f.key===field.key))runtime.declareField(spec.id,field);}
 for(const change of next.changes){if(change.remove)continue;const before=baseRows.get(change.tableId+'#'+change.recordId),physical=current.tables?.[change.tableId]?.[change.recordId]?.values,values=Object.fromEntries(Object.entries(change.values).filter(([field,value])=>!physical||!Object.hasOwn(physical,field)||!before||!Object.hasOwn(before.values??{},field)||stable(before.values[field])!==stable(value)));if(!Object.keys(values).length)continue;if(!runtime.rows(change.tableId)[change.recordId])runtime.newRecord(change.tableId,{},change.recordId);for(const [field,value]of Object.entries(values))runtime.set([change.tableId,change.recordId,field,[]],value,change.states?.[field]??'known');if(change.metadata)runtime.record(change.tableId,change.recordId).metadata={...runtime.record(change.tableId,change.recordId).metadata,...clone(change.metadata)};}
 return runtime.data;
}
export function createPhoneDatabaseStorage({database,contextKey}={}){
 if(!database?.read||!database?.commit)fail('PHONE_DATABASE_SERVICE','缺少唯一表单数据库接口');let loadedRevision=null,phoneRevision=null,previousActions=new Set(),reservations={};
 const read=async()=>{const value=await database.read();if(!value)fail('ENGINE_NOT_BOUND','请先接入最新版表单');if(value.contextKey!==contextKey)fail('PHONE_CONTEXT_CHANGED','手机表单聊天已改变');return value;};
 return {authoritativeDatabase:true,async load(){const db=await read();loadedRevision=db.revision;let archive=decodePhoneDatabase(db.state,{contextKey,revision:db.revision,allowedOriginContextKeys:db.allowedOriginContextKeys??[]});if(!archive&&db.phoneDetached)fail('PHONE_DATABASE_DETACHED','当前历史已离开手机初始化分支，原手机证据仍在同一存档，未重新初始化');
  phoneRevision=archive?.revision??null;previousActions=new Set((archive?.actions??[]).map(a=>a.id));reservations=db.phoneActionReservations??{};return archive;
 },async save(archive,{expectedRevision,kind='state'}={}){const db=await read();if(loadedRevision!==db.revision)fail('PHONE_DATABASE_STALE','表单已更新，请刷新手机后重试；未覆盖新数据');if(phoneRevision!==expectedRevision)fail('PHONE_LIFE_REVISION','手机版本已变化');const encoded=encodePhoneDatabase(archive,db.state,{initializing:!db.state.tables?.[PHONE_BINDING_TABLE]?.[currentId]?.values?.owner_ref&&!!archive.life});const newPhoneActions=(archive.actions??[]).filter(a=>!previousActions.has(a.id));for(const action of newPhoneActions)if(reservations[action.id])fail('PHONE_LIFE_ACTION_BRANCH','这个操作ID属于已离开的历史，不能在当前分支重用');const source={kind:'phone',lifecycle:kind,newPhoneActions};const operationId='phone:'+digest({contextKey,previous:phoneRevision,...encoded,source});const commit=['turn-prepare','turn-accept','turn-fail','turn-reconcile','turn-reject'].includes(kind)&&database.commitLifecycle?database.commitLifecycle:database.commit;const result=await commit({operationId,expectedRevision:db.revision,contextKey,...encoded,source});loadedRevision=result.revision;phoneRevision=archive.revision;return {...result,phoneArchive:decodePhoneDatabase(result.state,{contextKey,revision:result.revision,allowedOriginContextKeys:db.allowedOriginContextKeys??[]})};}};
}

export function phoneDatabaseReference(path,{root}={}){const p=Array.isArray(path)?path:String(path).split('/');const semantic=p.map((k,i)=>/^\d+$/.test(k)||maps.has(p.slice(0,i).join('/'))?'*':k);const table=history(p.join('/'))?historyTable(p.join('/')):namedTable(semantic),value=root?p.reduce((v,k)=>v?.[k],root):null,saved=value?.id?root?.life?.databaseRefs?.[table+'#'+value.id]:null;if(saved)return clone(saved);return {tableId:table,recordId:phoneDatabaseRecordId(root&&!history(p.join('/'))?entityPath(p,root):p)};}
export const PHONE_DATABASE_ENTITY_TABLES=Object.freeze({...tableNames});

export function phoneDatabaseRows(root){const rows=[];function visit(value,path=[]){if(!value||typeof value!=='object')return;if(!Array.isArray(value)){const semantic=path.map((k,i)=>/^\d+$/.test(k)||maps.has(path.slice(0,i).join('/'))?'*':k).join('/');if(tableNames[semantic])rows.push({reference:phoneDatabaseReference(path,{root}),value:clone(value),path:clone(path)});}for(const [k,v]of Object.entries(value))visit(v,[...path,k]);}visit(root);return rows;}
