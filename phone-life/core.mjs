// Pure life-domain rules. All world facts and initial values are supplied explicitly.
import {sha256} from '../engine/common.mjs';
import {WorldClock} from '../engine/math.mjs';
import {performLifeExtension,refreshExtended,validateLifeExtensions,pendingMoney,quoteCommerce} from './life-extended.mjs';
export {quoteCommerce} from './life-extended.mjs';
const MINUTE = 60000;
const YEAR = 365 * 24 * 60;
const clone = value => structuredClone(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function need(condition, message, code = 'INVALID_ACTION') { if (!condition) fail(code, message); }
function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  need(Number.isSafeInteger(n) && n >= min && n <= max, `${label}必须是${min > 0 ? '正' : '非负'}整数，且在允许范围内。`);
  return n;
}
function amount(value) { return integer(value, '金额（分）', 1, 100000000); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function nextId(s,prefix){const used=new Set();const walk=x=>{if(!x||typeof x!=='object')return;if(typeof x.id==='string')used.add(x.id);for(const v of Object.values(x))walk(v);};walk(s);let value;do{value=`${prefix}-${++s.seq}`;}while(used.has(value));return value;}
function byId(rows, id, label) { const found = rows.find(x => x.id === id); need(found, `${label}不存在。`, 'NOT_FOUND'); return found; }
function account(s, id) { return byId(s.wallet.accounts, id, '账户'); }
function debit(s, id, n) { const row = account(s, id); need(Number.isSafeInteger(row.balance), `${row.name}余额未配置。`, 'UNCONFIGURED_BALANCE'); need(row.balance >= n, `${row.name}余额不足；不会自动借款或透支。`, 'INSUFFICIENT_FUNDS'); row.balance -= n; }
function credit(s, id, n) { const row=account(s,id); need(Number.isSafeInteger(row.balance), `${row.name}余额未配置。`, 'UNCONFIGURED_BALANCE'); row.balance += n; }
function record(s, type, description, n, accountId = '', extra = {}) {
  s.wallet.ledger.unshift({ id: nextId(s, 'ledger'), at: (s.config?.calendar||Number.isFinite(s.config?.epoch))?s.clock.totalMinutes:null, type, description, amount: n, accountId, ...extra });
}
function epoch(s) { if(s.config?.calendar)return 0;need(Number.isFinite(s.config?.epoch), '世界故事时间起点未配置。', 'UNCONFIGURED_CLOCK'); return s.config.epoch + (s.config.timezoneOffsetMinutes || 0) * MINUTE; }
function owner(s) { need(typeof s.identity?.personId==='string'&&s.identity.personId,'当前人物身份未配置。','UNCONFIGURED_IDENTITY'); return s.identity.personId; }
function defaultAccount(s, requested) { return requested || s.wallet.defaultAccountId || s.wallet.accounts[0]?.id; }
function fundingAccount(s,requested){return requested||s.wallet.fundingAccountId||defaultAccount(s);}
function formClock(s,minutes=s.clock.totalMinutes){if(!s.config?.calendar)return null;const clock=new WorldClock(s.config.calendar);need(Number.isSafeInteger(s.config.calendarOrigin),'表单历法缺少时间锚点。','UNCONFIGURED_CLOCK');clock.setOrdinal(s.config.calendarOrigin+minutes);return clock;}
function dayMinutes(s){const c=formClock(s);return c?c.c.day_hours*c.c.hour_minutes:1440;}
function yearMinutes(s,minutes=s.clock.totalMinutes){const c=formClock(s,minutes);return c?c.lengths(c.c.year).reduce((a,b)=>a+b,0)*dayMinutes(s):YEAR;}
function atMinute(s, year, month, day, minute = 0) { const current=formClock(s);if(current){const c=current.c,clock=new WorldClock({...c,year,[c.mode==='SEASON_FIXED'?'season':'month']:month,day,hour:Math.floor(minute/c.hour_minutes),minute:minute%c.hour_minutes});return clock.ordinal()-s.config.calendarOrigin;}return Math.round((Date.UTC(year, month - 1, day, 0, minute) - epoch(s)) / MINUTE); }
function cardDates(s) {
  need(s.wallet.card.enabled!==false&&Number.isInteger(s.wallet.card.billDay)&&Number.isInteger(s.wallet.card.dueDay),'信用卡或账单日期未配置。','UNCONFIGURED_CREDIT');
  const current=formClock(s);
  if(current){let year=current.c.year,period=current.c.mode==='SEASON_FIXED'?current.c.season:current.c.month;const next=()=>{period++;if(period>current.lengths(year).length){period=1;year++;}};
    const end=dayMinutes(s)-1;let statementAt=atMinute(s,year,period,s.wallet.card.billDay,end);if(statementAt<s.clock.totalMinutes){next();statementAt=atMinute(s,year,period,s.wallet.card.billDay,end);}if(s.wallet.card.dueDay<=s.wallet.card.billDay)next();return {statementAt,dueAt:atMinute(s,year,period,s.wallet.card.dueDay,end)};
  }
  const d = new Date(epoch(s) + s.clock.totalMinutes * MINUTE);
  let month = d.getUTCMonth();
  let statement = Date.UTC(d.getUTCFullYear(), month, s.wallet.card.billDay, 23, 59);
  if (epoch(s) + s.clock.totalMinutes * MINUTE > statement) { month += 1; statement = Date.UTC(d.getUTCFullYear(), month, s.wallet.card.billDay, 23, 59); }
  const dueMonth = month + (s.wallet.card.dueDay <= s.wallet.card.billDay ? 1 : 0);
  return { statementAt: (statement - epoch(s)) / MINUTE, dueAt: (Date.UTC(d.getUTCFullYear(), dueMonth, s.wallet.card.dueDay, 23, 59) - epoch(s)) / MINUTE };
}
const extensionHelpers={nextId,defaultAccount,amount,epoch,debit,credit,record};
function refresh(s) {
  if(s.config?.calendar){const current=formClock(s),c=current.c;Object.assign(s.clock,{year:c.year,month:c.month??c.season,day:c.day,minute:c.hour*c.hour_minutes+c.minute,...(c.mode==='SEASON_FIXED'?{season:c.season}:{})});}
  else if(Number.isFinite(s.config?.epoch)){
  const d = new Date(epoch(s) + s.clock.totalMinutes * MINUTE);
  s.clock.year = d.getUTCFullYear(); s.clock.month = d.getUTCMonth() + 1; s.clock.day = d.getUTCDate(); s.clock.minute = d.getUTCHours() * 60 + d.getUTCMinutes();
  }
  const c = s.wallet.card; c.used = c.charges.reduce((sum, x) => sum + x.remaining, 0);
  const statements = new Map();
  for (const charge of c.charges) {
    charge.status = charge.remaining === 0 ? 'paid' : s.clock.totalMinutes > charge.dueAt ? 'overdue' : s.clock.totalMinutes >= charge.statementAt ? 'billed' : 'unbilled';
    const id = `statement-${charge.statementAt}`;
    if (!statements.has(id)) statements.set(id, { id, statementAt: charge.statementAt, dueAt: charge.dueAt, total: 0, remaining: 0, status: '' });
    const row = statements.get(id); row.total += charge.originalDebt; row.remaining += charge.remaining;
  }
  c.statements = [...statements.values()].sort((a, b) => a.statementAt - b.statementAt).map(x => ({ ...x, status: x.remaining === 0 ? 'paid' : s.clock.totalMinutes > x.dueAt ? 'overdue' : s.clock.totalMinutes >= x.statementAt ? 'billed' : 'unbilled' }));
  for (const loan of s.wallet.loans) loan.status = loan.installments.every(x => x.paid === x.amount) ? 'paid' : loan.installments.some(x => x.paid < x.amount && s.clock.totalMinutes > x.dueAt) ? 'overdue' : 'active';
  refreshExtended(s,extensionHelpers);
  for (const event of s.calendar.events) {
    if (['personal', 'confirmed'].includes(event.status) && (s.config?.calendar||Number.isFinite(s.config?.epoch)) && Number.isSafeInteger(event.at) && event.at <= s.clock.totalMinutes && !event.notified) {
      event.notified = true;
      s.audit.push({ id: nextId(s, 'reminder'), at: s.clock.totalMinutes, type: 'calendar.due', message: `故事日程已到时间：${event.title}` });
    }
  }
}
function advanceTime(s, minutes) { epoch(s); s.clock.totalMinutes += integer(minutes, '推进分钟', 0, YEAR * 10); need(s.clock.totalMinutes <= YEAR * 100, '故事时钟最多推进100个故事年。'); refresh(s); }

export function money(cents) {
  if(cents===null||cents===undefined)return '未配置';
  need(Number.isSafeInteger(cents), '金额必须是整数分。');
  return `${cents < 0 ? '-' : ''}${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function quoteLoan(value, term, source) {
  const config=source?.config?.economy?.loan??source?.economy?.loan??source;
  need(config&&typeof config==='object','这个世界尚未配置贷款。','UNCONFIGURED_LOAN');
  const n=integer(value,'借款金额（最小单位）',integer(config.minAmount,'最低本金',1),integer(config.maxAmount,'最高本金',1));
  const months=integer(term,'期数',1,120);
  need(Array.isArray(config.terms)&&config.terms.includes(months),'可选期数为'+(config.terms?.length>1?config.terms.slice(0,-1).join('、')+'或'+config.terms.at(-1):(config.terms||[]).join(''))+'期。');
  const annualRateBps=integer(config.annualRateBps,'年利率基点',0,1000000),periodDays=integer(config.periodDays,'每期天数',1,366),periodsPerYear=integer(config.periodsPerYear,'每年计息期数',1,366);
  let remaining=n;
  const installments=Array.from({length:months},(_,i)=>{const principal=Math.floor(n/months)+(i<n%months?1:0),numerator=BigInt(remaining)*BigInt(annualRateBps),denominator=BigInt(10000*periodsPerYear),interest=Number((numerator+denominator/2n)/denominator);remaining-=principal;return {number:i+1,principal,interest,amount:principal+interest};});
  const totalInterest=installments.reduce((sum,x)=>sum+x.interest,0);
  const quoteId='phone-loan:'+sha256(stable({amount:n,months,config}));
  return {quoteId,amount:n,months,apr:annualRateBps/10000,annualRateBps,periodDays,fee:0,totalInterest,totalPayable:n+totalInterest,monthlyPayment:installments[0].amount,installments};
}

export function quoteJourney(s, placeId, mode = 'walk') {
  need(!s.map.journey, '当前行程尚未结束。');
  const from = byId(s.map.places, s.map.position, '出发地点');
  const to = byId(s.map.places, placeId, '目的地');
  need(to.known === true, '尚未获知这个地点。'); need(from.id !== to.id, '已经在这个地点。');
  epoch(s); const speeds=s.config?.travel?.speeds; need(speeds&&typeof speeds==='object','这个世界尚未配置出行速度。','UNCONFIGURED_TRAVEL');
  need([from.x,from.y,to.x,to.y].every(Number.isFinite),'地点坐标尚未配置。','UNCONFIGURED_PLACE');
  need(own(speeds,mode)&&Number.isFinite(speeds[mode])&&speeds[mode]>0,'该出行方式尚未配置。');
  const duration = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / speeds[mode]));
  const rule=s.config.travel.fares?.[mode],fare=rule?integer(rule.base??0,'起步费用')+duration*integer(rule.perMinute??0,'每分钟费用'):0;integer(fare,'总行程费用');const journey={from:from.id,to:to.id,mode,duration,fare,departAt:s.clock.totalMinutes,arriveAt:s.clock.totalMinutes+duration};return {...journey,quoteId:'journey:'+sha256(stable(journey))};
}


function pay(s, order, payment, accountId) {
  if (payment === 'balance') {
    debit(s, accountId, order.total);
    record(s, 'purchase', `${order.kind === 'food' ? '外卖' : '商城'}付款`, -order.total, accountId, { orderId: order.id });
  } else {
    need(payment === 'credit', '请选择余额或信用卡付款。');
    const c = s.wallet.card; need(c.enabled!==false&&Number.isSafeInteger(c.limit),'信用账户未配置。','UNCONFIGURED_CREDIT'); const prepaid = Math.min(c.refundBalance, order.total); const debt = order.total - prepaid;
    need(c.used + debt <= c.limit, '信用卡可用额度不足；不会自动提高额度。', 'CREDIT_LIMIT');
    c.refundBalance -= prepaid;
    const charge = { id: nextId(s, 'charge'), orderId: order.id, amount: order.total, originalDebt: debt, remaining: debt, paid: 0, refunded: 0, prepaid, createdAt: s.clock.totalMinutes, ...cardDates(s) };
    c.charges.push(charge); c.used += debt; order.creditChargeId = charge.id;
    record(s, 'credit.purchase', '信用卡消费（不是现金到账）', -order.total, 'credit', { orderId: order.id });
  }
  s.wallet.external += order.total;
}
function refund(s, order, status, partial=null) {
  const remaining=order.total-order.refunded;need(remaining>0,'订单已经退款，不能重复退款。','ALREADY_REFUNDED');
  const selected=partial?[order.items.find(x=>x.productId===partial.productId)]:order.items;need(selected.every(Boolean),'退货商品不存在。');
  const returns=[];
  for(const item of selected){const available=item.qty-(item.refundedQty??0),qty=partial?integer(partial.qty,'退货数量',1,available):available;if(!qty)continue;
    if(item.fulfillment==='digital'||item.kind==='digital'){const right=(s.commerce.entitlements??[]).find(x=>x.orderId===order.id&&x.productId===item.productId);need(right&&right.status==='active'&&right.used===0,'数字权益已使用或不可退款。');need(!partial||qty===available,'数字权益须按完整一项退订。');}
    else if(order.status==='completed'){const holding=s.inventory.find(x=>x.orderId===order.id&&x.productId===item.productId);need(holding&&holding.qty>=qty&&holding.ownerId===owner(s)&&holding.holderId===owner(s),'商品已消耗、转赠或不归本人，不能按此数量退货。');need(!s.map.journey&&holding.placeId===s.map.position,'请先回到商品所在地点办理退货。');}
    need(item.policy?.refundable!==false,'此商品的已确认规则不允许退款。');returns.push({item,qty});
  }
  need(returns.length,'没有可退商品。');
  const gross=returns.reduce((n,r)=>n+r.item.price*r.qty,0),discountShare=order.discount?Math.floor(order.discount*gross/order.subtotal):0;
  const n=partial?Math.min(remaining,gross-discountShare):remaining;need(n>0,'本次退款金额为零。');
  for(const {item,qty} of returns){item.refundedQty=(item.refundedQty??0)+qty;const p=byId(s.commerce.products,item.productId,'商品');p.stock+=qty;
    if(item.fulfillment==='digital'||item.kind==='digital'){const right=s.commerce.entitlements.find(x=>x.orderId===order.id&&x.productId===item.productId);right.status='refunded';right.refundedAt=s.clock.totalMinutes;}
    else if(order.status==='completed'){const holding=s.inventory.find(x=>x.orderId===order.id&&x.productId===item.productId);holding.qty-=qty;holding.returned=(holding.returned??0)+qty;}
  }
  if(order.payment==='credit'){const c=s.wallet.card,charge=byId(c.charges,order.creditChargeId,'信用消费记录'),againstDebt=Math.min(charge.remaining,n);charge.remaining-=againstDebt;charge.refunded+=n;c.refundBalance+=n-againstDebt;c.used-=againstDebt;record(s,'credit.refund','原路退款：冲减本单债务，余款留作卡内溢缴款',n,'credit',{orderId:order.id});}
  else {credit(s,order.accountId,n);record(s,'refund',partial?'订单部分原路退款':'订单原路全额退款',n,order.accountId,{orderId:order.id});}
  s.wallet.external-=n;order.refunded+=n;if(!partial||order.refunded===order.total)order.status=status;order.updatedAt=s.clock.totalMinutes;
}

function fulfillDigital(s,order){
  const digital=order.items.filter(x=>x.fulfillment==='digital'||x.kind==='digital');
  for(const item of digital){s.commerce.entitlements??=[];s.commerce.entitlements.push({id:nextId(s,'entitlement'),orderId:order.id,productId:item.productId,ownerId:order.recipientId??owner(s),kind:item.entitlement?.kind??'content',resourceId:item.entitlement?.resourceId??item.productId,status:'active',used:0,createdAt:s.clock.totalMinutes,expiresAt:item.entitlement?.durationMinutes==null?null:s.clock.totalMinutes+integer(item.entitlement.durationMinutes,'权益有效分钟',1)});}
  if(digital.length===order.items.length)order.status='completed';return digital;
}

function perform(s, a,options={}) {
  const extension=performLifeExtension(s,a,extensionHelpers,options);if(extension)return extension;
  const msg = message => ({ message });
  switch (a.type) {
    case 'wallet.transfer': {
      const n = amount(a.amount), from = defaultAccount(s,a.from); need(a.to !== from, '不能向同一个账户转账。');
      const destination = s.wallet.accounts.find(x => x.id === a.to);
      const recipient=(s.contacts||[]).find(x=>x.id===a.to); need(destination||recipient,'请先确认收款人的稳定身份。'); debit(s, from, n);
      if (destination) credit(s, destination.id, n); else s.wallet.external += n;
      record(s, 'transfer', `转给${destination?.name || recipient.name}`, -n, from, { to: a.to });
      if (destination) record(s, 'transfer.in', `从${account(s, from).name}转入`, n, destination.id);
      return msg(`已转账 ${money(n)} ${s.config.currency?.name||''}，付款记录已保留。`);
    }
    case 'wallet.card.repay': {
      const n = amount(a.amount), from = fundingAccount(s,a.accountId); need(n <= s.wallet.card.used, '还款金额不能超过当前信用卡欠款。'); debit(s, from, n);
      let remaining = n;
      const charges=s.wallet.card.charges.filter(c=>!a.statementId||`statement-${c.statementAt}`===a.statementId).sort((x,y)=>x.dueAt-y.dueAt);need(n<=charges.reduce((sum,c)=>sum+c.remaining,0),'还款金额超过所选账期未还金额。');for (const charge of charges) { const paid = Math.min(remaining, charge.remaining); charge.remaining -= paid; charge.paid += paid; remaining -= paid; }
      s.wallet.card.used -= n; record(s, 'credit.repay', '信用卡还款', -n, from);
      return msg(`已还款 ${money(n)} ${s.config.currency?.name||''}；没有自动扣款或新增借款。`);
    }
    case 'wallet.loan.borrow': {
      const quote = quoteLoan(a.amount, a.months, s); need(a.quoteId === quote.quoteId, '请先查看并确认本次贷款报价。', 'QUOTE_REQUIRED');
      epoch(s); const to = fundingAccount(s,a.accountId); account(s, to);
      const loan = { ...quote, id: nextId(s, 'loan'), remainingPrincipal: quote.amount, paid: 0, status: 'active', createdAt: s.clock.totalMinutes, accountId: to, installments: quote.installments.map(x => ({ ...x, paid: 0, dueAt: s.clock.totalMinutes + x.number * quote.periodDays * dayMinutes(s) })) };
      s.wallet.loans.push(loan); credit(s, to, loan.amount); record(s, 'loan.disburse', '贷款放款（同时产生负债）', loan.amount, to, { loanId: loan.id });
      return { message: `已按已确认报价放款 ${money(loan.amount)} ${s.config.currency?.name||''}，共${loan.months}期，总还款 ${money(loan.totalPayable)} ${s.config.currency?.name||''}。`, loanId: loan.id };
    }
    case 'wallet.loan.repay': {
      const loan = byId(s.wallet.loans, a.loanId, '贷款'); const n = amount(a.amount), from = fundingAccount(s,a.accountId);
      need(n <= loan.totalPayable - loan.paid, '还款金额超过这笔贷款的剩余应还金额。'); debit(s, from, n);
      let left = n, principalPaid = 0, interestPaid = 0;
      for (const installment of loan.installments) {
        const paid = Math.min(left, installment.amount - installment.paid);
        const oldPrincipal = Math.max(0, installment.paid - installment.interest);
        installment.paid += paid;
        const newPrincipal = Math.max(0, installment.paid - installment.interest);
        principalPaid += newPrincipal - oldPrincipal; interestPaid += paid - (newPrincipal - oldPrincipal); left -= paid;
      }
      loan.paid += n; loan.remainingPrincipal -= principalPaid; s.wallet.external += interestPaid;
      record(s, 'loan.repay', `贷款还款：本金${money(principalPaid)}，利息${money(interestPaid)}`, -n, from, { loanId: loan.id, principal: principalPaid, interest: interestPaid });
      return msg(`已归还 ${money(n)} ${s.config.currency?.name||''}；剩余应还 ${money(loan.totalPayable - loan.paid)} ${s.config.currency?.name||''}。`);
    }
    case 'wallet.invest.buy': {
      epoch(s); const product = byId(s.wallet.investmentProducts, a.productId, '理财产品'); const n = amount(a.amount), from = fundingAccount(s,a.accountId); debit(s, from, n);
      need(n>=(product.minAmount??1)&&n<=(product.maxAmount??100000000),'申购金额超出产品约定范围。'); const investment = { id: nextId(s, 'invest'), productId: product.id, productSnapshot:clone(product), accountId:from, maturityAt:product.termMinutes==null?null:s.clock.totalMinutes+integer(product.termMinutes,'理财期限',1), principal: n, accrued: 0, createdAt: s.clock.totalMinutes, settledAt: s.clock.totalMinutes, status: 'active' };
      s.wallet.investments.push(investment); record(s, 'invest.buy', '理财申购（现金转为持有份额）', -n, from);
      return { message: `已申购 ${money(n)} ${s.config.currency?.name||''}。收益只在明确结算后入账。`, investmentId: investment.id };
    }
    case 'wallet.invest.settle': {
      const row = byId(s.wallet.investments, a.investmentId, '理财持仓'); need(row.status === 'active', '该持仓已经赎回。');
      epoch(s); const product = row.productSnapshot??byId(s.wallet.investmentProducts, row.productId, '理财产品');
      const earned = Number(BigInt(row.principal) * BigInt(product.annualRateBps) * BigInt(Math.min(s.clock.totalMinutes,row.maturityAt??s.clock.totalMinutes) - row.createdAt) / BigInt(10000 * yearMinutes(s,row.createdAt)));
      const gain = earned - row.accrued; need(gain > 0, '按已过去的故事时间计算，尚无新增整分收益；不会凭空加钱。');
      row.accrued = earned; row.settledAt = s.clock.totalMinutes; s.wallet.external -= gain;
      record(s, 'invest.simulated-yield', '按故事规则结算收益', gain, row.id);
      return msg(`按故事时间结算 ${money(gain)} ${s.config.currency?.name||''}；未修改现实时间。`);
    }
    case 'wallet.invest.redeem': {
      const row = byId(s.wallet.investments, a.investmentId, '理财持仓'); need(row.status === 'active', '该持仓已经赎回，不能重复领取。');
      need(row.maturityAt==null||s.clock.totalMinutes>=row.maturityAt||row.productSnapshot?.allowEarlyRedemption===true,'尚未到期，产品规则未允许提前赎回。');const n = row.principal + row.accrued, to = a.accountId||row.accountId||fundingAccount(s); credit(s, to, n); row.status = 'redeemed'; row.redeemedAt = s.clock.totalMinutes;
      record(s, 'invest.redeem', '赎回本金与已结算收益', n, to);
      return msg(`已赎回 ${money(n)} ${s.config.currency?.name||''}；未结算收益不会自动补入。`);
    }
    case 'cart.add': {
      const product = byId(s.commerce.products, a.productId, '商品'); need(Number.isSafeInteger(product.stock)&&Number.isSafeInteger(product.price),'商品价格或库存未配置。','UNCONFIGURED_PRODUCT'); const qty = integer(a.qty ?? 1, '数量', 1, 99);
      const optionIds=Array.isArray(a.optionIds)?[...new Set(a.optionIds)].sort():a.optionId?[a.optionId]:[];for(const id of optionIds)byId(product.options??[],id,'商品规格');const row = s.commerce.cart.find(x => x.productId === product.id&&stable(x.optionIds??[])===stable(optionIds)); const total = (row?.qty || 0) + qty;
      need(total <= product.stock, '购物车数量超过当前库存。'); if (row) row.qty = total; else s.commerce.cart.push({ productId: product.id, qty,...(optionIds.length?{optionIds}:{}) });
      return msg(`已加入${product.name}，尚未付款。`);
    }
    case 'cart.remove': {
      need(s.commerce.cart.some(x => x.productId === a.productId), '购物车里没有这件商品。'); s.commerce.cart = s.commerce.cart.filter(x => x.productId !== a.productId); return msg('已从购物车移除。');
    }
    case 'order.checkout': {
      let quote;
      if(a.quoteId){quote=(s.commerce.quotes??[]).find(q=>q.quoteId===a.quoteId);need(quote,'确认报价不存在，请重新生成。','QUOTE_REQUIRED');need(s.clock.totalMinutes<=quote.expiresAt,'报价已过期，请重新核对。','QUOTE_EXPIRED');const fresh=quoteCommerce(s,{...quote,kind:a.kind??quote.kind});need(fresh.quoteId===quote.quoteId,'价格、库存、规格或费用已经变化，请重新确认报价。','QUOTE_CHANGED');}
      else {need(!(s.commerce.quotes??[]).some(q=>q.kind===a.kind),'本类购物车已有报价，请从报价页确认。','QUOTE_REQUIRED');quote=quoteCommerce(s,a);}
      const order={...clone(quote),id:nextId(s,'order'),items:quote.items.map(({stock,version,...item})=>({...item,quotedStock:stock,quotedVersion:version})),status:'paid',createdAt:s.clock.totalMinutes,updatedAt:s.clock.totalMinutes,refunded:0,payerId:owner(s)};
      pay(s,order,order.payment,order.accountId);
      for(const item of order.items)byId(s.commerce.products,item.productId,'商品').stock-=item.qty;
      if(order.couponId){const coupon=byId(s.commerce.coupons,order.couponId,'优惠券');coupon.usedBy=order.id;}
      const selected=new Set(order.items.map(x=>x.productId));s.commerce.cart=s.commerce.cart.filter(x=>!selected.has(x.productId));s.commerce.orders.unshift(order);
      const digital=fulfillDigital(s,order);
      return {message:digital.length===order.items.length?'付款已保存，数字权益已开通。':`已付款 ${money(order.total)} ${s.config.currency?.name||''}，等待${order.kind==='food'?'制作配送':'发货'}；实物尚未进入背包。`,orderId:order.id,navigate:{app:order.kind,tab:'orders',detail:order.id}};
    }
    case 'order.reserve': {
      const quote=(s.commerce.quotes??[]).find(q=>q.quoteId===a.quoteId);need(quote,'报价不存在，请重新核对。');need(s.clock.totalMinutes<=quote.expiresAt,'报价已过期。');need(quoteCommerce(s,quote).quoteId===quote.quoteId,'报价内容已经变化，请重新确认。');
      const order={...clone(quote),id:nextId(s,'order'),status:'unpaid',payerId:owner(s),createdAt:s.clock.totalMinutes,updatedAt:s.clock.totalMinutes,refunded:0,reservedUntil:quote.expiresAt};
      for(const item of order.items)byId(s.commerce.products,item.productId,'商品').stock-=item.qty;
      const selected=new Set(order.items.map(i=>i.productId));s.commerce.cart=s.commerce.cart.filter(r=>!selected.has(r.productId));s.commerce.orders.unshift(order);return {message:'订单已预留库存，尚未扣款；到期未付款会释放。',orderId:order.id,navigate:{app:order.kind,tab:'order',detail:order.id}};
    }
    case 'order.pay': {
      const order=byId(s.commerce.orders,a.orderId,'订单');need(order.status==='unpaid','这笔订单不是待付款状态。');need(s.clock.totalMinutes<=order.reservedUntil,'库存预留已经过期，请重新下单。');if(order.couponId){const coupon=byId(s.commerce.coupons,order.couponId,'优惠券');need(!coupon.usedBy&&coupon.ownerId===owner(s)&&(coupon.expiresAt==null||coupon.expiresAt>=s.clock.totalMinutes),'优惠券已失效，请重新核对报价。');coupon.usedBy=order.id;}
      pay(s,order,order.payment,order.accountId);order.status='paid';order.updatedAt=s.clock.totalMinutes;fulfillDigital(s,order);return {message:'已按预留报价付款，订单和流水已保存。',orderId:order.id};
    }
    case 'order.advance': {
      const order = byId(s.commerce.orders, a.orderId, '订单'); const steps = order.kind === 'food' ? ['paid', 'preparing', 'delivering', 'delivered'] : ['paid', 'shipped', 'delivered'];
      const index = steps.indexOf(order.status); need(index >= 0 && index < steps.length - 1, '此订单当前没有可推进的物流阶段。');
      if(steps[index+1]==='delivered')need(order.scheduledAt==null||s.clock.totalMinutes>=order.scheduledAt,'预约送达时间尚未到达。');order.status = steps[index + 1]; order.updatedAt = s.clock.totalMinutes;
      return msg(`订单更新为：${{ preparing: '制作中', delivering: '配送中', shipped: '已发货', delivered: '已送到指定地点，等待领取' }[order.status]}。`);
    }
    case 'order.collect': {
      const order = byId(s.commerce.orders, a.orderId, '订单'); need(order.status === 'delivered', '订单尚未送达，或者已经领取。');
      need((order.recipientId??owner(s))===owner(s),'这是赠礼订单，须等待实际收件人的签收回执。');need(!s.map.journey && s.map.position === order.placeId, '请先到达订单的收货地点再领取。');
      for (const item of order.items.filter(x=>x.fulfillment!=='digital'&&x.kind!=='digital')) s.inventory.push({ id: nextId(s, 'item'), productId: item.productId, name: item.name, kind: item.kind, qty: item.qty, ownerId: owner(s), holderId: owner(s), storage: 'carried', placeId: order.placeId, orderId: order.id, consumed: 0 });
      order.status = 'completed'; order.updatedAt = s.clock.totalMinutes; return msg('已经领取，物品归本人持有；食物现在可以食用。');
    }
    case 'order.cancel': {
      const order = byId(s.commerce.orders, a.orderId, '订单');if(order.status==='unpaid'){for(const item of order.items)byId(s.commerce.products,item.productId,'商品').stock+=item.qty;order.status='void';order.updatedAt=s.clock.totalMinutes;return msg('未付款订单已取消，预留库存已经释放。');}need(['paid', 'preparing'].includes(order.status), '订单已经开始配送或结束，请按收货/退货流程处理。');
      refund(s, order, 'cancelled'); return msg('已取消并原路全额退款，库存已经释放。');
    }
    case 'order.refund': {
      const order = byId(s.commerce.orders, a.orderId, '订单'); need(['delivered', 'completed'].includes(order.status), '只有已送达或已领取的订单可以在此退货退款。');
      refund(s, order, 'refunded'); return msg('已登记全额退货退款；原付款与退款记录都保留。');
    }
    case 'order.refund.partial': {const order=byId(s.commerce.orders,a.orderId,'订单');need(['delivered','completed'].includes(order.status),'部分退货仅适用于已送达或已收货订单。');refund(s,order,'refunded',{productId:a.productId,qty:a.qty});return msg('已按原价和优惠分摊完成部分原路退款，未退商品仍保留。');}
    case 'inventory.consume': {
      const item = byId(s.inventory, a.itemId, '持有物'); need(item.kind === 'food' && item.ownerId === owner(s) && item.holderId === owner(s), '只有本人已经领取的食物可以食用。');
      need(item.qty > 0, '这份食物已经吃完。'); need(!s.map.journey && item.placeId === s.map.position, '请在食物所在地点食用。'); item.qty -= 1; item.consumed += 1;
      return msg(`已吃掉一份${item.name}，物品记录保留。`);
    }
    case 'map.depart': { const journey=quoteJourney(s,a.placeId,a.mode||'walk');need(a.quoteId===undefined||a.quoteId===journey.quoteId,'行程时间或费用已经变化，请重新确认。');if(journey.fare){need(s.config.settlementOwner==='phone'||s.config.settlementOwner==='tables'&&s.config.database===true,'行程费用必须由当前统一账本结算。');const from=defaultAccount(s,a.accountId);debit(s,from,journey.fare);s.wallet.external+=journey.fare;record(s,'travel.fare','出行费用',-journey.fare,from,{journeyId:journey.quoteId});journey.accountId=from;}s.map.journey=journey; return msg(`已出发，预计经过${s.map.journey.duration}个故事分钟到达；当前位置尚未变更。`); }
    case 'map.arrive': {
      const journey = s.map.journey; need(journey, '当前没有正在进行的行程。'); advanceTime(s, Math.max(0, journey.arriveAt - s.clock.totalMinutes)); s.map.position = journey.to; s.map.journey = null;
      for (const item of s.inventory) if (item.holderId === owner(s) && item.storage === 'carried') item.placeId = journey.to;
      return msg(`已到达${byId(s.map.places, journey.to, '目的地').name}；故事时间已推进到抵达时刻。`);
    }
    case 'calendar.add': {
      const title = String(a.title || '').trim(); need(title.length > 0 && title.length <= 100, '日程标题须为1—100字。'); const current=formClock(s),length=current?current.lengths(s.clock.year)[s.clock.month-1]:31;const day = integer(a.day, '日期', 1, length), minute = integer(a.minute, '当日分钟', 0, dayMinutes(s)-1);
      if(!current){const date = new Date(Date.UTC(s.clock.year, s.clock.month - 1, day)); need(date.getUTCMonth() + 1 === s.clock.month, '当前故事月不存在这个日期。');}
      const at = atMinute(s,s.clock.year, s.clock.month, day, minute); need(at >= s.clock.totalMinutes, '不能把新日程安排到故事过去。'); byId(s.map.places, a.placeId, '日程地点');
      const participantId = String(a.participantId || ''); need(!participantId||(s.contacts||[]).some(x=>x.id===participantId)||(s.social?.accounts||[]).some(x=>x.id===participantId),'请先确认邀请对象。');
      const event = { id: nextId(s, 'event'), title, day, minute, placeId: a.placeId, participantId, status: participantId ? 'invited' : 'personal', at, notified: false };
      s.calendar.events.push(event); return { message: participantId ? '已发出邀请，尚未得到参与者确认。' : '已记入个人日程。', eventId: event.id };
    }
    case 'calendar.confirm': { const event = byId(s.calendar.events, a.eventId, '日程'); need(event.status === 'invited', '只有待确认邀请可以接受。'); event.status = 'confirmed'; return msg('已按本轮回执记录参与者确认。'); }
    case 'calendar.cancel': { const event = byId(s.calendar.events, a.eventId, '日程'); need(event.status !== 'cancelled', '日程已经取消。'); event.status = 'cancelled'; return msg('已取消日程，原记录仍保留。'); }
    case 'world.advance': { const n = integer(a.minutes, '推进分钟', 1, YEAR * 10); advanceTime(s, n); return msg(`已推进${n}个故事分钟；没有自动付款、借款或结算理财收益。`); }
    default: fail('UNSUPPORTED_ACTION', `核心不处理动作 ${String(a.type)}。请由所属应用处理。`);
  }
}

export function validateState(s) {
  need(s && s.schema === 1 && s.wallet && s.commerce && s.map && s.calendar && s.clock, '手机存档结构不完整；不会重置原档。', 'INVALID_STATE');
  for (const [label, rows] of [['账户', s.wallet.accounts], ['信用消费', s.wallet.card?.charges], ['贷款', s.wallet.loans], ['理财持仓', s.wallet.investments], ['理财产品', s.wallet.investmentProducts], ['资金流水', s.wallet.ledger], ['商品', s.commerce.products], ['订单', s.commerce.orders], ['持有物', s.inventory], ['地点', s.map.places], ['日程', s.calendar.events]]) {
    need(Array.isArray(rows) && rows.every(x => x && typeof x.id === 'string') && new Set(rows.map(x => x.id)).size === rows.length, `${label}记录缺失或身份重复；原档不会重置。`, 'INVALID_STATE');
  }
  need(Array.isArray(s.commerce.cart) && Array.isArray(s.audit), '购物车或事件记录结构损坏。', 'INVALID_STATE');
  integer(s.revision, '修订'); integer(s.seq, '序列'); integer(s.clock.totalMinutes, '故事时间', 0, YEAR * 100);
  need(Array.isArray(s.applied) && new Set(s.applied).size === s.applied.length && s.receipts && typeof s.receipts === 'object', '操作回执结构损坏。', 'INVALID_STATE');
  const cash=s.wallet.accounts.reduce((sum,x)=>sum+(x.balance===null?0:integer(x.balance,'账户余额')),0);
  need(new Set(s.wallet.accounts.map(x => x.id)).size === s.wallet.accounts.length, '账户身份重复。');
  const card = s.wallet.card; if(card.enabled===false)need(card.limit===null,'未配置的信用账户不能捏造额度。');else integer(card.limit,'信用额度'); integer(card.used, '信用债务'); integer(card.refundBalance, '卡内溢缴款');
  need(card.enabled===false?card.used===0&&card.charges.length===0:card.used <= card.limit, '信用额度超限。', 'INVALID_STATE');
  const debt = card.charges.reduce((sum, x) => { integer(x.remaining, '消费剩余债务'); integer(x.originalDebt, '原始消费债务'); integer(x.amount, '消费总额'); integer(x.paid, '已还信用金额', 0, x.originalDebt); integer(x.refunded, '已退信用金额', 0, x.amount); need(x.remaining === Math.max(0, x.originalDebt - x.paid - x.refunded) && x.originalDebt + x.prepaid === x.amount, '消费债务不一致。'); return sum + x.remaining; }, 0);
  need(debt === card.used, '信用卡总债务与逐笔消费不一致。', 'INVALID_STATE');
  let principal = 0;
  for (const loan of s.wallet.loans) {
    integer(loan.remainingPrincipal, '剩余贷款本金'); integer(loan.paid, '贷款已还');
    let paid = 0, remaining = 0;
    for (const x of loan.installments) { integer(x.principal, '分期本金'); integer(x.interest, '分期利息'); integer(x.paid, '分期已还', 0, x.amount); need(x.amount === x.principal + x.interest, '分期合计损坏。'); paid += x.paid; remaining += x.principal - Math.max(0, x.paid - x.interest); }
    need(paid === loan.paid && remaining === loan.remainingPrincipal && loan.installments.reduce((n, x) => n + x.amount, 0) === loan.totalPayable, '贷款分期与本金不一致。', 'INVALID_STATE'); principal += loan.remainingPrincipal;
  }
  let invested = 0;
  for (const row of s.wallet.investments) { integer(row.principal, '理财本金'); integer(row.accrued, '已结算收益'); need(['active', 'redeemed'].includes(row.status), '理财状态损坏。'); if (row.status === 'active') invested += row.principal + row.accrued; }
  for (const product of s.commerce.products) { if(product.stock!==null)integer(product.stock,'商品库存'); if(product.price!==null)integer(product.price,'商品单价'); }
  for (const row of s.commerce.cart) { integer(row.qty, '购物车数量', 1); byId(s.commerce.products, row.productId, '购物车商品'); }
  for (const order of s.commerce.orders) {
    integer(order.total, '订单总额'); integer(order.refunded, '已退金额', 0, order.total); integer(order.deliveryFee, '配送费');
    need(Array.isArray(order.items) && order.items.length > 0, '订单明细缺失。');
    for (const item of order.items) { integer(item.price, '商品单价'); integer(item.qty, '商品数量', 1);if(item.refundedQty!=null)integer(item.refundedQty,'已退商品数量',0,item.qty); byId(s.commerce.products, item.productId, '订单商品'); }
    need(order.total === order.items.reduce((n, x) => n + x.price * x.qty, 0) + order.deliveryFee-(order.discount??0), '订单金额损坏。');
    need(['unpaid','void','paid', 'preparing', 'delivering', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'].includes(order.status), '订单状态损坏。');
    need(['cancelled', 'refunded'].includes(order.status) ? order.refunded === order.total : order.refunded <= order.total, '订单退款状态与金额不符。');
  }
  for (const item of s.inventory) { integer(item.qty, '持有数量'); integer(item.consumed, '已消耗数量'); }
  need(Number.isSafeInteger(s.wallet.external) && Number.isSafeInteger(s.wallet.initialNet), '资金核验数据损坏。');
  need([cash, invested, principal].every(Number.isSafeInteger), '汇总金额超过整数精度范围。');
  const net = BigInt(cash) + BigInt(invested) + BigInt(card.refundBalance) - BigInt(card.used) - BigInt(principal) + BigInt(s.wallet.external) + BigInt(pendingMoney(s));
  need(s.config?.database===true||net === BigInt(s.wallet.initialNet), '资金与负债不守恒，候选操作被拒绝；原档不变。', 'MONEY_INVARIANT');
  validateLifeExtensions(s);return true;
}

function financialNet(s){return BigInt(s.wallet.accounts.reduce((n,a)=>n+(a.balance??0),0))+BigInt(s.wallet.investments.filter(p=>p.status==='active').reduce((n,p)=>n+p.principal+p.accrued,0))+BigInt(s.wallet.card.refundBalance)-BigInt(s.wallet.card.used)-BigInt(s.wallet.loans.reduce((n,l)=>n+l.remainingPrincipal,0))+BigInt(s.wallet.external)+BigInt(pendingMoney(s));}
export function reduce(state, action,options={}) {
  validateState(state);
  need(action && typeof action.type === 'string', '动作类型缺失。');
  need(typeof action.id === 'string' && /^[\w.:-]{1,160}$/.test(action.id) && !['__proto__', 'constructor', 'prototype'].includes(action.id), '每个动作必须有有效的唯一编号。');
  const fingerprint = stable(action);
  if (own(state.receipts, action.id)) {
    const receipt = state.receipts[action.id]; need(receipt.fingerprint === fingerprint, '同一操作编号不能更改参数。', 'ID_CONFLICT');
    return { state, result: { ...clone(receipt.result), replayed: true } };
  }
  need(!state.applied.includes(action.id), '该操作编号已经用于另一个应用。', 'ID_CONFLICT');
  assertLifeActionAvailable(state,action);
  const next = clone(state); const result = perform(next, action,options); refresh(next);
  next.revision += 1; next.applied.push(action.id); next.receipts[action.id] = { fingerprint, result: clone(result), at: next.clock.totalMinutes };
  next.audit.push({ id: action.id, at: next.clock.totalMinutes, type: action.type, message: result.message });
  validateState(next);need(financialNet(next)===financialNet(state),'本次操作资金与负债不守恒，未写入表单。','MONEY_INVARIANT');return { state: next, result };
}

export function assertLifeActionAvailable(s,a){
  const config=s.config; need(config&&Array.isArray(config.apps),'世界手机配置缺失。','UNCONFIGURED_WORLD');
  let app=a.type.startsWith('wallet.')?'wallet':a.type.startsWith('map.')?'map':a.type.startsWith('calendar.')?'calendar':null;
  if(a.type.startsWith('cart.')){const p=s.commerce.products.find(x=>x.id===a.productId);app=p?.kind==='food'?'food':'shop';}
  if(a.type.startsWith('order.')){const o=a.type==='order.reserve'?(s.commerce.quotes??[]).find(q=>q.quoteId===a.quoteId):['order.checkout','order.quote'].includes(a.type)?a:s.commerce.orders.find(x=>x.id===a.orderId);app=o?.kind==='food'?'food':'shop';}
  if(app)need(config.apps.includes(app),'世界未启用这个应用。','APP_DISABLED');
  if(a.type.startsWith('wallet.')||['order.checkout','order.pay','order.cancel','order.refund','order.refund.partial'].includes(a.type)){need(config.settlementOwner==='phone'||config.settlementOwner==='tables'&&config.database===true,'数值由原生变量或表单结算；手机不能另写一份账本。','EXTERNAL_STATE_OWNER');need(config.currency&&typeof config.currency.name==='string','世界货币尚未配置。','UNCONFIGURED_CURRENCY');}
}
export function refreshState(input){const next=clone(input);refresh(next);validateState(next);return next;}
