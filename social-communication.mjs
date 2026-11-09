// Fictional demonstration records. They do not modify the Glanz worldbook.
export const COMMUNICATION_KINDS=['forum','group','bubble','dm','inbox','timeline'];
export const communicationAccounts={
  me:{name:'我',role:'self',avatar:'default',personId:'reader'},
  forum_op:{name:'一卷过期胶片',platform:'douban',role:'audience'},
  forum_momo_a:{name:'momo',platform:'douban',role:'audience'},
  forum_momo_b:{name:'momo',platform:'douban',role:'audience'},
  forum_night:{name:'今天不加班',platform:'douban',role:'audience'},
  forum_orange:{name:'橙子汽水',platform:'douban',role:'audience'},
  chat_film:{name:'胶片',platform:'wechat',role:'audience',personId:'film'},
  chat_momo:{name:'momo',platform:'wechat',role:'audience'},
  chat_orange:{name:'汽水',platform:'wechat',role:'audience'},
  bb_lotis:{name:'洛缇斯',platform:'bubble',role:'artist',personId:'lotis'},
  bb_mikhail:{name:'米哈伊尔',platform:'bubble',role:'artist',personId:'mikhail'},
  dm_manager:{name:'工作室 · 行程',platform:'dm',role:'staff'},
  system:{name:'消息中心',role:'system'}
};
const start='2026-11-09T19:07:00+08:00';
const core=(platform,baseTime=start)=>({platform,baseTime,stepSeconds:30,nextFloor:1});
export const communicationDocuments=[
 {id:'forum-encore',kind:'forum',title:'【安可】同麦那段，有没有不切镜头的版本？',at:start,visibility:'public',author:'forum_op',text:'舞台回看小组',refs:['video-encore','notice-audio'],meta:{groupName:'舞台回看小组',groupDescription:'看舞台，也聊舞台之外',tags:['现场回看','安可'],coreThread:core('douban')},items:[
  {by:'forum_op',text:'刚好切到远景了。\n有人存到最后那段吗，想从头听一遍。',counts:{like:{set:32}}},
  {by:'forum_momo_a',text:'蹲',counts:{like:{set:5}}},
  {by:'forum_night',text:'有，原视频在相关链接里。',counts:{like:{set:43}}},
  {by:'forum_momo_b',text:'这个momo不是我，我还在加载',quote:2,counts:{like:{set:19}}},
  {by:'forum_orange',text:'公司刚补了音轨说明。',at:'2026-11-09T19:15:00+08:00',counts:{like:{set:17},down:{set:1}}},
  {by:'forum_op',text:'我去看一眼',quote:5,counts:{like:{set:2}}},
  {by:'forum_momo_a',text:'等楼主回来',counts:{like:{set:8}}},
  {by:'forum_momo_b',text:'等楼主回来',counts:{like:{set:0}}}
 ]},
 {id:'group-watch',kind:'group',title:'下班看舞台 (8)',at:'2026-11-09T19:00:00+08:00',visibility:'private',audience:['me'],author:'chat_film',refs:['video-encore'],meta:{notice:'群公告：链接放群里，截图记得问一声。',memberCount:8,coreThread:core('wechat','2026-11-09T19:00:00+08:00')},items:[
  {by:'chat_momo',text:'已经安可了吗'},
  {by:'chat_momo',text:'我这边刚进广告',afterSeconds:3},
  {by:'chat_film',text:'刚开始，给你发完整机位。'},
  {by:'me',text:'收到了'},
  {by:'chat_orange',text:'谁存了谢幕',quote:3},
  {by:'chat_film',text:'等一下，我在翻相册。'},
  {by:'chat_orange',text:'发错图了'},
  {delete:7},
  {by:'me',text:'慢慢来，不急'}
 ]},
 {id:'bubble-lotis',kind:'bubble',title:'洛缇斯',at:'2026-11-09T19:32:00+08:00',visibility:'subscriber',audience:['me'],author:'bb_lotis',refs:['artist-lotis'],meta:{artistAccount:'bb_lotis',wallpaper:'./assets/bubble-blue-window.svg',accent:'blue',coreThread:core('bubble','2026-11-09T19:32:00+08:00'),broadcastQuotes:{4:{text:'刚才的和声听到了！',source:'subscriber',sourceFloor:3},7:{text:'谢幕的时候有一点舍不得',source:'subscriber'}}},items:[
  {by:'bb_lotis',text:'到休息室了'},
  {by:'bb_lotis',text:'外面是不是还很冷',afterSeconds:8},
  {by:'me',text:'刚才的和声听到了！'},
  {by:'bb_lotis',text:'听到就好。',quote:3},
  {by:'bb_lotis',text:'先去吃饭，等会儿见',afterSeconds:9},
  {by:'me',text:'多吃一点'},
  {by:'bb_lotis',text:'我也是。下次再见。'}
 ]},
 {id:'bubble-mikhail',kind:'bubble',title:'米哈伊尔',at:'2026-11-09T19:35:00+08:00',visibility:'subscriber',audience:['me'],author:'bb_mikhail',refs:['artist-lotis'],meta:{artistAccount:'bb_mikhail',wallpaper:'./assets/bubble-warm-paper.svg',accent:'warm',coreThread:core('bubble','2026-11-09T19:35:00+08:00')},items:[
  {by:'bb_mikhail',text:'谢谢今天来听歌。'},
  {by:'bb_mikhail',text:'回去路上注意安全。',afterSeconds:12},
  {by:'me',text:'听到了，晚安'},
  {by:'bb_mikhail',text:'晚安。'}
 ]},
 {id:'dm-team',kind:'dm',title:'工作室 · 行程',at:'2026-11-09T18:40:00+08:00',visibility:'private',audience:['me'],author:'dm_manager',refs:['schedule-main'],meta:{statusLabel:'工作账号',coreThread:core('dm','2026-11-09T18:40:00+08:00')},items:[
  {by:'dm_manager',text:'明天的公开行程表稍后更新。'},
  {by:'dm_manager',text:'你的内部集合时间单独确认，不放公开表。',afterSeconds:6},
  {by:'me',text:'收到。'},
  {by:'dm_manager',text:'改动会在这里告诉你。'}
 ]},
 {id:'inbox-main',kind:'inbox',title:'消息',at:'2026-11-09T19:40:00+08:00',visibility:'private',audience:['me'],author:'system',refs:['wb-encore','notice-audio','bubble-lotis','dm-team','ticket-showcase'],meta:{unreadIds:['nt-1','nt-2'],tabs:['all','mentions','subscriptions','system']},items:[
  {id:'nt-1',category:'subscriptions',title:'橘园文化更新了一则公告',text:'安可回放音轨说明 · 已补充',at:'2026-11-09T19:25:00+08:00',target:'notice-audio',icon:'notice'},
  {id:'nt-2',category:'subscriptions',title:'洛缇斯有新消息',text:'先去吃饭，等会儿见',at:'2026-11-09T19:34:00+08:00',target:'bubble-lotis',icon:'bubble'},
  {id:'nt-3',category:'mentions',title:'舞台回看中有人回复你',text:'点开查看原微博与评论',at:'2026-11-09T19:16:00+08:00',target:'wb-encore',icon:'comment'},
  {id:'nt-4',category:'system',title:'你关注的活动更新了票务说明',text:'以活动详情页公布的状态为准',at:'2026-11-09T19:32:00+08:00',target:'ticket-showcase',icon:'ticket'},
  {id:'nt-5',category:'all',title:'工作室 · 行程',text:'明天的公开行程表稍后更新',at:'2026-11-09T18:40:00+08:00',target:'dm-team',icon:'chat'}
 ]},
 {id:'timeline-encore',kind:'timeline',title:'安可回看 · 公开传播记录',at:'2026-11-09T19:30:00+08:00',visibility:'public',author:'system',refs:['live-encore','video-encore','wb-encore','forum-encore','notice-audio','news-audio','trends-main'],text:'这里只列已公开的来源与回应，不把私密频道的知情自动并入。',meta:{eventId:'encore-demo'},items:[
  {id:'ev-1',label:'舞台直播',text:'公开播出后，出现现场回看讨论。',target:'live-encore',status:'公开源'},
  {id:'ev-2',label:'视频与微博流转',text:'剪辑片段与原视频分别保留来源。',target:'wb-encore',status:'传播'},
  {id:'ev-3',sourceFloor:5,label:'论坛回帖',text:'楼内补充完整机位与音轨说明链接。',target:'forum-encore',status:'讨论'},
  {id:'ev-4',label:'公司补充说明',text:'保留首版公告和本次更正时间。',target:'notice-audio',status:'回应'},
  {id:'ev-5',label:'媒体更新',text:'新闻页列署名、原始来源与更新记录。',target:'news-audio',status:'报道'}
 ]}
];

const day=at=>new Date(new Date(at).getTime()+8*3600000).toISOString().slice(0,10);
const dayText=at=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date(at));
const itemId=(doc,m)=>`row-${doc.id}-${m.floor}`;
function sourceLinks(doc,c){return (doc.refs??[]).filter(id=>c.get(id)).map(id=>c.link(id,c.get(id).title,'comm-source-link')).join('');}
function quote(doc,m,c,bubble=false){
 const broadcast=bubble?doc.meta?.broadcastQuotes?.[m.floor]:null;
 if(broadcast){const original=doc.items.find(x=>x.floor===broadcast.sourceFloor);const valid=original&&!original.deleted&&original.by==='me'&&original.text===broadcast.text;return `<${valid?'button':'div'} class="comm-quote"${valid?` data-jump="${original.floor}"`:''}><small>艺人引用的留言</small><p>${c.esc(broadcast.text)}</p></${valid?'button':'div'}>`;}
 if(!m.quote)return '';const q=doc.items.find(x=>x.floor===m.quote);if(!q)return '<div class="comm-quote">原楼未收录</div>';
 return `<button class="comm-quote" data-jump="${q.floor}"><small>${bubble?'引用留言':c.esc(c.account(q.by).name)}${!bubble?` · ${q.floor}楼`:''}</small><p>${q.deleted?'原消息已删除':c.esc(q.text)}</p></button>`;
}
function count(m,key,label,c){return Object.hasOwn(m.counts??{},key)?c.esc(m.counts[key]):label;}
function composer(doc,c){return `<form class="comm-compose" data-compose="${c.esc(doc.id)}"><input name="text" aria-label="新增消息" placeholder="${doc.kind==='bubble'?'回复艺人…':'写一条消息…'}" maxlength="1600" autocomplete="off"><button type="submit">发送</button></form>`;}
function forum(doc,c){
 const post=doc.items[0],op=post?.by;let replies=doc.items.slice(1);if(c.ui.tab==='op')replies=replies.filter(x=>x.by===op);if(c.ui.tab==='best')replies.sort((a,b)=>(b.counts?.like??-1)-(a.counts?.like??-1)||a.floor-b.floor);
 const per=25,pages=Math.max(1,Math.ceil(replies.length/per)),page=Math.min(c.ui.page??0,pages-1);const shown=replies.slice(page*per,(page+1)*per);
 return `<section class="comm-forum"><header class="cf-brand"><b>豆瓣</b><span>小组讨论</span></header><div class="cf-group"><div class="cf-group-mark">组</div><div><strong>${c.esc(doc.meta.groupName)}</strong><small>${c.esc(doc.meta.groupDescription)}</small></div><button data-action="join" data-record="${c.esc(doc.id)}">${c.ui.joined?'已加入':'+ 加入'}</button></div><article class="cf-main" id="${post?c.esc(itemId(doc,post)):''}"><h1>${c.esc(doc.title)}</h1><div class="comm-author">${c.avatar(op)}<div><strong>${c.esc(c.account(op).name)}</strong><small>${c.time(post?.at??doc.at,true)}</small></div></div><p>${post?.deleted?'主帖已删除':c.esc(post?.text??'')}</p><div class="cf-tags">${doc.meta.tags.map(t=>`<span>${c.esc(t)}</span>`).join('')}</div><div class="comm-sources">${sourceLinks(doc,c)}</div></article><nav class="cf-tabs">${[['all','全部回应'],['best','最赞回应'],['op','只看楼主']].map(([v,l])=>`<button data-action="tab" data-value="${v}" data-record="${c.esc(doc.id)}" aria-pressed="${(c.ui.tab??'all')===v}">${l}</button>`).join('')}<label><input type="checkbox" data-floor-assist ${c.ui.floorAssist!==false?'checked':''}>楼号</label></nav><div class="cf-replies">${shown.map(m=>`<article class="cf-reply" id="${c.esc(itemId(doc,m))}">${c.avatar(m.by)}<div class="cf-reply-body"><div class="cf-user"><b>${c.esc(c.account(m.by).name)}</b>${m.by===op?'<small>楼主</small>':''}${c.ui.floorAssist!==false?`<span>#${m.floor}</span>`:''}</div>${quote(doc,m,c)}<p>${m.deleted?'该回应已删除':c.esc(m.text)}</p><footer><time>${c.time(m.at,true)}</time><button data-reply-floor="${m.floor}">回应</button><button data-like-floor="${m.floor}" aria-pressed="${c.ui.floorLikes?.[m.floor]===true}" class="${c.ui.floorLikes?.[m.floor]?'is-liked':''}">${c.ui.floorLikes?.[m.floor]?'已赞':'赞'} ${count(m,'like','',c)}</button>${Object.hasOwn(m.counts??{},'down')&&c.ui.floorAssist!==false?`<span>踩 ${c.esc(m.counts.down)}</span>`:''}</footer></div></article>`).join('')||'<p class="comm-empty">还没有这类回应。</p>'}</div><div class="comm-pagination"><button data-action="page" data-value="${page-1}" ${page===0?'disabled':''}>上一页</button><span>${page+1} / ${pages}</span><button data-action="page" data-value="${page+1}" ${page+1>=pages?'disabled':''}>下一页</button></div>${composer(doc,c)}</section>`;
}
function chat(doc,c){let previous=null;const bubble=doc.kind==='bubble',dm=doc.kind==='dm';
 const stream=doc.items.map(m=>{const self=m.by==='me',newDay=!previous||day(m.at)!==day(previous.at),newTime=newDay||new Date(m.at)-new Date(previous.at)>90000,consecutive=previous&&!newDay&&previous.by===m.by&&!previous.deleted&&!m.deleted&&new Date(m.at)-new Date(previous.at)<60000;previous=m;const stamp=newTime?`<div class="comm-date">${newDay?c.esc(dayText(m.at))+'　':''}${!bubble?c.time(m.at):''}</div>`:'';if(m.deleted)return `${stamp}<div class="comm-withdrawn" id="${c.esc(itemId(doc,m))}">${c.esc(c.account(m.by).name)}撤回了一条消息</div>`;return `${stamp}<article class="comm-message${self?' self':''}${consecutive?' consecutive':''}" id="${c.esc(itemId(doc,m))}">${c.avatar(m.by)}<div class="comm-message-content">${!self?`<div class="comm-sender">${c.esc(c.account(m.by).name)}</div>`:''}<div class="comm-bubble">${bubble?quote(doc,m,c,true):''}<p>${c.esc(m.text)}</p></div>${!bubble?quote(doc,m,c):''}${bubble?`<time>${c.time(m.at)}</time>`:''}</div></article>`;}).join('');
 return `<section class="comm-chat ${bubble?'is-bubble':dm?'is-dm':'is-group'}" data-accent="${c.esc(doc.meta?.accent??'gray')}"><header class="comm-chat-head">${bubble?c.avatar(doc.meta.artistAccount):''}<div><h1>${c.esc(doc.title)}</h1>${bubble?'<small>艺人频道</small>':dm?`<small>${c.esc(doc.meta.statusLabel??'')}</small>`:''}</div>${bubble?'<span class="comm-bubble-word">bubble ♡</span>':''}</header>${doc.meta?.notice?`<div class="comm-group-notice">${c.esc(doc.meta.notice)}</div>`:''}${bubble?`<div class="comm-room-switch">${c.link('bubble-lotis','洛缇斯')}${c.link('bubble-mikhail','米哈伊尔')}</div>`:''}<div class="comm-stream">${stream}<div class="comm-chat-sources">${sourceLinks(doc,c)}</div></div>${composer(doc,c)}${bubble?'<p class="comm-channel-note">我的回复仅发给艺人；艺人引用的留言随频道消息广播。</p>':''}</section>`;
}
function inbox(doc,c){const selected=c.ui.tab??'all',labels={all:'全部',mentions:'回复与提及',subscriptions:'订阅',system:'系统'};const items=selected==='all'?doc.items:doc.items.filter(m=>m.category===selected);return `<section class="comm-inbox"><header><h1>${c.esc(doc.title)}</h1><button data-action="mark-read" data-record="${c.esc(doc.id)}">全部已读</button></header><nav>${Object.entries(labels).map(([v,l])=>`<button data-action="tab" data-record="${c.esc(doc.id)}" data-value="${v}" aria-pressed="${selected===v}">${l}</button>`).join('')}</nav><div>${items.map(m=>`<button class="comm-notification" data-open="${c.esc(m.target)}" data-notification="${c.esc(m.id)}"><span class="comm-notification-mark">${c.esc(m.title.slice(0,1))}</span><span><strong>${c.esc(m.title)}</strong><p>${c.esc(m.text)}</p><time>${c.time(m.at,true)}</time></span>${doc.meta.unreadIds?.includes(m.id)?'<i class="unread-dot" aria-label="未读"></i>':''}</button>`).join('')||'<p class="comm-empty">暂无这类消息。</p>'}</div></section>`;}
function timeline(doc,c){const eventAt=m=>m.at??(m.sourceFloor?c.get(m.target)?.items?.find(x=>x.floor===m.sourceFloor)?.at:null)??c.get(m.target)?.at;return `<section class="comm-timeline"><header><span>EVENT LOG</span><h1>${c.esc(doc.title)}</h1><p>${c.esc(doc.text)}</p></header><ol>${[...doc.items].sort((a,b)=>Date.parse(eventAt(a))-Date.parse(eventAt(b))).map(m=>`<li><div class="comm-event-time">${c.time(eventAt(m),true)}</div><div class="comm-event"><span>${c.esc(m.status)}</span><h2>${c.esc(m.label)}</h2><p>${c.esc(m.text)}</p>${c.link(m.target,'查看来源 →')}</div></li>`).join('')}</ol><footer>传播顺序以已登记来源为准，不按热度倒推谁先知道。</footer></section>`;}
export function renderCommunication(doc,ctx){if(doc.kind==='forum')return forum(doc,ctx);if(['group','bubble','dm'].includes(doc.kind))return chat(doc,ctx);if(doc.kind==='inbox')return inbox(doc,ctx);if(doc.kind==='timeline')return timeline(doc,ctx);throw new Error('Unsupported communication page: '+doc.kind);}
