import {sha256} from '../engine/common.mjs';
const stable=v=>Array.isArray(v)?`[${v.map(stable)}]`:v&&typeof v==='object'?`{${Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`)}}`:JSON.stringify(v);
const need=(x,m)=>{if(!x)throw new Error(m);};
const int=(x,label,min=0)=>{const n=typeof x==='string'&&/^\d+$/.test(x)?Number(x):x;need(Number.isSafeInteger(n)&&n>=min,`${label}须是${min?'正':'非负'}整数。`);return n;};
const by=(rows,id,label)=>{const row=(rows??[]).find(x=>x.id===id);need(row,`${label}不存在。`);return row;};
const personal=s=>s.identity.personId;
export const LIFE_EXTENDED_WORLD_ACTIONS={
 'wallet.transfer.respond':['transferId','response'],
 'order.resolve':['orderId','status','note'],
 'order.gift.receive':['orderId','recipientId'],
 'calendar.respond':['eventId','response'],
 'calendar.source.update':['eventId','sourceId','at','status','note'],
};
export const pendingMoney=s=>(s.wallet.pendingTransfers??[]).filter(t=>t.status==='pending').reduce((n,t)=>n+t.amount,0);
export function quoteCommerce(s,a){
 need(['shop','food'].includes(a.kind),'订单类型无效。');
 const place=by(s.map.places,a.placeId,'收货地点');need(place.known,'只能配送到已知地点。');
 const selected=s.commerce.cart.map(row=>({row,product:by(s.commerce.products,row.productId,'商品')})).filter(({product})=>(product.kind==='food')===(a.kind==='food'));
 need(selected.length,'本类购物车为空。');
 const recipientId=a.recipientId||personal(s);need(recipientId===personal(s)||(s.contacts??[]).some(x=>x.id===recipientId),'赠礼收件人须有已登记身份。');
 const items=selected.map(({row,product:p})=>{
  int(p.price,'单价');int(p.stock,'库存');need(row.qty<=p.stock,`${p.name}库存不足。`);
  const optionIds=Array.isArray(row.optionIds)?row.optionIds:[],options=optionIds.map(id=>by(p.options,id,'商品规格'));
  const extra=options.reduce((n,o)=>n+int(o.price,'附加价'),0),price=p.price+extra;
  if(a.pickup===true)need(p.placeId===place.id,'自取必须选择商品登记的商家地点。');
  if(p.deliveryPlaceIds&&a.pickup!==true)need(p.deliveryPlaceIds.includes(place.id),'该商品不配送到所选地点。');
  if(p.availableFrom!=null)need(s.clock.totalMinutes>=p.availableFrom,'商家尚未营业。');
  if(p.availableUntil!=null)need(s.clock.totalMinutes<=p.availableUntil,'商家已经休息。');
  return {id:p.id+':'+sha256(stable(optionIds)).slice(0,10),productId:p.id,name:p.name,kind:p.kind,qty:row.qty,price,optionIds,stock:p.stock,version:p.version??null,fulfillment:p.fulfillment??'physical',entitlement:p.entitlement??null,policy:structuredClone(p.policy??{})};
 });
 for(const id of new Set(items.map(x=>x.productId))){const quantity=items.filter(x=>x.productId===id).reduce((n,x)=>n+x.qty,0);need(quantity<=by(s.commerce.products,id,'商品').stock,'同一商品的不同规格合计超过库存。');}
 need(a.pickup===true||Number.isSafeInteger(s.config?.economy?.deliveryFees?.[a.kind]),'配送费未配置，尚未付款。');const deliveryFee=a.pickup===true?0:int(s.config?.economy?.deliveryFees?.[a.kind],'配送费');
 const subtotal=items.reduce((n,p)=>n+p.qty*p.price,0);int(subtotal,'商品合计');
 const min=s.config?.economy?.minimumOrders?.[a.kind];if(min!=null)need(subtotal>=int(min,'起送金额'),'尚未达到起送金额。');
 const discount=a.couponId?by(s.commerce.coupons,a.couponId,'优惠券'):null;
 if(discount){need(!discount.usedBy&&discount.ownerId===personal(s),'优惠券不属于本人或已经使用。');need(discount.expiresAt==null||s.clock.totalMinutes<=discount.expiresAt,'优惠券已过期。');need(!discount.kind||discount.kind===a.kind,'优惠券不适用于本订单。');need(subtotal>=(discount.minimum??0),'尚未达到优惠门槛。');}
 const discountAmount=discount?Math.min(subtotal,int(discount.amount,'优惠金额')):0;
 const snapshot={kind:a.kind,payment:a.payment||'balance',accountId:a.accountId||s.wallet.defaultAccountId||s.wallet.accounts[0]?.id,placeId:place.id,recipientId,anonymous:a.anonymous===true,pickup:a.pickup===true,scheduledAt:a.scheduledAt??null,couponId:discount?.id??null,items,subtotal,deliveryFee,discount:discountAmount,total:subtotal+deliveryFee-discountAmount,currency:structuredClone(s.config.currency),note:String(a.note??'').slice(0,300),giftMessage:String(a.giftMessage??'').slice(0,300)};
 if(snapshot.scheduledAt!=null)need(Number.isSafeInteger(snapshot.scheduledAt)&&snapshot.scheduledAt>=s.clock.totalMinutes,'预约配送时间须为有效的未来故事时间。');
 const quoteId='quote:'+sha256(stable(snapshot));
 return {...snapshot,quoteId,createdAt:s.clock.totalMinutes,expiresAt:s.clock.totalMinutes+(s.config?.economy?.quoteMinutes??30)};
}
export function refreshExtended(s,h){
 for(const o of s.commerce.orders)if(o.status==='unpaid'&&o.reservedUntil<s.clock.totalMinutes){for(const item of o.items)by(s.commerce.products,item.productId,'商品').stock+=item.qty;o.status='void';o.updatedAt=s.clock.totalMinutes;o.voidReason='reservation-expired';}
 for(const t of s.wallet.pendingTransfers??[])if(t.status==='pending'&&t.expiresAt!=null&&s.clock.totalMinutes>=t.expiresAt){h.credit(s,t.from,t.amount);t.status='expired';t.settledAt=s.clock.totalMinutes;h.record(s,'transfer.expire','待领取款项到期退回',t.amount,t.from,{transferId:t.id});}
 for(const e of s.calendar.events){
  if(!['personal','confirmed'].includes(e.status)||!Number.isSafeInteger(e.at))continue;
  const lead=e.reminderMinutes??0;
  if(s.clock.totalMinutes>=e.at-lead&&!e.reminderNotified){e.reminderNotified=true;s.audit.push({id:h.nextId(s,'reminder'),at:s.clock.totalMinutes,type:'calendar.reminder',eventId:e.id,message:`日程提醒：${e.title}`});}
  const r=e.repeat;if(r&&s.clock.totalMinutes>=e.at+(e.duration??0)&&!e.nextOccurrenceId){
   const nextAt=e.at+r.everyMinutes,index=(e.occurrence??0)+1;
   if((r.until==null||nextAt<=r.until)&&(r.count==null||index<r.count)){
    const next={...structuredClone(e),id:h.nextId(s,'event'),at:nextAt,occurrence:index,parentEventId:e.parentEventId??e.id,notified:false,reminderNotified:false,history:[]};delete next.nextOccurrenceId;e.nextOccurrenceId=next.id;s.calendar.events.push(next);
   }
  }
 }
}
export function performLifeExtension(s,a,h,{acceptedSource=false}={}){
 const message=text=>({message:text}),now=s.clock.totalMinutes;
 switch(a.type){
  case 'wallet.transfer.pending':{
   h.epoch(s);const from=h.defaultAccount(s,a.from),n=h.amount(a.amount);need(a.to!==from,'不能向同一账户转账。');need(s.wallet.accounts.some(x=>x.id===a.to)||(s.contacts??[]).some(x=>x.id===a.to),'请先确认收款人的稳定身份。');
   const expiresAt=a.expiresInMinutes!=null?now+int(a.expiresInMinutes,'领取有效分钟',1):a.expiresAt==null?null:int(a.expiresAt,'到期故事分钟');need(expiresAt===null||expiresAt>now,'领取期限必须在当前故事时间之后。');h.debit(s,from,n);
   const row={id:h.nextId(s,'transfer'),from,to:a.to,amount:n,currency:structuredClone(s.config.currency),kind:a.kind==='redpacket'?'redpacket':'transfer',status:'pending',createdAt:now,expiresAt,message:String(a.message??'').slice(0,300)};(s.wallet.pendingTransfers??=[]).push(row);h.record(s,'transfer.reserve','款项已冻结，等待对方领取',-n,from,{transferId:row.id,to:a.to});return {message:'款项已冻结，尚未到账；拒收或到期后原路退回。',transferId:row.id};
  }
  case 'wallet.transfer.respond':{
   need(acceptedSource,'对方收款结果须由已接纳的剧情回执确认。');const t=by(s.wallet.pendingTransfers,a.transferId,'待领取款项');need(t.status==='pending','这笔待领取款项已经结束。');need(['accept','refuse'].includes(a.response),'收款结果无效。');
   if(a.response==='refuse'){h.credit(s,t.from,t.amount);t.status='refused';h.record(s,'transfer.refuse','对方拒收，款项已退回',t.amount,t.from,{transferId:t.id});}
   else {const destination=s.wallet.accounts.find(x=>x.id===t.to);if(destination)h.credit(s,t.to,t.amount);else s.wallet.external+=t.amount;t.status='accepted';h.record(s,'transfer.accept','对方已领取待收款项',0,t.from,{transferId:t.id,to:t.to});}t.settledAt=now;return message(a.response==='accept'?'对方已领取，原冻结记录保留。':'对方拒收，已原路退回。');
  }
  case 'wallet.transfer.cancel':{
   const t=by(s.wallet.pendingTransfers,a.transferId,'待领取款项');need(t.status==='pending','款项已经结算，不能撤回。');h.credit(s,t.from,t.amount);t.status='cancelled';t.settledAt=now;h.record(s,'transfer.cancel','本人撤回待领取款项',t.amount,t.from,{transferId:t.id});return message('已撤回尚未领取的款项。');
  }
  case 'order.quote':{const quote=quoteCommerce(s,a);s.commerce.quotes??=[];s.commerce.quotes=s.commerce.quotes.filter(q=>q.quoteId!==quote.quoteId);s.commerce.quotes.push(quote);return {message:'报价已生成，请核对价格、规格、收货人与费用后确认付款。',quoteId:quote.quoteId,quote,navigate:{app:a.kind,tab:'quote',detail:quote.quoteId}};}
  case 'order.resolve':{
   need(acceptedSource,'商家状态须由已接纳的剧情回执确认。');const o=by(s.commerce.orders,a.orderId,'订单');need(!['unpaid','void','cancelled','refunded','completed'].includes(o.status),'订单尚未付款或已经结束。');need(['accepted','out-of-stock','delayed','ready','delivered'].includes(a.status),'商家状态无效。');
   if(a.status==='accepted')need(['paid','preparing'].includes(o.status),'已经进入配送阶段，不能倒退为商家接单。');if(a.status==='out-of-stock')need(['paid','preparing'].includes(o.status),'已发货或送达订单不能改成未备货。');if(a.status==='ready')need(o.kind==='food'&&o.status==='preparing','只有制作中的餐单能确认备餐完成。');if(a.status==='delivered')need(o.scheduledAt==null||now>=o.scheduledAt,'预约送达时间尚未到达。');
   (o.history??=[]).push({at:now,status:o.status,note:String(a.note??'').slice(0,500)});o.merchantStatus=a.status;o.merchantNote=String(a.note??'').slice(0,500);if(a.status==='accepted')o.status=o.kind==='food'?'preparing':'paid';if(a.status==='delivered'||a.status==='ready'&&o.pickup)o.status='delivered';o.updatedAt=now;return message('商家回执已记录；没有自动加购、额外扣款或替用户收货。');
  }
  case 'order.gift.receive':{need(acceptedSource,'赠礼签收须由已接纳的剧情回执确认。');const o=by(s.commerce.orders,a.orderId,'订单');need(o.status==='delivered'&&o.recipientId&&o.recipientId!==personal(s)&&o.recipientId===a.recipientId,'赠礼接收人或签收状态不匹配。');for(const item of o.items.filter(x=>x.fulfillment!=='digital'))s.inventory.push({id:h.nextId(s,'gift'),productId:item.productId,orderLineId:item.id??null,name:item.name,kind:item.kind,qty:item.qty,ownerId:o.recipientId,holderId:o.recipientId,storage:'placed',placeId:o.placeId,orderId:o.id,consumed:0});o.status='completed';o.updatedAt=now;return message('收件人已签收，物品归收件人持有；付款记录仍属于付款人。');}
  case 'order.support':{const o=by(s.commerce.orders,a.orderId,'订单'),text=String(a.text??'').trim();need(text&&text.length<=1000,'请填写售后或客服请求。');const row={id:h.nextId(s,'support'),text,at:now,status:'queued'};(o.support??=[]).push(row);return {message:'请求已记录，等待下一轮商家回应。',requestId:row.id};}
  case 'order.review':{const o=by(s.commerce.orders,a.orderId,'订单');need(o.status==='completed','请在实际收货后评价。');need(!o.review,'本订单已经评价。');const rating=int(a.rating,'评分',1);need(rating<=5,'评分不能超过5。');o.review={rating,text:String(a.text??'').slice(0,1000),at:now,ownerId:personal(s)};return message('评价已保存。');}
  case 'order.calendar':{const o=by(s.commerce.orders,a.orderId,'订单'),at=a.at??o.scheduledAt;need(Number.isSafeInteger(at)&&at>=now,'请明确填写尚未过去的故事时间。');need(!s.calendar.events.some(e=>e.source?.kind==='order'&&e.source.id===o.id&&e.status!=='cancelled'),'这个订单已有日程。');const e={id:h.nextId(s,'event'),title:String(a.title??(o.kind==='food'?'取餐':'订单安排')).slice(0,100),at,placeId:o.placeId,participantId:'',status:'personal',notified:false,visibility:'private',source:{kind:'order',id:o.id},duration:0};s.calendar.events.push(e);return {message:'订单已关联到私人日历；订单和地点使用同一编号。',eventId:e.id,navigate:{app:'calendar',tab:'agenda',detail:e.id}};}
  case 'map.favorite':{const p=by(s.map.places,a.placeId,'地点');need(p.known,'地点尚未知晓。');const rows=s.map.favorites??=[],i=rows.indexOf(p.id);if(i<0)rows.push(p.id);else rows.splice(i,1);s.map.favorites=rows;return message(i<0?'地点已收藏。':'已取消地点收藏。');}
  case 'map.share':{const p=by(s.map.places,a.placeId,'地点');need(p.known,'不能分享未知地点。');const recipient=by(s.contacts,a.recipientId,'接收人'),row={id:h.nextId(s,'place-share'),placeId:p.id,recipientId:recipient.id,at:now,sourcePosition:s.map.position,status:'queued'};(s.map.shares??=[]).push(row);return {message:'地点分享已记录，只发给指定接收人。',shareId:row.id};}
  case 'calendar.edit':{
   const e=by(s.calendar.events,a.eventId,'日程');need(!e.source,'来源日程请通过原订单或活动更新。');need(e.status!=='cancelled','已取消日程不能修改。');
   const before=structuredClone(e);delete before.history;(e.history??=[]).push(before);
   if(a.title!==undefined){const title=String(a.title).trim();need(title&&title.length<=100,'日程标题长度无效。');e.title=title;}
   if(a.at!==undefined){e.at=int(a.at,'日程故事分钟');need(e.at>=now,'改期不能放到故事过去。');e.notified=false;e.reminderNotified=false;}
   if(a.placeId!==undefined){need(by(s.map.places,a.placeId,'日程地点').known,'日程地点尚未知晓。');e.placeId=a.placeId;}
   if(a.duration!==undefined)e.duration=int(a.duration,'持续分钟');if(a.note!==undefined)e.note=String(a.note).slice(0,2000);
   if(a.visibility!==undefined){need(['private','shared','public'].includes(a.visibility),'日程权限无效。');e.visibility=a.visibility;}
   if(a.reminderMinutes!==undefined)e.reminderMinutes=int(a.reminderMinutes,'提前提醒分钟');
   if(a.repeatEveryMinutes!==undefined){const every=int(a.repeatEveryMinutes,'重复间隔');a={...a,repeat:every?{everyMinutes:every,count:int(a.repeatCount??1,'重复次数',1)}:null};}
   if(a.repeat!==undefined){if(a.repeat===null)e.repeat=null;else {const r=a.repeat;int(r.everyMinutes,'重复间隔',1);if(r.count!=null)int(r.count,'重复次数',1);if(r.until!=null)int(r.until,'重复结束时间');need(r.count!=null||r.until!=null,'重复日程必须指定次数或截止时间。');need((r.count??1)<=1000&&(r.until==null||(r.until-e.at)/r.everyMinutes<=1000),'重复次数不能超过1000。');e.repeat={everyMinutes:r.everyMinutes,count:r.count??null,until:r.until??null};}}
   if(e.participantId&&['confirmed','tentative'].includes(e.status)&&(a.at!==undefined||a.placeId!==undefined||a.repeat!==undefined))e.status='invited';
   const conflicts=s.calendar.events.filter(x=>x.id!==e.id&&x.status!=='cancelled'&&Math.max(x.at,e.at)<Math.min(x.at+(x.duration||1),e.at+(e.duration||1))).map(x=>x.id);e.conflicts=conflicts;return {message:conflicts.length?'修改已保存；存在时间冲突，请自行调整。':'日程修改已保存。',conflicts};
  }
  case 'calendar.respond':{need(acceptedSource,'参与者答复须由已接纳的剧情确认。');const e=by(s.calendar.events,a.eventId,'日程');need(e.status==='invited','此日程不在待确认状态。');need(['accept','decline','tentative'].includes(a.response),'邀请答复无效。');e.status={accept:'confirmed',decline:'declined',tentative:'tentative'}[a.response];return message('参与者答复已保存。');}
  case 'calendar.source.update':{need(acceptedSource,'来源改期须由已接纳的剧情确认。');const e=by(s.calendar.events,a.eventId,'日程');need(e.source&&e.source.id===a.sourceId,'日程来源不匹配。');need(a.status===undefined||['confirmed','cancelled','tentative'].includes(a.status),'来源日程状态无效。');(e.history??=[]).push({at:e.at,status:e.status,changedAt:now,note:String(a.note??'').slice(0,500)});if(a.at!==undefined){e.at=int(a.at,'改期时间');need(e.at>=now,'不能改到故事过去。');e.notified=false;e.reminderNotified=false;}if(a.status!==undefined)e.status=a.status;return message('来源日程已更新，改期历史保留。');}
  default:return null;
 }
}
export function validateLifeExtensions(s){
 const ids=new Set();for(const t of s.wallet.pendingTransfers??[]){need(t.id&&!ids.has(t.id),'待领取款项编号重复。');ids.add(t.id);int(t.amount,'待领取金额',1);by(s.wallet.accounts,t.from,'付款账户');need(['pending','accepted','refused','cancelled','expired'].includes(t.status),'待领取款项状态无效。');if(t.expiresAt!=null)int(t.expiresAt,'领取期限');}
 for(const e of s.calendar.events){if(e.duration!=null)int(e.duration,'日程长度');if(e.reminderMinutes!=null)int(e.reminderMinutes,'提醒间隔');if(e.repeat){int(e.repeat.everyMinutes,'重复间隔',1);need(e.repeat.count!=null||e.repeat.until!=null,'重复日程缺少结束边界。');}}
 return true;
}
