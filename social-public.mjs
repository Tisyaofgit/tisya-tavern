/*
 * Independent network-block preview. All document content is demonstration data.
 * Official structure references, read 2026-11-09 (no real-person allegations used):
 * https://kefu.weibo.com/faqdetail?id=21378 — profile tabs vary by available content.
 * https://kefu.weibo.com/faqdetail?id=21749 — hot comments are not a like-count sort.
 * https://weverse.io/notice/39078 — community polls have options, duration and vote state.
 * https://www.bj.news.cn/20260908/efd0d09f02b24096b025e5f4113226a8/c.html
 *   — source/date/byline structure was visible in the search extract; full open timed out.
 * These are structural references, not a claim of pixel-level platform equivalence.
 * No network requests, storage writes, host-chat mutation, or event handlers live here.
 */

export const PUBLIC_KINDS=Object.freeze(['weibo','artist','notice','news','trends','fanclub']);

export const publicAccounts=Object.freeze({
 'wb-lotis':{id:'wb-lotis',name:'洛缇斯',platform:'weibo',personId:'lotis',handle:'@lotis_glanz',bio:'Glanz 成员。舞台与作品，慢慢放在这里。',verification:{mark:'V',label:'演示艺人账号'},profileId:'artist-lotis',avatar:'default'},
 'wb-orchard':{id:'wb-orchard',name:'橘园文化',platform:'weibo',personId:'orchard-culture',handle:'@juyuan_culture',verification:{mark:'V',label:'演示机构账号'},bio:'演示用公司账号',avatar:'default'},
 'site-orchard':{id:'site-orchard',name:'橘园文化',platform:'company-site',personId:'orchard-culture',bio:'演示用公司网站',avatar:'default'},
 'wb-film':{id:'wb-film',name:'一卷过期胶片',platform:'weibo',avatar:'default'},
 'wb-momo':{id:'wb-momo',name:'momo',platform:'weibo',avatar:'default'},
 'wb-orange':{id:'wb-orange',name:'橙子汽水',platform:'weibo',avatar:'default'},
 'wb-lamp':{id:'wb-lamp',name:'灯还亮着',platform:'weibo',avatar:'default'},
 'press-window':{id:'press-window',name:'现场观察',platform:'news',bio:'演示用文化资讯栏目',avatar:'default'},
 'press-reporter':{id:'press-reporter',name:'林予',platform:'news',bio:'演示署名',avatar:'default'},
 'press-editor':{id:'press-editor',name:'小梁',platform:'news',bio:'演示署名',avatar:'default'},
 'fan-lime':{id:'fan-lime',name:'青柠后援站',platform:'fanclub',personId:'lime-fans',bio:'粉丝自发整理，非公司账号。',avatar:'default'},
 'wb-fan-lime':{id:'wb-fan-lime',name:'青柠后援站',platform:'weibo',personId:'lime-fans',bio:'粉丝自发整理，非公司账号。',avatar:'default'},
 'trends-editor':{id:'trends-editor',name:'文娱热搜',platform:'trends',bio:'演示榜单',avatar:'default'}
});

const demo={demo:true,demoLabel:'演示素材'};

export const publicDocuments=[
 {
  id:'wb-encore',kind:'weibo',title:'洛缇斯的安可微博',at:'2026-11-09T19:08:00+08:00',visibility:'public',author:'wb-lotis',
  text:'和声那段，你们听清了吗？\n回看放在这里。今晚谢谢大家。',metrics:{like:1248,repost:126,reply:61},
  refs:['artist-lotis','video-encore','wb-lotis-note','fanclub-main'],
  meta:{...demo,sourceLabel:'微博网页版',topics:['安可舞台'],mediaRef:'video-encore',mediaLabel:'安可舞台 · 完整回看',mediaType:'视频',commentOrder:'hot',profileRef:'artist-lotis'},
  items:[
   {id:'wb-encore-c1',kind:'comment',by:'wb-orange',text:'和声听到了，想再听一遍。',at:'2026-11-09T19:08:30+08:00',metrics:{like:208},hotRank:1,sourceLabel:'微博网页版'},
   {id:'wb-encore-c2',kind:'comment',by:'wb-momo',text:'我一直在看队长手里的奖杯',at:'2026-11-09T19:09:00+08:00',metrics:{like:127},hotRank:2},
   {id:'wb-encore-c3',kind:'comment',by:'wb-film',text:'他那段讲话还没结束哈哈',at:'2026-11-09T19:09:15+08:00',metrics:{like:43},parentId:'wb-encore-c2',replyTo:'wb-encore-c2'},
   {id:'wb-encore-c4',kind:'comment',by:'wb-lamp',text:'最后一起谢幕那段也留着了。',at:'2026-11-09T19:10:00+08:00',metrics:{like:19},hotRank:3},
   {id:'wb-encore-r1',kind:'repost',by:'wb-fan-lime',text:'回看入口收好，字幕整理会放在站内通知。',at:'2026-11-09T19:11:00+08:00',sourceDocumentId:'wb-encore',relatedRef:'fanclub-main'}
  ]
 },
 {
  id:'wb-lotis-note',kind:'weibo',title:'洛缇斯的夜间短微博',at:'2026-11-09T22:16:00+08:00',visibility:'public',author:'wb-lotis',
  text:'晚一点，再听一遍。',refs:['artist-lotis','music-afterlight'],
  meta:{...demo,profileRef:'artist-lotis',mediaRef:'music-afterlight',mediaLabel:'Afterlight',mediaType:'音乐'},items:[]
 },
 {
  id:'wb-company-audio',kind:'weibo',title:'橘园文化的回放说明',at:'2026-11-09T19:15:00+08:00',visibility:'public',author:'wb-orchard',
  text:'演示回放的音轨标识说明已更新，原回看入口不变。',metrics:{like:86,repost:21},refs:['notice-audio','video-encore'],
  meta:{...demo,sourceLabel:'微博网页版',quoteDocumentId:'notice-audio',quoteLabel:'公司公告'},items:[]
 },
 {
  id:'artist-lotis',kind:'artist',title:'洛缇斯',at:'2026-11-09T22:16:00+08:00',visibility:'public',author:'wb-lotis',
  text:'把舞台留下，也把没说完的话留一点。',metrics:{followers:8621,following:18},
  refs:['wb-encore','wb-lotis-note','music-afterlight','video-encore','schedule-main','fanclub-main'],
  meta:{...demo,profileLabel:'艺人主页',coverTone:'blue',introLabel:'音乐 · 舞台',pinnedRef:'wb-encore',tabs:[{id:'all',label:'主页'},{id:'works',label:'作品'},{id:'posts',label:'微博'}],quickLinks:[{ref:'schedule-main',label:'公开行程'},{ref:'fanclub-main',label:'粉丝站'}]},
  items:[
   {id:'lotis-work-1',kind:'work',ref:'music-afterlight',label:'单曲',tone:'dusk'},
   {id:'lotis-work-2',kind:'work',ref:'video-encore',label:'舞台回看',tone:'sage'},
   {id:'lotis-post-1',kind:'post',ref:'wb-lotis-note'},
   {id:'lotis-post-2',kind:'post',ref:'wb-encore'}
  ]
 },
 {
  id:'notice-audio',kind:'notice',title:'关于安可回放音轨标识的补充说明',at:'2026-11-09T19:14:00+08:00',visibility:'public',author:'site-orchard',
  text:'为方便回看，演示视频页面已补充音轨标识。视频内容与原回看入口保持一致。',
  refs:['notice-audio-v1','video-encore','wb-company-audio'],
  meta:{...demo,section:'公告',documentNo:'JY-DEMO-20261109-02',status:{code:'updated',label:'已更新'},revision:'02',updatedAt:'2026-11-09T19:14:00+08:00',effectiveAt:'2026-11-09T19:14:00+08:00',previousRef:'notice-audio-v1',signoff:'橘园文化',sections:[
   {heading:'一、更新内容',paragraphs:['视频页面增加“回放音轨”说明，方便读者区分现场画面与回放页面标识。']},
   {heading:'二、查看方式',paragraphs:['请以本公告所附回看页面为准。'],ref:'video-encore',refLabel:'查看演示回放'},
   {heading:'三、版本说明',paragraphs:['前一版所用“独立音轨”已改为“回放音轨”。本次仅修正页面表述。']}
  ],revisions:[
   {id:'notice-rev-2',version:'02',at:'2026-11-09T19:14:00+08:00',status:'当前版本',summary:'修正音轨名称，补充说明范围。'},
   {id:'notice-rev-1',version:'01',at:'2026-11-09T19:10:00+08:00',status:'历史版本',summary:'首次发布演示说明。',ref:'notice-audio-v1'}
  ]}
 },
 {
  id:'notice-audio-v1',kind:'notice',title:'安可回放页面说明（历史版本）',at:'2026-11-09T19:10:00+08:00',visibility:'public',author:'site-orchard',
  text:'演示视频页面将补充独立音轨说明，便于回看。',refs:['notice-audio','video-encore'],
  meta:{...demo,section:'公告存档',documentNo:'JY-DEMO-20261109-01',status:{code:'superseded',label:'已由新版替代'},revision:'01',currentRef:'notice-audio',signoff:'橘园文化',sections:[{heading:'版本备注',paragraphs:['本页保留首次发布的原文；更新内容请查看当前公告。']}],revisions:[{id:'notice-rev-1-copy',version:'01',at:'2026-11-09T19:10:00+08:00',status:'历史版本',summary:'首次发布。'}]}
 },
 {
  id:'news-audio',kind:'news',title:'Glanz 安可回放更新音轨标识',at:'2026-11-09T19:18:00+08:00',visibility:'public',author:'press-window',
  text:'橘园文化发布补充说明，对演示回放页面中的音轨名称作出修正。',refs:['notice-audio','notice-audio-v1','video-encore','wb-company-audio'],
  meta:{...demo,section:'文娱',kicker:'现场速记',summary:'调整的是回放页面的文字标识。',bylines:[{label:'记者',account:'press-reporter'},{label:'编辑',account:'press-editor'}],sourceRef:'notice-audio',sourceLabel:'橘园文化公开公告',updatedAt:'2026-11-09T19:22:00+08:00',paragraphs:[
   '橘园文化在补充说明中表示，演示视频页面已将相关表述调整为“回放音轨”，原回看入口不变。',
   '目前页面仍保留完整的舞台回看。此前版本的公告可以通过修订记录查看，便于比对前后表述。',
   '本文仅整理这次演示页面的公开更新。'
  ],pullQuote:{text:'本次仅修正页面表述。',sourceRef:'notice-audio'},corrections:[{id:'news-correction-1',at:'2026-11-09T19:22:00+08:00',label:'更正',text:'初稿中的“独立音轨”改为“回放音轨”，与当前公告保持一致。',sourceRef:'notice-audio'}],related:[{ref:'video-encore',label:'完整回看'},{ref:'notice-audio-v1',label:'公告历史版本'}]}
 },
 {
  id:'trends-main',kind:'trends',title:'文娱热搜',at:'2026-11-09T19:25:00+08:00',visibility:'public',author:'trends-editor',
  text:'只搜索这份演示中的公开页面。',refs:['wb-encore','video-encore','notice-audio','news-audio','artist-lotis','music-afterlight','fanclub-main'],
  meta:{...demo,rankingLabel:'实时热搜 · 演示榜单',searchPlaceholder:'搜索公开动态、公告、作品',updatedLabel:'本页更新时间',tabs:[{id:'all',label:'热搜榜'},{id:'entertainment',label:'文娱'},{id:'works',label:'作品'}]},
  items:[
   {id:'trend-1',rank:1,title:'安可同麦和声',category:'entertainment',badge:'热',metrics:{heat:12864},ref:'wb-encore'},
   {id:'trend-2',rank:2,title:'Glanz 安可全景回看',category:'works',badge:'新',metrics:{heat:9361},ref:'video-encore'},
   {id:'trend-3',rank:3,title:'回放音轨说明更新',category:'entertainment',metrics:{heat:5218},ref:'notice-audio'},
   {id:'trend-4',rank:4,title:'Afterlight',category:'works',metrics:{heat:4096},ref:'music-afterlight'},
   {id:'trend-5',rank:5,title:'洛缇斯公开主页',category:'entertainment',ref:'artist-lotis'},
   {id:'trend-6',rank:6,title:'粉丝站字幕整理',category:'entertainment',ref:'fanclub-main'}
  ]
 },
 {
  id:'fanclub-main',kind:'fanclub',title:'青柠后援站',at:'2026-11-09T19:30:00+08:00',visibility:'public',author:'fan-lime',
  text:'回看入口、公开行程和小小的集合点。',metrics:{members:268},refs:['video-encore','schedule-main','notice-audio','artist-lotis'],
  meta:{...demo,siteTag:'GLANZ · FAN COMMUNITY',siteNotice:'粉丝自发整理，非公司账号。',bannerTitle:'一起把今晚留住',tabs:[{id:'all',label:'站内动态'},{id:'support',label:'应援通知'},{id:'poll',label:'投票'}],poll:{id:'fanclub-light-poll',title:'下次回看页用哪一组配色？',description:'选一组你更喜欢的演示应援配色。',status:'open',endsAt:'2026-11-10T21:00:00+08:00',multiple:false,totalVotes:79,selectedOption:null,options:[{id:'soft-green',label:'浅绿与奶白',votes:48},{id:'warm-white',label:'暖白与银灰',votes:31}],note:'本投票仅用于独立预览。'}},
  items:[
   {id:'fan-notice-1',kind:'notice',title:'安可完整回看已整理',text:'入口放在这里，先看完整版。',at:'2026-11-09T19:26:00+08:00',label:'置顶',ref:'video-encore'},
   {id:'fan-notice-2',kind:'notice',title:'回放标识请以公司新公告为准',text:'旧版截图和新版说明别混用。',at:'2026-11-09T19:28:00+08:00',ref:'notice-audio'},
   {id:'fan-support-1',kind:'support',title:'回看字幕协作',text:'整理公开回放中的台词与时间点。先从听清的部分开始。',at:'2026-11-09T19:30:00+08:00',status:'进行中',deadline:'2026-11-10T20:00:00+08:00',ref:'video-encore',reminderLabel:'提醒我查看'},
   {id:'fan-support-2',kind:'support',title:'公开行程核对',text:'只收录已公开的安排；临时变更以原页面为准。',at:'2026-11-09T19:30:00+08:00',status:'待更新',ref:'schedule-main',reminderLabel:'提醒我查看'}
  ]
 }
];

const iconPaths={back:'m14 5-7 7 7 7',more:'M5 12h.01M12 12h.01M19 12h.01',search:'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',like:'M8 10v11H4V10h4Zm0 0 4-7c1-1 3 0 2.5 2.5L14 9h5a2 2 0 0 1 2 2.4L19.5 19a2 2 0 0 1-2 2H8',comment:'M20 11.5a8 8 0 0 1-8 8H8l-5 3 1.4-6A8 8 0 1 1 20 11.5',repost:'M5 8h13l-4-4M19 16H6l4 4M18 8v4M6 16v-4',arrow:'M4 12h16m-6-6 6 6-6 6',play:'m8 4 12 8-12 8V4',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',file:'M6 3h8l4 4v14H6V3m8 0v5h4M9 12h6M9 16h6',headphones:'M4 14v-3a8 8 0 0 1 16 0v3M4 12h3v8H4v-8m13 0h3v8h-3v-8',calendar:'M4 5h16v16H4V5M8 3v4M16 3v4M4 10h16',check:'m5 12 4 4L19 6',bookmark:'M6 3h12v18l-6-4-6 4V3',people:'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0M4 21v-3a8 8 0 0 1 16 0v3',chevron:'m9 5 7 7-7 7'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[name]??iconPaths.file}"/></svg>`;
const own=(value,key)=>Object.hasOwn(value??{},key);
const list=value=>Array.isArray(value)?value:[];
const esc=(ctx,value)=>ctx.esc(String(value??''));
const stamp=(ctx,at,full=false)=>at?esc(ctx,ctx.time(at,full)):'';
const account=(ctx,id)=>id?ctx.account(id):null;
const avatar=(ctx,id)=>id?`<span class="pub-avatar">${ctx.avatar(id)}</span>`:'';
const metric=(ctx,record,key,label)=>esc(ctx,ctx.count(record,key,label));
const verified=(ctx,id)=>{const v=account(ctx,id)?.verification;return v?.mark?`<span class="pub-verified" aria-label="${esc(ctx,v.label)}">${esc(ctx,v.mark)}</span>`:'';};
const button=(ctx,action,record,label,value='',className='')=>`<button class="${className}" data-action="${action}" data-record="${esc(ctx,record)}"${value!==''?` data-value="${esc(ctx,value)}"`:''}>${action==='remind'&&ctx.ui.reminders?.[value||record]?'已设本地提醒':label}</button>`;
function ref(ctx,id,label,className=''){const target=id?ctx.get(id):null;return target?ctx.link(id,label??target.title,className):`<span class="${className} pub-unavailable">${esc(ctx,label??'内容暂缺')}</span>`;}
function tabs(doc,ctx,rows,active=ctx.ui.tab??'all',className='pub-tabs'){return `<nav class="${className}" aria-label="页面分类">${rows.map(row=>`<button data-action="tab" data-record="${esc(ctx,doc.id)}" data-value="${esc(ctx,row.id)}" aria-pressed="${row.id===active}">${esc(ctx,row.label)}</button>`).join('')}</nav>`;}
function demoLabel(doc,ctx){return doc.meta?.demoLabel?`<span class="pub-demo">${esc(ctx,doc.meta.demoLabel)}</span>`:'';}
function authorLine(doc,ctx){const a=account(ctx,doc.author);return `<div class="pub-author">${avatar(ctx,doc.author)}<div class="pub-author-copy"><strong>${a?esc(ctx,a.name):''}${verified(ctx,doc.author)}</strong><small>${stamp(ctx,doc.at,true)}${doc.meta?.sourceLabel?` · ${esc(ctx,doc.meta.sourceLabel)}`:''}</small></div></div>`;}
function sourceCard(ctx,id,label){const d=ctx.get(id);if(!d)return '';return `<div class="pub-source-card"><span>${esc(ctx,label??'引用来源')}</span>${ref(ctx,id,d.title)}${d.text?`<p>${esc(ctx,d.text)}</p>`:''}</div>`;}
function miniPost(ctx,d){return `<article class="pub-mini-post">${authorLine(d,ctx)}${ref(ctx,d.id,d.text??d.title,'pub-mini-post-text')}<div class="pub-mini-post-meta">${stamp(ctx,d.at)}${own(d.metrics,'like')?`<span>${icon('like')}${metric(ctx,d,'like','赞')}</span>`:''}</div></article>`;}

function renderWeibo(doc,ctx){
 const items=list(doc.items),comments=items.filter(x=>x.kind==='comment'),reposts=items.filter(x=>x.kind==='repost'),tab=ctx.ui.tab??'all',ids=new Set(comments.map(x=>x.id));
 const top=comments.filter(x=>!x.parentId||!ids.has(x.parentId));
 if(tab==='latest')top.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));else top.sort((a,b)=>(a.hotRank??Infinity)-(b.hotRank??Infinity));
 const source=item=>`${stamp(ctx,item.at)}${item.sourceLabel?` · ${esc(ctx,item.sourceLabel)}`:''}`;
 const comment=(item,child=false)=>{const children=comments.filter(x=>x.parentId===item.id);const target=item.replyTo?comments.find(x=>x.id===item.replyTo):null;return `<article class="${child?'pub-wb-child':'pub-wb-comment'}" id="pub-comment-${esc(ctx,encodeURIComponent(String(doc.id)))}-${esc(ctx,encodeURIComponent(String(item.id)))}"${item.parentId?` data-parent-comment="${esc(ctx,item.parentId)}"`:''}>${child?'':avatar(ctx,item.by)}<div class="pub-wb-comment-copy"><div class="pub-wb-comment-name"><span>${esc(ctx,account(ctx,item.by)?.name)}${verified(ctx,item.by)}</span>${own(item.metrics,'like')?`<small>${icon('like')}${metric(ctx,item,'like','赞')}</small>`:''}</div><p>${target&&target.id!==item.parentId?`<span class="pub-wb-reply-to">回复 ${esc(ctx,account(ctx,target.by)?.name)}：</span>`:''}${esc(ctx,item.text)}</p><small class="pub-wb-comment-source">${source(item)}</small>${children.length&&!child?`<div class="pub-wb-children">${children.map(x=>comment(x,true)).join('')}</div>`:''}</div></article>`;};
 const media=doc.meta?.mediaRef?ctx.get(doc.meta.mediaRef):null;
 return `<section class="public-surface pub-weibo"><header class="pub-wb-header"><span>${icon('back')}</span><h1>${esc(ctx,doc.title)}</h1><span>${icon('more')}</span></header><article class="pub-wb-post">${authorLine(doc,ctx)}${demoLabel(doc,ctx)}<p class="pub-wb-text">${list(doc.meta?.topics).map(x=>`<span class="pub-wb-topic">#${esc(ctx,x)}#</span> `).join('')}${esc(ctx,doc.text)}</p>${media?`<div class="pub-wb-media">${ref(ctx,media.id,doc.meta.mediaLabel??media.title,'pub-wb-media-link')}<span class="pub-wb-media-icon">${icon(doc.meta.mediaType==='音乐'?'headphones':'play')}</span><small>${esc(ctx,doc.meta.mediaType)}</small></div>`:''}${doc.meta?.quoteDocumentId?sourceCard(ctx,doc.meta.quoteDocumentId,doc.meta.quoteLabel):''}<div class="pub-wb-actions">${button(ctx,'tab',doc.id,icon('repost')+metric(ctx,doc,'repost','转发'),'reposts')}${button(ctx,'tab',doc.id,icon('comment')+metric(ctx,doc,'reply','评论'),'all')}${button(ctx,'like',doc.id,icon('like')+metric(ctx,doc,'like','赞'),'','pub-like'+(ctx.ui.liked?' is-liked':''))}</div></article><section class="pub-wb-discussion">${tabs(doc,ctx,[{id:'all',label:'评论'},{id:'reposts',label:'转发'}],tab==='reposts'?'reposts':'all','pub-wb-tabs')}${tab==='reposts'?reposts.map(item=>`<article class="pub-wb-repost"><div class="pub-author">${avatar(ctx,item.by)}<div><strong>${esc(ctx,account(ctx,item.by)?.name)}</strong><small>${stamp(ctx,item.at,true)}</small></div></div><p>${esc(ctx,item.text)}</p>${sourceCard(ctx,item.sourceDocumentId,'转发原文')}${item.relatedRef?ref(ctx,item.relatedRef,'查看相关页面','pub-inline-link'):''}</article>`).join('')||'<p class="pub-empty">没有已展示的转发记录</p>':`${tabs(doc,ctx,[{id:'all',label:'按热度'},{id:'latest',label:'按时间'}],tab==='latest'?'latest':'all','pub-wb-sort')}${top.map(item=>comment(item)).join('')||'<p class="pub-empty">暂无已展示的评论</p>'}`}</section></section>`;
}

function renderArtist(doc,ctx){
 const a=account(ctx,doc.author),tab=ctx.ui.tab??'all',works=list(doc.items).filter(x=>x.kind==='work'),posts=list(doc.items).filter(x=>x.kind==='post').map(x=>ctx.get(x.ref)).filter(Boolean),pinned=ctx.get(doc.meta?.pinnedRef);
 const workList=`<div class="pub-artist-works">${works.map(w=>{const target=ctx.get(w.ref);if(!target)return '';const tone=['dusk','sage','paper'].includes(w.tone)?w.tone:'paper';return `<article class="pub-work"><span class="pub-work-art ${tone}" aria-hidden="true"><i></i><b></b></span><div><small>${esc(ctx,w.label)}</small>${ref(ctx,w.ref,target.title)}<time>${stamp(ctx,w.at??target.at,true)}</time></div><span>${icon('chevron')}</span></article>`;}).join('')}</div>`;
 return `<section class="public-surface pub-artist"><div class="pub-artist-cover"><span class="pub-artist-cover-line"></span><span>${esc(ctx,doc.meta?.profileLabel)}</span>${demoLabel(doc,ctx)}</div><header class="pub-artist-profile"><div class="pub-artist-avatar">${avatar(ctx,doc.author)}</div><div class="pub-artist-profile-actions">${button(ctx,'follow',doc.id,ctx.ui.followed?'已关注':'+ 关注')}</div><h1>${esc(ctx,doc.title)}${verified(ctx,doc.author)}</h1>${a?.handle?`<small class="pub-artist-handle">${esc(ctx,a.handle)}</small>`:''}${a?.bio?`<p class="pub-artist-bio">${esc(ctx,a.bio)}</p>`:''}<p class="pub-artist-intro">${esc(ctx,doc.text)}</p><div class="pub-artist-counts">${own(doc.metrics,'followers')?`<span><strong>${metric(ctx,doc,'followers','')}</strong> 粉丝</span>`:''}${own(doc.metrics,'following')?`<span><strong>${metric(ctx,doc,'following','')}</strong> 关注</span>`:''}</div><div class="pub-artist-quick">${list(doc.meta?.quickLinks).map(x=>ref(ctx,x.ref,x.label)).join('')}</div></header>${tabs(doc,ctx,list(doc.meta?.tabs),tab,'pub-artist-tabs')}<div class="pub-artist-content">${tab==='works'?workList:tab==='posts'?posts.map(d=>miniPost(ctx,d)).join(''):`${pinned?`<div class="pub-artist-pinned"><small>置顶</small>${miniPost(ctx,pinned)}</div>`:''}<h2>作品</h2>${workList}`}</div></section>`;
}

function revisionList(doc,ctx){return `<ol class="pub-revision-list">${list(doc.meta?.revisions).map(r=>`<li><div class="pub-revision-mark"></div><div><div class="pub-revision-heading"><strong>${esc(ctx,r.version)}</strong><span>${esc(ctx,r.status)}</span><time>${stamp(ctx,r.at,true)}</time></div><p>${esc(ctx,r.summary)}</p>${r.ref?ref(ctx,r.ref,'查看该版本','pub-inline-link'):''}</div></li>`).join('')}</ol>`;}
function renderNotice(doc,ctx){
 const m=doc.meta??{},a=account(ctx,doc.author),tab=ctx.ui.tab??'all';
 return `<section class="public-surface pub-notice"><header class="pub-company-header"><span class="pub-orchard-mark" aria-hidden="true"></span><div><strong>${esc(ctx,a?.name)}</strong><small>${esc(ctx,m.section)}</small></div>${demoLabel(doc,ctx)}</header><main class="pub-notice-paper"><div class="pub-notice-number">${esc(ctx,m.documentNo)}${m.status?`<span class="pub-notice-status ${m.status.code==='superseded'?'is-old':'is-current'}">${esc(ctx,m.status.label)}</span>`:''}</div><h1>${esc(ctx,doc.title)}</h1><div class="pub-notice-dates"><span>发布 ${stamp(ctx,doc.at,true)}</span>${m.updatedAt?`<span>更新 ${stamp(ctx,m.updatedAt,true)}</span>`:''}${m.revision?`<span>版本 ${esc(ctx,m.revision)}</span>`:''}</div>${m.currentRef?`<div class="pub-notice-superseded">${ref(ctx,m.currentRef,'查看当前有效版本')}${icon('arrow')}</div>`:''}${tabs(doc,ctx,[{id:'all',label:'公告正文'},{id:'history',label:'修订记录'}],tab,'pub-notice-tabs')}${tab==='history'?revisionList(doc,ctx):`<div class="pub-notice-body"><p>${esc(ctx,doc.text)}</p>${list(m.sections).map(section=>`<section><h2>${esc(ctx,section.heading)}</h2>${list(section.paragraphs).map(text=>`<p>${esc(ctx,text)}</p>`).join('')}${section.ref?ref(ctx,section.ref,section.refLabel,'pub-notice-attachment'):''}</section>`).join('')}</div><footer class="pub-notice-signoff"><strong>${esc(ctx,m.signoff)}</strong><time>${stamp(ctx,m.effectiveAt??doc.at,true)}</time></footer>${list(m.revisions).length>1?`<details class="pub-notice-history"><summary>修订记录</summary>${revisionList(doc,ctx)}</details>`:''}`}</main></section>`;
}

function renderNews(doc,ctx){
 const m=doc.meta??{},publisher=account(ctx,doc.author);
 return `<article class="public-surface pub-news"><header class="pub-news-masthead"><span>${esc(ctx,publisher?.name)}</span><small>${esc(ctx,m.section)}</small>${demoLabel(doc,ctx)}</header><div class="pub-news-article">${m.kicker?`<p class="pub-news-kicker">${esc(ctx,m.kicker)}</p>`:''}<h1>${esc(ctx,doc.title)}</h1>${m.summary?`<p class="pub-news-deck">${esc(ctx,m.summary)}</p>`:''}<div class="pub-news-byline">${list(m.bylines).map(x=>`<span>${esc(ctx,x.label)} ${esc(ctx,account(ctx,x.account)?.name)}</span>`).join('')}</div><div class="pub-news-date"><time>${stamp(ctx,doc.at,true)}</time>${m.updatedAt?`<span>更新 ${stamp(ctx,m.updatedAt,true)}</span>`:''}</div>${m.sourceRef?`<div class="pub-news-source">来源：${ref(ctx,m.sourceRef,m.sourceLabel)}</div>`:''}<div class="pub-news-body"><p class="pub-news-lead">${esc(ctx,doc.text)}</p>${list(m.paragraphs).map((text,index)=>`<p>${esc(ctx,text)}</p>${index===0&&m.pullQuote?`<blockquote><p>${esc(ctx,m.pullQuote.text)}</p>${m.pullQuote.sourceRef?`<cite>${ref(ctx,m.pullQuote.sourceRef,'查看原文')}</cite>`:''}</blockquote>`:''}`).join('')}</div>${list(m.corrections).length?`<section class="pub-news-corrections"><h2>更正记录</h2>${list(m.corrections).map(c=>`<div><strong>${esc(ctx,c.label)}</strong><time>${stamp(ctx,c.at,true)}</time><p>${esc(ctx,c.text)}</p>${c.sourceRef?ref(ctx,c.sourceRef,'核对更新来源','pub-inline-link'):''}</div>`).join('')}</section>`:''}<div class="pub-news-tools">${button(ctx,'bookmark',doc.id,icon('bookmark')+(ctx.ui.bookmarked?'已收藏':'收藏文章'))}</div>${list(m.related).length?`<section class="pub-news-related"><h2>相关资料</h2>${list(m.related).map(row=>ref(ctx,row.ref,row.label)).join('')}</section>`:''}</div></article>`;
}

const kindNames={forum:'论坛',weibo:'微博',artist:'艺人',notice:'公告',news:'新闻',trends:'热搜',fanclub:'粉丝站',live:'直播',video:'视频',music:'音乐',schedule:'行程',ticket:'票务',timeline:'事件链'};
function renderTrends(doc,ctx){
 const m=doc.meta??{},query=String(ctx.ui.query??'').trim(),tab=ctx.ui.tab??'all';
 const searchable=list(ctx.documents).filter(d=>d.visibility==='public');
 const results=query?searchable.filter(d=>[d.title,d.text,d.meta?.summary,d.meta?.description,...list(d.meta?.paragraphs),...list(d.meta?.sections).flatMap(s=>list(s.paragraphs)),...list(d.items).filter(x=>!x.deleted).flatMap(x=>[x.title,x.text])].filter(x=>typeof x==='string').join('\n').toLocaleLowerCase().includes(query.toLocaleLowerCase())):[];
 const rows=list(doc.items).filter(row=>tab==='all'||row.category===tab).filter(row=>ctx.get(row.ref)?.visibility==='public');
 return `<section class="public-surface pub-trends"><header class="pub-trends-header"><h1>${esc(ctx,doc.title)}</h1>${demoLabel(doc,ctx)}</header><div class="pub-search-box">${icon('search')}<input type="search" data-public-search data-record="${esc(ctx,doc.id)}" value="${esc(ctx,ctx.ui.query??'')}" placeholder="${esc(ctx,m.searchPlaceholder)}" aria-label="搜索公开页面"></div>${query?`<div class="pub-search-summary">找到 ${results.length} 条公开内容</div><div class="pub-search-results">${results.map(d=>`<article>${ref(ctx,d.id,d.title,'pub-search-result-title')}<p>${esc(ctx,d.meta?.summary??d.text??'')}</p><small><span>${esc(ctx,kindNames[d.kind]??'内容')}</span>${stamp(ctx,d.at,true)}</small></article>`).join('')||'<p class="pub-empty">没有匹配的公开内容</p>'}</div>`:`${tabs(doc,ctx,list(m.tabs),tab,'pub-trends-tabs')}<div class="pub-trend-caption"><strong>${esc(ctx,m.rankingLabel)}</strong><small>${esc(ctx,m.updatedLabel)} ${stamp(ctx,doc.at)}</small></div><ol class="pub-trend-list">${rows.map(row=>`<li><span class="pub-trend-rank${Number(row.rank)<=3?' is-top':''}">${esc(ctx,row.rank)}</span><div>${ref(ctx,row.ref,row.title,'pub-trend-title')}${own(row.metrics,'heat')?`<small>${metric(ctx,row,'heat','')}</small>`:''}</div>${row.badge?`<span class="pub-trend-badge${row.badge==='新'?' is-new':''}">${esc(ctx,row.badge)}</span>`:''}</li>`).join('')}</ol><p class="pub-trends-note">${esc(ctx,doc.text)}</p>`}</section>`;
}

function poll(doc,ctx){
 const p=doc.meta?.poll;if(!p)return '';const selected=p.selectedOption??ctx.ui.vote??null,options=list(p.options),closed=p.status!=='open',knownTotal=Number.isFinite(p.totalVotes)&&p.totalVotes>0;
 return `<section class="pub-fan-poll"><div class="pub-fan-poll-heading"><span>投票</span>${p.endsAt?`<small>截止 ${stamp(ctx,p.endsAt,true)}</small>`:''}</div><h2>${esc(ctx,p.title)}</h2>${p.description?`<p>${esc(ctx,p.description)}</p>`:''}<div class="pub-poll-options">${options.map(option=>{const percent=selected&&knownTotal&&Number.isFinite(option.votes)?Math.round(option.votes/p.totalVotes*100):null;return `<button data-action="vote" data-record="${esc(ctx,doc.id)}" data-value="${esc(ctx,option.id)}" aria-pressed="${selected===option.id}" ${selected||closed?'disabled':''}><span class="pub-poll-choice">${selected===option.id?icon('check'):'<i></i>'}</span><span>${esc(ctx,option.label)}</span>${selected&&own(option,'votes')?`<small>${esc(ctx,option.votes)} 票${percent!==null?` · ${percent}%`:''}</small>`:''}${percent!==null?`<b class="pub-poll-bar" style="--vote-share:${percent}%" aria-hidden="true"></b>`:''}</button>`;}).join('')}</div><footer>${selected?'<span>已投票</span>':closed?'<span>投票已结束</span>':p.multiple===false?'<span>单选</span>':p.multiple===true?'<span>多选</span>':''}${own(p,'totalVotes')?`<span>${esc(ctx,p.totalVotes)} 票</span>`:''}</footer>${p.note?`<small class="pub-poll-note">${esc(ctx,p.note)}</small>`:''}</section>`;
}
function renderFanclub(doc,ctx){
 const m=doc.meta??{},tab=ctx.ui.tab??'all',items=list(doc.items).filter(row=>tab==='support'?row.kind==='support':row.kind==='notice');
 return `<section class="public-surface pub-fanclub"><header class="pub-fan-header"><div class="pub-fan-logo" aria-hidden="true">${icon('people')}</div><div><h1>${esc(ctx,doc.title)}</h1><small>${esc(ctx,m.siteTag)}</small></div>${button(ctx,'join',doc.id,ctx.ui.joined?'已加入':'加入')}</header><div class="pub-fan-banner"><span class="pub-fan-flower" aria-hidden="true"></span><div>${demoLabel(doc,ctx)}<h2>${esc(ctx,m.bannerTitle)}</h2><p>${esc(ctx,doc.text)}</p></div></div><div class="pub-fan-info"><span>${esc(ctx,m.siteNotice)}</span>${own(doc.metrics,'members')?`<small>${metric(ctx,doc,'members','')} 位成员</small>`:''}</div>${tabs(doc,ctx,list(m.tabs),tab,'pub-fan-tabs')}<div class="pub-fan-content">${tab==='poll'?poll(doc,ctx):`${items.map(item=>`<article class="pub-fan-entry${item.kind==='support'?' is-support':''}"><div class="pub-fan-entry-meta">${item.label?`<span>${esc(ctx,item.label)}</span>`:''}<time>${stamp(ctx,item.at,true)}</time>${item.status?`<b>${esc(ctx,item.status)}</b>`:''}</div><h2>${esc(ctx,item.title)}</h2><p>${esc(ctx,item.text)}</p>${item.deadline?`<div class="pub-fan-deadline">${icon('clock')}截止 ${stamp(ctx,item.deadline,true)}</div>`:''}<div class="pub-fan-entry-links">${item.ref?ref(ctx,item.ref,'查看原页面'):''}${item.reminderLabel?button(ctx,'remind',doc.id,esc(ctx,item.reminderLabel),item.id):''}</div></article>`).join('')}${tab==='all'?poll(doc,ctx):''}`}</div></section>`;
}

export function renderPublic(doc,ctx){
 if(!doc||!PUBLIC_KINDS.includes(doc.kind))throw Error('Unsupported public document kind: '+String(doc?.kind));
 return ({weibo:renderWeibo,artist:renderArtist,notice:renderNotice,news:renderNews,trends:renderTrends,fanclub:renderFanclub})[doc.kind](doc,ctx);
}
