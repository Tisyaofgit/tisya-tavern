import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePhoneWorld,parsePhoneCharacter,createInitialPhoneLife,validatePhoneLife,phoneLifeCapabilities} from '../phone-life-config.mjs';
import {reduce,quoteLoan,money} from '../phone-life/core.mjs';
import {reduceSocial,renderSocial} from '../phone-life/social.mjs';

const wrap=(tag,value)=>`来源原文保留\n<${tag}>${JSON.stringify(value)}</${tag}>\n其他设定`;
const world=(extra={})=>parsePhoneWorld(wrap('手机世界',{格式:'缇斯亚手机世界/1',世界编号:'city-a',名称:'测试世界',应用:['微博','钱包','商城','外卖','相册','音乐','地图','日历'],...extra}));
const character=(extra={})=>parsePhoneCharacter(wrap('手机初态',{格式:'缇斯亚手机角色/1',角色编号:'person-a',姓名:'阿甲',...extra}));
const binding=()=>({world:{book:'世界资料',uid:2},character:{book:'角色资料',uid:4}});
const initial=(w={},c={})=>createInitialPhoneLife({world:world(w),character:character(c),binding:binding()});
const configured={时间:{起点:'2033-02-09T23:30:00+08:00'},结算归属:'手机账本',货币:{名称:'银元',符号:'¤'},金融:{贷款:{年利率基点:400,期数:[2,4],每期天数:45,每年计息期数:8,最低本金:100,最高本金:1000000},理财:[{编号:'p1',名称:'契约存款',年利率基点:25,说明:'测试世界明定'}],商城配送费:0,外卖配送费:700},交通:{步行速度:5},地点:[{编号:'home-a',名称:'住所',横坐标:0,纵坐标:0,已知:true},{编号:'park-a',名称:'公园',横坐标:15,纵坐标:0,已知:true}],商品:[{编号:'book-a',名称:'纸书',单价:100,库存:2,类别:'实物',地点编号:'home-a'}]};
const funded={钱包:{账户:[{编号:'cash-a',名称:'零钱',余额:100000}],默认付款账户:'cash-a',默认收支账户:'cash-a'},联系人:[{编号:'person-b',名称:'阿乙'}],当前位置:'home-a'};
const accountRows=[{编号:'account-a',名称:'主号',用户名:'main',本人:true},{编号:'account-alt',名称:'另一个账号',用户名:'alt',本人:true},{编号:'account-b',名称:'乙号',用户名:'other',人物编号:'person-b',本人:false}];
const act=(state,type,p={},id='one')=>reduce(state,{type,id,...p});
const social=(state,type,p={},id='social-one',options)=>reduceSocial(state,{type,id,...p},options);
const h={esc:v=>String(v??'').replaceAll('<','&lt;'),mediaUrl:()=>'',art:()=>'<svg></svg>',icon:()=>'',avatar:()=>'',btn:(label)=>`<button>${label}</button>`,tabs:()=>''};

test('Chinese source parser distinguishes absent, draft, duplicate, unsafe and invalid blocks',()=>{
 assert.equal(parsePhoneWorld('只有世界原文'),null);assert.equal(parsePhoneCharacter('只有角色原文'),null);
 assert.throws(()=>parsePhoneWorld('<手机世界>{</手机世界>'),/JSON/);
 const one=wrap('手机世界',{格式:'缇斯亚手机世界/1'});assert.throws(()=>parsePhoneWorld(one+one),/一个完整/);
 assert.throws(()=>parsePhoneWorld('<手机世界>{"格式":"缇斯亚手机世界/1","__proto__":{}}</手机世界>'),/安全/);
 assert.throws(()=>world({画风:{背景:'url(javascript:alert(1))'}}),/颜色令牌/);
 assert.throws(()=>world({画风:{css:'body{}'}}),/未支持字段/);
 assert.throws(()=>world({时间:{起点:'2033-02-31T12:00:00+08:00'}}),/不存在的日期/);
 assert.throws(()=>createInitialPhoneLife({world:world({世界编号:null}),character:character(),binding:binding()}),/世界编号/);
});
test('empty production initialization preserves absent facts and has deterministic receipt without demo seed',()=>{
 const input={world:world(),character:character(),binding:binding()},before=JSON.stringify(input),first=createInitialPhoneLife(input),again=createInitialPhoneLife(input);
 assert.equal(JSON.stringify(input),before);assert.deepEqual(first,again);assert.equal(first.state.social.activeAccountId,null);assert.deepEqual(first.state.social.accounts,[]);
 assert.deepEqual(first.state.wallet.accounts,[]);assert.equal(first.state.wallet.card.limit,null);assert.equal(first.state.clock.day,null);assert.equal(first.state.config.epoch,null);
 for(const rows of [first.state.commerce.products,first.state.map.places,first.state.social.posts,first.state.media.photos,first.state.calendar.events])assert.deepEqual(rows,[]);
 assert.equal(validatePhoneLife(JSON.parse(JSON.stringify(first))),true);assert.equal(phoneLifeCapabilities(first).payment,false);assert.equal(phoneLifeCapabilities(first).loan,false);
 assert.doesNotMatch(JSON.stringify(first),/林间|余舟|青禾|280000|600000|2026-11-09/);
});
test('legitimate empty account permits personal album and music without inventing network identity',()=>{
 const life=initial(),s=life.state;
 const photo=social(s,'media.photo.add',{photo:{id:'private-original',name:'自己的相片',ownerId:'person-a',source:'file',visibility:'private'}}).state;
 assert.equal(photo.social.activeAccountId,null);assert.deepEqual(photo.social.accounts,[]);assert.equal(photo.media.photos[0].ownerId,'person-a');
 const favorite=social(photo,'media.photo.favorite',{photoId:'private-original'},'fav').state;assert.deepEqual(favorite.media.favoritePhotos,['person-a:private-original']);
 assert.match(renderSocial(favorite,{app:'album'},h),/自己的相片/);assert.match(renderSocial(favorite,{app:'weibo'},h),/尚未配置本人账号/);
 const music=social(favorite,'music.song.add',{song:{id:'original-song',title:'曲',artist:'本人',audioId:null}},'song').state;assert.equal(music.media.songs.length,1);
 assert.throws(()=>social(music,'social.publish',{text:'公开'},'blocked-publish'),/本人账号/);assert.throws(()=>social(music,'media.photo.share',{photoId:'private-original'},'blocked-share'),/可发博/);
});
test('unknown balance remains null, explicit zero remains zero and neither silently funds payment',()=>{
 const life=initial(configured,{钱包:{账户:[{编号:'unknown',名称:'未知账户',余额:null},{编号:'zero',名称:'明确为零',余额:0}]},联系人:funded.联系人}),s=life.state,before=JSON.stringify(s);
 assert.equal(s.wallet.accounts[0].balance,null);assert.equal(s.wallet.accounts[1].balance,0);assert.equal(money(null),'未配置');
 assert.throws(()=>act(s,'wallet.transfer',{from:'unknown',to:'person-b',amount:1}),/未配置/);
 assert.throws(()=>act(s,'wallet.transfer',{from:'zero',to:'person-b',amount:1}),/余额不足/);assert.equal(JSON.stringify(s),before);
});
test('world-configured epoch and timezone drive date progression without the preview epoch',()=>{
 const s=initial(configured,funded).state;assert.deepEqual(s.clock,{year:2033,month:2,day:9,minute:1410,totalMinutes:0});
 const next=act(s,'world.advance',{minutes:60}).state;assert.equal(next.clock.day,10);assert.equal(next.clock.minute,30);assert.equal(s.clock.day,9);
 assert.throws(()=>act(initial().state,'world.advance',{minutes:60}),/起点未配置/);
});
test('loan requires complete configured terms and exact quoted parameters',()=>{
 const s=initial(configured,funded).state,q=quoteLoan(100000,2,s);assert.equal(q.apr,0.04);assert.equal(q.totalInterest,750);assert.equal(q.totalPayable,100750);
 const next=act(s,'wallet.loan.borrow',{...q}).state;assert.equal(next.wallet.accounts[0].balance,200000);assert.equal(next.wallet.loans[0].installments[0].dueAt,45*1440);
 assert.throws(()=>act(s,'wallet.loan.borrow',{...q,amount:100001}),/确认本次贷款报价/);assert.throws(()=>quoteLoan(100000,2),/尚未配置贷款/);
 const absent=initial({...configured,金融:{贷款:null}},funded);assert.equal(phoneLifeCapabilities(absent).loan,false);assert.throws(()=>act(absent.state,'wallet.loan.borrow',{...q}),/贷款|整数/);
 const partial=initial({...configured,金融:{贷款:{年利率基点:1200}}},funded);assert.equal(phoneLifeCapabilities(partial).loan,false);
});
test('explicit zero shipping is preserved; unknown shipping rejects before cash or inventory mutation',()=>{
 let s=initial(configured,funded).state;s=act(s,'cart.add',{productId:'book-a'}).state;
 const paid=act(s,'order.checkout',{kind:'shop',payment:'balance',placeId:'home-a'},'pay').state;assert.equal(paid.commerce.orders[0].deliveryFee,0);assert.equal(paid.commerce.orders[0].total,100);
 let missing=initial({...configured,金融:{商城配送费:null}},funded).state;missing=act(missing,'cart.add',{productId:'book-a'}).state;const before=JSON.stringify(missing);
 assert.throws(()=>act(missing,'order.checkout',{kind:'shop',placeId:'home-a'},'pay'),/配送费未配置/);assert.equal(JSON.stringify(missing),before);
});
test('disabled apps and external state owners cannot write a second wallet',()=>{
 const native=initial({...configured,结算归属:'原生变量'},funded),tables=initial({...configured,结算归属:'表单'},funded);
 for(const life of [native,tables]){assert.equal(phoneLifeCapabilities(life).payment,false);assert.throws(()=>act(life.state,'wallet.transfer',{to:'person-b',amount:100}),/不能另写一份/);}
 const disabled=initial({...configured,应用:['相册']},funded);assert.throws(()=>act(disabled.state,'wallet.transfer',{to:'person-b',amount:1}),/未启用/);
 const noCurrency=initial({...configured,货币:null},funded);assert.throws(()=>act(noCurrency.state,'wallet.transfer',{to:'person-b',amount:1}),/货币尚未配置/);
});
test('wallet recipient must be explicitly registered; no built-in person ID fallback',()=>{
 const s=initial(configured,funded).state;assert.throws(()=>act(s,'wallet.transfer',{to:'yu',amount:1}),/稳定身份/);
 const next=act(s,'wallet.transfer',{to:'person-b',amount:100}).state;assert.equal(next.wallet.accounts[0].balance,99900);assert.equal(next.wallet.ledger[0].to,'person-b');
});
test('template identity and binding changes remain explicit and source initialization does not overwrite a progressed value',()=>{
 const life=initial(configured,{...funded,账号:accountRows});const next=act(life.state,'wallet.transfer',{to:'person-b',amount:100}).state;const progressed={...life,state:next};
 assert.equal(validatePhoneLife(progressed),true);assert.equal(progressed.state.wallet.accounts[0].balance,99900);createInitialPhoneLife({world:world(configured),character:character(funded),binding:binding()});assert.equal(progressed.state.wallet.accounts[0].balance,99900);
 assert.throws(()=>validatePhoneLife(progressed,{binding:{...binding(),character:{book:'其他人物',uid:4}}}),/归属已改变/);
 const corrupt=structuredClone(progressed);corrupt.state.config.subjectId='person-other';assert.throws(()=>validatePhoneLife(corrupt),/人物或世界绑定/);
 const wrongMedia=structuredClone(progressed);wrongMedia.state.media.ownerId='person-other';assert.throws(()=>validatePhoneLife(wrongMedia),/另一人物/);
 const policy=structuredClone(progressed);policy.state.config.economy.deliveryFees.shop=99;assert.throws(()=>validatePhoneLife(policy),/运行配置不一致/);
});
test('role-owned private photos work with registered accounts but still need per-post publication permission',()=>{
 const s=initial(configured,{...funded,账号:accountRows,相册:[{编号:'portrait',名称:'私密原图',来源:'文件',可见范围:'私密'}]}).state;
 assert.match(renderSocial(s,{app:'album'},h),/私密原图/);assert.throws(()=>social(s,'social.publish',{text:'分享',photoId:'portrait',visibility:'public'}),/明确勾选/);
 const next=social(s,'social.publish',{text:'分享',photoId:'portrait',visibility:'public',allowPublicPhoto:true}).state;assert.equal(next.media.photos[0].visibility,'private');assert.equal(next.social.posts[0].authorId,'account-a');
 assert.throws(()=>initial(configured,{账号:[{编号:'steal',名称:'非本人',用户名:'x',人物编号:'person-other',本人:true}]}),/另一人物/);
});
test('formal delivery advances only when host accepted-source permission is supplied',()=>{
 const s=initial(configured,{账号:accountRows,微博:[{编号:'p-b',作者:'account-b',正文:'公开内容',可见范围:'公开',时间:'2033-02-09T22:00:00+08:00'}]}).state;
 const queued=social(s,'social.like',{postId:'p-b'}).state;assert.throws(()=>social(queued,'social.network.advance',{},'send'),/宿主已接纳/);
 const sent=social(queued,'social.network.advance',{},'send',{acceptedSource:true}).state;assert.equal(sent.social.pending[0].status,'sent');assert.equal(sent.social.pending[0].actorId,'account-a');
});
test('world app names and safe visual tokens remain presentation data',()=>{
 const life=initial({应用名称:{weibo:'星河广场',wallet:'银票夹'},画风:{背景:'#123456',面板:'#ffffff',文字:'#123',强调:'#abcdef',圆角:18}});
 assert.equal(life.world.appNames.weibo,'星河广场');assert.equal(life.state.config.theme.radius,18);assert.equal(life.state.social.posts.length,0);
 assert.throws(()=>world({应用名称:{script:'危险'}}),/未登记应用/);assert.throws(()=>world({画风:{圆角:99}}),/范围内/);
});
test('accountless album renders personal original and detail without a network account',()=>{
 const s=initial({}, {相册:[{编号:'personal',名称:'本体相片',来源:'文件',可见范围:'私密'}]}).state;
 assert.match(renderSocial(s,{app:'album'},h),/本体相片/);assert.match(renderSocial(s,{app:'album',detail:'personal'},h),/原图暂不可用/);assert.equal(s.media.photos[0].ownerId,'person-a');assert.equal(s.social.activeAccountId,null);
});
test('accountless music renders its library and source-less work without fabricating playback',()=>{
 const s=initial({}, {音乐:[{编号:'music-personal',歌名:'档案中的歌',作者:'阿甲',音源:null}]}).state;
 assert.match(renderSocial(s,{app:'music'},h),/档案中的歌/);assert.match(renderSocial(s,{app:'music',detail:'music-personal'},h),/还没有音源/);assert.equal(s.social.activeAccountId,null);
});
test('accountless inbox message projection renders an explicit account boundary',()=>{
 const s=initial().state,before=JSON.stringify(s);assert.match(renderSocial(s,{app:'weibo',tab:'messages'},h),/尚未配置本人账号/);assert.equal(JSON.stringify(s),before);assert.deepEqual(s.social.notifications,[]);
});
test('accepted NPC posts cannot impersonate the player and stable operation replay never duplicates content',()=>{
 const s=initial(configured,{账号:accountRows}).state,payload={postId:'npc-source-post',authorId:'account-b',text:'这一轮的内容'};
 assert.throws(()=>social(s,'social.npc.post',payload,'npc-post'),/宿主已接纳/);
 assert.throws(()=>social(s,'social.npc.post',{...payload,authorId:'account-a'},'npc-post',{acceptedSource:true}),/非本人/);
 const first=social(s,'social.npc.post',payload,'npc-post',{acceptedSource:true});assert.equal(first.state.social.posts[0].visibility,'public');assert.equal(first.state.social.posts[0].createdAt.minute,1410);
 const replay=social(first.state,'social.npc.post',payload,'npc-post',{acceptedSource:true});assert.strictEqual(replay.state,first.state);assert.equal(replay.state.social.posts.length,1);
});
test('accepted NPC comments respect private/follower access and produce recipient-scoped notifications',()=>{
 const life=initial(configured,{账号:accountRows,微博:[{编号:'private',作者:'account-a',正文:'秘密',可见范围:'私密'},{编号:'public',作者:'account-a',正文:'公开',可见范围:'公开'}]}),s=life.state,before=JSON.stringify(s);
 assert.throws(()=>social(s,'social.npc.comment',{postId:'private',authorId:'account-b',text:'不能偷看'},'comment-private',{acceptedSource:true}),/没有读取/);assert.equal(JSON.stringify(s),before);
 const reply=social(s,'social.npc.comment',{postId:'public',authorId:'account-b',text:'可以回复'},'comment-public',{acceptedSource:true}).state;assert.equal(reply.social.comments[0].authorId,'account-b');assert.equal(reply.social.notifications[0].recipientId,'account-a');
});
