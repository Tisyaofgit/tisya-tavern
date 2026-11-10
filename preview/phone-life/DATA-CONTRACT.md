# 离线生活手机状态契约

本目录是虚构演示世界；金额均为整数分，无真实金融产品、模型调用或定位。纯状态核不访问 DOM、存储或当前系统时间。

## 根状态与视图字段

`schema:1, revision:0, seq:100, applied:[], receipts:{}, audit:[]`。社交由 root 合并 `socialSeed()`；核心保留额外分区。

- `clock:{year,month,day,minute,totalMinutes}`：固定故事起点 2026-11-09 18:00；minute 是当日分钟，totalMinutes 是自起点经过的故事分钟。
- `wallet.accounts:[{id,name,balance}]`：ID `balance`（零钱）、`bank`（银行卡），balance 为可用整数分。
- `wallet.card:{id,name,limit,used,refundBalance,billDay,dueDay,charges:[],statements:[]}`：额度/占用/溢缴款分开；used 是债务，refundBalance 是资产。账单日20日、还款日28日。
- 账单 `statements:[{id,statementAt,dueAt,total,remaining,status}]`，total 是原始上账债额，remaining 为当前未还；status 为 unbilled/billed/overdue/paid。到期不自动扣款，不虚构罚息。
- `wallet.loans:[{id,amount,months,apr,totalInterest,totalPayable,remainingPrincipal,paid,status,installments:[{number,principal,interest,amount,paid,dueAt}]}]`。
- `wallet.investmentProducts:[{id,name,apr,annualRateBps,description}]`，唯一演示产品 ID `steady`，年化模拟率1.8%，不自动结算。
- `wallet.investments:[{id,productId,principal,accrued,createdAt,settledAt,status}]`。
- `wallet.ledger:[{id,at,type,description,amount,accountId,orderId?,loanId?}]`。金额显示方向由正负区分。
- `wallet.external` 为账外对手方累计资金，`wallet.initialNet` 为守恒校验起点；视图无需展示这两个核验字段。
- `commerce.products:[{id,name,description,price,stock,kind,shopId,placeId,image,tags}]`。kind 为 physical/food/digital。
- `commerce.cart:[{productId,qty}]`，`commerce.orders:[{id,kind,items:[{productId,name,qty,price,kind}],subtotal,deliveryFee,total,payment,accountId,placeId,note,status,createdAt,updatedAt,refunded,creditChargeId?}]`。
- `inventory:[{id,productId,name,kind,qty,ownerId,holderId,storage:'carried',placeId,orderId,consumed}]`。已领取的随身物品随角色抵达移动；尚未领取订单的配送地点不随角色移动。
- `map:{position:'home',journey:null,places:[{id,name,description,x,y,kind,known:true}]}`。地点 ID home/cafe/park/store；journey `{from,to,mode,duration,departAt,arriveAt}`，mode walk/bike/transit。
- `calendar.events:[{id,title,day,minute,placeId,participantId,status,at,notified}]`。status personal/invited/confirmed/cancelled；participantId 为 `yu` 时发邀请，不自动确认。

产品 ID：coat/book/headphones 属商城；coffee/meal/fruit 属外卖，所有 seed 都可直接从数组遍历。没有单独的 flat wallet.balance、products、orders 或 world 字段。

## 动作（全部必须有唯一字符串 id）

- `wallet.transfer {amount,to,from?}`：from 默认 balance；to 为 bank/balance 或 yu。自己账户互转保留总钱；yu 为演示转账对手，扣款留流水。
- `wallet.card.repay {amount,accountId?}`：默认 bank；不得超过实际债务，不自动借款。
- `quoteLoan(amount,months)` 导出纯报价：`{quoteId,amount,months,apr,totalInterest,totalPayable,monthlyPayment,installments}`。months 为3/6/12，年利率12%，无额外手续费，等额本金，每期30故事日。首期额为 monthlyPayment，后续逐期减少，完整 installments 各期金额可见。
- `wallet.loan.borrow {amount,months,quoteId,accountId?}`：必须提交与已展示报价相同的 quoteId，默认放到 bank。
- `wallet.loan.repay {loanId,amount,accountId?}`：默认 bank；按最早未清分期顺序还，可部分还；各期先息后本；不能超出全部未还款。
- `wallet.invest.buy {amount,productId,accountId?}`：产品 steady，默认 bank。
- `wallet.invest.settle {investmentId}`：明确点击的模拟结算；按本金×1.8%×故事分钟/365日向下取整到分，累计后取差，不因重复结算增益。
- `wallet.invest.redeem {investmentId,accountId?}`：默认 bank，一次赎回本金及已经明确结算收益；未结算收益不会自动补入。
- `cart.add {productId,qty?}` / `cart.remove {productId}`。
- `order.checkout {kind:'shop'|'food',payment:'balance'|'credit',accountId?,placeId,note?}`：余额默认 balance，shop 配送600分、food配送500分；按本类购物车一次结算。付款扣库存但不进入背包。
- `order.advance {orderId}`：明确模拟下一阶段，不调用真实物流。商城 paid→shipped→delivered；外卖 paid→preparing→delivering→delivered；不自动推动故事时钟。
- `order.collect {orderId}`：仅 delivered；本人须到达配送地址且不在旅途中，收货进入当地持有物。
- `order.cancel {orderId}`：仅 paid/preparing 可取消，原路全退并恢复库存。
- `order.refund {orderId}`：仅 delivered/completed；明确模拟批准全额退款。已领商品必须全部仍存在且未消费才可退货；退款回库存。原信用卡债务先冲减，超过剩余债务的部分转卡内溢缴款，不凭空变现金。
- `inventory.consume {itemId}`：只有本人已经领取、在同一地点且拥有的 food 可吃，每次1份。
- `map.depart {placeId,mode}` / `map.arrive {}`：出发建立行程，抵达按钮明确推进到预计抵达故事时间再改变位置；无自动GPS。
- `quoteJourney(state,placeId,mode)` 导出同源只读路线报价 `{from,to,mode,duration,departAt,arriveAt}`，视图不自行复制路程算法。
- `calendar.add {title,day,minute,placeId,participantId?}`：日期按当前故事月；仅本人为 personal，有参与者为 invited。
- `calendar.confirm {eventId}`：明确演示参与者确认；只有 invited 可以变 confirmed。
- `calendar.cancel {eventId}`。
- `world.advance {minutes}`：推进故事时钟，评估账期/逾期/日历到期，不自动支付、不自动生收益、不自动接受邀请。

reduce 返回 `{state,result:{message,...}}`。成功记录 receipts[id] 的动作指纹与结果；重复同动作返回原回执，不再次执行；同 id 改参数拒绝。失败抛中文错误，原状态原封不动；root 负责保留错误及持久化成功后交换状态。未知社交动作由 root 分派，不由核心吞掉。

## 金额与回滚

资金恒等式：现金账户+未赎回理财+信用卡溢缴款−信用卡债务−贷款未还本金+账外对手方资金=初始净额。支付/退款/还款均在单次 reduce 候选内完成并校验。借贷利息作为对手方收入记账；报价中的未来利息不冒充已到账余额。预览导出包含整个唯一状态；正式宿主的原生分支回滚没有在此离线预览冒充实现。
