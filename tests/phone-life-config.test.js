import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialPhoneLife,validatePhoneLife,phoneLifeCapabilities} from '../phone-life-config.mjs';
import {reduce,quoteLoan,money} from '../phone-life/core.mjs';
import {reduceSocial,renderSocial as renderSocialOnly} from '../phone-life/social.mjs';
import {renderPhoneAlbum,renderPhoneMusic} from '../phone-life/media-ui.mjs';
const renderSocial=(s,u,h)=>renderPhoneAlbum(s,u,h)??renderPhoneMusic(s,u,h)??renderSocialOnly(s,u,h);

import {phoneProfile,currentCalendar} from './fixtures/phone-current.mjs';
const initial=(w={},c={})=>{const {calendar=null,...world}=w;return createInitialPhoneLife(phoneProfile({worldId:'city-a',personId:'person-a',world,character:c,calendar}));};
const configured={calendar:currentCalendar(),currency:{name:'银元',symbol:'¤',minorUnits:2},economy:{loan:{annualRateBps:400,terms:[2,4],periodDays:45,periodsPerYear:8,minAmount:100,maxAmount:1000000},investments:[{id:'p1',name:'契约存款',annualRateBps:25,apr:0.0025,description:'测试世界明定'}],deliveryFees:{shop:0,food:700}},travel:{speeds:{walk:5}},places:[{id:'home-a',name:'住所',x:0,y:0,known:true},{id:'park-a',name:'公园',x:15,y:0,known:true}],catalog:[{id:'book-a',name:'纸书',price:100,stock:2,kind:'physical',placeId:'home-a',tags:[]}]};
const funded={wallet:{accounts:[{id:'cash-a',name:'零钱',balance:100000}],defaultAccountId:'cash-a',fundingAccountId:'cash-a'},contacts:[{id:'person-b',name:'阿乙'}],position:'home-a'};
const accountRows=[{id:'account-a',name:'主号',handle:'main',owned:true},{id:'account-alt',name:'另一个账号',handle:'alt',owned:true},{id:'account-b',name:'乙号',handle:'other',personId:'person-b',owned:false}];
const act=(state,type,p={},id='one')=>{if(type==='order.checkout'&&!p.quoteId){const q=reduce(state,{type:'order.quote',id:id+':quote',...p});return reduce(q.state,{type,id,kind:p.kind,quoteId:q.result.quoteId});}return reduce(state,{type,id,...p});};
const social=(state,type,p={},id='social-one',options)=>reduceSocial(state,{type,id,...p},options);
const h={esc:v=>String(v??'').replaceAll('<','&lt;'),mediaUrl:()=>'',art:()=>'<svg></svg>',icon:()=>'',avatar:()=>'',btn:(label)=>`<button>${label}</button>`,tabs:()=>''};

test('only current form profiles initialize; unsafe tokens and foreign bindings remain rejected',()=>{
 assert.throws(()=>createInitialPhoneLife({}),/统一表单/);
 const legacy=phoneProfile();legacy.database=false;assert.throws(()=>createInitialPhoneLife(legacy),/统一表单/);
 assert.throws(()=>initial({theme:{background:'url(javascript:alert(1))'}}),/颜色令牌/);
 assert.throws(()=>initial({theme:{css:'body{}'}}),/未知字段/);
 const broken=phoneProfile();broken.binding.character={book:'旧书',uid:1};assert.throws(()=>createInitialPhoneLife(broken),/当前表单/);
 assert.throws(()=>initial({id:null}),/世界编号/);
});
test('empty production initialization preserves absent facts and has deterministic receipt without demo seed',()=>{
 const input=phoneProfile({worldId:'city-a',personId:'person-a',calendar:null}),before=JSON.stringify(input),first=createInitialPhoneLife(input),again=createInitialPhoneLife(input);
 assert.equal(JSON.stringify(input),before);assert.deepEqual(first,again);assert.equal(first.state.social.activeAccountId,null);assert.deepEqual(first.state.social.accounts,[]);
 assert.deepEqual(first.state.wallet.accounts,[]);assert.equal(first.state.wallet.card.limit,null);assert.equal(first.state.clock.day,null);assert.equal(first.state.config.epoch,null);
 for(const rows of [first.state.commerce.products,first.state.map.places,first.state.social.posts,first.state.media.photos,first.state.calendar.events])assert.deepEqual(rows,[]);
 assert.equal(validatePhoneLife(JSON.parse(JSON.stringify(first))),true);assert.equal(phoneLifeCapabilities(first).payment,false);assert.equal(phoneLifeCapabilities(first).loan,false);
 assert.doesNotMatch(JSON.stringify(first),/林间|余舟|青禾|280000|600000|2026-11-09/);
});
test('legitimate empty account permits personal album and music without inventing network identity',()=>{
 const life=initial(),s=life.state;
 const photo=social(s,'media.photo.add',{photo:{id:'private-original',assetId:'original-bytes',name:'自己的相片',ownerId:'person-a',source:'file',visibility:'private'}}).state;
 assert.equal(photo.social.activeAccountId,null);assert.deepEqual(photo.social.accounts,[]);assert.equal(photo.media.photos[0].ownerId,'person-a');
 const favorite=social(photo,'media.photo.favorite',{photoId:'private-original'},'fav').state;assert.deepEqual(favorite.media.favoritePhotos,['person-a:private-original']);
 assert.match(renderSocial(favorite,{app:'album'},h),/自己的相片/);assert.match(renderSocial(favorite,{app:'weibo'},h),/尚未配置本人账号/);
 const music=social(favorite,'music.song.add',{song:{id:'original-song',title:'曲',artist:'本人',audioId:null}},'song').state;assert.equal(music.media.songs.length,1);
 assert.throws(()=>social(music,'social.publish',{text:'public'},'blocked-publish'),/本人账号/);assert.throws(()=>social(music,'media.photo.share',{photoId:'private-original'},'blocked-share'),/可发博/);
});
test('unknown balance remains null, explicit zero remains zero and neither silently funds payment',()=>{
 const life=initial(configured,{wallet:{accounts:[{id:'unknown',name:'未知账户',balance:null},{id:'zero',name:'明确为零',balance:0}]},contacts:funded.contacts}),s=life.state,before=JSON.stringify(s);
 assert.equal(s.wallet.accounts[0].balance,null);assert.equal(s.wallet.accounts[1].balance,0);assert.equal(money(null),'未配置');
 assert.throws(()=>act(s,'wallet.transfer',{from:'unknown',to:'person-b',amount:1}),/未配置/);
 assert.throws(()=>act(s,'wallet.transfer',{from:'zero',to:'person-b',amount:1}),/余额不足/);assert.equal(JSON.stringify(s),before);
});
test('world form calendar drives date progression without a preview epoch',()=>{
 const s=initial(configured,funded).state;assert.deepEqual(s.clock,{year:2033,month:2,day:9,minute:1410,totalMinutes:0});
 const next=act(s,'world.advance',{minutes:60}).state;assert.equal(next.clock.day,10);assert.equal(next.clock.minute,30);assert.equal(s.clock.day,9);
 assert.throws(()=>act(initial().state,'world.advance',{minutes:60}),/时间|起点|历法/);
});
test('loan requires complete configured terms and exact quoted parameters',()=>{
 const s=initial(configured,funded).state,q=quoteLoan(100000,2,s);assert.equal(q.apr,0.04);assert.equal(q.totalInterest,750);assert.equal(q.totalPayable,100750);
 const next=act(s,'wallet.loan.borrow',{...q}).state;assert.equal(next.wallet.accounts[0].balance,200000);assert.equal(next.wallet.loans[0].installments[0].dueAt,45*1440);
 assert.throws(()=>act(s,'wallet.loan.borrow',{...q,amount:100001}),/确认本次贷款报价/);assert.throws(()=>quoteLoan(100000,2),/尚未配置贷款/);
 const absent=initial({...configured,economy:{loan:null}},funded);assert.equal(phoneLifeCapabilities(absent).loan,false);assert.throws(()=>act(absent.state,'wallet.loan.borrow',{...q}),/贷款|整数/);
 const partial=initial({...configured,economy:{loan:{annualRateBps:1200}}},funded);assert.equal(phoneLifeCapabilities(partial).loan,false);
});
test('explicit zero shipping is preserved; unknown shipping rejects before cash or inventory mutation',()=>{
 let s=initial(configured,funded).state;s=act(s,'cart.add',{productId:'book-a'}).state;
 const paid=act(s,'order.checkout',{kind:'shop',payment:'balance',placeId:'home-a'},'pay').state;assert.equal(paid.commerce.orders[0].deliveryFee,0);assert.equal(paid.commerce.orders[0].total,100);
 let missing=initial({...configured,economy:{deliveryFees:{shop:null,food:null}}},funded).state;missing=act(missing,'cart.add',{productId:'book-a'}).state;const before=JSON.stringify(missing);
 assert.throws(()=>act(missing,'order.checkout',{kind:'shop',placeId:'home-a'},'pay'),/配送费未配置/);assert.equal(JSON.stringify(missing),before);
});
test('only table-owned balances are accepted, and disabled apps or absent currency cannot spend',()=>{
 assert.throws(()=>initial({...configured,settlementOwner:'native'},funded),/统一表单/);
 const disabled=initial({...configured,apps:['album']},funded);assert.throws(()=>act(disabled.state,'wallet.transfer',{to:'person-b',amount:1}),/未启用/);
 const noCurrency=initial({...configured,currency:null},funded);assert.throws(()=>act(noCurrency.state,'wallet.transfer',{to:'person-b',amount:1}),/货币尚未配置/);
});
test('wallet recipient must be explicitly registered; no built-in person ID fallback',()=>{
 const s=initial(configured,funded).state;assert.throws(()=>act(s,'wallet.transfer',{to:'yu',amount:1}),/稳定身份/);
 const next=act(s,'wallet.transfer',{to:'person-b',amount:100}).state;assert.equal(next.wallet.accounts[0].balance,99900);assert.equal(next.wallet.ledger[0].to,'person-b');
});
test('template identity and binding changes remain explicit and source initialization does not overwrite a progressed value',()=>{
 const life=initial(configured,{...funded,accounts:accountRows});const next=act(life.state,'wallet.transfer',{to:'person-b',amount:100}).state;const progressed={...life,state:next};
 assert.equal(validatePhoneLife(progressed),true);assert.equal(progressed.state.wallet.accounts[0].balance,99900);initial(configured,funded);assert.equal(progressed.state.wallet.accounts[0].balance,99900);
 assert.throws(()=>validatePhoneLife(progressed,{binding:{world:{database:true,worldId:'city-a'},character:{database:true,entityId:'other',dossierId:'other'}}}),/归属已改变/);
 const corrupt=structuredClone(progressed);corrupt.state.config.subjectId='person-other';assert.throws(()=>validatePhoneLife(corrupt),/人物或世界绑定/);
 const wrongMedia=structuredClone(progressed);wrongMedia.state.media.ownerId='person-other';assert.throws(()=>validatePhoneLife(wrongMedia),/另一人物/);
 const policy=structuredClone(progressed);policy.state.config.economy.deliveryFees.shop=99;assert.throws(()=>validatePhoneLife(policy),/运行配置不一致/);
});
test('role-owned private photos work with registered accounts but still need per-post publication permission',()=>{
 const s=initial(configured,{...funded,accounts:accountRows,photos:[{id:'portrait',name:'私密原图',source:'file',visibility:'private'}]}).state;
 assert.match(renderSocial(s,{app:'album'},h),/私密原图/);assert.throws(()=>social(s,'social.publish',{text:'分享',photoId:'portrait',visibility:'public'}),/明确勾选/);
 const next=social(s,'social.publish',{text:'分享',photoId:'portrait',visibility:'public',allowPublicPhoto:true}).state;assert.equal(next.media.photos[0].visibility,'private');assert.equal(next.social.posts[0].authorId,'account-a');
 assert.throws(()=>initial(configured,{accounts:[{id:'steal',name:'非本人',handle:'x',personId:'person-other',owned:true}]}),/另一人物/);
});
test('formal delivery advances only when host accepted-source permission is supplied',()=>{
 const s=initial(configured,{accounts:accountRows,posts:[{id:'p-b',authorId:'account-b',text:'公开内容',visibility:'public',mediaIds:[],createdAt:{year:2033,month:2,day:9,minute:1320,totalMinutes:-90}}]}).state;
 const queued=social(s,'social.like',{postId:'p-b'}).state;assert.throws(()=>social(queued,'social.network.advance',{},'send'),/宿主已接纳/);
 const sent=social(queued,'social.network.advance',{},'send',{acceptedSource:true}).state;assert.equal(sent.social.pending[0].status,'sent');assert.equal(sent.social.pending[0].actorId,'account-a');
});
test('world app names and safe visual tokens remain presentation data',()=>{
 const life=initial({appNames:{weibo:'星河广场',wallet:'银票夹'},theme:{background:'#123456',panel:'#ffffff',text:'#123',accent:'#abcdef',radius:18}});
 assert.equal(life.world.appNames.weibo,'星河广场');assert.equal(life.state.config.theme.radius,18);assert.equal(life.state.social.posts.length,0);
 assert.throws(()=>initial({apps:['script']}),/应用清单/);assert.throws(()=>initial({theme:{radius:99}}),/范围/);
});
test('accountless album renders personal original and detail without a network account',()=>{
 const s=initial({}, {photos:[{id:'personal',name:'本体相片',source:'file',visibility:'private'}]}).state;
 assert.match(renderSocial(s,{app:'album'},h),/本体相片/);assert.match(renderSocial(s,{app:'album',detail:'personal'},h),/原件尚未关联/);assert.equal(s.media.photos[0].ownerId,'person-a');assert.equal(s.social.activeAccountId,null);
});
test('accountless music renders its library and source-less work without fabricating playback',()=>{
 const s=initial({}, {songs:[{id:'music-personal',title:'档案中的歌',ownerId:'person-a',visibility:'private',artist:'阿甲',audioId:null}]}).state;
 assert.match(renderSocial(s,{app:'music'},h),/档案中的歌/);assert.match(renderSocial(s,{app:'music',detail:'music-personal'},h),/未提供音源/);assert.equal(s.social.activeAccountId,null);
});
test('accountless inbox message projection renders an explicit account boundary',()=>{
 const s=initial().state,before=JSON.stringify(s);assert.match(renderSocial(s,{app:'weibo',tab:'messages'},h),/尚未配置本人账号/);assert.equal(JSON.stringify(s),before);assert.deepEqual(s.social.notifications,[]);
});

test('sparse author labels never create doubled mentions or attribute another account comment to the player',()=>{
 const s=initial({}, {accounts:[{id:'main',name:'主角',handle:'main',owned:true},{id:'unnamed',name:null,handle:'known-handle',personId:'person-b',owned:false},{id:'unknown',name:null,handle:null,personId:'person-c',owned:false}],posts:[{id:'original',authorId:'unnamed',text:'已知原文',visibility:'public',mediaIds:[]},{id:'unknown-original',authorId:'unknown',text:'另一条原文',visibility:'public',mediaIds:[]}],songs:[{id:'song',title:'共同听过的歌',ownerId:'person-a',visibility:'private',artist:null,audioId:null,comments:[{id:'comment',authorId:'unknown',text:'匿名账号的评论'}]}]}).state;
 const first=social(s,'social.publish',{text:'转发',repostOf:'original',visibility:'public'}).state,second=social(first,'social.publish',{text:'再转发',repostOf:'unknown-original',visibility:'public'},'second').state,before=JSON.stringify(second);
 const feed=renderSocial(second,{app:'weibo'},h);assert.match(feed,/@known-handle/);assert.doesNotMatch(feed,/@@|@未填网名/);
 const song=renderSocial(second,{app:'music',detail:'song'},h);assert.match(song,/<strong>未填网名<\/strong><br>匿名账号的评论/);assert.doesNotMatch(song,/<strong>本人<\/strong><br>匿名账号的评论/);assert.equal(JSON.stringify(second),before);
});
test('accepted NPC posts cannot impersonate the player and stable operation replay never duplicates content',()=>{
 const s=initial(configured,{accounts:accountRows}).state,payload={postId:'npc-source-post',authorId:'account-b',text:'这一轮的内容'};
 assert.throws(()=>social(s,'social.npc.post',payload,'npc-post'),/宿主已接纳/);
 assert.throws(()=>social(s,'social.npc.post',{...payload,authorId:'account-a'},'npc-post',{acceptedSource:true}),/非本人/);
 const first=social(s,'social.npc.post',payload,'npc-post',{acceptedSource:true});assert.equal(first.state.social.posts[0].visibility,'public');assert.equal(first.state.social.posts[0].createdAt.minute,1410);
 const replay=social(first.state,'social.npc.post',payload,'npc-post',{acceptedSource:true});assert.strictEqual(replay.state,first.state);assert.equal(replay.state.social.posts.length,1);
});
test('accepted NPC comments respect private/follower access and produce recipient-scoped notifications',()=>{
 const life=initial(configured,{accounts:accountRows,posts:[{id:'private',authorId:'account-a',text:'秘密',mediaIds:[],visibility:'private'},{id:'public',authorId:'account-a',text:'public',mediaIds:[],visibility:'public'}]}),s=life.state,before=JSON.stringify(s);
 assert.throws(()=>social(s,'social.npc.comment',{postId:'private',authorId:'account-b',text:'不能偷看'},'comment-private',{acceptedSource:true}),/没有读取/);assert.equal(JSON.stringify(s),before);
 const reply=social(s,'social.npc.comment',{postId:'public',authorId:'account-b',text:'可以回复'},'comment-public',{acceptedSource:true}).state;assert.equal(reply.social.comments[0].authorId,'account-b');assert.equal(reply.social.notifications[0].recipientId,'account-a');
});
