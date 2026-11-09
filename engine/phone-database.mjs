// Phone views are hydrated from the forms database. The layout contains only
// coordinates and shape; every current business scalar lives in a typed row.
// Seed/envelopes/frame snapshots are immutable history, never current authority.
import {clone,digest,stable,stableId,fail} from './common.mjs';
import {WorldClock} from './math.mjs';
import {importPhone,exportPhone,attachPhoneDatabaseSnapshot} from '../phone-core.mjs';
import {EXTENSION_PREFERENCE_SCHEMA} from '../extension-preferences.mjs';

export const PHONE_BINDING_TABLE='X_PHONE_BINDINGS';
export const phoneDatabaseRecordId=path=>stableId('phone:'+JSON.stringify(Array.isArray(path)?path:String(path).split('/')));
const currentId='phone-current';
const field=(key,type='TEXT')=>({key,label:key,type});
export const PHONE_DATABASE_SCHEMAS=[{id:PHONE_BINDING_TABLE,label:'手机表单视图绑定',fields:[field('row_uuid','ID'),field('context_key'),field('world_ref','REF'),field('owner_ref','REF'),field('revision','INTEGER'),field('layout','JSON'),field('archive_digest'),field('migration_source','JSON')]},EXTENSION_PREFERENCE_SCHEMA];
const tableNames={
 'life/world':'X_PHONE_WORLD_CONFIG','life/state/wallet/accounts/*':'X_FIN_ACCOUNTS','life/state/wallet/card':'X_FIN_CREDIT_CARDS','life/state/wallet/card/charges/*':'X_FIN_CREDIT_CHARGES','life/state/wallet/card/statements/*':'X_FIN_CREDIT_STATEMENTS','life/state/wallet/loans/*':'X_FIN_LOANS','life/state/wallet/loans/*/installments/*':'X_FIN_LOAN_INSTALLMENTS','life/state/wallet/investments/*':'X_FIN_INVESTMENTS','life/world/economy/investments/*':'X_FIN_INVESTMENT_PRODUCTS','life/state/wallet/ledger/*':'X_FIN_TRANSACTIONS','life/state/commerce/orders/*':'X_SHOP_ORDERS','life/state/commerce/orders/*/items/*':'X_SHOP_ORDER_ITEMS','life/state/commerce/cart/*':'X_SHOP_CART_ITEMS','life/state/commerce/products/*':'X_SHOP_PRODUCT_DETAILS','life/state/inventory/*':'X_HOLDING_DETAILS','life/state/social/accounts/*':'X_SOCIAL_ACCOUNTS','life/state/social/posts/*':'X_SOCIAL_POSTS','life/state/social/comments/*':'X_SOCIAL_COMMENTS','life/state/social/notifications/*':'X_SOCIAL_NOTIFICATIONS','life/state/social/pending/*':'X_SOCIAL_OUTBOX','life/state/media/photos/*':'X_MEDIA_PHOTOS','life/state/media/songs/*':'X_MEDIA_SONGS','life/state/media/playlists/*':'X_MEDIA_PLAYLISTS','life/state/calendar/events/*':'X_CALENDAR_EVENTS','life/state/map/places/*':'X_PLACE_MAP_POINTS','life/state/map/journey':'X_JOURNEY_DETAILS','life/state/contacts/*':'X_SOCIAL_CONTACTS','suite/documents/*':'X_NETWORK_DOCUMENTS','suite/documents/*/items/*':'X_NETWORK_ITEMS','suite/accounts/*':'X_NETWORK_ACCOUNTS','actions/*':'X_PHONE_ACTIONS','requests/*':'X_PHONE_REQUESTS','frames/*':'X_PHONE_FRAMES','lifeEventLog/*':'X_PHONE_LIFE_EVENTS'};
const maps=new Set(['suite/accounts','suite/documents','suite/branches','requests','frames','rejectedSources','drafts','life/state/receipts','life/state/social/drafts','life/state/social/follows','life/state/social/likes','life/state/social/bookmarks','life/state/social/acceptedLikes']);
const history=p=>p==='suite/seed'||p==='lifeInitial'||/^suite\/branches\/[^/]+\/envelopes\/\d+$/.test(p)||/^lifeEventLog\/\d+$/.test(p)||/^frames\/[^/]+$/.test(p)||/^requests\/[^/]+$/.test(p);
const historyTable=p=>p.startsWith('frames/')?'X_PHONE_FRAMES':p.startsWith('requests/')?'X_PHONE_REQUESTS':p.startsWith('lifeEventLog/')?'X_PHONE_LIFE_EVENTS':p==='lifeInitial'?'X_PHONE_INITIAL_SNAPSHOTS':p==='suite/seed'?'X_NETWORK_SEEDS':'X_NETWORK_ENVELOPES';
const pathId=p=>phoneDatabaseRecordId(p);
function namedTable(semantic){const p=semantic.join('/');return tableNames[p]??'X_PHONE_'+semantic.filter(x=>x!=='*').map(x=>x.replace(/[^A-Za-z0-9]/g,'_').toUpperCase()).join('_');}
const typeOf=(v,key)=>v===null?'JSON':typeof v==='number'?(Number.isSafeInteger(v)?'INTEGER':'NUMBER'):typeof v==='boolean'?'BOOLEAN':typeof v==='string'?'TEXT':'JSON';
const rowValue=(s,t,r,k)=>s.tables?.[t]?.[r]?.values?.[k];
const known=(s,t,r,k)=>['known','derived'].includes(s.tables?.[t]?.[r]?.states?.[k]);
const cents=v=>{if(v===null||v===undefined)return null;const c=Math.round(v*100);if(!Number.isSafeInteger(c)||Math.abs(c/100-v)>1e-8)fail('PHONE_MONEY_PRECISION','现有余额精度不能无损映射为分');return c;};

export function encodePhoneDatabase(archive,databaseState,{migration=false}={}){
 const phone=importPhone(archive),scope=phone.contextKey,changes=new Map(),schemas=new Map(PHONE_DATABASE_SCHEMAS.map(t=>[t.id,clone(t)]));
 const life=phone.life,person=life?.state?.identity?.personId,world=life?.world?.id,currency=world?world+':currency':null;
 const ensure=(t,k,v)=>{let spec=schemas.get(t);if(!spec){spec={id:t,label:t,fields:[field('row_uuid','ID')]};schemas.set(t,spec);}const existing=databaseState.schema?.[t]?.fields?.find(f=>f.key===k);if(!spec.fields.some(f=>f.key===k))spec.fields.push(existing?clone(existing):field(k,typeOf(v,k)));};
 const write=(t,r,k,v,{canonical=false}={})=>{
  const existing=databaseState.schema?.[t]?.fields?.find(f=>f.key===k);if(canonical&&!existing)fail('PHONE_DATABASE_SCHEMA','既有表字段不存在',{table:t,field:k});if(!canonical)ensure(t,k,v);
  if(migration&&canonical&&known(databaseState,t,r,k)&&stable(rowValue(databaseState,t,r,k))!==stable(v))fail('PHONE_MIGRATION_CONFLICT','旧手机与既有表单数值冲突，迁移未写入',{table:t,record:r,field:k,existing:rowValue(databaseState,t,r,k),incoming:v});
  const key=t+'#'+r;let c=changes.get(key);if(!c){c={tableId:t,recordId:r,values:{},metadata:{phone_scope:scope}};changes.set(key,c);}c.values[k]=v;return [t,r,k];
 };
 function canonical(path,obj,key,value){
  const p=path.join('/');let target=null,unit=null;
  if(p==='life/world'&&['id','name'].includes(key))target=['T_STATIC_WORLDS',world,key==='id'?'world_id':'name'];
  if(p==='life/state/identity'&&['personId','name'].includes(key))target=['T_SYS_ENTITIES',person,key==='personId'?'entity_id':'name'];
  if(/^life\/state\/contacts\/\d+$/.test(p)&&key==='name')target=['T_SYS_ENTITIES',obj.personId??obj.id,'name'];
  if(/^life\/state\/wallet\/accounts\/\d+$/.test(p)&&key==='balance'){
   const r='account:'+person+':'+obj.id;write('T_DYN_CURRENCY_BALANCES',r,'owner_ref',person,{canonical:true});write('T_DYN_CURRENCY_BALANCES',r,'currency_ref',currency,{canonical:true});target=['T_DYN_CURRENCY_BALANCES',r,'balance'];value=value===null?null:value/100;unit='minor100';
  }
  if(/^life\/state\/map\/places\/\d+$/.test(p)&&['id','name'].includes(key))target=['T_STATIC_PLACES',obj.id,key==='id'?'place_id':'name'];
  if(/^life\/state\/commerce\/products\/\d+$/.test(p)){
   if(['id','name','description','kind'].includes(key))target=['T_STATIC_ITEMS_SKILLS',obj.id,({id:'asset_id',name:'name',description:'identified_full_desc',kind:'category'})[key]];
   if(['price','stock'].includes(key)){const rid='offer:'+world+':'+obj.id;write('X_SHOP_OFFERS',rid,'item_ref',obj.id,{canonical:true});write('X_SHOP_OFFERS',rid,'currency_ref',currency,{canonical:true});target=['X_SHOP_OFFERS',rid,key==='price'?'buy_price':'stock'];if(key==='price'){value=value===null?null:value/100;unit='minor100';}}
  }
  if(/^life\/state\/inventory\/\d+$/.test(p)&&['quantity','productId'].includes(key))target=['T_DYN_HOLDINGS_INVENTORY','holding:'+person+':'+obj.id,key==='quantity'?'quantity':'item_ref'];
  if(p==='life/state/map'&&key==='position')target=['T_SYS_ENTITIES',person,'place_ref'];
  if(/^life\/state\/media\/(photos|songs)\/\d+$/.test(p)){
   const rid='media:'+person+':'+obj.id;
   if(key==='ownerId')target=['T_SYS_MEDIA_ASSETS',rid,'entity_ref'];
   if(['audioId','assetId'].includes(key))target=['T_SYS_MEDIA_ASSETS',rid,'asset_locator'];
   if(key==='checksum')target=['T_SYS_MEDIA_ASSETS',rid,'checksum'];
  }
  if(!target)return null;write(...target,value,{canonical:true});return {at:target,...(unit?{unit}:{}),empty:value===''?'string':null};
 }
 function pack(value,path=[],semantic=[]){
  const p=path.join('/');
  if(history(p)){const t=historyTable(p),r=pathId(path);write(t,r,'snapshot',clone(value));return {snapshot:[t,r,'snapshot']};}
  if(Array.isArray(value))return {array:value.map((v,i)=>pack(v,[...path,String(i)],[...semantic,'*']))};
  if(value===null||typeof value!=='object'){
   const t=namedTable(semantic.length?semantic:['ROOT_VALUE']),r=pathId(path);write(t,r,'value',value);return {scalar:[t,r,'value'],empty:value===''?'string':null};
  }
  const table=namedTable(semantic.length?semantic:['SESSION']),rid=pathId(path),fields={},children={};
  for(const [key,v]of Object.entries(value)){
   if(v===undefined)continue;
   if(path.length===0&&key==='life'){} // life is the current normalized view.
   const next=[...path,key],sem=[...semantic,maps.has(p)?'*':key];
   if(v===null||typeof v!=='object'){
    const special=canonical(path,value,key,v);fields[key]=special??{at:write(table,rid,key,v),empty:v===''?'string':null};
   }else children[key]=pack(v,next,sem);
  }
  return {fields,children};
 }
 // Avoid two editable copies of shared configuration/catalogs in current rows.
 const aliases=[];
 if(life){for(const key of ['apps','appNames','theme','currency','economy','travel','settlementOwner']){aliases.push({path:['life','state','config',key],source:['life','world',key]});delete phone.life.state.config[key];}
  for(const [path,source]of [[['life','world','catalog'],['life','state','commerce','products']],[['life','world','places'],['life','state','map','places']],[['life','state','wallet','investmentProducts'],['life','world','economy','investments']]]){aliases.push({path,source});let at=phone;for(const k of path.slice(0,-1))at=at[k];delete at[path.at(-1)];}
 }
 const layout=pack(phone);layout.aliases=aliases;
 if(life){
  const clockId=databaseState.runtime?.calendar_record_id??Object.keys(databaseState.tables?.X_WORLD_CLOCKS??{}).at(0)??'world-clock:'+world;
  const existing=databaseState.tables?.X_WORLD_CLOCKS?.[clockId];
  let clockConfig=existing?clone(existing.values):null;
  if(!clockConfig&&Number.isFinite(life.state.config.epoch)){
   const d=new Date(life.state.config.epoch+(life.state.config.timezoneOffsetMinutes??0)*60000);clockConfig={name:life.world.name,world_ref:world,mode:'MONTH_TABLE',year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:d.getUTCHours(),minute:d.getUTCMinutes(),day_hours:24,hour_minutes:60,month_lengths:[31,28,31,30,31,30,31,31,30,31,30,31],leap_rule:'GREGORIAN'};
  }
  if(clockConfig){
   const clock=new WorldClock(clockConfig),origin=life.state.config.calendarOrigin??new WorldClock({...clockConfig,year:life.state.clock.year,month:life.state.clock.month,season:life.state.clock.season,day:life.state.clock.day,hour:Math.floor(life.state.clock.minute/clockConfig.hour_minutes),minute:life.state.clock.minute%clockConfig.hour_minutes}).ordinal()-life.state.clock.totalMinutes;
   if(migration&&existing&&clock.ordinal()!==origin+life.state.clock.totalMinutes)fail('PHONE_MIGRATION_CLOCK','旧手机时刻与表单世界时钟不同，未自动选择或叠加');
   clock.setOrdinal(origin+life.state.clock.totalMinutes);for(const [k,v]of Object.entries(clock.c))if(databaseState.schema?.X_WORLD_CLOCKS?.fields.some(f=>f.key===k))write('X_WORLD_CLOCKS',clockId,k,v,{canonical:true});
   layout.clock={tableId:'X_WORLD_CLOCKS',recordId:clockId,origin};
   // Clock fields in phone rows are deleted: hydrate derives them from X_WORLD_CLOCKS.
   const discard=node=>{if(node?.fields)for(const x of Object.values(node.fields)){const [t,r,k]=x.at;changes.get(t+'#'+r)&&delete changes.get(t+'#'+r).values[k];}};
   discard(layout.children.life.children.state.children.clock);delete layout.children.life.children.state.children.clock;
  }
 }
 const bind={context_key:scope,world_ref:world??null,owner_ref:person??null,revision:phone.revision,layout,archive_digest:digest(archive)};
 if(migration)bind.migration_source=clone(archive);
 changes.set(PHONE_BINDING_TABLE+'#'+currentId,{tableId:PHONE_BINDING_TABLE,recordId:currentId,values:bind});
 return {changes:[...changes.values()].filter(c=>Object.keys(c.values).length),schema:[...schemas.values()]};
}

function readCoordinate(state,at,empty,unit){const [t,r,k]=at,row=state.tables?.[t]?.[r];if(!row||!Object.hasOwn(row.values,k))fail('PHONE_DATABASE_REFERENCE','手机引用的表单字段不存在',{table:t,record:r,field:k});let v=clone(row.values[k]);if(v===null&&empty==='string')v='';if(unit==='minor100')v=cents(v);return v;}
export function decodePhoneDatabase(state,{contextKey,revision}={}){
 const binding=state.tables?.[PHONE_BINDING_TABLE]?.[currentId]?.values;if(!binding)return null;
 const unpack=n=>{if(n.snapshot)return readCoordinate(state,n.snapshot);if(n.scalar)return readCoordinate(state,n.scalar,n.empty);if(n.array)return n.array.map(unpack);const out={};for(const [k,f]of Object.entries(n.fields??{}))out[k]=readCoordinate(state,f.at,f.empty,f.unit);for(const [k,v]of Object.entries(n.children??{}))out[k]=unpack(v);return out;};
 const result=unpack(binding.layout),at=path=>path.reduce((v,k)=>v[k],result);
 for(const alias of binding.layout.aliases??[])at(alias.path.slice(0,-1))[alias.path.at(-1)]=clone(at(alias.source));
 if(binding.layout.clock&&result.life){const c=binding.layout.clock,values=state.tables[c.tableId]?.[c.recordId]?.values;if(!values)fail('PHONE_DATABASE_CLOCK','世界时钟绑定不存在');const clock=new WorldClock(values),s=result.life.state;s.clock={year:clock.c.year,month:clock.c.month??clock.c.season,day:clock.c.day,minute:clock.c.hour*clock.c.hour_minutes+clock.c.minute,totalMinutes:clock.ordinal()-c.origin,...(clock.c.mode==='SEASON_FIXED'?{season:clock.c.season}:{})};s.config.calendar=clone(clock.c);s.config.calendarOrigin=c.origin;}
 if(contextKey&&result.contextKey!==contextKey)fail('PHONE_DATABASE_SCOPE','手机表单属于另一会话，需通过已验证的原生分支继承');
 return attachPhoneDatabaseSnapshot(result,{revision:revision??state.runtime?.revision??0});
}
export function readPhoneDatabaseProfile(state,{worldId,entityId}={}){
 const archive=decodePhoneDatabase(state);if(!archive?.life)return null;const life=archive.life;if(worldId&&life.world.id!==worldId||entityId&&life.state.identity.personId!==entityId)return null;
 return {database:true,worldId:life.world.id,entityId:life.state.identity.personId,binding:clone(life.binding),life:clone(life)};
}
export function createPhoneDatabaseStorage({database,contextKey,legacyLoad}={}){
 if(!database?.read||!database?.commit)fail('PHONE_DATABASE_SERVICE','缺少唯一表单数据库接口');let loadedRevision=null,phoneRevision=null,legacy=null;
 const read=async()=>{const value=await database.read();if(!value)fail('ENGINE_NOT_BOUND','请先接入最新版表单');if(value.contextKey!==contextKey)fail('PHONE_CONTEXT_CHANGED','手机表单聊天已改变');return value;};
 return {authoritativeDatabase:true,async load(){const db=await read();loadedRevision=db.revision;let archive=decodePhoneDatabase(db.state,{contextKey,revision:db.revision});if(!archive&&legacyLoad){legacy=await legacyLoad();if(legacy!=null){archive=importPhone(legacy,{contextKey});const encoded=encodePhoneDatabase(archive,db.state,{migration:true});const saved=await database.commit({operationId:'phone-migration:'+digest({contextKey,legacy}),expectedRevision:db.revision,contextKey,...encoded,source:{kind:'phone-migration'}});loadedRevision=saved.revision;archive=decodePhoneDatabase(saved.state,{contextKey,revision:saved.revision});}}
  phoneRevision=archive?.revision??null;return archive;
 },async save(archive,{expectedRevision,kind='state'}={}){const db=await read();if(loadedRevision!==db.revision)fail('PHONE_DATABASE_STALE','表单已更新，请刷新手机后重试；未覆盖新数据');if(phoneRevision!==expectedRevision)fail('PHONE_LIFE_REVISION','手机版本已变化');const encoded=encodePhoneDatabase(archive,db.state,{migration:!db.state.tables?.[PHONE_BINDING_TABLE]?.[currentId]&&!!archive.life});const operationId='phone:'+digest({contextKey,previous:phoneRevision,archive});const source={kind:'phone',lifecycle:kind};const commit=['turn-prepare','turn-accept','turn-fail','turn-reconcile','turn-reject'].includes(kind)&&database.commitLifecycle?database.commitLifecycle:database.commit;const result=await commit({operationId,expectedRevision:db.revision,contextKey,...encoded,source});loadedRevision=result.revision;phoneRevision=archive.revision;return result;}};
}
