// Demo fixtures stay in the preview; production imports phone-life/core.mjs.
import {validateState,quoteLoan as configuredQuoteLoan} from '../../phone-life/core.mjs';
export {reduce,money,validateState,quoteJourney,refreshState} from '../../phone-life/core.mjs';
const DEMO_LOAN={annualRateBps:1200,terms:[3,6,12],periodDays:30,periodsPerYear:12,minAmount:10000,maxAmount:1000000};
export function quoteLoan(amount,months,source=DEMO_LOAN){return configuredQuoteLoan(amount,months,source);}
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
  s.wallet.defaultAccountId='balance';s.wallet.fundingAccountId='bank';
  s.identity={personId:'me',name:'林间'};s.contacts=[{id:'yu',name:'余舟'},{id:'cafe',name:'日落咖啡'}];
  s.config={demo:true,apps:['weibo','wallet','shop','food','album','music','map','calendar'],epoch:Date.UTC(2026,10,9,18,0),timezoneOffsetMinutes:0,settlementOwner:'phone',currency:{name:'元',symbol:'¥',minorUnits:2},economy:{loan:DEMO_LOAN,deliveryFees:{shop:600,food:500}},travel:{speeds:{walk:3,bike:7.5,transit:9}}};
  validateState(s);return s;
}

