/**
 * Media pages for the independent social-suite preview.
 * All artists, works, dates, counts, prices and event policies below are DEMO DATA.
 * Structural references checked 2026-11-09; no native-app/Android verification:
 * 1. https://support.google.com/youtube/answer/9826490?hl=en
 *    Archived live-chat replay follows the recording; later comments are separate.
 * 2. https://support.spotify.com/us/artists/article/understanding-spotify-charts/
 *    Chart-eligible streams differ from total streams; chart period and timezone matter.
 * 3. https://help.ticketmaster.com/hc/en-us/articles/9784866185745-What-happens-if-my-event-is-postponed
 *    Postponed is a distinct event state; refund options follow a specific organizer notice.
 * No real ticket price, refund deadline, performer image, or audio is copied.
 * Controls are delegated to the host. This module performs no network or state writes.
 */

export const MEDIA_KINDS = ['live', 'video', 'music', 'schedule', 'ticket'];

export const mediaAccounts = {
  'media-glanz-channel': {name:'Glanz 影像频道',handle:'@glanz.stage',platform:'video',personId:'glanz',role:'publisher'},
  'media-orange-events': {name:'橘园文化 · 演出事务',handle:'@orangerie.events',platform:'ticket',personId:'orangerie',role:'organizer'},
  'media-rivr': {name:'RIVR Music',handle:'@rivr.charts',platform:'music',role:'platform'},
  'media-fan-film': {name:'一卷过期胶片',handle:'@outdated.film',platform:'video',role:'audience'},
  'media-fan-dinner': {name:'晚饭还没吃',handle:'@not.dinner',platform:'video',role:'audience'},
  'media-fan-orange': {name:'橙子汽水',handle:'@orange.soda',platform:'video',role:'audience'},
  'media-fan-angle': {name:'这个机位别切',handle:'@hold.the.angle',platform:'video',role:'audience'},
};

const ART = {
  stage:'./assets/media-stage.svg',
  afterlight:'./assets/media-afterlight.svg',
  roomtone:'./assets/media-roomtone.svg',
  bluehour:'./assets/media-bluehour.svg',
  ticket:'./assets/media-ticket.svg',
};

export const mediaDocuments = [
  {
    id:'live-encore',kind:'live',title:'Glanz · 安可舞台完整回放',
    at:'2026-11-09T20:00:00+09:00',visibility:'public',author:'media-glanz-channel',
    text:'从安可开场到谢幕的连续机位。右侧聊天随回放时间显示，视频结束后的评论收录在视频页。',
    metrics:{replayViews:18420,like:1268},
    refs:['video-encore','wb-encore','music-afterlight','schedule-main'],
    meta:{
      demo:true,platformLabel:'STAGE / LIVE',status:'replay',statusLabel:'直播回放',
      durationSeconds:210,poster:'stage',posterAlt:'蓝色灯光与舞台地面的原创抽象演示画面',
      playbackNotice:'分镜与聊天回放演示 · 暂无真实音视频',
      chatLabel:'当时的聊天',chatMode:'公开聊天回放',timezone:'Asia/Seoul',
      audienceMetricLabel:'回放观看次数',chatWindowSeconds:35,
      chapters:[
        {seconds:0,label:'安可开场'}, {seconds:42,label:'同麦和声'},
        {seconds:94,label:'致谢'}, {seconds:158,label:'一起谢幕'}
      ],
      beats:[
        {seconds:0,title:'安可开场',caption:'舞台灯光缓慢亮起'},
        {seconds:42,title:'同麦和声',caption:'镜头保持全景'},
        {seconds:94,title:'致谢',caption:'掌声与返场灯光'},
        {seconds:158,title:'一起谢幕',caption:'演出结束前的最后一个机位'}
      ],
      related:[
        {id:'video-encore',label:'视频详情与回看评论'},
        {id:'wb-encore',label:'原舞台微博'},
        {id:'music-afterlight',label:'本次演示作品'}
      ]
    },
    items:[
      {id:'live-chat-01',seconds:0,author:'media-fan-angle',text:'来了'},
      {id:'live-chat-02',seconds:4,author:'media-fan-orange',text:'今天有全景'},
      {id:'live-chat-03',seconds:11,author:'media-fan-dinner',text:'刚点进来，还没结束吧'},
      {id:'live-chat-04',seconds:23,author:'media-fan-film',text:'还在，安可刚开始'},
      {id:'live-chat-05',seconds:43,author:'media-fan-angle',text:'别切别切'},
      {id:'live-chat-06',seconds:46,author:'media-fan-orange',text:'两个共用一支麦了'},
      {id:'live-chat-07',seconds:51,author:'media-fan-film',text:'和声这句听到了'},
      {id:'live-chat-08',seconds:66,author:'media-fan-dinner',text:'我刚才卡住了……'},
      {id:'live-chat-09',seconds:95,author:'media-fan-angle',text:'奖杯还举着'},
      {id:'live-chat-10',seconds:112,author:'media-fan-orange',text:'后排也在招手'},
      {id:'live-chat-11',seconds:159,author:'media-fan-film',text:'这段留住了'},
      {id:'live-chat-12',seconds:183,author:'media-fan-dinner',text:'终于看到完整谢幕'},
      {id:'live-chat-13',seconds:204,author:'media-fan-orange',text:'晚安'}
    ]
  },
  {
    id:'video-encore',kind:'video',title:'安可同麦与谢幕｜连续机位',
    at:'2026-11-09T20:06:00+09:00',visibility:'public',author:'media-glanz-channel',
    text:'保留开场、同麦和声及谢幕三个时间段。时间点指向本视频，不与原直播的时间混用。',
    metrics:{views:12640,like:932,comments:4,bookmarks:176},
    refs:['live-encore','music-afterlight','wb-encore','notice-audio'],
    meta:{
      demo:true,platformLabel:'STAGE / VIDEO',format:'video',durationSeconds:126,
      poster:'stage',posterAlt:'蓝色聚光灯下的抽象舞台画面',
      playbackNotice:'时间轴演示 · 暂无真实视频文件',
      category:'舞台现场',sourceLabel:'Glanz 影像频道发布',
      chapters:[{seconds:0,label:'开场'},{seconds:27,label:'同麦和声'},{seconds:83,label:'谢幕'}],
      beats:[{seconds:0,title:'安可开场',caption:'连续机位节选'},{seconds:27,title:'同麦和声',caption:'未切换机位'},{seconds:83,title:'谢幕',caption:'完整保留谢幕段落'}],
      sourceLinks:[
        {id:'live-encore',label:'原直播回放',description:'原始时间轴 00:00—03:30'},
        {id:'wb-encore',label:'舞台原帖',description:'发布账号与转发讨论'},
        {id:'notice-audio',label:'音源说明',description:'查看相关公司公告'}
      ],
      credits:[{label:'发布账号',value:'Glanz 影像频道'},{label:'素材类型',value:'原创分镜演示'},{label:'剪辑范围',value:'完整回放的章节节选'}]
    },
    items:[
      {id:'media-comment-01',author:'media-fan-angle',at:'2026-11-09T20:14:00+09:00',seconds:27,text:'这里不用再切近景了，全景正好。',metrics:{like:84}},
      {id:'media-comment-02',author:'media-fan-dinner',at:'2026-11-09T20:15:00+09:00',seconds:83,text:'我在直播间卡掉的就是这段。',metrics:{like:21}},
      {id:'media-comment-03',author:'media-fan-orange',at:'2026-11-09T20:16:00+09:00',text:'原直播链接在简介里，前面还有一小段。',metrics:{like:8}},
      {id:'media-comment-04',author:'media-fan-film',at:'2026-11-09T20:17:00+09:00',parentId:'media-comment-02',text:'全景回放已经能看了。'}
    ]
  },
  {
    id:'media-short-encore',kind:'video',title:'同麦那一句',
    at:'2026-11-09T20:21:00+09:00',visibility:'public',author:'media-glanz-channel',
    text:'取自连续机位的 27—45 秒。短片没有包含致谢与谢幕，完整上下文见来源。',
    metrics:{views:4820,like:416,comments:2},
    refs:['video-encore','live-encore'],
    meta:{
      demo:true,platformLabel:'STAGE / SHORTS',format:'short',durationSeconds:18,
      poster:'stage',posterAlt:'蓝色舞台灯光的竖幅裁切演示',
      playbackNotice:'短视频时间轴演示 · 暂无真实视频文件',
      category:'舞台节选',sourceLabel:'Glanz 影像频道发布',
      chapters:[{seconds:0,label:'同麦片段'},{seconds:12,label:'片段结尾'}],
      beats:[{seconds:0,title:'同麦那一句',caption:'来源片段 00:27—00:45'},{seconds:12,title:'片段结尾',caption:'完整上下文见原视频'}],
      sourceLinks:[{id:'video-encore',label:'查看完整视频',description:'此短片来自原视频 00:27—00:45'}],
      credits:[{label:'节选范围',value:'18 秒'},{label:'画幅',value:'竖幅裁切演示'}]
    },
    items:[
      {id:'media-short-comment-01',author:'media-fan-orange',at:'2026-11-09T20:24:00+09:00',seconds:3,text:'先看下面的完整版，前面还有。',metrics:{like:19}},
      {id:'media-short-comment-02',author:'media-fan-angle',at:'2026-11-09T20:25:00+09:00',text:'这个裁切只剩半个舞台了。'}
    ]
  },
  {
    id:'music-afterlight',kind:'music',title:'AFTERLIGHT / 余光',
    at:'2026-11-09T18:00:00+09:00',visibility:'public',author:'media-rivr',
    text:'灯光退下去之后，房间仍保留一点亮。三首演示曲目组成的单曲专辑。',
    refs:['media-song-afterlight','media-song-roomtone','media-song-bluehour','media-chart-daily','video-encore','artist-lotis'],
    meta:{
      demo:true,view:'album',platformLabel:'RIVR MUSIC',artist:'Glanz',releaseType:'Single Album',
      cover:'afterlight',coverAlt:'暖橙光束与奶白纸面组成的原创抽象封面',
      releaseDate:'2026-11-09',label:'橘园文化',formatLabel:'数字专辑',
      playbackNotice:'曲目页演示，暂不含音源',
      credits:[{label:'表演',value:'Glanz'},{label:'发行',value:'橘园文化'},{label:'作品状态',value:'本次界面演示候选，未写入正式设定'}],
      related:[{id:'media-chart-daily',label:'查看榜单与统计口径'},{id:'video-encore',label:'相关舞台视频'}]
    },
    items:[
      {id:'media-song-afterlight',number:1,title:'AFTERLIGHT',durationSeconds:196,tag:'主打'},
      {id:'media-song-roomtone',number:2,title:'Room Tone',durationSeconds:171},
      {id:'media-song-bluehour',number:3,title:'Half-Past Blue',durationSeconds:204}
    ]
  },
  {
    id:'media-song-afterlight',kind:'music',title:'AFTERLIGHT',
    at:'2026-11-09T18:00:00+09:00',visibility:'public',author:'media-rivr',
    text:'主打曲目资料与独立统计。',
    metrics:{totalStreams:12460},
    refs:['music-afterlight','media-chart-daily','video-encore'],
    meta:{demo:true,view:'song',platformLabel:'RIVR MUSIC',artist:'Glanz',albumId:'music-afterlight',albumTitle:'AFTERLIGHT / 余光',cover:'afterlight',coverAlt:'暖橙光束与奶白纸面的原创封面',durationSeconds:196,releaseDate:'2026-11-09',playbackNotice:'曲目页演示，暂不含音源',statsAsOf:'2026-11-09T12:00:00Z',statsTimezone:'UTC',credits:[{label:'表演',value:'Glanz'},{label:'发行',value:'橘园文化'},{label:'音源状态',value:'未提供'}]},
    items:[]
  },
  {
    id:'media-song-roomtone',kind:'music',title:'Room Tone',
    at:'2026-11-09T18:00:00+09:00',visibility:'public',author:'media-rivr',
    text:'同一张专辑中的第二首演示曲目。',
    refs:['music-afterlight'],
    meta:{demo:true,view:'song',platformLabel:'RIVR MUSIC',artist:'Glanz',albumId:'music-afterlight',albumTitle:'AFTERLIGHT / 余光',cover:'roomtone',coverAlt:'灰绿矩形与柔和同心线的原创抽象封面',durationSeconds:171,releaseDate:'2026-11-09',playbackNotice:'曲目页演示，暂不含音源',credits:[{label:'表演',value:'Glanz'},{label:'发行',value:'橘园文化'},{label:'音源状态',value:'未提供'}]},
    items:[]
  },
  {
    id:'media-song-bluehour',kind:'music',title:'Half-Past Blue',
    at:'2026-11-09T18:00:00+09:00',visibility:'public',author:'media-rivr',
    text:'同一张专辑中的第三首演示曲目。',
    refs:['music-afterlight'],
    meta:{demo:true,view:'song',platformLabel:'RIVR MUSIC',artist:'Glanz',albumId:'music-afterlight',albumTitle:'AFTERLIGHT / 余光',cover:'bluehour',coverAlt:'蓝紫色弧形光带与银白圆点的原创抽象封面',durationSeconds:204,releaseDate:'2026-11-09',playbackNotice:'曲目页演示，暂不含音源',credits:[{label:'表演',value:'Glanz'},{label:'发行',value:'橘园文化'},{label:'音源状态',value:'未提供'}]},
    items:[]
  },
  {
    id:'media-chart-daily',kind:'music',title:'榜单与数据',
    at:'2026-11-10T10:00:00Z',visibility:'public',author:'media-rivr',
    text:'两张榜单使用各自的统计窗口与单位，不合成“总热度”。以下为演示榜单节选。',
    refs:['music-afterlight','media-song-afterlight'],
    meta:{
      demo:true,view:'chart',platformLabel:'RIVR CHARTS',
      charts:[
        {id:'streams',label:'歌曲日榜',title:'歌曲日榜 · 全球',metricLabel:'计榜有效播放',unit:'次',scope:'RIVR Music 全球',period:'2026-11-09 00:00—23:59',timezone:'UTC',timezoneId:'UTC',asOf:'2026-11-10T10:00:00Z',note:'本榜按演示平台的有效播放口径排序；与曲目页累计总播放分开记录。展示第 6—8 名节选。',
          rows:[{rank:6,previousRank:8,title:'Off the Record',artist:'PROTOCOL',value:10380},{rank:7,previousRank:null,title:'AFTERLIGHT',artist:'Glanz',value:9720,docId:'media-song-afterlight'},{rank:8,previousRank:6,title:'Late Fee',artist:'OVERDRAFT',value:9140}]},
        {id:'sales',label:'专辑周榜',title:'实体专辑周榜 · 指定门店',metricLabel:'登记净销量',unit:'张',scope:'演示合作门店',period:'2026-11-09—2026-11-15',timezone:'Asia/Seoul · UTC+09:00',timezoneId:'Asia/Seoul',asOf:'2026-11-16T10:00:00+09:00',note:'只统计该榜登记范围内的实体净销量，不代表全渠道销量，也不与播放次数相加。展示第 2—4 名节选。',
          rows:[{rank:2,previousRank:2,title:'Off the Record',artist:'PROTOCOL',value:2160},{rank:3,previousRank:null,title:'AFTERLIGHT / 余光',artist:'Glanz',value:1840,docId:'music-afterlight'},{rank:4,previousRank:3,title:'Late Fee',artist:'OVERDRAFT',value:1685}]}
      ]
    },items:[]
  },
  {
    id:'schedule-main',kind:'schedule',title:'Glanz 公开行程',
    at:'2026-11-09T21:00:00+09:00',visibility:'public',author:'media-orange-events',
    text:'本页只收录已公开的演出与上线活动。时间以活动所在地为准。',
    refs:['live-encore','music-afterlight','ticket-showcase','media-ticket-postponed'],
    meta:{
      demo:true,platformLabel:'ORANGERIE / SCHEDULE',month:'2026-11',today:'2026-11-09',
      timezone:'Asia/Seoul',timezoneLabel:'韩国标准时间 KST · UTC+09:00',
      secondaryTimezone:'Asia/Shanghai',secondaryTimezoneLabel:'北京时间',
      calendarLabel:'2026 年 11 月',visibilityLabel:'公开活动',updatedLabel:'演出事务发布'
    },
    items:[
      {id:'media-event-live',title:'安可舞台直播',startAt:'2026-11-09T20:02:00+09:00',endAt:'2026-11-09T20:05:30+09:00',visibility:'public',status:'ended',statusLabel:'已结束',category:'线上直播',location:'STAGE 直播频道',docId:'live-encore'},
      {id:'media-event-album',title:'AFTERLIGHT 专辑听歌会',startAt:'2026-11-14T19:00:00+09:00',endAt:'2026-11-14T19:40:00+09:00',visibility:'public',status:'scheduled',statusLabel:'已公布',category:'线上活动',location:'RIVR Music 演示活动页',docId:'music-afterlight'},
      {id:'media-event-showcase',title:'AFTERLIGHT Showcase',startAt:'2026-11-21T19:00:00+09:00',endAt:'2026-11-21T20:30:00+09:00',visibility:'public',status:'scheduled',statusLabel:'已公布',category:'现场演出',location:'ORANGE HALL · 首尔（虚构场馆）',docId:'ticket-showcase'},
      {id:'media-event-postponed',title:'AFTERLIGHT Showcase · 加场',originalStartAt:'2026-11-28T18:00:00+09:00',startAt:null,visibility:'public',status:'postponed',statusLabel:'延期 · 新日期待定',category:'现场演出',location:'ORANGE HALL · 首尔（虚构场馆）',docId:'media-ticket-postponed'}
    ]
  },
  {
    id:'ticket-showcase',kind:'ticket',title:'Glanz · AFTERLIGHT Showcase',
    at:'2026-11-09T20:30:00+09:00',visibility:'public',author:'media-orange-events',
    text:'公开演出场次与票档演示。所有价格、场馆、余票状态均为虚构示例。',
    refs:['schedule-main','music-afterlight','media-ticket-postponed'],
    meta:{
      demo:true,view:'event',platformLabel:'ORANGERIE TICKETS',cover:'ticket',coverAlt:'橙白光圈与舞台线条组成的原创演出票面',
      saleStatus:'onSale',saleStatusLabel:'在售',
      startAt:'2026-11-21T19:00:00+09:00',doorsAt:'2026-11-21T18:00:00+09:00',
      timezone:'Asia/Seoul',timezoneLabel:'KST · UTC+09:00',
      venue:'ORANGE HALL · 首尔',venueNote:'虚构场馆',organizer:'橘园文化',
      currency:'KRW',priceNote:'演示价格 · 含本示例列明的费用',bookingNotice:'演示预约仅在本地标记意向，不生成订单、不占真实票额、不扣款。',
      rules:[{label:'场次',value:'2026-11-21 19:00（KST）'},{label:'入场',value:'18:00 开始（KST）'},{label:'座席',value:'各票档为分区示意，当前未提供真实座位图'},{label:'退改',value:'此场示例规则：预约可在本地取消；真实交易与退款未接入'}],
      notices:[{id:'media-ticket-postponed',label:'查看另一个延期场次',description:'延期状态与退款公告的独立示例'}]
    },
    items:[
      {id:'media-tier-a',name:'A 区',description:'舞台前方区域',price:88000,status:'onSale',statusLabel:'在售'},
      {id:'media-tier-b',name:'B 区',description:'侧面座席区域',price:66000,status:'soldOut',statusLabel:'售罄'},
      {id:'media-tier-c',name:'看台区',description:'后方阶梯座席',price:55000,status:'onSale',statusLabel:'在售'}
    ]
  },
  {
    id:'media-ticket-postponed',kind:'ticket',title:'AFTERLIGHT Showcase · 加场',
    at:'2026-11-09T21:00:00+09:00',visibility:'public',author:'media-orange-events',
    text:'本场次延期，新日期尚未确定。原日期不作为当前可购场次；预约入口已暂停。',
    refs:['media-ticket-refund','schedule-main','ticket-showcase'],
    meta:{
      demo:true,view:'event',platformLabel:'ORANGERIE TICKETS',cover:'ticket',coverAlt:'橙白光圈与舞台线条组成的原创演出票面',
      saleStatus:'postponed',saleStatusLabel:'延期',
      originalStartAt:'2026-11-28T18:00:00+09:00',startAt:null,
      timezone:'Asia/Seoul',timezoneLabel:'KST · UTC+09:00',
      venue:'ORANGE HALL · 首尔',venueNote:'虚构场馆',organizer:'橘园文化',currency:'KRW',
      priceNote:'原票档仅供查询，当前暂停预约',bookingNotice:'演示页面无真实订单。具体延期安排与退款入口状态见本场公告。',
      rules:[{label:'原日期',value:'2026-11-28 18:00（KST）'},{label:'新日期',value:'待定'},{label:'预约状态',value:'暂停'},{label:'退款状态',value:'本示例已发布单独公告；并非所有延期都自动退款'}],
      notices:[{id:'media-ticket-refund',label:'延期及退款安排',description:'主办方公告 · 查看适用场次与窗口'}]
    },
    items:[
      {id:'media-postponed-tier-a',name:'A 区',description:'原票档',price:88000,status:'paused',statusLabel:'暂停预约'},
      {id:'media-postponed-tier-b',name:'B 区',description:'原票档',price:66000,status:'paused',statusLabel:'暂停预约'}
    ]
  },
  {
    id:'media-ticket-refund',kind:'ticket',title:'加场延期及退款安排',
    at:'2026-11-09T21:00:00+09:00',visibility:'public',author:'media-orange-events',
    text:'原定 11 月 28 日的加场延期，新日期待定。此公告仅适用于该加场，不改变 11 月 21 日场次。',
    refs:['media-ticket-postponed','ticket-showcase','schedule-main'],
    meta:{
      demo:true,view:'notice',platformLabel:'ORANGERIE TICKETS',noticeType:'场次变更公告',
      version:'演示第 1 版',appliesTo:'media-ticket-postponed',
      effectiveAt:'2026-11-09T21:00:00+09:00',timezone:'Asia/Seoul',
      sections:[
        {title:'演出安排',text:'加场新日期尚未公布，原场次暂停预约。后续安排在本场票务页更新。'},
        {title:'退款安排（演示规则）',text:'本示例设置申请窗口为 11 月 10 日 10:00 至 11 月 17 日 18:00（KST）。这是本次虚构活动的规则，不代表任何真实票务平台政策。'},
        {title:'预览中的操作范围',text:'当前没有真实订单和支付记录，因此不提供真实退款提交按钮。可以查看场次状态或在本地收藏公告。'}
      ]
    },items:[]
  }
];

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('zh-CN').format(value) : null;
}
function seconds(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0,Math.floor(value)) : 0;
}
function clock(value) {
  const n=seconds(value); return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
}
function zoned(at,zone,includeDate=true) {
  if(!at) return null;
  const d=new Date(at); if(Number.isNaN(d.valueOf())) return null;
  try { return new Intl.DateTimeFormat('zh-CN',{timeZone:zone||'UTC',...(includeDate?{month:'2-digit',day:'2-digit'}:{}),hour:'2-digit',minute:'2-digit',hour12:false}).format(d); } catch { return null; }
}
function dateKey(at,zone) {
  if(!at) return null; const d=new Date(at); if(Number.isNaN(d.valueOf()))return null;
  try { const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const get=t=>p.find(x=>x.type===t)?.value; return get('year')+'-'+get('month')+'-'+get('day'); } catch {return null;}
}
function kit(ctx) {
  const E=value=>ctx.esc(value??'');
  const h=(tag,attrs={},body='')=>'<'+tag+Object.entries(attrs).filter(([,v])=>v!==false&&v!==null&&v!==undefined).map(([k,v])=>' '+k+(v===true?'':'="'+E(v)+'"')).join('')+'>'+body+'</'+tag+'>';
  const t=(tag,text,cls)=>h(tag,cls?{class:cls}:{},E(text));
  const action=(label,actionName,id,value,cls='',disabled=false)=>{const flag={like:'liked',follow:'followed',bookmark:'bookmarked'}[actionName];const selected=flag?ctx.ui?.[flag]===true:['remind','subscribe'].includes(actionName)?ctx.ui?.reminders?.[value||id]===true:actionName==='join'?ctx.ui?.reservations?.[value]===true:null;const words={like:'已赞',follow:'已关注',bookmark:'已收藏',remind:'已设本地提醒',subscribe:'已设本地提醒',join:'已设预约意向 · 取消'};return h('button',{type:'button',class:cls+(selected?' is-selected':''),'data-action':actionName,'data-record':id,'data-value':value,...(selected!==null?{'aria-pressed':String(selected)}:{}),disabled},E(selected?words[actionName]:label));};
  const link=(id,label,cls='sm-link')=>id&&ctx.get(id)?ctx.link(id,label,cls):t('span',label,cls+' sm-unavailable');
  const picture=(key,alt,cls='')=>ART[key]?'<img class="'+E(cls)+'" src="'+E(ART[key])+'" alt="'+E(alt||'原创封面')+'" loading="lazy" decoding="async">':t('div','未提供封面','sm-cover-missing '+cls);
  const who=id=>ctx.account(id)?.name||'未提供署名';
  const owner=(doc,extra='')=>h('div',{class:'sm-owner'},(doc.author?ctx.avatar(doc.author):'')+h('div',{},t('strong',who(doc.author))+t('small',extra||ctx.time(doc.at,true))));
  const badge=(label,cls='')=>t('span',label,'sm-badge '+cls);
  const metric=(record,key,label)=>number(record?.metrics?.[key])===null?'':h('span',{class:'sm-metric'},t('strong',number(record.metrics[key]))+t('small',label));
  const header=(doc,section)=>h('header',{class:'sm-header'},h('div',{},t('span',doc.meta?.platformLabel||section,'sm-brand')+t('span',section,'sm-section-label'))+badge('演示内容','sm-demo'));
  const tabs=(doc,entries,current)=>h('nav',{class:'sm-tabs','aria-label':'页面内容'},entries.map(([id,label])=>h('button',{type:'button','data-action':'tab','data-record':doc.id,'data-value':id,'aria-pressed':String(current===id)},E(label))).join(''));
  const related=(entries,title='相关页面')=>!entries?.length?'':h('section',{class:'sm-related'},t('h2',title)+entries.map(row=>h('div',{class:'sm-related-row'},link(row.id,row.label)+(row.description?t('small',row.description):''))).join(''));
  return {E,h,t,action,link,picture,who,owner,badge,metric,header,tabs,related};
}
function cursorFor(doc,ctx) {
  const duration=seconds(doc.meta?.durationSeconds);
  return {duration,cursor:Math.min(duration,seconds(ctx.ui?.cursorSeconds)),playing:Boolean(ctx.ui?.playing)};
}
function player(doc,ctx,k,{live=false}={}) {
  const {E,h,t,action,picture,badge}=k,m=doc.meta||{},p=cursorFor(doc,ctx);
  const beats=Array.isArray(m.beats)?m.beats:[],beat=beats.filter(x=>seconds(x.seconds)<=p.cursor).at(-1);
  const recent=live?(doc.items||[]).filter(x=>seconds(x.seconds)<=p.cursor&&seconds(x.seconds)>=p.cursor-(m.chatWindowSeconds||35)).slice(-3):[];
  const overlay=recent.map((x,i)=>t('div',x.text,'sm-danmaku sm-danmaku-'+i)).join('');
  const bar='<input class="sm-seek" type="range" min="0" max="'+E(p.duration)+'" step="1" value="'+E(p.cursor)+'" data-media-seek="'+E(doc.id)+'" aria-label="演示回放进度，单位秒" aria-valuetext="'+E(clock(p.cursor)+' / '+clock(p.duration))+'">';
  return h('section',{class:'sm-player'+(m.format==='short'?' sm-player-short':''),'aria-label':live?'直播回放演示':'视频回放演示'},
    h('div',{class:'sm-player-image'},picture(m.poster,m.posterAlt)+h('div',{class:'sm-player-top'},badge(live?(m.statusLabel||'回放'):'视频','sm-on-dark')+t('span',m.playbackNotice,'sm-playback-notice'))+h('div',{class:'sm-danmaku-layer','aria-hidden':'true'},overlay)+h('div',{class:'sm-scene'},t('strong',beat?.title||doc.title)+t('span',beat?.caption||'')))+
    h('div',{class:'sm-player-controls'},action(p.playing?'暂停':'播放演示','play',doc.id,undefined,'sm-play-button')+t('span',clock(p.cursor)+' / '+clock(p.duration),'sm-player-clock')+bar)+
    h('div',{class:'sm-chapters'},(m.chapters||[]).map(c=>action(clock(c.seconds)+' '+c.label,'play',doc.id,'seek:'+seconds(c.seconds),'sm-chapter'+(p.cursor>=seconds(c.seconds)?' sm-reached':''))).join(''))
  );
}
function renderLive(doc,ctx,k) {
  const {h,t,badge,owner,metric,action,related}=k,p=cursorFor(doc,ctx),m=doc.meta||{};
  const seen=(doc.items||[]).filter(x=>seconds(x.seconds)<=p.cursor).slice(-10);
  const chat=h('section',{class:'sm-live-chat'},h('div',{class:'sm-chat-heading'},t('h2',m.chatLabel||'聊天回放')+badge(m.chatMode||'回放'))+h('div',{class:'sm-chat-rows','aria-label':'当前回放时间之前的聊天'},seen.map(x=>h('div',{class:'sm-chat-row'},t('time',clock(x.seconds))+t('strong',k.who(x.author))+t('span',x.text))).join('')||t('p','这个时间点暂无已收录的聊天','sm-empty'))+t('p','聊天只随回放进度显示；这里不向真实直播间发送消息。','sm-footnote'));
  return h('article',{class:'social-media sm-live'},k.header(doc,'直播')+player(doc,ctx,k,{live:true})+h('div',{class:'sm-page-body'},t('h1',doc.title)+h('div',{class:'sm-metrics'},metric(doc,'replayViews',m.audienceMetricLabel||'回放观看次数')+metric(doc,'like','赞'))+owner(doc)+t('p',doc.text,'sm-description')+h('div',{class:'sm-action-row'},action('关注频道','follow',doc.id)+action('收藏回放','bookmark',doc.id))+chat+related(m.related)));
}
function videoComments(doc,ctx,k) {
  const {h,t,action}=k,items=doc.items||[],top=items.filter(x=>!x.parentId);
  const one=(x,nested=false)=>h('article',{class:'sm-video-comment'+(nested?' sm-nested-comment':'')},ctx.avatar(x.author)+h('div',{class:'sm-comment-body'},h('div',{class:'sm-comment-author'},t('strong',k.who(x.author))+t('time',ctx.time(x.at)))+h('p',{},(typeof x.seconds==='number'?action(clock(x.seconds),'play',doc.id,'seek:'+seconds(x.seconds),'sm-time-link'):'')+k.E(x.text))+(number(x.metrics?.like)!==null?t('small',number(x.metrics.like)+' 赞','sm-comment-count'):'')+(!nested?items.filter(y=>y.parentId===x.id).map(y=>one(y,true)).join(''):'')));
  return h('section',{class:'sm-video-comments'},t('h2','回看评论')+top.map(x=>one(x)).join('')+t('p','评论发表时间与视频内时间点分别显示。','sm-footnote'));
}
function renderVideo(doc,ctx,k) {
  const {h,t,tabs,owner,metric,action,related}=k,m=doc.meta||{},tab=['comments','source'].includes(ctx.ui?.tab)?ctx.ui.tab:'overview';
  const info=h('div',{class:'sm-video-info'},t('h1',doc.title)+h('div',{class:'sm-metrics'},metric(doc,'views','播放')+metric(doc,'like','赞')+metric(doc,'comments','条评论'))+owner(doc,m.sourceLabel||'')+h('div',{class:'sm-action-row'},action('赞','like',doc.id)+action('收藏','bookmark',doc.id)+k.link('media-short-encore','短视频节选'))+t('p',doc.text,'sm-description'));
  const source=related(m.sourceLinks,'来源与上下文')+h('dl',{class:'sm-facts'},(m.credits||[]).map(c=>h('div',{},t('dt',c.label)+t('dd',c.value))).join(''));
  return h('article',{class:'social-media sm-video'+(m.format==='short'?' sm-short':'')},k.header(doc,m.format==='short'?'短视频':'视频')+player(doc,ctx,k)+h('div',{class:'sm-page-body'},info+tabs(doc,[['overview','简介'],['comments','评论'],['source','来源']],tab)+(tab==='comments'?videoComments(doc,ctx,k):tab==='source'?source:related(m.sourceLinks?.slice(0,1),'完整来源')+videoComments(doc,ctx,k))));
}
function musicCredits(meta,k) {
  return k.h('dl',{class:'sm-facts'},(meta.credits||[]).map(c=>k.h('div',{},k.t('dt',c.label)+k.t('dd',c.value))).join(''));
}
function renderChart(doc,ctx,k) {
  const {h,t,tabs,link}=k,charts=doc.meta?.charts||[],selected=charts.find(x=>x.id===ctx.ui?.tab)||charts[0];
  if(!selected)return h('article',{class:'social-media sm-music'},k.header(doc,'榜单')+t('p','未提供榜单','sm-empty'));
  const rankChange=row=>row.previousRank===null?'新上榜':typeof row.previousRank!=='number'?'':row.previousRank===row.rank?'持平':row.previousRank>row.rank?'升 '+(row.previousRank-row.rank):'降 '+(row.rank-row.previousRank);
  return h('article',{class:'social-media sm-music sm-chart'},k.header(doc,'榜单')+h('div',{class:'sm-page-body'},t('h1',doc.title)+t('p',doc.text,'sm-description')+tabs(doc,charts.map(c=>[c.id,c.label]),selected.id)+h('section',{class:'sm-chart-intro'},t('span',selected.scope,'sm-eyebrow')+t('h2',selected.title)+t('p',selected.period+' · '+selected.timezone,'sm-period')+t('p',selected.metricLabel+' / '+selected.unit,'sm-metric-definition'))+h('div',{class:'sm-chart-table',role:'table','aria-label':selected.title},h('div',{class:'sm-chart-table-head',role:'row'},t('span','排名')+t('span','作品')+t('span',selected.metricLabel))+(selected.rows||[]).map(row=>h('div',{class:'sm-chart-table-row',role:'row'},h('div',{class:'sm-rank'},t('strong',row.rank)+t('small',rankChange(row)))+h('div',{class:'sm-chart-track'},row.docId?link(row.docId,row.title):t('strong',row.title))+h('div',{class:'sm-chart-value'},t('strong',number(row.value)??'未提供')+t('small',selected.unit))+t('small',row.artist,'sm-chart-artist'))).join(''))+t('p',selected.note,'sm-method-note')+t('p','该榜发布时间：'+(zoned(selected.asOf,selected.timezoneId)||'未提供')+' · '+selected.timezone,'sm-footnote')+k.related([{id:'music-afterlight',label:'专辑资料'},{id:'media-song-afterlight',label:'曲目累计播放口径'}])));
}
function renderMusic(doc,ctx,k) {
  const {h,t,picture,badge,tabs,link,related}=k,m=doc.meta||{};
  if(m.view==='chart')return renderChart(doc,ctx,k);
  const tab=['credits','related'].includes(ctx.ui?.tab)?ctx.ui.tab:'tracks',album=m.view==='album';
  const hero=h('section',{class:'sm-music-hero'},picture(m.cover,m.coverAlt,'sm-album-cover')+h('div',{class:'sm-album-info'},t('span',m.releaseType||(album?'专辑':'歌曲'),'sm-eyebrow')+t('h1',doc.title)+t('strong',m.artist,'sm-album-artist')+t('p',[m.releaseDate,m.formatLabel].filter(Boolean).join(' · '),'sm-release')+(m.label?t('small',m.label):'')));
  const tracks=album?h('section',{class:'sm-track-list'},(doc.items||[]).map(track=>h('div',{class:'sm-track'},t('span',track.number,'sm-track-number')+h('div',{},link(track.id,track.title)+(track.tag?badge(track.tag):''))+t('span',clock(track.durationSeconds),'sm-track-duration'))).join('')):h('section',{class:'sm-song-details'},t('p','时长 '+clock(m.durationSeconds))+link(m.albumId,m.albumTitle||'所属专辑')+(number(doc.metrics?.totalStreams)!==null?h('div',{class:'sm-song-stat'},t('strong',number(doc.metrics.totalStreams))+t('span','累计总播放')+t('small','截至 '+(zoned(m.statsAsOf,m.statsTimezone)||'未提供')+' · '+(m.statsTimezone||''))):'')+t('p','未提供的播放量不显示为零；歌曲累计播放与榜单有效播放分别记录。','sm-footnote'));
  return h('article',{class:'social-media sm-music'},k.header(doc,album?'专辑':'歌曲')+hero+h('div',{class:'sm-page-body'},t('p',doc.text,'sm-description')+h('div',{class:'sm-audio-unavailable'},t('span',m.playbackNotice||'未提供音源')+k.action('收藏作品','bookmark',doc.id))+tabs(doc,[['tracks',album?'曲目':'资料'],['credits','制作信息'],['related','相关']],tab)+(tab==='credits'?musicCredits(m,k):tab==='related'?related(m.related||[{id:m.albumId||'music-afterlight',label:'所属专辑'},{id:'media-chart-daily',label:'榜单与统计口径'}]):tracks)));
}
function renderSchedule(doc,ctx,k) {
  const {h,t,badge,action,link}=k,m=doc.meta||{},events=(doc.items||[]).filter(e=>e.visibility==='public');
  const parts=String(m.month||'').match(/^(\d{4})-(\d{2})$/),year=parts?Number(parts[1]):0,month=parts?Number(parts[2]):0,valid=year>=1900&&month>=1&&month<=12;
  const daySelection=String(ctx.ui?.tab||'').startsWith('day:')?String(ctx.ui.tab).slice(4):null;
  const dayFor=e=>dateKey(e.startAt||e.originalStartAt,m.timezone);
  let calendar='';
  if(valid){
    const first=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,days=new Date(Date.UTC(year,month,0)).getUTCDate(),cells=[];
    for(let i=0;i<first;i++)cells.push(h('span',{class:'sm-calendar-empty','aria-hidden':'true'},''));
    for(let d=1;d<=days;d++){
      const key=parts[1]+'-'+parts[2]+'-'+String(d).padStart(2,'0'),matches=events.filter(e=>dayFor(e)===key),current=key===m.today;
      cells.push(h('button',{type:'button',class:'sm-calendar-day'+(matches.length?' sm-has-event':'')+(current?' sm-today':'')+(daySelection===key?' sm-selected':''),'data-action':'tab','data-record':doc.id,'data-value':'day:'+key,'aria-label':key+'，'+(matches.length?matches.length+' 项公开活动':'无已收录活动'),'aria-pressed':String(daySelection===key)},t('span',d)+(matches.length?h('i',{'aria-hidden':'true',class:matches.some(e=>e.status==='postponed')?'sm-postponed-dot':''},''):'')));
    }
    calendar=h('section',{class:'sm-calendar','aria-label':m.calendarLabel||m.month},h('div',{class:'sm-calendar-title'},t('h2',m.calendarLabel||m.month)+action('全部行程','tab',doc.id,'all','sm-link'))+h('div',{class:'sm-calendar-weekdays'},['一','二','三','四','五','六','日'].map(d=>t('span',d)).join(''))+h('div',{class:'sm-calendar-grid'},cells.join('')));
  }
  const selected=daySelection?events.filter(e=>dayFor(e)===daySelection):events;
  const rows=selected.map(e=>{
    const current=zoned(e.startAt,m.timezone),original=zoned(e.originalStartAt,m.timezone),secondary=zoned(e.startAt,m.secondaryTimezone);
    return h('article',{class:'sm-event-row'+(e.status==='postponed'?' sm-event-postponed':'')},h('div',{class:'sm-event-date'},t('strong',(dayFor(e)||'').slice(5).replace('-',' / '))+t('small',e.category))+h('div',{class:'sm-event-body'},badge(e.statusLabel,'sm-status-'+e.status)+t('h3',e.title)+t('p',e.location,'sm-event-location')+(current?t('p',current+' · '+m.timezoneLabel,'sm-event-time'):t('p','新日期待定','sm-event-time'))+(original?t('p','原定 '+original+' · KST','sm-original-date'):'')+(secondary?t('small',m.secondaryTimezoneLabel+' '+secondary,'sm-event-secondary'):'')+h('div',{class:'sm-event-actions'},link(e.docId,e.status==='postponed'?'查看延期详情':'查看相关页面')+(e.startAt&&e.status!=='ended'?action('本地提醒','remind',doc.id,e.id,'sm-remind'):''))));
  }).join('');
  return h('article',{class:'social-media sm-schedule'},k.header(doc,'行程')+h('div',{class:'sm-page-body'},t('h1',doc.title)+t('p',doc.text,'sm-description')+h('div',{class:'sm-timezone'},badge(m.visibilityLabel||'公开活动')+t('span',m.timezoneLabel))+calendar+t('h2',daySelection?daySelection+' 的行程':'已公布活动','sm-list-title')+(rows||t('p','这一天没有已收录的公开活动。','sm-empty'))+t('p','更新时间：'+(zoned(doc.at,m.timezone)||'未提供')+' · '+m.timezoneLabel+' · '+k.who(doc.author),'sm-footnote')));
}
function price(value,currency) {
  if(typeof value!=='number'||!Number.isFinite(value))return null;
  try{return new Intl.NumberFormat('zh-CN',{style:'currency',currency:currency||'KRW',maximumFractionDigits:0}).format(value);}catch{return String(value);}
}
function renderTicketNotice(doc,ctx,k) {
  const {h,t,action,link}=k,m=doc.meta||{};
  return h('article',{class:'social-media sm-ticket sm-ticket-notice'},k.header(doc,m.noticeType||'票务公告')+h('div',{class:'sm-page-body'},t('span',m.version,'sm-eyebrow')+t('h1',doc.title)+k.owner(doc,(zoned(doc.at,m.timezone)||'未提供')+' · '+(m.timezone||''))+t('p',doc.text,'sm-description')+h('div',{class:'sm-notice-applies'},t('span','适用场次')+link(m.appliesTo,ctx.get(m.appliesTo)?.title||'关联场次'))+(m.sections||[]).map(s=>h('section',{class:'sm-notice-section'},t('h2',s.title)+t('p',s.text))).join('')+h('div',{class:'sm-action-row'},action('收藏公告','bookmark',doc.id)+link('schedule-main','查看公开行程'))));
}
function renderTicket(doc,ctx,k) {
  if(doc.meta?.view==='notice')return renderTicketNotice(doc,ctx,k);
  const {h,t,picture,badge,action,related}=k,m=doc.meta||{},date=zoned(m.startAt,m.timezone),original=zoned(m.originalStartAt,m.timezone);
  const hero=h('section',{class:'sm-ticket-hero'},picture(m.cover,m.coverAlt,'sm-ticket-poster')+h('div',{class:'sm-ticket-overview'},badge(m.saleStatusLabel,'sm-sale-'+m.saleStatus)+t('h1',doc.title)+t('p',m.venue)+(m.venueNote?t('small',m.venueNote):'')+t('p',date?date+' · '+m.timezoneLabel:'新日期待定','sm-ticket-date')+(original?t('small','原定 '+original+' · '+m.timezoneLabel,'sm-original-date'):'')));
  const tiers=h('section',{class:'sm-tiers'},t('h2','票档')+t('p',m.priceNote,'sm-price-note')+(doc.items||[]).map(tier=>{
    const available=m.saleStatus==='onSale'&&tier.status==='onSale';
    return h('div',{class:'sm-ticket-tier'+(!available?' sm-tier-unavailable':'')},h('div',{},t('strong',tier.name)+t('small',tier.description))+h('div',{class:'sm-tier-price'},t('strong',price(tier.price,m.currency)||'未提供价格')+t('small',tier.statusLabel))+action(available?'演示预约':tier.statusLabel,'join',doc.id,tier.id,'sm-booking-button',!available));
  }).join(''));
  return h('article',{class:'social-media sm-ticket'},k.header(doc,'票务')+hero+h('div',{class:'sm-page-body'},t('p',doc.text,'sm-description')+tiers+t('p',m.bookingNotice,'sm-booking-note')+h('section',{class:'sm-ticket-rules'},t('h2','场次信息')+h('dl',{class:'sm-facts'},(m.rules||[]).map(rule=>h('div',{},t('dt',rule.label)+t('dd',rule.value))).join('')))+related(m.notices,'公告与场次')+related([{id:'schedule-main',label:'公开行程'},{id:'music-afterlight',label:'演示作品资料'}])+t('p','主办：'+(m.organizer||k.who(doc.author)),'sm-footnote')));
}

export function renderMedia(doc,ctx) {
  if(!doc||!MEDIA_KINDS.includes(doc.kind))return '';
  const k=kit(ctx);
  const renderers={live:renderLive,video:renderVideo,music:renderMusic,schedule:renderSchedule,ticket:renderTicket};
  return renderers[doc.kind](doc,ctx,k);
}

