import {quoteLoan,quoteJourney} from './core.mjs';

// Presentation only. All changes go through the shared, persisted action reducer.
export function renderUtility(state,ui,h){
 if(!['wallet','shop','food','map','calendar'].includes(ui.app))return null;
 const e=h.esc,m=v=>h.money(v),b=(label,type,payload={},cls='u-secondary')=>h.btn(e(label),type,payload,cls);
 const ib=(icon,label,type,payload={},cls='u-secondary')=>b(label,type,payload,cls).replace('>','>'+h.icon(icon));
 const card=(body,cls='')=>'<section class="card u-card '+cls+'">'+body+'</section>';
 const pill=(text,cls='')=>'<span class="u-pill '+cls+'">'+e(text)+'</span>';
 const empty=(text,icon='wallet')=>'<div class="u-empty">'+h.icon(icon)+e(text)+'</div>';
 const note=text=>'<p class="u-note">'+e(text)+'</p>';
 const section=(title,more='')=>'<div class="u-section"><h3>'+e(title)+'</h3>'+more+'</div>';
 const heading=(kicker,title,desc)=>'<div class="u-heading"><div><p class="u-kicker">'+e(kicker)+'</p><h2>'+e(title)+'</h2><p>'+e(desc)+'</p></div><span class="u-demo">离线演示</span></div>';
 const tabs=(items,current)=>'<div class="u-tabs">'+h.tabs(items.map(([id,label])=>({id,label})),current)+'</div>';
 const stat=(title,value)=>'<div class="u-stat"><p class="u-label">'+e(title)+'</p><div class="u-value">'+value+'</div></div>';
 const hidden=(name,value)=>'<input type="hidden" name="'+e(name)+'" value="'+e(value)+'">';
 const field=(label,content)=>'<label>'+e(label)+content+'</label>';
 const amount=(name,value,extra='')=>'<input name="'+e(name)+'" type="number" inputmode="decimal" min="0.01" step="0.01" data-cents value="'+e((Number(value)/100).toFixed(2))+'" required '+extra+'>';
 const opts=(rows,value)=>rows.map(([id,label])=>'<option value="'+e(id)+'"'+(String(id)===String(value)?' selected':'')+'>'+e(label)+'</option>').join('');
 const select=(name,rows,value,attrs='')=>'<select name="'+e(name)+'" '+attrs+'>'+opts(rows,value)+'</select>';
 const submit=(label,cls='')=>'<button type="submit" class="u-submit '+cls+'">'+e(label)+'</button>';
 const form=(type,content)=>'<form class="u-form" data-action="'+e(type)+'">'+content+'</form>';
 const accounts=state.wallet.accounts,places=state.map.places.filter(p=>p.known!==false),products=state.commerce.products;
 const accountOptions=accounts.map(a=>[a.id,a.name+' · ¥'+m(a.balance)]);
 const place=id=>places.find(p=>p.id===id);
 const locationName=id=>place(id)?.name??'未指定地点';
 const nav=(app,tab='',detail='')=>({app,tab,detail});
 const storyDate=value=>{const c=state.clock;return new Date(Date.UTC(c.year,c.month-1,c.day,0,c.minute-(c.totalMinutes??0)+value));};
 const at=value=>{
  if(typeof value==='string')return e(value.replace('T',' ').slice(0,16));
  if(!Number.isFinite(value))return '—';
  const d=storyDate(value);
  return (d.getUTCMonth()+1)+'月'+d.getUTCDate()+'日 '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');
 };
 const hh=minute=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
 const artFor=p=>p.image||({coat:'coat',coffee:'coffee',meal:'meal',fruit:'meal',book:'album',headphones:'album'}[p.id]??'coat');
 const productArt=p=>'<div class="u-product-art">'+h.art(artFor(p))+'</div>';
 const productBy=id=>products.find(p=>p.id===id);

 function ledgerList(rows){
  if(!rows.length)return empty('账单还空着。付款、转账和还款都会留在这里。');
  return card(rows.map(r=>'<div class="u-list-row"><div class="u-mini-icon">'+h.icon(r.amount>=0?'arrow':'wallet')+'</div><div class="u-list-copy"><p class="u-item-title">'+e(r.description)+'</p><p class="u-item-sub">'+at(r.at)+' · '+e(accounts.find(a=>a.id===r.accountId)?.name??(r.accountId==='credit'?'信用账户':r.accountId??'账户'))+'</p></div><div class="u-list-amount '+(r.amount>0?'positive':'')+'">'+(r.amount>0?'+':'')+m(r.amount)+'</div></div>').join(''));
 }
 function walletHome(){
  const w=state.wallet,cash=accounts.reduce((n,a)=>n+a.balance,0),invest=w.investments.filter(i=>i.status!=='redeemed').reduce((n,i)=>n+i.principal+i.accrued,0);
  return '<section class="u-hero"><div class="u-hero-brand"><span>澄光 · WALLET</span><span>◈ C G</span></div><p class="u-label">我的可用现金</p><div class="u-hero-amount"><small>¥</small>'+m(cash)+'</div><div class="u-hero-footer"><span>零钱与银行卡合计</span><strong>故事内账户</strong></div></section>'+
   '<div class="u-actions">'+ib('send','转账','nav',nav('wallet','transfer'))+ib('card','信用卡','nav',nav('wallet','card'))+ib('star','轻理财','nav',nav('wallet','invest'))+ib('clock','账单','nav',nav('wallet','ledger'))+'</div>'+
   '<div class="u-grid"><div class="u-finance-card"><p class="u-kicker">CREDIT</p><h3>留一点周转空间</h3><div class="u-value">¥'+m(Math.max(0,w.card.limit-w.card.used))+'</div><p class="u-subtle">剩余信用额度</p>'+b('查看信用账户','nav',nav('wallet','card'),'u-secondary')+'</div><div class="u-finance-card gold"><p class="u-kicker">SAVINGS</p><h3>给生活存一点</h3><div class="u-value">¥'+m(invest)+'</div><p class="u-subtle">持有本金与已结算收益</p>'+b('查看我的理财','nav',nav('wallet','invest'),'u-secondary')+'</div></div>'+
   section('我的账户')+card(accounts.map(a=>'<div class="u-list-row"><span class="u-mini-icon">'+h.icon(a.id==='bank'?'card':'wallet')+'</span><div class="u-list-copy"><p class="u-item-title">'+e(a.name)+'</p><p class="u-item-sub">可用于付款与转账</p></div><strong>¥'+m(a.balance)+'</strong></div>').join(''))+
   section('最近账单',b('查看全部','nav',nav('wallet','ledger'),'u-text'))+ledgerList(w.ledger.slice(0,4));
 }
 function transfer(){
  return card('<h3>转一笔，记一笔</h3>'+note('自己的账户之间划转，或转给演示联系人余舟。确认后才实际扣款。')+'<div class="u-rule"></div>'+form('wallet.transfer',
   field('付款账户',select('from',accountOptions,'balance'))+
   field('转给谁',select('to',[['bank','我的银行卡'],['balance','我的零钱'],['yu','余舟 · 联系人']],'yu'))+
   field('转账金额（元）',amount('amount',5000))+submit('确认转账')));
 }
 function credit(){
  const c=state.wallet.card;
  return '<div class="u-credit-card"><div class="u-row u-card-name"><span>澄光 · 信用账户</span>'+h.icon('card')+'</div><p class="u-label">剩余额度</p><div class="u-value">¥'+m(Math.max(0,c.limit-c.used))+'</div><div class="u-card-number">◦◦◦◦ &nbsp; 1028</div></div>'+
   card('<div class="u-three">'+stat('信用总额','¥'+m(c.limit))+stat('当前欠款','¥'+m(c.used))+stat('溢缴款','¥'+m(c.refundBalance))+'</div><div class="u-rule"></div><div class="u-row"><span class="u-subtle">账单日 · 每月 '+e(c.billDay)+' 日</span><span class="u-subtle">到期日 · 每月 '+e(c.dueDay)+' 日</span></div>'+note('示例账期。账单与未出账消费分别记录，偿还后才恢复相应额度。'))+
   section('还款')+(c.used>0?card(form('wallet.card.repay',
    field('扣款账户',select('accountId',accountOptions,'bank'))+field('本次还款（元）',amount('amount',c.used,'max="'+(c.used/100).toFixed(2)+'"'))+submit('确认还款'))):empty('当前没有信用欠款。','check'))+
   section('账期记录')+(c.statements.length?card(c.statements.slice().reverse().map(s=>'<div class="u-list-row"><div class="u-list-copy"><p class="u-item-title">'+e({unbilled:'未出账',billed:'待还账单',overdue:'已逾期',paid:'已还清'}[s.status]??s.status)+'</p><p class="u-item-sub">到期 '+at(s.dueAt)+'</p></div><div><p class="u-list-amount">¥'+m(s.remaining)+'</p><p class="u-item-sub">本期原金额 '+m(s.total)+'</p></div></div>').join('')):note('消费产生后可在此查看账期。故事时间推进到对应日期才更新状态。'));
 }
 function loan(){
  const w=state.wallet;
  if(ui.tab==='loan-quote'){
   let q;try{q=quoteLoan(Number(ui.loanAmount),Number(ui.loanMonths));}catch(error){return card('<h3>请重新选择借款方案</h3>'+note(error.message)+b('返回修改','nav',nav('wallet','loan')));}
   return card('<div class="u-row"><h3>借款方案确认</h3>'+pill('演示报价')+'</div>'+note('这一步只展示费用；点击下方确认后，借款才进入银行卡。')+
    '<div class="u-grid">'+stat('借款本金','¥'+m(q.amount))+stat('年利率 APR',(Number(q.apr)*100).toFixed(1)+'%')+'</div>'+
    '<div class="u-quote-total"><p class="u-label">'+q.months+' 期合计应还</p><div class="u-value">¥'+m(q.totalPayable)+'</div><p class="u-note">总利息 ¥'+m(q.totalInterest)+' · 无额外手续费</p></div>'+
    '<div class="u-row"><span class="u-subtle">等额本金 · 首期金额</span><strong>¥'+m(q.monthlyPayment)+'</strong></div>'+
    note('每期相隔 30 个故事日，后续金额逐期递减；完整计划如下。')+
    '<table class="u-schedule-table"><thead><tr><th>期次</th><th>本金</th><th>利息</th><th>应还</th></tr></thead><tbody>'+q.installments.map((r,i)=>'<tr><td>'+(r.number??i+1)+' / '+q.months+'</td><td>'+m(r.principal)+'</td><td>'+m(r.interest)+'</td><td>'+m(r.amount)+'</td></tr>').join('')+'</tbody></table>'+
    '<div class="u-buttons">'+b('修改方案','nav',nav('wallet','loan'),'u-secondary')+b('确认借入 ¥'+m(q.amount),'wallet.loan.borrow',{amount:q.amount,months:q.months,quoteId:q.quoteId,accountId:'bank'},'u-primary')+'</div>')+
    note('本预览使用固定的虚构利率与期限，不对应真实借贷产品。');
  }
  return card('<p class="u-kicker">A LITTLE ROOM</p><h3>需要时，留一点余地</h3>'+note('先看完整报价，再决定是否借款。示例年利率 12%，等额本金，无额外手续费。')+'<div class="u-rule"></div>'+form('ui',
   hidden('tab','loan-quote')+field('借款本金（元）',amount('loanAmount',Number(ui.loanAmount)||300000))+
   field('还款期数',select('loanMonths',[[3,'3 期 · 每期 30 故事日'],[6,'6 期 · 每期 30 故事日'],[12,'12 期 · 每期 30 故事日']],ui.loanMonths||6,'data-number'))+
   submit('查看完整费用与还款计划')))+section('我的借款')+
   (w.loans.length?w.loans.slice().reverse().map(l=>{
    const remaining=l.totalPayable-l.paid,next=l.installments.find(i=>i.paid<i.amount);
    return card('<div class="u-row"><h3>周转借款 · '+e(l.id)+'</h3>'+pill(remaining<=0?'已还清':'还款中',remaining<=0?'':'warn')+'</div><div class="u-grid">'+stat('未还金额','¥'+m(Math.max(0,remaining)))+stat('剩余本金','¥'+m(l.remainingPrincipal))+'</div>'+
     (next?note('下一期 '+at(next.dueAt)+' · 未还 ¥'+m(next.amount-next.paid)):'')+
     (remaining>0?form('wallet.loan.repay',hidden('loanId',l.id)+field('扣款账户',select('accountId',accountOptions,'bank'))+field('本次还款（元）',amount('amount',next?next.amount-next.paid:remaining,'max="'+(remaining/100).toFixed(2)+'"'))+submit('确认还款')):''));
   }).join(''):empty('尚未借款。先看方案，不会自动产生债务。'));
 }
 function investments(){
  const w=state.wallet;
  return '<div class="u-hero"><div class="u-hero-brand"><span>慢慢存 · SAVINGS</span>'+h.icon('star')+'</div><p class="u-label">持有本金</p><div class="u-hero-amount"><small>¥</small>'+m(w.investments.filter(i=>i.status!=='redeemed').reduce((n,i)=>n+i.principal,0))+'</div><div class="u-hero-footer"><span>按故事时间模拟</span><strong>由你明确结算</strong></div></div>'+
   w.investmentProducts.map(p=>card('<div class="u-row"><div><p class="u-kicker">DEMO SAVINGS</p><h3>'+e(p.name)+'</h3></div>'+pill('虚构产品')+'</div><div class="u-grid">'+stat('演示年化率',(p.annualRateBps/100).toFixed(2)+'%')+stat('结算方式','主动结算')+'</div>'+note(p.description)+'<div class="u-rule"></div>'+form('wallet.invest.buy',hidden('productId',p.id)+field('付款账户',select('accountId',accountOptions,'bank'))+field('申购金额（元）',amount('amount',100000))+submit('确认申购')))).join('')+
   section('我的持仓')+(w.investments.length?w.investments.slice().reverse().map(i=>card('<div class="u-row"><h3>'+e(w.investmentProducts.find(p=>p.id===i.productId)?.name??i.productId)+'</h3>'+pill(i.status==='redeemed'?'已赎回':'持有中')+'</div><div class="u-grid">'+stat('本金','¥'+m(i.principal))+stat('已结算收益','+ ¥'+m(i.accrued))+'</div>'+note('申购 '+at(i.createdAt)+' · 上次结算 '+at(i.settledAt))+(i.status!=='redeemed'?'<div class="u-buttons">'+b('模拟结算收益','wallet.invest.settle',{investmentId:i.id},'u-secondary')+b('赎回至银行卡','wallet.invest.redeem',{investmentId:i.id,accountId:'bank'},'u-primary')+'</div>'+note('赎回金额为本金与已结算收益；未结算部分不会自动补入。'):''))).join(''):empty('还没有持仓。申购后会在这里保留记录。','star'));
 }
 function wallet(){
  const current=ui.tab?.startsWith('loan')?'loan':ui.tab||'overview';
  return heading('CHENGGUANG FINANCE','钱包','让每一笔生活，都有来处。')+tabs([['overview','账户'],['card','信用'],['loan','借款'],['invest','理财'],['ledger','账单']],current)+
    (current==='overview'?walletHome():current==='card'?credit():current==='loan'?loan():current==='invest'?investments():current==='transfer'?transfer():current==='ledger'?ledgerList(state.wallet.ledger.slice()):walletHome());
 }
 function productCard(p,app){
  return '<article class="u-product">'+productArt(p)+'<div class="u-product-copy">'+b(p.name,'nav',nav(app,'product',p.id),'u-product-link')+'<p>'+e(p.tags?.join(' · ')||p.description)+'</p><div class="u-row"><span class="u-price"><small>¥</small>'+m(p.price)+'</span>'+b('加入','cart.add',{productId:p.id,qty:1})+'</div></div></article>';
 }
 function commerce(){
  const app=ui.app,isFood=app==='food',kind=isFood?'food':'shop',items=products.filter(p=>isFood?p.kind==='food':p.kind!=='food');
  const cartItems=state.commerce.cart.filter(r=>items.some(p=>p.id===r.productId));
  const orderRows=state.commerce.orders.filter(o=>o.kind===kind);
  const title=isFood?'这一餐，慢慢吃':'把喜欢带回家';
  const current=ui.tab||(items.some(p=>p.id===ui.detail)?'product':'browse');
  let content='';
  if(current==='product'){
   const p=productBy(ui.detail);
   content=p?card('<div class="u-product-large">'+productArt(p)+'<div class="u-row"><h3>'+e(p.name)+'</h3>'+pill(p.kind==='digital'?'数字内容':isFood?'现点现做':'生活好物')+'</div><p class="u-note">'+e(p.description)+'</p><div class="u-row" style="margin:18px 0"><span class="u-price">¥'+m(p.price)+'</span><span class="u-subtle">库存 '+e(p.stock)+'</span></div>'+form('cart.add',hidden('productId',p.id)+field('数量','<input type="number" name="qty" min="1" max="'+e(p.stock)+'" value="1" required>')+submit('加入'+(isFood?'餐袋':'购物车')))+b('返回逛逛','nav',nav(app,'browse'),'u-text')+'</div>'):empty('没有找到这件商品。','shop');
  }else if(current==='cart'){
   const subtotal=cartItems.reduce((n,r)=>n+productBy(r.productId).price*r.qty,0),fee=isFood?500:600;
   content=cartItems.length?card(cartItems.map(r=>{const p=productBy(r.productId);return '<div class="u-cart-line">'+productArt(p)+'<div><h4>'+e(p.name)+'</h4><p class="u-subtle">¥'+m(p.price)+' × '+r.qty+'</p>'+b('移除','cart.remove',{productId:p.id},'u-text')+'</div><strong>¥'+m(p.price*r.qty)+'</strong></div>';}).join('')+
    '<div class="u-rule"></div><div class="u-row u-subtle"><span>商品小计</span><span>¥'+m(subtotal)+'</span></div><div class="u-row u-subtle"><span>配送费</span><span>¥'+m(fee)+'</span></div><div class="u-cart-total"><strong>合计</strong><span class="u-price">¥'+m(subtotal+fee)+'</span></div>'+
    form('order.checkout',hidden('kind',kind)+field('送到这里',select('placeId',places.map(p=>[p.id,p.name]),state.map.position))+
     field('付款方式',select('payment',[['balance','余额付款'],['credit','信用卡 · 可用 ¥'+m(state.wallet.card.limit-state.wallet.card.used)]],'balance'))+
     field('余额付款账户',select('accountId',accountOptions,'balance'))+
     field(isFood?'餐品备注':'给商家的留言','<textarea name="note" placeholder="'+(isFood?'比如少糖、不要香菜……':'可填写礼物留言或配送说明')+'"></textarea>')+
     submit('确认付款 ¥'+m(subtotal+fee)))+note('演示结算。付款后建立订单并扣库存；送达并领取后才进入持有物。')):empty('这里还空着。先挑一点喜欢的。',isFood?'food':'shop');
  }else if(current==='orders'){
   content=orderRows.length?orderRows.slice().map(o=>card('<div class="u-row"><span class="u-subtle">'+e(o.id)+' · '+at(o.createdAt)+'</span>'+pill(orderStatus(o.status))+'</div><div class="u-rule"></div>'+o.items.map(i=>'<div class="u-row" style="margin:8px 0"><span class="u-item-title">'+e(i.name)+' × '+i.qty+'</span><span class="u-subtle">¥'+m(i.price*i.qty)+'</span></div>').join('')+'<div class="u-row" style="margin-top:15px"><strong>实付 ¥'+m(o.total)+'</strong>'+b('查看订单','nav',nav(app,'order',o.id))+'</div>')).join(''):empty('还没有订单。确认付款后，就可以在这里追踪。',isFood?'food':'shop');
  }else if(current==='order'){
   const o=orderRows.find(o=>o.id===ui.detail);content=o?orderDetail(o,app):empty('这笔订单没有收录。','shop');
  }else if(current==='bag'){
   const held=state.inventory.filter(i=>isFood?i.kind==='food':i.kind!=='food');
   content=held.length?held.map(i=>card('<div class="u-row"><div><h3>'+e(i.name)+'</h3><p class="u-item-sub">'+e(locationName(i.placeId))+' · 剩余 '+i.qty+' 份</p></div>'+pill(i.qty>0?'已领取':'已用完')+'</div>'+(i.kind==='food'&&i.qty>0?'<div class="u-buttons">'+b('吃一份','inventory.consume',{itemId:i.id},'u-primary')+b('前往这里','nav',nav('map','',i.placeId),'u-secondary')+'</div>':'')+note('只有本人到达存放地点且已领取的食物才能食用。'))).join(''):empty(isFood?'餐品送达并领取后会放在这里。':'收到的物品会放在对应地点。',isFood?'food':'shop');
  }else{
   const q=String(ui.query||'').trim().toLowerCase(),visible=items.filter(p=>!q||(p.name+' '+p.description+' '+p.tags.join(' ')).toLowerCase().includes(q));
   content='<div class="u-commerce-banner '+(isFood?'food':'')+'"><div><p class="u-kicker">'+(isFood?'DINNER, DELIVERED':'LITTLE THINGS / BIG DAYS')+'</p><h3>'+(isFood?'日落之前<br>好好吃饭':'新日常<br>刚刚上架')+'</h3><p>'+(isFood?'咖啡、热餐和水果<br>给今天留一点温度。':'一点柔软，一点喜欢<br>让平凡的日子发光。')+'</p></div>'+h.art(isFood?'meal':'coat')+'</div>'+
    '<form class="u-search" data-action="ui"><input type="search" name="query" value="'+e(ui.query||'')+'" placeholder="'+(isFood?'想吃点什么？':'搜索喜欢的物件')+'"><button type="submit" aria-label="搜索">'+h.icon('search')+'</button></form>'+
    section(isFood?'附近好味道':'为你挑选',pill(isFood?'配送 ¥5.00':'配送 ¥6.00'))+
    (visible.length?'<div class="u-grid u-products">'+visible.map(p=>productCard(p,app)).join('')+'</div>':empty('没有找到匹配的内容。','search'));
  }
  return heading(isFood?'SUNSET DELIVERY':'EVERYDAY SELECT',title,isFood?'当前收货位置 · '+locationName(state.map.position):'小小的物件，长长的陪伴。')+
   tabs([['browse',isFood?'点餐':'逛逛'],['cart',(isFood?'餐袋':'购物车')+(cartItems.length?' '+cartItems.reduce((n,r)=>n+r.qty,0):'')],['orders','订单'],['bag',isFood?'已领取':'持有物']],['product','order'].includes(current)?(current==='order'?'orders':'browse'):current)+content;
 }
 function orderStatus(status){return ({paid:'已付款',preparing:'制作中',shipped:'已发货',delivering:'配送中',delivered:'已送达',completed:'已领取',cancelled:'已取消',refunded:'已退款'})[status]??status;}
 function orderDetail(o,app){
  const steps=o.kind==='food'?['已付款','制作中','配送中','已送达']:['已付款','已发货','已送达','已领取'];
  const orderStates=o.kind==='food'?['paid','preparing','delivering','delivered']:['paid','shipped','delivered','completed'];
  const index=o.status==='completed'?3:orderStates.indexOf(o.status);
  return card('<div class="u-order-state">'+h.icon(o.status==='completed'?'check':'shop')+'<div><h3>'+e(orderStatus(o.status))+'</h3><p>'+e(o.id)+'</p></div></div>'+
   (index>=0?'<div class="u-order-steps">'+steps.map((s,i)=>'<div class="u-order-step '+(i<=index?'done':'')+'">'+e(s)+'</div>').join('')+'</div>':'')+
   '<div class="u-location-row">'+h.icon('location')+'<div><h4>'+e(locationName(o.placeId))+'</h4><p class="u-subtle">'+e(o.note||'没有额外留言')+'</p></div></div><div class="u-rule"></div>'+
   o.items.map(i=>'<div class="u-row" style="margin:9px 0"><span>'+e(i.name)+' × '+i.qty+'</span><span class="u-subtle">¥'+m(i.price*i.qty)+'</span></div>').join('')+
   '<div class="u-rule"></div><div class="u-row"><span class="u-subtle">支付方式</span><strong>'+e(o.payment==='credit'?'澄光信用卡':accounts.find(a=>a.id===o.accountId)?.name??'余额')+'</strong></div>'+
   '<div class="u-row" style="margin-top:10px"><span class="u-subtle">含配送费 ¥'+m(o.deliveryFee)+'</span><span class="u-price">¥'+m(o.total)+'</span></div>'+note('下单 '+at(o.createdAt))+
   '<div class="u-buttons">'+(['paid','preparing','shipped','delivering'].includes(o.status)?b('模拟推进配送','order.advance',{orderId:o.id},'u-primary'):'')+
   (o.status==='delivered'?b('确认领取','order.collect',{orderId:o.id},'u-primary'):'')+
   (['paid','preparing'].includes(o.status)?b('取消并退款','order.cancel',{orderId:o.id},'u-danger'):'')+
   (['delivered','completed'].includes(o.status)?b('模拟退货退款','order.refund',{orderId:o.id},'u-danger'):'')+'</div>'+
   (o.status==='delivered'?note('领取前请先到达配送地址；地图浏览不会改变当前位置。'):'')+
   (['paid','preparing','shipped','delivering'].includes(o.status)?note('配送推进为明确点击的离线演示，不代表真实物流。'):'')+
   (o.refunded?note('已原路退回 ¥'+m(o.refunded)+'。信用支付先冲减债务，超出部分记作溢缴款。'):'')+
   '<div class="u-buttons">'+b('查看收货地点','nav',nav('map','',o.placeId),'u-secondary')+b('返回订单','nav',nav(app,'orders'),'u-secondary')+'</div>');
 }
 function mapView(){
  const mp=state.map,current=place(mp.position),selected=place(ui.detail)||current,mode=ui.travelMode||'walk';
  let route=null;try{if(selected&&selected.id!==mp.position&&!mp.journey)route=quoteJourney(state,selected.id,mode);}catch{}
  const x=p=>Math.max(8,Math.min(92,Number(p?.x)||50)),y=p=>Math.max(15,Math.min(88,Number(p?.y)||50));
  const routeLine=current&&selected&&current.id!==selected.id?'<path d="M '+(x(current)*3.6)+' '+(y(current)*3.2)+' L '+(x(selected)*3.6)+' '+(y(current)*3.2)+' L '+(x(selected)*3.6)+' '+(y(selected)*3.2)+'" fill="none" stroke="#4c8f76" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 8"/>':'';
  const map='<div class="u-map"><svg viewBox="0 0 360 320" role="img" aria-label="故事城区示意地图"><rect width="360" height="320" fill="#edf1e8"/><path d="M 243 -20 C 201 70 299 99 263 176 C 220 254 279 273 254 350" fill="none" stroke="#cce3e4" stroke-width="48"/><g fill="#dae4d6"><rect x="15" y="54" width="71" height="54" rx="12"/><rect x="111" y="59" width="78" height="45" rx="12"/><rect x="18" y="152" width="65" height="65" rx="12"/><rect x="107" y="154" width="76" height="61" rx="13"/><rect x="25" y="258" width="158" height="42" rx="12"/><rect x="293" y="54" width="57" height="58" rx="12"/><rect x="299" y="160" width="50" height="89" rx="12"/></g><g fill="none" stroke="#fffdf5" stroke-width="15"><path d="M 0 132 H 360 M 0 236 H 360 M 97 0 V 320 M 204 0 V 320 M 286 0 V 320"/></g><g stroke="#e7e6dd" stroke-width="1"><path d="M 0 132 H 360 M 0 236 H 360 M 97 0 V 320 M 204 0 V 320"/></g><ellipse cx="146" cy="186" rx="28" ry="18" fill="#bed7bd"/><g fill="#bed3b9"><circle cx="44" cy="77" r="11"/><circle cx="62" cy="89" r="8"/><circle cx="323" cy="194" r="14"/></g>'+routeLine+'</svg><span class="u-map-caption">澄川 · 生活地图</span><span class="u-map-legend">故事地图示意</span>'+
   places.map(p=>'<div class="u-map-pin '+(p.id===selected?.id?'selected ':'')+(p.id===mp.position?'current':'')+'" style="left:'+x(p)+'%;top:'+y(p)+'%">'+ib(p.kind==='home'?'home':p.kind==='food'?'food':'location',p.name,'ui',{detail:p.id})+'</div>').join('')+'</div>';
  const journey=mp.journey?'<div class="u-journey"><p class="u-kicker">ON THE WAY</p><h3>'+e(locationName(mp.journey.from))+' → '+e(locationName(mp.journey.to))+'</h3><p class="u-note">路程 '+mp.journey.duration+' 分钟 · 预计 '+at(mp.journey.arriveAt)+'</p><div class="u-buttons">'+b('抵达目的地','map.arrive',{},'u-primary')+'</div>'+note('确认抵达会推进相应故事时间，并改变当前位置。')+'</div>':'';
  const selection=selected?card('<div class="u-row"><div><h3>'+e(selected.name)+'</h3><p class="u-item-sub">'+e(selected.description)+'</p></div>'+pill(selected.id===mp.position?'当前位置':'目的地')+'</div>'+
   (selected.id!==mp.position&&!mp.journey?'<div class="u-mode-row">'+[['walk','步行'],['bike','骑行'],['transit','公交']].map(([id,label])=>b(label,'ui',{travelMode:id},mode===id?'active':'')).join('')+'</div>'+
    (route?'<div class="u-row"><span class="u-subtle">预计路程 '+route.duration+' 分钟</span><span class="u-subtle">抵达 '+at(route.arriveAt)+'</span></div>':'')+
    '<div class="u-buttons">'+b('确认出发','map.depart',{placeId:selected.id,mode},'u-primary')+'</div>'+note('选择地点和查看路线不会移动角色；确认出发才建立行程。'):'')+
   (selected.id==='cafe'?b('看看咖啡与餐点','nav',nav('food'),'u-text'):selected.id==='store'?b('逛逛店里的好物','nav',nav('shop'),'u-text'):'')):'';
  return heading('CHENGCHUAN / CITY GUIDE','出去走走','此刻的位置 · '+locationName(mp.position))+map+journey+selection+
   section('熟悉的地方')+places.map(p=>'<div class="u-place"><span class="u-mini-icon">'+h.icon(p.id==='home'?'home':p.id==='cafe'?'food':p.id==='store'?'shop':'location')+'</span><div class="u-list-copy"><p class="u-item-title">'+e(p.name)+'</p><p class="u-item-sub">'+e(p.description)+'</p></div>'+b('查看','ui',{detail:p.id})+'</div>').join('');
 }
 function calendar(){
  const c=state.clock,count=new Date(Date.UTC(c.year,c.month,0)).getUTCDate(),day=Math.max(1,Math.min(count,Number(ui.calendarDay)||c.day)),offset=(new Date(Date.UTC(c.year,c.month-1,1)).getUTCDay()+6)%7;
  const events=state.calendar.events.filter(ev=>{const date=storyDate(ev.at);return date.getUTCFullYear()===c.year&&date.getUTCMonth()===c.month-1;});
  const rows=events.filter(v=>v.day===day).sort((a,b)=>a.minute-b.minute);
  let month='<section class="u-month"><div class="u-month-head"><div><h3>'+c.year+' 年 '+c.month+' 月</h3><span class="u-subtle">MAKE ROOM FOR GOOD DAYS</span></div>'+b('今天','ui',{calendarDay:c.day},'u-text')+'</div><div class="u-week">'+['一','二','三','四','五','六','日'].map(s=>'<span>'+s+'</span>').join('')+'</div><div class="u-dates">'+Array.from({length:offset},()=>'<span></span>').join('');
  for(let d=1;d<=count;d++)month+=b(String(d),'ui',{calendarDay:d},'u-date '+(d===c.day?'today ':'')+(d===day?'selected ':'')+(events.some(x=>x.day===d&&x.status!=='cancelled')?'has-event':''));
  month+='</div></section>';
  const agenda=rows.length?rows.map(ev=>'<div class="u-agenda"><span class="u-agenda-time">'+hh(ev.minute)+'</span><article class="u-agenda-card '+e(ev.status)+'"><div class="u-row"><h3>'+e(ev.title)+'</h3>'+pill({personal:'我的安排',invited:'待对方确认',confirmed:'已确认',cancelled:'已取消'}[ev.status]??ev.status,ev.status==='invited'?'warn':'')+'</div><p class="u-item-sub">'+e(locationName(ev.placeId))+(ev.participantId?' · 与 '+e(state.social.accounts.find(a=>a.id===ev.participantId)?.name??ev.participantId):'')+'</p><div class="u-buttons">'+(ev.status==='invited'?b('模拟对方确认','calendar.confirm',{eventId:ev.id},'u-secondary'):'')+(ev.status!=='cancelled'?b('查看地点','nav',nav('map','',ev.placeId),'u-secondary')+b('取消安排','calendar.cancel',{eventId:ev.id},'u-text'):'')+'</div></article></div>').join(''):empty('这一天还留着空白，写下一件想做的事吧。','calendar');
  const add=card('<div class="u-row"><h3>添一件小事</h3>'+pill(c.month+'月'+day+'日')+'</div><div class="u-rule"></div>'+form('calendar.add',
   field('安排名称','<input name="title" maxlength="80" placeholder="例如：和余舟喝一杯咖啡" required>')+
   '<div class="u-form-row">'+field('日期','<input type="number" name="day" min="1" max="'+count+'" value="'+day+'" required>')+field('时间','<input type="time" name="minute" data-minutes value="'+hh(c.minute)+'" required>')+'</div>'+
   field('地点',select('placeId',places.map(p=>[p.id,p.name]),'cafe'))+
   field('一起的人',select('participantId',[['','仅自己'],['yu','余舟 · 发出邀请']],''))+submit('保存安排'))+note('邀请先显示待确认。模拟对方确认是单独操作，不会替对方自动答应。'));
  return heading('LITTLE PLANS','把日子记下来','故事时间 · '+c.month+'月'+c.day+'日 '+hh(c.minute))+month+section(c.month+'月'+day+'日的安排',pill(rows.filter(r=>r.status!=='cancelled').length+' 项'))+agenda+section('新的安排')+add;
 }
 return '<div class="life-utility" data-utility-app="'+e(ui.app)+'">'+(ui.app==='wallet'?wallet():ui.app==='shop'||ui.app==='food'?commerce():ui.app==='map'?mapView():calendar())+'</div>';
}
