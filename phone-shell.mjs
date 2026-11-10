// Pure phone shell. bodyHtml is trusted HTML produced by the local social renderers.
// All user- and model-controlled text/attributes are escaped at this boundary.
const phoneEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phoneNumber = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const phoneKind = Object.freeze({
  forum:['小组','forum','leaf'], weibo:['微博','weibo','coral'], artist:['艺人','artist','lavender'],
  notice:['公告','notice','stone'], news:['新闻','news','paper'], trends:['热搜','search','amber'],
  fanclub:['后援会','heart','rose'], live:['直播','live','teal'], video:['视频','video','blue'],
  music:['音乐','music','plum'], schedule:['日程','calendar','sage'], ticket:['票夹','ticket','sand'],
  group:['群聊','chat','green'], bubble:['泡泡','bubble','sky'], dm:['私信','mail','mint'],
  inbox:['通知','bell','silver'], timeline:['时间线','timeline','wheat']
});
const phoneKindInfo = kind => Object.hasOwn(phoneKind,kind) ? phoneKind[kind] : undefined;
const phonePaths = Object.freeze({
  home:'<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  back:'<path d="m14 5-7 7 7 7"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  settings:'<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  forum:'<path d="M4 4h16v12H9l-5 4Z"/><path d="M8 8h8M8 12h5"/>',
  weibo:'<path d="M18 9c3 1 3 6 0 8-4 3-12 3-14-1-2-3 1-6 4-9 1-1 2 0 2 2 5-3 8-2 7 1"/><ellipse cx="11" cy="14" rx="4" ry="2.5"/><path d="M17 3c3 0 5 2 5 5m-5-2c1 0 2 1 2 2"/>',
  artist:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  notice:'<path d="M6 3h12v18H6Z"/><path d="M9 7h6M9 11h6M9 15h3"/><circle cx="15" cy="17" r="2"/>',
  news:'<path d="M5 4h16v15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8h2Z"/><path d="M5 8v11m4-11h8M9 12h3m-3 4h3m4-4h2m-2 4h2"/>',
  heart:'<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
  live:'<rect x="6" y="6" width="12" height="12" rx="4"/><circle cx="12" cy="12" r="2"/><path d="M3 6a12 12 0 0 0 0 12m18-12a12 12 0 0 1 0 12"/>',
  video:'<rect x="3" y="5" width="18" height="14" rx="4"/><path d="m10 9 6 3-6 3Z"/>',
  music:'<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18M7 14h3m4 0h3m-10 3h3"/>',
  ticket:'<path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4Z"/><path d="M15 6v2m0 3v2m0 3v2"/>',
  chat:'<path d="M20 11a8 8 0 0 1-8 8H8l-5 3 1.4-6A8 8 0 1 1 20 11Z"/><path d="M7 11h.1M11 11h.1M15 11h.1"/>',
  bubble:'<path d="M20 10c0 5-4 8-9 8H9l-5 3 1-6a8 8 0 1 1 15-5Z"/><path d="M8 9c1-2 3-3 5-2"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  bell:'<path d="M5 16h14l-2-3V8a5 5 0 0 0-10 0v5Zm5 3a2 2 0 0 0 4 0"/>',
  timeline:'<path d="M6 3v18m5-15h9m-9 6h6m-6 6h9"/><circle cx="6" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="6" cy="18" r="2"/>',
  send:'<path d="m3 3 18 9-18 9 3-9Z"/><path d="M6 12h15"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  link:'<path d="m10 14 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0) scale(.92)"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  signal:'<path d="M4 18v-3m5 3v-6m5 6V9m5 9V6"/>',
  battery:'<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4M5 10h11v4H5Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  retry:'<path d="M20 7v5h-5M4 17v-5h5M5.5 7A7 7 0 0 1 18 5l2 7M4 12l2 7a7 7 0 0 0 12.5-2"/>',
  pause:'<path d="M8 5v14m8-14v14"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01"/>'
});
function phoneIcon(name, cls='') { return `<svg class="phone-icon ${phoneEscape(cls)}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${phonePaths[name] ?? phonePaths.grid}</svg>`; }
function phoneBadge(count) { const n=phoneNumber(count); return n ? `<span class="phone-badge" aria-label="${n} 条未读">${n>99?'99+':n}</span>` : ''; }
function phoneButton(label, action, icon, cls='') { return `<button type="button" class="phone-icon-button ${phoneEscape(cls)}" ${action} aria-label="${phoneEscape(label)}" title="${phoneEscape(label)}">${phoneIcon(icon)}</button>`; }
function phoneConnection(model) {
  const c=model.connection??{}, mode=c.mode??'disconnected';
  const connected=mode==='next-turn' && !['error','disconnected','unavailable','blocked'].includes(c.status);
  return {mode,connected,label:c.label||(connected?'随下一轮剧情收发':'尚未接入剧情'),status:c.status??(connected?'ready':'disconnected')};
}
function phoneApp(app, detailed=false) {
  const [name,icon,color]=phoneKindInfo(app.kind)??['页面','grid','stone'];
  return `<button type="button" class="phone-app ${detailed?'phone-app-detailed':''}" ${app.empty?`data-phone-empty-kind="${phoneEscape(app.kind)}"`:`data-phone-open="${phoneEscape(app.id)}"`}><span class="phone-app-icon phone-tint-${color}">${phoneIcon(icon)}${phoneBadge(app.unread)}</span><span class="phone-app-copy"><strong>${phoneEscape(detailed?app.title:name)}</strong>${detailed?`<small>${phoneEscape(name)}</small>`:''}</span></button>`;
}
function phoneEmpty(icon,title,detail) { return `<div class="phone-empty">${phoneIcon(icon)}<strong>${phoneEscape(title)}</strong><p>${phoneEscape(detail)}</p></div>`; }
function phoneHome(model) {
  const apps=Array.isArray(model.apps)?model.apps:[], unique=[...Object.keys(phoneKind).map(kind=>apps.find(a=>a.kind===kind)??{kind,empty:true,title:phoneKindInfo(kind)[0]}),...apps.filter((a,i)=>!phoneKindInfo(a.kind)&&apps.findIndex(b=>b.kind===a.kind)===i)];
  const c=phoneConnection(model), pending=(model.outbox??[]).filter(x=>['queued','sent','pending','sending','requesting'].includes(x.status)).length;
  const inbox=apps.find(a=>a.kind==='inbox');
  return `<div class="phone-home">
    <header class="phone-home-heading"><div><p>YOUR SMALL WORLD</p><h1>月潮手机</h1></div><div class="phone-home-heading-actions"><button type="button" class="phone-home-settings" data-phone-nav="settings" aria-label="打开设置">${phoneIcon('settings')}</button><button type="button" class="phone-home-close" data-phone-close aria-label="收起手机">${phoneIcon('close')}</button></div></header>
    <section class="phone-home-widget" aria-label="当前状态"><div class="phone-widget-art" aria-hidden="true"><i></i><i></i><i></i><span>☾</span></div><span class="phone-widget-eyebrow">此刻</span><strong>${phoneEscape(model.homeTime||'故事仍在继续')}</strong><p>${phoneEscape(model.subtitle||'消息、舞台和那些还没说完的话。')}</p><button type="button" class="phone-connection-chip" data-phone-nav="settings"><i class="${c.connected?'is-connected':''}"></i>${phoneEscape(c.label)}${phoneIcon('arrow')}</button></section>
    <button type="button" class="phone-home-search" data-phone-nav="search">${phoneIcon('search')}<span>搜索帖子、消息、公告</span><small>搜索</small></button>
    ${(phoneNumber(model.unread)||pending)?`<div class="phone-glance">${phoneNumber(model.unread)?`<button type="button" ${inbox?`data-phone-open="${phoneEscape(inbox.id)}"`:'data-phone-nav="apps"'}>${phoneIcon('bell')}<span>${phoneNumber(model.unread)} 条未读通知</span>${phoneIcon('arrow')}</button>`:''}${pending?`<button type="button" data-phone-nav="outbox">${phoneIcon('clock')}<span>${pending} 条消息待处理</span>${phoneIcon('arrow')}</button>`:''}</div>`:''}
    <div class="phone-section-title"><h2>我的应用</h2><button type="button" data-phone-nav="apps">全部页面 ${phoneIcon('arrow')}</button></div>
    <div class="phone-app-grid">${unique.map(app=>phoneApp(app)).join('')}</div>
    ${unique.length?'':phoneEmpty('grid','还没有应用内容','接入世界数据后，页面会出现在这里。')}
    <p class="phone-home-footnote">${apps.length} 个页面 · ${unique.length} 类应用</p>
  </div>`;
}
function phoneApps(model) {
  const apps=Array.isArray(model.apps)?model.apps:[];
  const groups=Object.keys(phoneKind);
  const unknown=apps.filter(a=>!phoneKindInfo(a.kind));
  return `<div class="phone-app-library"><p class="phone-section-intro">所有已收录、当前账号可见的页面。</p>${groups.map(kind=>`<section class="phone-app-group" data-phone-kind="${kind}"><h2>${phoneEscape(phoneKindInfo(kind)[0])}<span>${apps.filter(a=>a.kind===kind).length}</span></h2><div>${apps.filter(a=>a.kind===kind).map(a=>phoneApp(a,true)).join('')||'<p class="phone-app-empty">暂无内容</p>'}</div></section>`).join('')}${unknown.map(a=>phoneApp(a,true)).join('')}${apps.length?'':phoneEmpty('grid','没有可见页面','当前存档尚未收录应用内容。')}</div>`;
}
function phoneSearch(model) {
  const results=Array.isArray(model.searchResults)?model.searchResults:[],query=String(model.query??''),scope=model.searchScope==='mine'?'mine':'public';
  return `<div class="phone-search-page"><form class="phone-search-form" data-phone-search><label for="phone-search-query">查找内容</label><div class="phone-search-input">${phoneIcon('search')}<input id="phone-search-query" name="query" type="search" value="${phoneEscape(query)}" placeholder="名字、关键词、某句话……" autocomplete="off" maxlength="300"><button type="submit">搜索</button></div><label class="phone-search-scope" for="phone-search-scope"><span>搜索范围</span><select id="phone-search-scope" name="scope"><option value="public"${scope==='public'?' selected':''}>公开网页</option><option value="mine"${scope==='mine'?' selected':''}>我能看到的全部内容</option></select></label></form><p class="phone-search-note">${scope==='public'?'检索已收录的公开内容。群聊、私信和订阅消息不会混入。':'包含当前账号有权查看的消息。结果不会自动公开给其他角色。'}</p>${query.trim()?`<button type="button" class="phone-search-more" data-phone-search-more ${model.busy?'disabled':''}>随下轮继续查 ${phoneIcon('arrow')}</button><div class="phone-search-heading"><strong>搜索结果</strong><small>${results.length} 条</small></div>${results.length?`<div class="phone-search-results">${results.map(r=>`<button type="button" class="phone-search-result" data-phone-open="${phoneEscape(r.id)}"><span class="phone-result-type">${phoneEscape(phoneKindInfo(r.kind)?.[0]??'页面')}</span><strong>${phoneEscape(r.title||r.id)}</strong><p>${phoneEscape(r.snippet??'')}</p><span class="phone-result-open">查看原文 ${phoneIcon('arrow')}</span></button>`).join('')}</div>`:phoneEmpty('search','没有找到这段内容','换个短一点的关键词，或调整搜索范围。')}`:phoneEmpty('search','想翻哪条消息？','输入关键词，搜索已经收录在这部手机里的内容。')}</div>`;
}
function phoneErrorText(error) { return typeof error==='string'?error:error?.message??''; }
function phoneOutboxEntry(item, compact=false) {
  const status=String(item.status??'pending');
  const labels={queued:'待发送',sent:'等待本轮回复',pending:'待处理',sending:'随剧情发送中',requesting:'等待本轮回复',received:'回复已到',replied:'回复已到',completed:'回复已到',failed:'接收失败',error:'接收失败',cancelled:'已取消',detached:'已离开该分支',interrupted:'已中断'};
  const busy=['queued','sent','pending','sending','requesting'].includes(status),failed=['failed','error','interrupted'].includes(status),retryable=['failed','error','interrupted'].includes(status);
  const error=phoneErrorText(item.error);
  return `<article class="phone-outbox-item ${busy?'is-pending':''} ${failed?'is-failed':''} ${compact?'is-compact':''}"><div class="phone-outbox-heading"><span class="phone-delivery-state">${phoneIcon(failed?'help':busy?'clock':status==='cancelled'?'pause':'check')}${phoneEscape(Object.hasOwn(labels,status)?labels[status]:status)}</span><small>${phoneNumber(item.attempts)?`第 ${phoneNumber(item.attempts)} 次请求`:''}</small></div>${compact?'':item.threadId?`<button type="button" class="phone-outbox-thread" data-phone-open="${phoneEscape(item.threadId)}">${phoneEscape(item.title||item.threadId)} ${phoneIcon('arrow')}</button>`:`<p class="phone-outbox-thread">${phoneEscape(item.title||'搜索请求')}</p>`}${error?`<p class="phone-delivery-error">${phoneEscape(error)}</p>`:''}${retryable||busy?`<div class="phone-outbox-actions">${retryable?`<button type="button" data-phone-retry="${phoneEscape(item.id)}">${phoneIcon('retry')}重新排队</button>`:''}${['queued','pending'].includes(status)?`<button type="button" data-phone-cancel="${phoneEscape(item.id)}">撤回待发</button>`:''}</div>`:''}</article>`;
}
function phoneOutbox(model) {
  const items=Array.isArray(model.outbox)?model.outbox:[];
  return `<div class="phone-outbox-page"><div class="phone-section-intro">待发消息会随下一轮剧情发送。回复到达后会回到原对话，未成功的消息仍会保留。</div>${items.length?items.slice().reverse().map(item=>phoneOutboxEntry(item)).join(''):phoneEmpty('send','还没有发出的消息','打开群聊、私信或论坛，写下你的第一条消息。')}</div>`;
}
function phoneSettings(model) {
  const c=phoneConnection(model);
  return `<div class="phone-settings-page"><section class="phone-setting-card"><div class="phone-setting-heading"><span class="phone-setting-mark">${phoneIcon('link')}</span><div><h2>随剧情收发</h2><p>${phoneEscape(c.label)}</p></div><span class="phone-state-pill ${c.connected?'is-ready':''}">${c.connected?'已接入':'待接入'}</span></div><p class="phone-settings-explain">在手机里发送消息、搜索或回应帖子后，待处理的动作会随下一轮剧情一起送出。新的消息和动态会回到对应的应用。</p><div class="phone-delivery-steps"><span>${phoneIcon('send')}手机操作</span><i>→</i><span>${phoneIcon('clock')}下一轮剧情</span><i>→</i><span>${phoneIcon('bell')}收到更新</span></div><button type="button" class="phone-primary-button phone-connect-button" data-phone-nav="outbox">查看待发消息 ${phoneIcon('arrow')}</button></section>
    <section class="phone-setting-card"><h2>本轮收发</h2><p class="phone-settings-explain">在独立预览中，可以带出待发送内容，并接收这一轮产生的新消息。</p><div class="phone-round-actions"><button type="button" class="phone-primary-button" data-phone-copy-prompt>${phoneIcon('upload')}复制待发送内容</button><button type="button" class="phone-secondary-button" data-phone-sync>${phoneIcon('download')}接收本轮内容</button></div>${model.busy?'<button type="button" class="phone-secondary-button" data-phone-fail-preview>上轮已结束，恢复待发</button>':''}<p class="phone-settings-hint">接收成功后，新内容自动接到已有对话；原来的消息与楼层继续保留。</p></section>
    <section class="phone-setting-card"><h2>进度与存档</h2><p class="phone-settings-explain">导出当前进度，或导入已有存档继续使用。</p><div class="phone-storage-actions"><button type="button" data-phone-export>${phoneIcon('download')}导出进度</button><label class="phone-import-label">${phoneIcon('upload')}导入进度<input type="file" data-phone-import accept="application/json,.json" aria-label="选择要导入的进度文件"></label></div></section>
    <p class="phone-settings-footer">月潮手机 · 缇斯亚网络区块</p></div>`;
}
function phoneDocument(model) { return `<div class="phone-document" data-phone-document>${String(model.bodyHtml??'')}</div>`; }
function phoneComposer(model) {
  const c=phoneConnection(model),items=Array.isArray(model.outbox)?model.outbox:[],current=model.currentId;
  const recent=items.filter(i=>!current||i.threadId===current).filter(i=>!['received','replied','completed'].includes(i.status)).slice(-2);
  return `${recent.length?`<section class="phone-document-delivery" aria-label="回复状态">${recent.map(i=>phoneOutboxEntry(i,true)).join('')}</section>`:''}${(model.canCompose??model.canSend)?`<div class="phone-compose-wrap">${model.replyLabel?`<div class="phone-quote-target"><span>${phoneEscape(model.replyLabel)}</span><button type="button" data-phone-dismiss-reply aria-label="取消引用">${phoneIcon('close')}</button></div>`:''}<form class="phone-compose" data-phone-send><label class="phone-sr-only" for="phone-message-text">发送消息</label><textarea id="phone-message-text" name="text" rows="1" maxlength="12000" placeholder="说点什么……" aria-describedby="phone-compose-hint">${phoneEscape(model.draft??'')}</textarea><button type="submit" aria-label="发送消息" ${!model.canSend?'disabled':''}>${phoneIcon('send')}<span>发送</span></button></form><p id="phone-compose-hint" class="phone-compose-hint">${model.busy?'本轮正在收发，草稿会保留。':c.connected?'消息已排队后，会随下一轮剧情发送。':'消息先记入待发列表，接入剧情后继续收发。'}</p></div>`:''}`;
}

export function renderPhoneShell(model={}) {
  const screen=['home','apps','settings','search','outbox','document'].includes(model.screen)?model.screen:'home';
  const names={home:'月潮手机',apps:'应用库',settings:'设置',search:'搜索',outbox:'发件箱',document:'页面'};
  const title=model.title||names[screen],c=phoneConnection(model),apps=Array.isArray(model.apps)?model.apps:[];
  const messaging=apps.find(a=>a.kind==='group')??apps.find(a=>a.kind==='dm'),inbox=apps.find(a=>a.kind==='inbox');
  const body=screen==='home'?phoneHome(model):screen==='apps'?phoneApps(model):screen==='search'?phoneSearch(model):screen==='settings'?phoneSettings(model):screen==='outbox'?phoneOutbox(model):phoneDocument(model);
  const dock=screen==='home'||screen==='apps';
  return `<section class="phone-shell phone-screen-${screen}" data-phone-screen="${screen}" aria-label="月潮虚拟手机">
    <div class="phone-statusbar"><span class="phone-status-time">${phoneEscape(model.homeTime||'月潮')}</span><span class="phone-status-middle"><i class="${c.connected?'is-connected':''}"></i>${c.connected?'剧情联动':'独立预览'}</span><div class="phone-status-right">${phoneIcon('signal')}${phoneIcon('battery')}</div></div>
    ${screen==='home'?'':`<header class="phone-topbar">${phoneButton('返回','data-phone-back','back')}<div><h1>${phoneEscape(title)}</h1>${model.subtitle?`<p>${phoneEscape(model.subtitle)}</p>`:''}</div>${phoneButton('返回桌面','data-phone-nav="home"','home')}${phoneButton('收起手机','data-phone-close','close')}</header>`}
    ${model.notice?`<div class="phone-global-notice" role="status">${phoneEscape(model.notice)}</div>`:''}
    <main class="phone-page" tabindex="-1">${body}</main>${screen==='document'?phoneComposer(model):''}
    ${dock?`<nav class="phone-dock" aria-label="手机快捷入口"><button type="button" ${messaging?`data-phone-open="${phoneEscape(messaging.id)}"`:'data-phone-nav="apps"'}>${phoneIcon('chat')}<span>通信</span></button><button type="button" data-phone-nav="search">${phoneIcon('search')}<span>搜索</span></button><button type="button" ${inbox?`data-phone-open="${phoneEscape(inbox.id)}"`:'data-phone-nav="outbox"'}>${phoneIcon('bell')}${phoneBadge(model.unread)}<span>通知</span></button><button type="button" data-phone-nav="settings">${phoneIcon('settings')}<span>设置</span></button></nav>`:screen==='document'?`<nav class="phone-document-tools" aria-label="手机导航"><button type="button" data-phone-nav="home">${phoneIcon('home')}<span>桌面</span></button><button type="button" data-phone-nav="search">${phoneIcon('search')}<span>搜索</span></button><button type="button" data-phone-nav="outbox">${phoneIcon('send')}<span>发件箱</span></button><button type="button" data-phone-nav="apps">${phoneIcon('grid')}<span>应用</span></button></nav>`:''}
    <div class="phone-home-indicator"><button type="button" data-phone-nav="home" aria-label="返回手机桌面"></button></div>
  </section>`;
}

// Historical message projection. Snapshot contents never mutate the current phone.
export function renderPhoneSnapshot({id='',title='手机消息',kind='forum',bodyHtml='',at='',label='当时的内容'}={}) {
  const type=phoneKindInfo(kind)?.[0]??'页面';
  return `<section class="phone-snapshot" aria-label="${phoneEscape(title)}，历史快照"><header><span class="phone-snapshot-mark">${phoneIcon(phoneKindInfo(kind)?.[1]??'grid')}</span><div><strong>${phoneEscape(title)}</strong><small>${phoneEscape(type)} · ${phoneEscape(label)}${at?` · ${phoneEscape(at)}`:''}</small></div><span class="phone-snapshot-fixed">定格</span></header><div class="phone-snapshot-body" inert aria-label="此处为只读内容">${String(bodyHtml)}</div><footer><span>保留这一刻，不随之后的消息改变。</span>${id?`<button type="button" data-phone-open="${phoneEscape(id)}">打开完整版 ${phoneIcon('arrow')}</button>`:''}</footer></section>`;
}
