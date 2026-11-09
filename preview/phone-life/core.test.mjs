import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, reduce, money, validateState, quoteLoan, quoteJourney } from './core.mjs';

let serial = 0;
const apply = (state, type, payload = {}) => reduce(state, { id: `test-${++serial}`, type, ...payload }).state;
const cash = (state, id = 'balance') => state.wallet.accounts.find(x => x.id === id).balance;
function rejectUnchanged(state, type, payload, match) {
  const before = JSON.stringify(state);
  assert.throws(() => apply(state, type, payload), match);
  assert.equal(JSON.stringify(state), before, '失败必须保留原状态，包括购物车、库存和回执');
}
function purchase(productId = 'book', payment = 'balance', placeId = 'home') {
  let s = apply(createDemoState(), 'cart.add', { productId });
  return apply(s, 'order.checkout', { kind: ['meal', 'coffee', 'fruit'].includes(productId) ? 'food' : 'shop', payment, placeId });
}
function deliver(s) {
  const id = s.commerce.orders[0].id;
  while (s.commerce.orders[0].status !== 'delivered') s = apply(s, 'order.advance', { orderId: id });
  return s;
}
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }

test('演示起点固定，金额严格为整数分', () => {
  const s = createDemoState();
  assert.equal(validateState(s), true);
  assert.deepEqual(s.clock, { year: 2026, month: 11, day: 9, minute: 1080, totalMinutes: 0 });
  assert.equal(cash(s) + cash(s, 'bank'), 880000);
  assert.equal(money(1), '0.01'); assert.equal(money(-199), '-1.99');
  assert.throws(() => money(1.5), /整数分/);
});

test('纯 reducer 可处理深冻结输入，保留独立社交状态', () => {
  const s = createDemoState(); s.social = { posts: [{ id: 'p', text: '保持原文' }] };
  freeze(s);
  const next = apply(s, 'cart.add', { productId: 'book' });
  assert.equal(s.commerce.cart.length, 0); assert.equal(next.commerce.cart.length, 1);
  assert.deepEqual(next.social, s.social); assert.notEqual(next.social, s.social);
});

test('相同操作幂等，改参数冲突，JSON冷启动仍可重放回执', () => {
  const a = { id: 'fixed-transfer', type: 'wallet.transfer', amount: 1200, to: 'yu' };
  const first = reduce(createDemoState(), a); const restored = JSON.parse(JSON.stringify(first.state));
  const second = reduce(restored, a);
  assert.equal(second.state, restored); assert.equal(second.result.replayed, true);
  assert.equal(cash(second.state), 278800); assert.equal(second.state.revision, 1);
  assert.throws(() => reduce(second.state, { ...a, amount: 1300 }), /同一操作编号/);
});

test('操作编号不能跨社交与钱包复用', () => {
  const s = createDemoState(); s.applied.push('social-1');
  assert.throws(() => reduce(s, { id: 'social-1', type: 'wallet.transfer', amount: 1, to: 'yu' }), /另一个应用/);
});

test('本人账户转账守恒，未知收款人和余额不足不扣钱', () => {
  let s = apply(createDemoState(), 'wallet.transfer', { from: 'bank', to: 'balance', amount: 10000 });
  assert.equal(cash(s), 290000); assert.equal(cash(s, 'bank'), 590000); assert.equal(s.wallet.external, 0);
  rejectUnchanged(s, 'wallet.transfer', { to: 'unknown', amount: 500 }, /收款人/);
  rejectUnchanged(s, 'wallet.transfer', { to: 'yu', amount: 999999 }, /余额不足/);
  rejectUnchanged(s, 'wallet.transfer', { to: 'yu', amount: 0.1 }, /整数/);
});

test('商城付款留订单，不提前进入背包；商店和外卖购物车分开结算', () => {
  let s = apply(createDemoState(), 'cart.add', { productId: 'book' });
  s = apply(s, 'cart.add', { productId: 'coffee' });
  s = apply(s, 'order.checkout', { kind: 'shop', payment: 'balance', placeId: 'home' });
  assert.equal(s.inventory.length, 0); assert.equal(s.commerce.orders[0].total, 5500);
  assert.equal(cash(s), 274500); assert.deepEqual(s.commerce.cart, [{ productId: 'coffee', qty: 1 }]);
  rejectUnchanged(s, 'order.collect', { orderId: s.commerce.orders[0].id }, /尚未送达/);
});

test('支付失败保留资金、库存、购物车和全部审计状态', () => {
  let s = apply(createDemoState(), 'wallet.transfer', { to: 'yu', amount: 280000 });
  s = apply(s, 'cart.add', { productId: 'coat' });
  rejectUnchanged(s, 'order.checkout', { kind: 'shop', payment: 'balance', placeId: 'home' }, /余额不足/);
  assert.equal(s.wallet.card.used, 0, '不自动改用信用卡');
});

test('取消付款订单原路退款并恢复库存；不同ID也不能重复退款', () => {
  let s = purchase(); const orderId = s.commerce.orders[0].id;
  s = apply(s, 'order.cancel', { orderId });
  assert.equal(cash(s), 280000); assert.equal(s.wallet.external, 0);
  assert.equal(s.commerce.products.find(x => x.id === 'book').stock, 12);
  assert.equal(s.wallet.ledger.length, 2, '原付款记录与退款记录都存在');
  rejectUnchanged(s, 'order.cancel', { orderId }, /配送或结束/);
  rejectUnchanged(s, 'order.refund', { orderId }, /已送达或已领取/);
});

test('配送地点不跟随人物，须真正到场领取；预览路线不移动人物', () => {
  let s = deliver(purchase('book', 'balance', 'cafe')); const orderId = s.commerce.orders[0].id;
  rejectUnchanged(s, 'order.collect', { orderId }, /收货地点/);
  const quote = quoteJourney(s, 'cafe', 'walk'); assert.equal(s.map.position, 'home'); assert.equal(s.map.journey, null);
  s = apply(s, 'map.depart', { placeId: 'cafe', mode: 'walk' }); assert.equal(s.map.position, 'home');
  rejectUnchanged(s, 'order.collect', { orderId }, /收货地点/);
  s = apply(s, 'map.arrive'); assert.equal(s.clock.totalMinutes, quote.duration); assert.equal(s.map.position, 'cafe');
  s = apply(s, 'order.collect', { orderId });
  assert.equal(s.inventory[0].placeId, 'cafe'); assert.equal(s.inventory[0].ownerId, 'me');
  rejectUnchanged(s, 'order.collect', { orderId }, /已经领取/);
});

test('食物领取前不能吃，吃后不能整单退款或重复吃', () => {
  let s = deliver(purchase('meal')); const orderId = s.commerce.orders[0].id;
  assert.equal(s.inventory.length, 0);
  rejectUnchanged(s, 'inventory.consume', { itemId: 'meal' }, /持有物不存在/);
  s = apply(s, 'order.collect', { orderId }); const itemId = s.inventory[0].id;
  s = apply(s, 'inventory.consume', { itemId }); assert.equal(s.inventory[0].qty, 0); assert.equal(s.inventory[0].consumed, 1);
  rejectUnchanged(s, 'inventory.consume', { itemId }, /已经吃完/);
  rejectUnchanged(s, 'order.refund', { orderId }, /已经使用、消耗/);
});

test('完整已领取商品退货同时收回物品、退款、补回库存', () => {
  let s = deliver(purchase()); const orderId = s.commerce.orders[0].id;
  s = apply(s, 'order.collect', { orderId }); s = apply(s, 'order.refund', { orderId });
  assert.equal(s.inventory.length, 0); assert.equal(cash(s), 280000);
  assert.equal(s.commerce.products.find(x => x.id === 'book').stock, 12);
  assert.equal(s.commerce.orders[0].status, 'refunded'); assert.equal(validateState(s), true);
});

test('信用消费保留现金，未还消费退款冲掉该笔债务', () => {
  let s = purchase('meal', 'credit'); const orderId = s.commerce.orders[0].id;
  assert.equal(cash(s), 280000); assert.equal(s.wallet.card.used, 4300);
  s = apply(s, 'order.cancel', { orderId });
  assert.equal(s.wallet.card.used, 0); assert.equal(s.wallet.card.refundBalance, 0); assert.equal(s.wallet.external, 0);
});

test('信用部分还款后退款：仅未还部分减债，已还部分成为溢缴款', () => {
  let s = purchase('meal', 'credit'); const orderId = s.commerce.orders[0].id;
  s = apply(s, 'wallet.card.repay', { amount: 1000 });
  s = apply(s, 'order.cancel', { orderId });
  assert.equal(s.wallet.card.used, 0); assert.equal(s.wallet.card.refundBalance, 1000); assert.equal(cash(s, 'bank'), 599000);
  s = apply(s, 'cart.add', { productId: 'book' });
  s = apply(s, 'order.checkout', { kind: 'shop', payment: 'credit', placeId: 'home' });
  assert.equal(s.wallet.card.refundBalance, 0); assert.equal(s.wallet.card.used, 4500);
  s = apply(s, 'order.cancel', { orderId: s.commerce.orders[0].id });
  assert.equal(s.wallet.card.used, 0); assert.equal(s.wallet.card.refundBalance, 1000); assert.equal(validateState(s), true);
});

test('信用卡还款有上限，限额不足不会扣现金或改借款', () => {
  let s = purchase('book', 'credit');
  rejectUnchanged(s, 'wallet.card.repay', { amount: 5501 }, /超过当前信用卡欠款/);
  s = apply(s, 'wallet.card.repay', { amount: 5500 });
  rejectUnchanged(s, 'wallet.card.repay', { amount: 1 }, /超过当前信用卡欠款/);
  let limited = createDemoState(); limited.wallet.card.limit = 1000;
  limited = apply(limited, 'cart.add', { productId: 'book' });
  rejectUnchanged(limited, 'order.checkout', { kind: 'shop', payment: 'credit', placeId: 'home' }, /额度不足/);
});

test('多笔信用消费退款只抵消原单，已还款不冲错另一笔欠款', () => {
  let s = purchase('book', 'credit'); const firstOrder = s.commerce.orders[0].id;
  s = apply(s, 'cart.add', { productId: 'coat' });
  s = apply(s, 'order.checkout', { kind: 'shop', payment: 'credit', placeId: 'home' }); const secondOrder = s.commerce.orders[0].id;
  s = apply(s, 'wallet.card.repay', { amount: 10000 });
  assert.equal(s.wallet.card.used, 21000);
  s = apply(s, 'order.cancel', { orderId: firstOrder });
  assert.equal(s.wallet.card.used, 21000); assert.equal(s.wallet.card.refundBalance, 5500);
  s = apply(s, 'order.cancel', { orderId: secondOrder });
  assert.equal(s.wallet.card.used, 0); assert.equal(s.wallet.card.refundBalance, 10000);
  assert.equal(cash(s, 'bank'), 590000); assert.equal(validateState(s), true);
});

test('已领取随身食品随角色到达，未领取订单地址保持不变', () => {
  let s = deliver(purchase('coffee')); const orderId = s.commerce.orders[0].id;
  s = apply(s, 'order.collect', { orderId });
  s = apply(s, 'map.depart', { placeId: 'park', mode: 'bike' }); s = apply(s, 'map.arrive');
  assert.equal(s.commerce.orders[0].placeId, 'home'); assert.equal(s.inventory[0].placeId, 'park');
  s = apply(s, 'inventory.consume', { itemId: s.inventory[0].id }); assert.equal(s.inventory[0].consumed, 1);
});

test('账单日与到期按故事时间评估，不自动还款和凭空计费', () => {
  let s = purchase('book', 'credit'); const bank = cash(s, 'bank');
  assert.equal(s.wallet.card.statements[0].status, 'unbilled');
  s = apply(s, 'world.advance', { minutes: 12 * 1440 });
  assert.equal(s.clock.day, 21); assert.equal(s.wallet.card.statements[0].status, 'billed');
  s = apply(s, 'world.advance', { minutes: 8 * 1440 });
  assert.equal(s.clock.day, 29); assert.equal(s.wallet.card.statements[0].status, 'overdue');
  assert.equal(s.wallet.card.used, 5500); assert.equal(cash(s, 'bank'), bank);
});

test('贷款报价提前披露准确期数、APR、逐期金额与总成本', () => {
  const quote = quoteLoan(100000, 6);
  assert.equal(quote.apr, 0.12); assert.equal(quote.fee, 0); assert.equal(quote.totalInterest, 3500); assert.equal(quote.totalPayable, 103500);
  assert.equal(quote.monthlyPayment, 17667); assert.equal(quote.installments.at(-1).amount, 16833);
  assert.equal(quote.installments.reduce((n, x) => n + x.principal, 0), 100000);
  assert.throws(() => quoteLoan(100000, 5), /3、6或12/);
});

test('没有确认当前报价不能借款；放款同时产生准确本金负债', () => {
  const s = createDemoState();
  rejectUnchanged(s, 'wallet.loan.borrow', { amount: 100000, months: 6 }, /先查看并确认/);
  rejectUnchanged(s, 'wallet.loan.borrow', { amount: 200000, months: 6, quoteId: quoteLoan(100000, 6).quoteId }, /先查看并确认/);
  const next = apply(s, 'wallet.loan.borrow', quoteLoan(100000, 6));
  assert.equal(cash(next, 'bank'), 700000); assert.equal(next.wallet.loans[0].remainingPrincipal, 100000);
  assert.equal(next.wallet.loans[0].installments[0].dueAt, 30 * 1440); assert.equal(validateState(next), true);
});

test('贷款部分还款与结清守恒，不重复消减本金或超额收款', () => {
  let s = apply(createDemoState(), 'wallet.loan.borrow', quoteLoan(100000, 6)); const loanId = s.wallet.loans[0].id;
  s = apply(s, 'wallet.loan.repay', { loanId, amount: 500 });
  assert.equal(s.wallet.loans[0].remainingPrincipal, 100000); assert.equal(s.wallet.external, 500);
  s = apply(s, 'wallet.loan.repay', { loanId, amount: 103000 });
  assert.equal(s.wallet.loans[0].status, 'paid'); assert.equal(s.wallet.loans[0].remainingPrincipal, 0);
  assert.equal(cash(s, 'bank'), 596500); assert.equal(s.wallet.external, 3500);
  rejectUnchanged(s, 'wallet.loan.repay', { loanId, amount: 1 }, /超过这笔贷款/);
});

test('贷款逾期仅标记状态，不偷偷从账户扣款', () => {
  let s = apply(createDemoState(), 'wallet.loan.borrow', quoteLoan(100000, 3));
  s = apply(s, 'world.advance', { minutes: 31 * 1440 });
  assert.equal(s.wallet.loans[0].status, 'overdue'); assert.equal(cash(s, 'bank'), 700000); assert.equal(s.wallet.loans[0].paid, 0);
});

test('理财不会自动生收益；显式结算只按故事时间，重复不多发', () => {
  let s = apply(createDemoState(), 'wallet.invest.buy', { productId: 'steady', amount: 100000 }); const investmentId = s.wallet.investments[0].id;
  rejectUnchanged(s, 'wallet.invest.settle', { investmentId }, /尚无新增整分收益/);
  s = apply(s, 'world.advance', { minutes: 365 * 1440 });
  assert.equal(s.wallet.investments[0].accrued, 0);
  s = apply(s, 'wallet.invest.settle', { investmentId }); assert.equal(s.wallet.investments[0].accrued, 1800);
  rejectUnchanged(s, 'wallet.invest.settle', { investmentId }, /尚无新增整分收益/);
  s = apply(s, 'wallet.invest.redeem', { investmentId }); assert.equal(cash(s, 'bank'), 601800); assert.equal(validateState(s), true);
  rejectUnchanged(s, 'wallet.invest.redeem', { investmentId }, /已经赎回/);
});

test('赎回不偷偷补算未确认收益', () => {
  let s = apply(createDemoState(), 'wallet.invest.buy', { productId: 'steady', amount: 100000 }); const investmentId = s.wallet.investments[0].id;
  s = apply(s, 'world.advance', { minutes: 365 * 1440 });
  s = apply(s, 'wallet.invest.redeem', { investmentId });
  assert.equal(cash(s, 'bank'), 600000); assert.equal(s.wallet.external, 0);
});

test('推进时间不代别人确认日程；明确模拟确认后才有到期提醒', () => {
  let s = apply(createDemoState(), 'calendar.add', { title: '一起喝咖啡', day: 9, minute: 1110, placeId: 'cafe', participantId: 'yu' }); const eventId = s.calendar.events.at(-1).id;
  s = apply(s, 'world.advance', { minutes: 40 });
  assert.equal(s.calendar.events.at(-1).status, 'invited'); assert.equal(s.calendar.events.at(-1).notified, false);
  s = apply(s, 'calendar.confirm', { eventId });
  assert.equal(s.calendar.events.at(-1).status, 'confirmed'); assert.equal(s.calendar.events.at(-1).notified, true);
  assert.equal(s.audit.filter(x => x.type === 'calendar.due').length, 1);
  s = apply(s, 'world.advance', { minutes: 1 }); assert.equal(s.audit.filter(x => x.type === 'calendar.due').length, 1);
});

test('错误日期、未知位置和倒退时钟均不改原状态', () => {
  const s = createDemoState();
  rejectUnchanged(s, 'calendar.add', { title: '过去', day: 8, minute: 600, placeId: 'home' }, /过去/);
  rejectUnchanged(s, 'calendar.add', { title: '不存在', day: 31, minute: 600, placeId: 'home' }, /不存在这个日期/);
  rejectUnchanged(s, 'map.depart', { placeId: 'secret', mode: 'walk' }, /目的地不存在/);
  rejectUnchanged(s, 'world.advance', { minutes: -1 }, /整数/);
});

test('篡改现金或债务会被全局守恒校验拒绝，不重置为演示初值', () => {
  const s = createDemoState(); s.wallet.accounts[0].balance += 1;
  assert.throws(() => validateState(s), /不守恒/);
  assert.throws(() => apply(s, 'cart.add', { productId: 'book' }), /不守恒/);
  assert.equal(s.wallet.accounts[0].balance, 280001);
});
