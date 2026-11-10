# 生活手机独立交互预览 · 协作接口

本轮授权：用户“👌🏻你做”，并追加银行／支付宝式钱包，含轻度理财、贷款、信用卡超前消费。仅本目录独立交互预览；正式插件、既有phone与用户运行数据不改。示例为明确标识的离线演示世界。视觉待用户查看，非宿主已安装版。

窗口：原13:26 UTC起点，硬14:45；14:18首版、14:22收敛、14:25开始持久保存。时钟不重置。

## 文件归属

- phone_review：core.mjs / core.test.mjs / DATA-CONTRACT.md。
- validation_audit：utility-views.mjs / utility.css。
- checkpoint_prep：social.mjs / social.css / social.test.mjs。
- root：app.mjs / app.css / index.html / build.mjs / assets.mjs / 浏览器与整体验证 / 保存。

## 数据结构（内部预览契约，不是正式MVU键迁移）

`core.mjs` exports `createDemoState()`, `reduce(state,action) => {state,result}`, `money(cents)`, `validateState(state)`。
`social.mjs` exports `renderSocial(state,ui,h) => string|null`, `reduceSocial(state,action) => {state,result}`。
`utility-views.mjs` exports `renderUtility(state,ui,h) => string|null`。

失败抛有中文message的Error，原对象不变。root只在新状态持久保存成功后替换当前state。每动作有root给的唯一 `action.id`；幂等记入 `state.applied` 字符串数组，成功递增 `revision`。两reducer各自处理其前缀，不调用另一模块。需要共同更新的钱/订单/持有在同一reduce中原子生成候选；预览单存储写入，不声称宿主跨系统事务已实现。

根结构采用A/B/C已经对齐的分区：`clock / wallet / commerce / inventory / map / calendar / audit / receipts`；C的 `socialSeed()` 返回 `{social,media}`，root仅首次演示初始化合并。完整字段和动作以同目录DATA-CONTRACT.md及social.mjs实际导出为准，UI视图不得另外创建状态。每个动作传root分配的action.id，重复操作只返回原回执。

A/B已对齐动作：wallet.transfer、credit.repay、loan.quote/accept/repay、invest.subscribe/redeem/settle、cart.add/remove、order.pay/advance/claim/cancel/refund、inventory.eat、map.depart/arrive、calendar.add/invite/respond、clock.advance。钱包单位为分；金融参数为显式演示设定，先展示报价再确认。社交动作由C定义并告知root。

## UI路由与通用交互

`ui={app:'home'|'wallet'|'shop'|'food'|'map'|'calendar'|'weibo'|'album'|'music'|'inbox'|'settings',tab:'',detail:'',query:'', ...}`；视图不修改它。

helpers：
- `h.esc(value)` HTML文本/属性转义。
- `h.money(cents)`。
- `h.btn(label,type,payload={},className='')` 生成button；`type='nav'` payload `{app,tab?,detail?}` 为UI导航，`type='ui'` 为patch ui；其余业务action交给reducer。
- `h.icon(name)` 内联原创线条SVG；支持 home,wallet,shop,food,map,calendar,weibo,album,music,back,search,plus,close,heart,comment,share,bell,arrow,check,user,play,pause,more,card,send,location,clock,star。
- `h.tabs(items,current)` items `[{id,label}]`生成type ui patch tab按钮。
- `h.avatar(account)` 小头像字母/名字图形；非图片头像不伪装照片。
- `h.mediaUrl(id)` 真资源url或空字符串。
- `h.art(kind)` 原创SVG插画字符串（封面、商品、咖啡等），kind从 `coat,coffee,meal,album,city,night,photo` 中选。

表单：`<form data-action="wallet.transfer">`；字段用标准name。root提交时收集FormData，同名checkbox以实际checked为准，type=number转Number；带 `data-cents` 的输入按十进制元字符串严格转分；`<input type="hidden" name="...">`可传稳定ID。`data-payload='JSON'`可放在form或button，h.btn自动安全编码。表单按钮标准submit；其他按钮须type=button。成功后root通知result.message并重绘；返回对象其他字段 `{navigate:{...}}` 可引导到订单详情等。不要用全局alert/prompt代替产品界面。

常用样式root提供：`.card,.section-title,.muted,.row,.between,.stack,.grid-2,.grid-3,.chip,.primary,.secondary,.danger,.field,.empty,.pill,.amount,.hero-card,.list-item,.avatar,.tabs,.app-heading,.small,.media-cover,.form-grid,.full-width`。视图专属CSS加前缀如wallet-/shop-/social-；所有input与按钮适合移动端。无外部字体/CDN依赖；原手机当前预览已用系统字体，新原创SVG在本目录候选资源登记。

## 业务动作与文件媒体

业务动作与字段以DATA-CONTRACT及各reducer实际导出为准；前述共用UI契约保持。root发送动作时保证一次操作只有一个稳定id。

真实文件导入、播放器控制、导出/导入存档由root UI actions `file.image` / `file.audio` / `player.play {songId}` / `player.pause` / `backup.export` / `backup.import`，纯reducer不假装已保存媒体文件。h.mediaUrl(id)返回经实际资源存储取回的URL或空；C将给root媒体元数据和歌曲shape。

## 预览实际能力边界

演示世界可有明确的“推进剧情／演示下一轮”控件，生成本地预先定义的结果应标为模拟，不假装真实模型或宿主联调。不写入正式聊天，无自动外部调用。不会自动重置损坏档案；首次初始化、存储失败、媒体缺失都显示清楚。真实音频只通过实际导入文件播放，无音源不跑假进度。公开帖子可以明确分享私人媒体，此为新事件；未分享前不自动进入公域。
