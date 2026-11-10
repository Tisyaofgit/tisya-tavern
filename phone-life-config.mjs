import {WorldClock} from './engine/math.mjs';
import {sha256} from './engine/common.mjs';
import {validateState,refreshState} from './phone-life/core.mjs';
import {validateSocialState} from './phone-life/social.mjs';

export const PHONE_LIFE_FORMAT='tisya.phone-life/1';
export const PHONE_WORLD_FORMAT='tisya.phone-world/1';
export const PHONE_CHARACTER_FORMAT='tisya.phone-character/1';
export const PHONE_APP_LABELS=Object.freeze({weibo:'微博',wallet:'钱包',shop:'商城',food:'外卖',album:'相册',music:'音乐',map:'地图',calendar:'日历'});
const APPS=Object.keys(PHONE_APP_LABELS),BAD=new Set(['__proto__','prototype','constructor']);
const own=(o,k)=>Object.hasOwn(o??{},k),plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),clone=x=>structuredClone(x);
const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':plain(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x);
const digest=x=>sha256(stable(x));
function need(ok,message,code='PHONE_LIFE_CONFIG'){if(!ok)throw Object.assign(new Error(message),{code});}
function safe(x,seen=new Set()){if(!x||typeof x!=='object')return;need(!seen.has(x),'配置不能循环引用。');seen.add(x);need(!Object.getOwnPropertySymbols(x).length,'配置不能包含符号字段。');for(const [k,d] of Object.entries(Object.getOwnPropertyDescriptors(x))){need(!BAD.has(k)&&!d.get&&!d.set&&k!=='toJSON','配置只接受安全 JSON 数据。');safe(d.value,seen);}seen.delete(x);}
function text(x,label,{nullable=false,max=2000}={}){if(x==null&&nullable)return null;need(typeof x==='string'&&x.trim()&&x.length<=max,label+'须为非空文字。');return x.trim();}
function id(x,label,{nullable=false}={}){if(x==null&&nullable)return null;const v=text(x,label,{max:160});need(!BAD.has(v)&&!/[\u0000-\u001f]/u.test(v),label+'无效。');return v;}
function validateBinding(binding){need(plain(binding),'手机表单绑定缺失。');safe(binding);for(const key of ['world','character']){const ref=binding[key];need(ref?.database===true,'手机只接受当前表单记录绑定。');id(key==='world'?ref.worldId:ref.entityId,key+'表单记录');if(key==='character'&&ref.dossierId!==undefined)id(ref.dossierId,'人物原点记录');}return true;}
function assertNormalizedWorld(w){need(w?.format===PHONE_WORLD_FORMAT,'手机世界必须来自当前表单。');safe(w);id(w.id,'已填写的世界编号');text(w.name,'已填写的世界名称');need(Array.isArray(w.apps)&&w.apps.every(a=>APPS.includes(a))&&new Set(w.apps).size===w.apps.length,'应用清单无效。');need(plain(w.theme)&&plain(w.economy)&&Array.isArray(w.catalog)&&Array.isArray(w.places),'世界结构不完整。');for(const [key,value]of Object.entries(w.theme)){need(['background','panel','text','accent','radius'].includes(key),'画风含未知字段。');if(key==='radius')need(value===null||Number.isSafeInteger(value)&&value>=0&&value<=40,'画风圆角超出范围。');else need(value===null||typeof value==='string'&&/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(value),'画风须使用安全颜色令牌。');}}
export function createInitialPhoneLife({world,character,binding,calendar=null,database=false}={}){
 need(database===true&&world?.settlementOwner==='tables','手机只从统一表单初始化。');
 assertNormalizedWorld(world);need(character?.format===PHONE_CHARACTER_FORMAT,'角色必须有已填写的手机初态。');safe(character);id(character.id,'已填写的角色编号');text(character.name,'已填写的角色姓名');validateBinding(binding);
 const w=clone(world),c=clone(character),owned=c.accounts.filter(a=>a.owned).map(a=>a.id);for(const a of c.accounts)if(a.owned){need(a.personId===null||a.personId===c.id,'本人账号不能归属另一人物。');a.personId=c.id;}
 const active=c.activeAccountId??owned[0]??null;need(active===null?!owned.length:owned.includes(active),'当前账号必须属于此人物。');
 const epoch=null,tz=0,clock={year:null,month:null,day:null,minute:null,totalMinutes:0};
 const wallet=c.wallet;wallet.card??={enabled:false,id:null,name:'',limit:null,used:0,refundBalance:0,billDay:null,dueDay:null,charges:[],statements:[]};wallet.investmentProducts=clone(w.economy.investments);wallet.ledger=[];wallet.external=0;
 for(const a of [wallet.defaultAccountId,wallet.fundingAccountId].filter(Boolean))need(wallet.accounts.some(x=>x.id===a),'默认钱包账户引用不存在。');
 wallet.initialNet=wallet.accounts.reduce((n,a)=>n+(a.balance??0),0)+wallet.investments.reduce((n,p)=>n+p.principal+p.accrued,0)+wallet.card.refundBalance-wallet.card.used-wallet.loans.reduce((n,l)=>n+l.remainingPrincipal,0);
 const maps=()=>Object.fromEntries(owned.map(x=>[x,[]]));
 const state={schema:1,revision:0,seq:0,applied:[],receipts:{},audit:[],identity:{personId:c.id,name:c.name},contacts:c.contacts,config:{apps:clone(w.apps),appNames:clone(w.appNames??{}),theme:clone(w.theme),currency:clone(w.currency),economy:clone(w.economy),travel:clone(w.travel),epoch,timezoneOffsetMinutes:tz,settlementOwner:w.settlementOwner,subjectId:c.id,demo:false},clock,wallet,commerce:{products:clone(w.catalog),cart:[],orders:[]},inventory:[],map:{position:c.position,journey:null,places:clone(w.places)},calendar:{events:c.calendar.map(event=>{need(Number.isSafeInteger(event.at)&&event.at>=0,'日程需要明确的故事分钟。');return clone(event);})},social:{ownedAccountIds:owned,ownerPersonId:c.id,activeAccountId:active,accidentalLikes:false,drafts:Object.fromEntries(owned.map(x=>[x,{text:'',visibility:'public'}])),accounts:c.accounts.map(({owned,following,...a})=>a),follows:Object.fromEntries(c.accounts.map(a=>[a.id,a.following])),likes:maps(),bookmarks:maps(),acceptedLikes:maps(),posts:c.posts.map(p=>({...p,createdAt:p.createdAt??{year:null,month:null,day:null,minute:null,totalMinutes:null}})),comments:[],notifications:[],pending:[]},media:{ownerId:c.id,photos:c.photos.map(p=>({...p,ownerId:p.ownerId??c.id})),songs:c.songs,playlists:c.playlists,favoritePhotos:[],favoriteSongs:[]}};
 if(database){state.inventory=clone(c.inventory??[]);state.social.comments=clone(c.comments??[]);Object.assign(state.media,clone(c.mediaExtras??{}));Object.assign(state.commerce,clone(c.commerceExtras??{}));}
 if(c.position!==null)need(w.places.some(p=>p.id===c.position),'当前位置没有登记在世界地点中。');
 for(const row of state.wallet.investments)need(state.wallet.investmentProducts.some(p=>p.id===row.productId),'已有持仓的产品没有世界定义。');
 if(database){state.config.database=true;if(calendar){const time=new WorldClock(calendar),c=time.c;state.config.calendar=clone(c);state.config.calendarOrigin=time.ordinal();state.clock={year:c.year,month:c.month??c.season,day:c.day,minute:c.hour*c.hour_minutes+c.minute,totalMinutes:0,...(c.mode==='SEASON_FIXED'?{season:c.season}:{})};}}
 const worldDigest=w.sourceDigest??digest(w),characterDigest=c.sourceDigest??digest(c),initialDigest=digest({binding,worldDigest,characterDigest});
 const life={format:PHONE_LIFE_FORMAT,binding:clone(binding),world:w,initialization:{id:'phone-init:'+initialDigest,digest:initialDigest,worldDigest,characterDigest,subjectId:c.id,worldId:w.id},state:refreshState(state)};
 validatePhoneLife(life);return life;
}
export function validatePhoneLife(life,{binding}={}){
 need(life?.format===PHONE_LIFE_FORMAT,'生活手机存档版本无效。','PHONE_LIFE_ARCHIVE');safe(life);validateBinding(life.binding);if(binding!==undefined)need(stable(life.binding)===stable(binding),'生活手机来源归属已改变，未覆盖原档。','PHONE_LIFE_BINDING');assertNormalizedWorld(life.world);
 const i=life.initialization,s=life.state;need(plain(i)&&typeof i.id==='string'&&[i.digest,i.worldDigest,i.characterDigest].every(x=>typeof x==='string'&&/^[a-f\d]{64}$/i.test(x)),'初始化回执缺失。');
 need(i.subjectId===s?.identity?.personId&&i.subjectId===s.config?.subjectId&&i.worldId===life.world.id,'生活手机人物或世界绑定不一致。','PHONE_LIFE_BINDING');need(s.config?.demo===false,'独立演示存档不能冒充正式生活手机。');need(s.media?.ownerId===i.subjectId&&s.social?.ownerPersonId===i.subjectId,'媒体或网络账号绑定到了另一人物。','PHONE_LIFE_BINDING');
 for(const key of ['apps','appNames','theme','currency','economy','travel','settlementOwner'])need(stable(s.config[key])===stable(life.world[key]),'世界'+key+'与运行配置不一致。');need(s.config.database===true&&s.config.settlementOwner==='tables','手机账目归属必须是统一表单。');
 validateState(s);validateSocialState(s);return true;
}
export function phoneLifeCapabilities(value){
 const s=value?.format===PHONE_LIFE_FORMAT?value.state:value,config=s?.config??{},ready=!!config.calendar,phone=config.settlementOwner==='tables'&&config.database===true,known=(s?.wallet?.accounts??[]).some(a=>Number.isSafeInteger(a.balance)),loan=config.economy?.loan;
 const loanReady=loan&&['annualRateBps','periodDays','periodsPerYear','minAmount','maxAmount'].every(k=>Number.isSafeInteger(loan[k]))&&loan.periodDays>0&&loan.periodsPerYear>0&&loan.minAmount>0&&loan.maxAmount>=loan.minAmount&&Array.isArray(loan.terms)&&loan.terms.length>0;
 return {apps:clone(config.apps??[]),accountReady:!!s?.social?.activeAccountId,clockReady:ready,payment:phone&&known&&!!config.currency,credit:phone&&ready&&s?.wallet?.card?.enabled===true,loan:phone&&known&&ready&&!!loanReady,invest:phone&&known&&ready&&(s?.wallet?.investmentProducts?.length??0)>0,map:ready&&!!s?.map?.position&&Object.keys(config.travel?.speeds??{}).length>0,calendar:ready,settlementOwner:config.settlementOwner??null,mediaReady:!!config.subjectId,delivery:{shop:Number.isSafeInteger(config.economy?.deliveryFees?.shop),food:Number.isSafeInteger(config.economy?.deliveryFees?.food)}};
}
