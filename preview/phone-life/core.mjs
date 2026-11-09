// Fictional, offline-only domain model. No storage, clock, network or DOM side effects.
const EPOCH = Date.UTC(2026, 10, 9, 18, 0);
const MINUTE = 60000;
const MONTH = 30 * 24 * 60;
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
function nextId(s, prefix) { s.seq += 1; return `${prefix}-${s.seq}`; }
function byId(rows, id, label) { const found = rows.find(x => x.id === id); need(found, `${label}不存在。`, 'NOT_FOUND'); return found; }
function account(s, id = 'balance') { return byId(s.wallet.accounts, id, '账户'); }
function debit(s, id, n) { const row = account(s, id); need(row.balance >= n, `${row.name}余额不足；不会自动借款或透支。`, 'INSUFFICIENT_FUNDS'); row.balance -= n; }
function credit(s, id, n) { account(s, id).balance += n; }
function record(s, type, description, n, accountId = '', extra = {}) {
  s.wallet.ledger.unshift({ id: nextId(s, 'ledger'), at: s.clock.totalMinutes, type, description, amount: n, accountId, ...extra });
}
function atMinute(year, month, day, minute = 0) { return Math.round((Date.UTC(year, month - 1, day, 0, minute) - EPOCH) / MINUTE); }
function cardDates(s) {
  const d = new Date(EPOCH + s.clock.totalMinutes * MINUTE);
  let month = d.getUTCMonth();
  let statement = Date.UTC(d.getUTCFullYear(), month, s.wallet.card.billDay, 23, 59);
  if (EPOCH + s.clock.totalMinutes * MINUTE > statement) { month += 1; statement = Date.UTC(d.getUTCFullYear(), month, s.wallet.card.billDay, 23, 59); }
  const dueMonth = month + (s.wallet.card.dueDay <= s.wallet.card.billDay ? 1 : 0);
  return { statementAt: (statement - EPOCH) / MINUTE, dueAt: (Date.UTC(d.getUTCFullYear(), dueMonth, s.wallet.card.dueDay, 23, 59) - EPOCH) / MINUTE };
}
function refresh(s) {
  const d = new Date(EPOCH + s.clock.totalMinutes * MINUTE);
  s.clock.year = d.getUTCFullYear(); s.clock.month = d.getUTCMonth() + 1; s.clock.day = d.getUTCDate(); s.clock.minute = d.getUTCHours() * 60 + d.getUTCMinutes();
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
  for (const event of s.calendar.events) {
    if (['personal', 'confirmed'].includes(event.status) && event.at <= s.clock.totalMinutes && !event.notified) {
      event.notified = true;
      s.audit.push({ id: nextId(s, 'reminder'), at: s.clock.totalMinutes, type: 'calendar.due', message: `故事日程已到时间：${event.title}` });
    }
  }
}
function advanceTime(s, minutes) { s.clock.totalMinutes += integer(minutes, '推进分钟', 0, YEAR * 10); need(s.clock.totalMinutes <= YEAR * 100, '演示时钟最多推进100个故事年。'); refresh(s); }

export function money(cents) {
  need(Number.isSafeInteger(cents), '金额必须是整数分。');
  return `${cents < 0 ? '-' : ''}${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function quoteLoan(value, term) {
  const n = integer(value, '借款金额（分）', 10000, 1000000);
  const months = integer(term, '期数', 1, 12);
  need([3, 6, 12].includes(months), '演示贷款只提供3、6或12期。');
  let remaining = n;
  const installments = Array.from({ length: months }, (_, i) => {
    const principal = Math.floor(n / months) + (i < n % months ? 1 : 0);
    const interest = Math.round(remaining / 100); // 12% nominal APR / 12: one percent per period.
    remaining -= principal;
    return { number: i + 1, principal, interest, amount: principal + interest };
  });
  const totalInterest = installments.reduce((sum, x) => sum + x.interest, 0);
  return { quoteId: `demo-loan-v1:${n}:${months}:1200`, amount: n, months, apr: 0.12, fee: 0, totalInterest, totalPayable: n + totalInterest, monthlyPayment: installments[0].amount, installments };
}

export function quoteJourney(s, placeId, mode = 'walk') {
  need(!s.map.journey, '当前行程尚未结束。');
  const from = byId(s.map.places, s.map.position, '出发地点');
  const to = byId(s.map.places, placeId, '目的地');
  need(to.known === true, '尚未获知这个地点。'); need(from.id !== to.id, '已经在这个地点。');
  const speeds = { walk: 1, bike: 2.5, transit: 3 };
  need(own(speeds, mode), '请选择步行、骑行或公共交通。');
  const duration = Math.max(3, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 3 / speeds[mode]));
  return { from: from.id, to: to.id, mode, duration, departAt: s.clock.totalMinutes, arriveAt: s.clock.totalMinutes + duration };
}

export function createDemoState() {
  const s = {
    schema: 1, revision: 0, seq: 100, applied: [], receipts: {}, audit: [],
    clock: { year: 2026, month: 11, day: 9, minute: 1080, totalMinutes: 0 },
    wallet: {
      accounts: [{ id: 'balance', name: '零钱余额', balance: 280000 }, { id: 'bank', name: '青禾银行卡', balance: 600000 }],
      card: { id: 'credit', name: '青禾信用卡', limit: 500000, used: 0, refundBalance: 0, billDay: 20, dueDay: 28, charges: [], statements: [] },
      loans: [], investments: [], ledger: [], external: 0, initialNet: 880000,
      investmentProducts: [{ id: 'steady', name: '零钱小花园 · 模拟计划', apr: 0.018, annualRateBps: 180, description: '固定1.8%模拟年率；仅在你点击模拟结算后入账，不代表真实收益。' }],
    },
    commerce: {
      products: [
        { id: 'coat', name: '柔雾针织外套', description: '适合傍晚散步的轻软外套。', price: 24900, stock: 8, kind: 'physical', shopId: 'moon-store', placeId: 'store', image: 'coat', tags: ['秋日', '实物'] },
        { id: 'book', name: '城市漫游手记', description: '把走过的小街和遇到的人记下来。', price: 4900, stock: 12, kind: 'physical', shopId: 'moon-store', placeId: 'store', image: 'album', tags: ['阅读'] },
        { id: 'headphones', name: '随身耳机', description: '一副陪你走路听歌的耳机。', price: 15900, stock: 6, kind: 'physical', shopId: 'moon-store', placeId: 'store', image: 'night', tags: ['音乐', '实物'] },
        { id: 'coffee', name: '桂花拿铁', description: '日落咖啡的当季热饮。', price: 2200, stock: 20, kind: 'food', shopId: 'sunset', placeId: 'cafe', image: 'coffee', tags: ['热饮'] },
        { id: 'meal', name: '照烧鸡腿饭', description: '一份热乎的晚饭，可备注少饭。', price: 3800, stock: 15, kind: 'food', shopId: 'sunset', placeId: 'cafe', image: 'meal', tags: ['正餐'] },
        { id: 'fruit', name: '时令水果盒', description: '当天制作的小份水果。', price: 1800, stock: 10, kind: 'food', shopId: 'sunset', placeId: 'cafe', image: 'meal', tags: ['甜点'] },
      ], cart: [], orders: [],
    },
    inventory: [],
    map: { position: 'home', journey: null, places: [
      { id: 'home', name: '我的住处', description: '窗边有一小片下午的阳光。', x: 25, y: 72, kind: 'home', known: true },
      { id: 'cafe', name: '日落咖啡', description: '熟悉的街角小店，也提供外卖。', x: 64, y: 50, kind: 'cafe', known: true },
      { id: 'park', name: '河畔公园', description: '沿着水边走一走。', x: 75, y: 18, kind: 'park', known: true },
      { id: 'store', name: '月下百货', description: '可以买到日常用品的小商店。', x: 22, y: 25, kind: 'shop', known: true },
    ] },
    calendar: { events: [{ id: 'event-seed', title: '去河边散步', day: 10, minute: 1020, placeId: 'park', participantId: '', status: 'personal', at: 1380, notified: false }] },
  };
  refresh(s); validateState(s); return s;
}

function pay(s, order, payment, accountId) {
  if (payment === 'balance') {
    debit(s, accountId, order.total);
    record(s, 'purchase', `${order.kind === 'food' ? '外卖' : '商城'}付款`, -order.total, accountId, { orderId: order.id });
  } else {
    need(payment === 'credit', '请选择余额或信用卡付款。');
    const c = s.wallet.card; const prepaid = Math.min(c.refundBalance, order.total); const debt = order.total - prepaid;
    need(c.used + debt <= c.limit, '信用卡可用额度不足；不会自动提高额度。', 'CREDIT_LIMIT');
    c.refundBalance -= prepaid;
    const charge = { id: nextId(s, 'charge'), orderId: order.id, amount: order.total, originalDebt: debt, remaining: debt, paid: 0, refunded: 0, prepaid, createdAt: s.clock.totalMinutes, ...cardDates(s) };
    c.charges.push(charge); c.used += debt; order.creditChargeId = charge.id;
    record(s, 'credit.purchase', '信用卡消费（不是现金到账）', -order.total, 'credit', { orderId: order.id });
  }
  s.wallet.external += order.total;
}
function refund(s, order, status) {
  need(order.refunded === 0, '订单已经退款，不能重复退款。', 'ALREADY_REFUNDED');
  if (order.status === 'completed') {
    for (const item of order.items) {
      const holding = s.inventory.find(x => x.orderId === order.id && x.productId === item.productId);
      need(holding && holding.qty === item.qty && holding.consumed === 0 && holding.ownerId === 'me', '商品已经使用、消耗或不再完整，不能模拟整单退货。');
      need(!s.map.journey && holding.placeId === s.map.position, '请先回到商品所在地点办理退货。');
    }
    s.inventory = s.inventory.filter(x => x.orderId !== order.id);
  }
  for (const item of order.items) byId(s.commerce.products, item.productId, '商品').stock += item.qty;
  if (order.payment === 'credit') {
    const c = s.wallet.card; const charge = byId(c.charges, order.creditChargeId, '信用消费记录');
    const againstDebt = Math.min(charge.remaining, order.total);
    charge.remaining -= againstDebt; charge.refunded += order.total;
    c.refundBalance += order.total - againstDebt; c.used -= againstDebt;
    record(s, 'credit.refund', '原路退款：冲减本单债务，余款留作卡内溢缴款', order.total, 'credit', { orderId: order.id });
  } else {
    credit(s, order.accountId, order.total);
    record(s, 'refund', '订单原路全额退款', order.total, order.accountId, { orderId: order.id });
  }
  s.wallet.external -= order.total; order.refunded = order.total; order.status = status; order.updatedAt = s.clock.totalMinutes;
}

function perform(s, a) {
  const msg = message => ({ message });
  switch (a.type) {
    case 'wallet.transfer': {
      const n = amount(a.amount), from = a.from || 'balance'; need(a.to !== from, '不能向同一个账户转账。');
      const destination = s.wallet.accounts.find(x => x.id === a.to);
      need(destination || a.to === 'yu', '请先确认收款人的稳定身份。'); debit(s, from, n);
      if (destination) credit(s, destination.id, n); else s.wallet.external += n;
      record(s, 'transfer', `转给${destination?.name || '余舟（演示收款人）'}`, -n, from, { to: a.to });
      if (destination) record(s, 'transfer.in', `从${account(s, from).name}转入`, n, destination.id);
      return msg(`已转账 ${money(n)} 元，付款记录已保留。`);
    }
    case 'wallet.card.repay': {
      const n = amount(a.amount), from = a.accountId || 'bank'; need(n <= s.wallet.card.used, '还款金额不能超过当前信用卡欠款。'); debit(s, from, n);
      let remaining = n;
      for (const charge of s.wallet.card.charges) { const paid = Math.min(remaining, charge.remaining); charge.remaining -= paid; charge.paid += paid; remaining -= paid; }
      s.wallet.card.used -= n; record(s, 'credit.repay', '信用卡还款', -n, from);
      return msg(`已还款 ${money(n)} 元；没有自动扣款或新增借款。`);
    }
    case 'wallet.loan.borrow': {
      const quote = quoteLoan(a.amount, a.months); need(a.quoteId === quote.quoteId, '请先查看并确认本次贷款报价。', 'QUOTE_REQUIRED');
      const to = a.accountId || 'bank'; account(s, to);
      const loan = { ...quote, id: nextId(s, 'loan'), remainingPrincipal: quote.amount, paid: 0, status: 'active', createdAt: s.clock.totalMinutes, accountId: to, installments: quote.installments.map(x => ({ ...x, paid: 0, dueAt: s.clock.totalMinutes + x.number * MONTH })) };
      s.wallet.loans.push(loan); credit(s, to, loan.amount); record(s, 'loan.disburse', '演示贷款放款（同时产生负债）', loan.amount, to, { loanId: loan.id });
      return { message: `已按已确认报价放款 ${money(loan.amount)} 元，共${loan.months}期，总还款 ${money(loan.totalPayable)} 元。`, loanId: loan.id };
    }
    case 'wallet.loan.repay': {
      const loan = byId(s.wallet.loans, a.loanId, '贷款'); const n = amount(a.amount), from = a.accountId || 'bank';
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
      return msg(`已归还 ${money(n)} 元；剩余应还 ${money(loan.totalPayable - loan.paid)} 元。`);
    }
    case 'wallet.invest.buy': {
      const product = byId(s.wallet.investmentProducts, a.productId, '模拟理财产品'); const n = amount(a.amount), from = a.accountId || 'bank'; debit(s, from, n);
      const investment = { id: nextId(s, 'invest'), productId: product.id, principal: n, accrued: 0, createdAt: s.clock.totalMinutes, settledAt: s.clock.totalMinutes, status: 'active' };
      s.wallet.investments.push(investment); record(s, 'invest.buy', '模拟理财申购（现金转为持有份额）', -n, from);
      return { message: `已申购 ${money(n)} 元。收益只在明确模拟结算后入账。`, investmentId: investment.id };
    }
    case 'wallet.invest.settle': {
      const row = byId(s.wallet.investments, a.investmentId, '理财持仓'); need(row.status === 'active', '该持仓已经赎回。');
      const product = byId(s.wallet.investmentProducts, row.productId, '模拟理财产品');
      const earned = Number(BigInt(row.principal) * BigInt(product.annualRateBps) * BigInt(s.clock.totalMinutes - row.createdAt) / BigInt(10000 * YEAR));
      const gain = earned - row.accrued; need(gain > 0, '按已过去的故事时间计算，尚无新增整分收益；不会凭空加钱。');
      row.accrued = earned; row.settledAt = s.clock.totalMinutes; s.wallet.external -= gain;
      record(s, 'invest.simulated-yield', '明确模拟结算收益（非真实金融回报）', gain, row.id);
      return msg(`按故事时间模拟结算 ${money(gain)} 元；未修改现实时间。`);
    }
    case 'wallet.invest.redeem': {
      const row = byId(s.wallet.investments, a.investmentId, '理财持仓'); need(row.status === 'active', '该持仓已经赎回，不能重复领取。');
      const n = row.principal + row.accrued, to = a.accountId || 'bank'; credit(s, to, n); row.status = 'redeemed'; row.redeemedAt = s.clock.totalMinutes;
      record(s, 'invest.redeem', '赎回本金与已结算模拟收益', n, to);
      return msg(`已赎回 ${money(n)} 元；未结算收益不会自动补入。`);
    }
    case 'cart.add': {
      const product = byId(s.commerce.products, a.productId, '商品'); const qty = integer(a.qty ?? 1, '数量', 1, 99);
      const row = s.commerce.cart.find(x => x.productId === product.id); const total = (row?.qty || 0) + qty;
      need(total <= product.stock, '购物车数量超过当前库存。'); if (row) row.qty = total; else s.commerce.cart.push({ productId: product.id, qty });
      return msg(`已加入${product.name}，尚未付款。`);
    }
    case 'cart.remove': {
      need(s.commerce.cart.some(x => x.productId === a.productId), '购物车里没有这件商品。'); s.commerce.cart = s.commerce.cart.filter(x => x.productId !== a.productId); return msg('已从购物车移除。');
    }
    case 'order.checkout': {
      need(['shop', 'food'].includes(a.kind), '订单类型无效。'); const place = byId(s.map.places, a.placeId, '收货地点'); need(place.known, '只能送到已经知道的地点。');
      const items = s.commerce.cart.map(row => ({ row, product: byId(s.commerce.products, row.productId, '商品') })).filter(({ product }) => (product.kind === 'food') === (a.kind === 'food'));
      need(items.length > 0, '本类购物车为空。');
      for (const { row, product } of items) need(product.stock >= row.qty, `${product.name}库存不足；本单没有扣款。`);
      const subtotal = items.reduce((sum, { row, product }) => sum + row.qty * product.price, 0); const deliveryFee = a.kind === 'food' ? 500 : 600;
      const order = { id: nextId(s, 'order'), kind: a.kind, items: items.map(({ row, product }) => ({ productId: product.id, name: product.name, qty: row.qty, price: product.price, kind: product.kind })), subtotal, deliveryFee, total: subtotal + deliveryFee, payment: a.payment || 'balance', accountId: a.accountId || 'balance', placeId: place.id, note: String(a.note || '').slice(0, 300), status: 'paid', createdAt: s.clock.totalMinutes, updatedAt: s.clock.totalMinutes, refunded: 0 };
      pay(s, order, order.payment, order.accountId);
      for (const { row, product } of items) product.stock -= row.qty;
      const selected = new Set(items.map(x => x.product.id)); s.commerce.cart = s.commerce.cart.filter(x => !selected.has(x.productId)); s.commerce.orders.unshift(order);
      return { message: `已付款 ${money(order.total)} 元，等待${a.kind === 'food' ? '制作配送' : '发货'}；物品尚未进入背包。`, orderId: order.id, navigate: { app: a.kind, tab: 'orders', detail: order.id } };
    }
    case 'order.advance': {
      const order = byId(s.commerce.orders, a.orderId, '订单'); const steps = order.kind === 'food' ? ['paid', 'preparing', 'delivering', 'delivered'] : ['paid', 'shipped', 'delivered'];
      const index = steps.indexOf(order.status); need(index >= 0 && index < steps.length - 1, '此订单当前没有可模拟推进的物流阶段。');
      order.status = steps[index + 1]; order.updatedAt = s.clock.totalMinutes;
      return msg(`已明确模拟下一阶段：${{ preparing: '制作中', delivering: '配送中', shipped: '已发货', delivered: '已送到指定地点，等待领取' }[order.status]}。`);
    }
    case 'order.collect': {
      const order = byId(s.commerce.orders, a.orderId, '订单'); need(order.status === 'delivered', '订单尚未送达，或者已经领取。');
      need(!s.map.journey && s.map.position === order.placeId, '请先到达订单的收货地点再领取。');
      for (const item of order.items) s.inventory.push({ id: nextId(s, 'item'), productId: item.productId, name: item.name, kind: item.kind, qty: item.qty, ownerId: 'me', holderId: 'me', storage: 'carried', placeId: order.placeId, orderId: order.id, consumed: 0 });
      order.status = 'completed'; order.updatedAt = s.clock.totalMinutes; return msg('已经领取，物品归本人持有；食物现在可以食用。');
    }
    case 'order.cancel': {
      const order = byId(s.commerce.orders, a.orderId, '订单'); need(['paid', 'preparing'].includes(order.status), '订单已经开始配送或结束，请按收货/退货流程处理。');
      refund(s, order, 'cancelled'); return msg('已取消并原路全额退款，库存已经释放。');
    }
    case 'order.refund': {
      const order = byId(s.commerce.orders, a.orderId, '订单'); need(['delivered', 'completed'].includes(order.status), '只有已送达或已领取的订单可以在此模拟批准退货退款。');
      refund(s, order, 'refunded'); return msg('已明确模拟批准全额退货退款；原付款与退款记录都保留。');
    }
    case 'inventory.consume': {
      const item = byId(s.inventory, a.itemId, '持有物'); need(item.kind === 'food' && item.ownerId === 'me' && item.holderId === 'me', '只有本人已经领取的食物可以食用。');
      need(item.qty > 0, '这份食物已经吃完。'); need(!s.map.journey && item.placeId === s.map.position, '请在食物所在地点食用。'); item.qty -= 1; item.consumed += 1;
      return msg(`已吃掉一份${item.name}，物品记录保留。`);
    }
    case 'map.depart': { s.map.journey = quoteJourney(s, a.placeId, a.mode || 'walk'); return msg(`已出发，预计经过${s.map.journey.duration}个故事分钟到达；当前位置尚未变更。`); }
    case 'map.arrive': {
      const journey = s.map.journey; need(journey, '当前没有正在进行的行程。'); advanceTime(s, Math.max(0, journey.arriveAt - s.clock.totalMinutes)); s.map.position = journey.to; s.map.journey = null;
      for (const item of s.inventory) if (item.holderId === 'me' && item.storage === 'carried') item.placeId = journey.to;
      return msg(`已到达${byId(s.map.places, journey.to, '目的地').name}；故事时间已推进到抵达时刻。`);
    }
    case 'calendar.add': {
      const title = String(a.title || '').trim(); need(title.length > 0 && title.length <= 100, '日程标题须为1—100字。'); const day = integer(a.day, '日期', 1, 31), minute = integer(a.minute, '当日分钟', 0, 1439);
      const date = new Date(Date.UTC(s.clock.year, s.clock.month - 1, day)); need(date.getUTCMonth() + 1 === s.clock.month, '当前故事月不存在这个日期。');
      const at = atMinute(s.clock.year, s.clock.month, day, minute); need(at >= s.clock.totalMinutes, '不能把新日程安排到故事过去。'); byId(s.map.places, a.placeId, '日程地点');
      const participantId = String(a.participantId || ''); need(!participantId || ['yu', 'cafe'].includes(participantId), '请先确认邀请对象。');
      const event = { id: nextId(s, 'event'), title, day, minute, placeId: a.placeId, participantId, status: participantId ? 'invited' : 'personal', at, notified: false };
      s.calendar.events.push(event); return { message: participantId ? '已发出演示邀请，尚未得到参与者确认。' : '已记入个人日程。', eventId: event.id };
    }
    case 'calendar.confirm': { const event = byId(s.calendar.events, a.eventId, '日程'); need(event.status === 'invited', '只有待确认邀请可以模拟接受。'); event.status = 'confirmed'; return msg('已明确模拟参与者确认；这不是实际联网回应。'); }
    case 'calendar.cancel': { const event = byId(s.calendar.events, a.eventId, '日程'); need(event.status !== 'cancelled', '日程已经取消。'); event.status = 'cancelled'; return msg('已取消日程，原记录仍保留。'); }
    case 'world.advance': { const n = integer(a.minutes, '推进分钟', 1, YEAR * 10); advanceTime(s, n); return msg(`已推进${n}个故事分钟；没有自动付款、借款或结算理财收益。`); }
    default: fail('UNSUPPORTED_ACTION', `核心不处理动作 ${String(a.type)}。请由所属应用处理。`);
  }
}

export function validateState(s) {
  need(s && s.schema === 1 && s.wallet && s.commerce && s.map && s.calendar && s.clock, '演示存档结构不完整；不会重置原档。', 'INVALID_STATE');
  for (const [label, rows] of [['账户', s.wallet.accounts], ['信用消费', s.wallet.card?.charges], ['贷款', s.wallet.loans], ['理财持仓', s.wallet.investments], ['理财产品', s.wallet.investmentProducts], ['资金流水', s.wallet.ledger], ['商品', s.commerce.products], ['订单', s.commerce.orders], ['持有物', s.inventory], ['地点', s.map.places], ['日程', s.calendar.events]]) {
    need(Array.isArray(rows) && rows.every(x => x && typeof x.id === 'string') && new Set(rows.map(x => x.id)).size === rows.length, `${label}记录缺失或身份重复；原档不会重置。`, 'INVALID_STATE');
  }
  need(Array.isArray(s.commerce.cart) && Array.isArray(s.audit), '购物车或事件记录结构损坏。', 'INVALID_STATE');
  integer(s.revision, '修订'); integer(s.seq, '序列'); integer(s.clock.totalMinutes, '故事时间', 0, YEAR * 100);
  need(Array.isArray(s.applied) && new Set(s.applied).size === s.applied.length && s.receipts && typeof s.receipts === 'object', '操作回执结构损坏。', 'INVALID_STATE');
  const cash = s.wallet.accounts.reduce((sum, x) => sum + integer(x.balance, '账户余额'), 0);
  need(new Set(s.wallet.accounts.map(x => x.id)).size === s.wallet.accounts.length, '账户身份重复。');
  const card = s.wallet.card; integer(card.limit, '信用额度'); integer(card.used, '信用债务'); integer(card.refundBalance, '卡内溢缴款');
  need(card.used <= card.limit, '信用额度超限。', 'INVALID_STATE');
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
  for (const product of s.commerce.products) { integer(product.stock, '商品库存'); integer(product.price, '商品单价'); }
  for (const row of s.commerce.cart) { integer(row.qty, '购物车数量', 1); byId(s.commerce.products, row.productId, '购物车商品'); }
  for (const order of s.commerce.orders) {
    integer(order.total, '订单总额'); integer(order.refunded, '已退金额', 0, order.total); integer(order.deliveryFee, '配送费');
    need(Array.isArray(order.items) && order.items.length > 0, '订单明细缺失。');
    for (const item of order.items) { integer(item.price, '商品单价'); integer(item.qty, '商品数量', 1); byId(s.commerce.products, item.productId, '订单商品'); }
    need(order.total === order.items.reduce((n, x) => n + x.price * x.qty, 0) + order.deliveryFee, '订单金额损坏。');
    need(['paid', 'preparing', 'delivering', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'].includes(order.status), '订单状态损坏。');
    need(['cancelled', 'refunded'].includes(order.status) ? order.refunded === order.total : order.refunded === 0, '订单退款状态与金额不符。');
  }
  for (const item of s.inventory) { integer(item.qty, '持有数量'); integer(item.consumed, '已消耗数量'); }
  need(Number.isSafeInteger(s.wallet.external) && Number.isSafeInteger(s.wallet.initialNet), '资金核验数据损坏。');
  need([cash, invested, principal].every(Number.isSafeInteger), '汇总金额超过整数精度范围。');
  const net = BigInt(cash) + BigInt(invested) + BigInt(card.refundBalance) - BigInt(card.used) - BigInt(principal) + BigInt(s.wallet.external);
  need(net === BigInt(s.wallet.initialNet), '资金与负债不守恒，候选操作被拒绝；原档不变。', 'MONEY_INVARIANT');
  return true;
}

export function reduce(state, action) {
  validateState(state);
  need(action && typeof action.type === 'string', '动作类型缺失。');
  need(typeof action.id === 'string' && /^[\w.:-]{1,160}$/.test(action.id) && !['__proto__', 'constructor', 'prototype'].includes(action.id), '每个动作必须有有效的唯一编号。');
  const fingerprint = stable(action);
  if (own(state.receipts, action.id)) {
    const receipt = state.receipts[action.id]; need(receipt.fingerprint === fingerprint, '同一操作编号不能更改参数。', 'ID_CONFLICT');
    return { state, result: { ...clone(receipt.result), replayed: true } };
  }
  need(!state.applied.includes(action.id), '该操作编号已经用于另一个应用。', 'ID_CONFLICT');
  const next = clone(state); const result = perform(next, action); refresh(next);
  next.revision += 1; next.applied.push(action.id); next.receipts[action.id] = { fingerprint, result: clone(result), at: next.clock.totalMinutes };
  next.audit.push({ id: action.id, at: next.clock.totalMinutes, type: action.type, message: result.message });
  validateState(next); return { state: next, result };
}
