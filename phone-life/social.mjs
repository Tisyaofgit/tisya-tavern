import {phoneTimeText,phoneCalendarPage} from './time-view.mjs';
import {displayText,accountDisplayName,accountMention} from './display.mjs';
import {performMediaExtension,validateMediaExtensions} from './media-rules.mjs';
import {performSocialExtension,validateSocialExtensions,postCounts,visibleSocialFeed,trendingTopics,topicsOf} from './social-rules.mjs';
export {postCounts,visibleSocialFeed,trendingTopics} from './social-rules.mjs';
const ownAccounts=s=>new Set(s.social?.ownedAccountIds||[]);
const copy = x => structuredClone(x);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const text = (v, max = 2000) => { const s=String(v ?? '').trim(); assert(s && s.length<=max, `请填写1—${max}字的内容。`); return s; };
const list = (o,k) => o[k] || (o[k]=[]);
const stamp = s => ({...s.clock});
const next=(s,p)=>{const used=new Set();const walk=x=>{if(!x||typeof x!=='object')return;if(typeof x.id==='string')used.add(x.id);for(const v of Object.values(x))walk(v);};walk(s);let value;do{value=`${p}-${++s.seq}`;}while(used.has(value));return value;};
const stable = value => Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`:JSON.stringify(value);
const account = (s,id) => s.social.accounts.find(x=>x.id===id);
const active = s => s.social.activeAccountId;
const mediaOwner=s=>active(s)??s.media.ownerId;
const ownPhoto=(s,p)=>!!p&&(p.ownerId===mediaOwner(s)||p.ownerId===s.media.ownerId||p.ownerId===s.config?.subjectId);

export function canReadPost(s,p,reader=active(s)){
 return !!p && !p.deleted && !(s.social.blocks?.[reader]??[]).includes(p.authorId) && !(s.social.blocks?.[p.authorId]??[]).includes(reader) && (p.authorId===reader || p.visibility==='public' || (p.visibility==='followers' && (s.social.follows[reader]||[]).includes(p.authorId)));
}
const needPost=(s,id)=>{const p=s.social.posts.find(x=>x.id===id);assert(canReadPost(s,p),'这条微博不存在，或当前账号没有查看权限。');return p;};
const needPhoto=(s,id)=>{const p=s.media.photos.find(x=>x.id===id);assert(p&&!p.purged&&p.deletedAt==null,'找不到这张相片，或已在最近删除中。');return p;};
export const canReadSong=(s,p)=>!!p&&(p.visibility==='public'||[active(s),s.media.ownerId,s.config?.subjectId].includes(p.ownerId)||(p.audience??[]).some(x=>[active(s),s.media.ownerId].includes(x)));
const needSong=(s,id)=>{const p=s.media.songs.find(x=>x.id===id);assert(canReadSong(s,p),'找不到这首歌，或当前账号无权读取。');return p;};
const toggle=(arr,id)=>{const n=arr.indexOf(id);if(n<0){arr.push(id);return true;}arr.splice(n,1);return false;};
export function validateSocialState(state){
 assert(state&&state.social&&state.media&&!Array.isArray(state.social)&&!Array.isArray(state.media),'社交或媒体存档结构不完整。');
 const page=state.config?.calendar&&state.clock?.day!=null?phoneCalendarPage(state):null;
 assert(!page||(state.clock.year===page.year&&(state.clock.month??state.clock.season)===page.period&&state.clock.day===page.day),'故事日期与表单历法不一致。');
 assert(state.clock&&((state.clock.day===null&&state.clock.minute===null)||(Number.isInteger(state.clock.day)&&state.clock.day>=1&&state.clock.day<=(page?.count??31)&&Number.isInteger(state.clock.minute)&&state.clock.minute>=0&&state.clock.minute<(page?.minutesPerDay??1440))),'故事时点缺失或无效。');
 const s=state.social,m=state.media,OWN=ownAccounts(state);
 const arrays=['accounts','posts','comments','notifications','pending'];for(const k of arrays)assert(Array.isArray(s[k]),`社交存档缺少${k}列表。`);
 for(const k of ['photos','songs','playlists','favoritePhotos','favoriteSongs'])assert(Array.isArray(m[k]),`媒体存档缺少${k}列表。`);
 const ids=(rows,label)=>{const keys=rows.map(x=>x&&x.id);assert(keys.every(x=>typeof x==='string'&&x.length>0&&x.length<200)&&new Set(keys).size===keys.length,`${label}编号缺失或重复。`);return new Set(keys);};
 const people=ids(s.accounts,'账号'),posts=ids(s.posts,'微博'),photos=ids(m.photos,'相片'),songs=ids(m.songs,'歌曲');ids(s.comments,'评论');ids(s.notifications,'通知');ids(s.pending,'待发操作');ids(m.playlists,'歌单');
 assert(Array.isArray(s.ownedAccountIds)&&new Set(s.ownedAccountIds).size===s.ownedAccountIds.length&&[...OWN].every(x=>people.has(x))&&(OWN.size?OWN.has(s.activeAccountId):s.activeAccountId===null),'存档的本人账号不完整。');
 assert([...OWN].every(id=>s.accounts.find(x=>x.id===id).personId===s.ownerPersonId),'本人账号归属错误。');
 assert(s.accidentalLikes===undefined||typeof s.accidentalLikes==='boolean','手滑点赞设置无效。');
 if(s.drafts!==undefined){assert(s.drafts&&typeof s.drafts==='object'&&!Array.isArray(s.drafts),'微博草稿结构无效。');for(const [id,d] of Object.entries(s.drafts))assert(OWN.has(id)&&d&&typeof d.text==='string'&&d.text.length<=2000&&(d.visibility===undefined||['public','followers','private'].includes(d.visibility)),'微博草稿归属或内容无效。');}
 for(const p of s.accounts)assert((p.name==null||typeof p.name==='string')&&(p.handle==null||typeof p.handle==='string'),'账号名称或标识类型无效。');
 for(const key of ['follows','likes','bookmarks','acceptedLikes']){
  assert(s[key]&&typeof s[key]==='object'&&!Array.isArray(s[key]),`社交存档的${key}结构错误。`);
  for(const who of OWN){const rows=s[key][who];assert(Array.isArray(rows)&&rows.every(x=>typeof x==='string')&&new Set(rows).size===rows.length,`${key}记录缺失或重复。`);assert(rows.every(x=>(key==='follows'?people:posts).has(x)),`${key}包含失效引用。`);}
 }
 for(const p of m.photos)assert((people.has(p.ownerId)||p.ownerId===m.ownerId||p.ownerId===state.config?.subjectId)&&['private','public'].includes(p.visibility)&&['art','file'].includes(p.source)&&(p.name==null||typeof p.name==='string'),'相片归属、类型或可见范围不完整。');
 for(const p of s.posts){
  assert(people.has(p.authorId)&&typeof p.text==='string'&&['public','followers','private'].includes(p.visibility)&&Array.isArray(p.mediaIds)&&p.mediaIds.every(x=>photos.has(x)),'微博作者、正文、可见范围或媒体引用错误。');
  if(p.repostOf)assert(posts.has(p.repostOf)&&p.repostOf!==p.id,'原微博引用错误。');if(p.songId)assert(songs.has(p.songId),'微博中的歌曲引用错误。');
  for(const id of p.mediaIds){const photo=m.photos.find(x=>x.id===id);if(photo.visibility==='private')assert((photo.ownerId===p.authorId||(photo.ownerId===m.ownerId&&OWN.has(p.authorId)))&&(p.visibility==='private'||(p.mediaGrants||[]).includes(id)),'私密相片缺少该条微博的分享授权。');}
 }
 for(const c of s.comments)assert(posts.has(c.postId)&&people.has(c.authorId)&&typeof c.text==='string','评论引用或正文错误。');
 for(const n of s.notifications)assert((posts.has(n.postId)||n.kind==='social.follow'&&n.postId===null)&&people.has(n.actorId)&&people.has(n.recipientId)&&typeof n.text==='string'&&typeof n.seen==='boolean','通知归属或来源错误。');
 for(const p of s.pending){assert(p.kind==='like'&&posts.has(p.postId)&&OWN.has(p.actorId)&&typeof p.value==='boolean'&&typeof p.previous==='boolean'&&['queued','sent','accepted','notification-seen','cancelled'].includes(p.status),'点赞收发记录不完整。');if(p.notificationId)assert(s.notifications.some(n=>n.id===p.notificationId),'点赞通知引用缺失。');}
 for(const song of m.songs)assert(typeof song.ownerId==='string'&&['public','private'].includes(song.visibility)&&(song.title==null||typeof song.title==='string')&&(song.artist==null||typeof song.artist==='string')&&(song.audioId==null||typeof song.audioId==='string')&&(song.duration==null||(Number.isFinite(song.duration)&&song.duration>=0)),'歌曲或实际音源信息不完整。');
 for(const p of m.playlists)assert((p.name==null||typeof p.name==='string')&&Array.isArray(p.songIds)&&p.songIds.every(x=>songs.has(x))&&new Set(p.songIds).size===p.songIds.length,'歌单记录或歌曲引用错误。');
 assert(m.favoriteSongs.every(x=>songs.has(x))&&new Set(m.favoriteSongs).size===m.favoriteSongs.length,'音乐收藏引用错误。');
 assert(m.favoritePhotos.every(key=>typeof key==='string'&&[...new Set([...OWN,m.ownerId,state.config?.subjectId].filter(Boolean))].some(who=>key.startsWith(who+':')&&m.photos.some(p=>p.id===key.slice(who.length+1)&&p.ownerId===who)))&&new Set(m.favoritePhotos).size===m.favoritePhotos.length,'相片收藏归属错误。');
 validateMediaExtensions(state);validateSocialExtensions(state);return true;
}
function accountMentions(s,content){const handles=[...content.matchAll(/@([\w\p{L}.-]{1,60})/gu)].map(m=>m[1]);return handles.flatMap(handle=>{const matches=s.social.accounts.filter(a=>a.handle===handle);return matches.length===1?[matches[0].id]:[];});}
function publish(s,a){
 const by=active(s),visibility=a.visibility||'public';assert(['public','followers','private'].includes(visibility),'请选择有效的可见范围。');
 const content=text(a.text),mediaIds=Array.isArray(a.mediaIds)?[...new Set(a.mediaIds)]:a.photoId?[String(a.photoId)]:[];assert(mediaIds.length<=9,'一次最多分享9个媒体。');
 for(const id of mediaIds){const p=needPhoto(s,id);assert(!p.purged&&p.deletedAt==null&&(p.ownerId===by||p.ownerId===s.media.ownerId),'只能使用当前账号自己的相片。');assert(p.visibility==='public'||visibility==='private'||a.allowPublicPhoto===true||a.allowPublicPhoto==='on'||a.allowPublicPhoto==='true','这张相片是私密的。请明确勾选本次分享授权，或设为仅自己可见。');}
 if(a.repostOf){const original=needPost(s,a.repostOf);assert(original.visibility==='public'||visibility==='private','非公开微博的转发请保留为仅自己可见。');}
 if(a.songId){const song=needSong(s,a.songId);assert(song.visibility!=='private'||visibility==='private'||a.allowPublicSong===true||a.allowPublicSong==='on','私密音乐需要明确授权本次分享。');}
 const p={id:next(s,'post'),authorId:by,text:content,visibility,mediaIds,mediaGrants:visibility==='private'?[]:mediaIds,repostOf:a.repostOf||null,songId:a.songId||null,songGrant:!!a.songId&&visibility!=='private',likesBase:0,version:1,createdAt:stamp(s)};
 s.social.posts.unshift(p);if(p.repostOf){const original=s.social.posts.find(x=>x.id===p.repostOf);p.repostSnapshot={text:original.text,authorId:original.authorId,version:original.version??1,mediaIds:[...original.mediaIds],visibility:original.visibility};}const mentionIds=Array.isArray(a.mentionIds)?a.mentionIds:accountMentions(s,p.text);p.mentionIds=[...new Set(mentionIds)];for(const id of p.mentionIds){assert(account(s,id),'提及的账号未登记。');if(id!==by&&canReadPost(s,p,id))s.social.notifications.push({id:next(s,'notice'),kind:'social.mention',actorId:by,recipientId:id,postId:p.id,text:accountDisplayName(account(s,by))+'提到了你',seen:false,withdrawn:false});}s.social.drafts??={};s.social.drafts[by]={text:'',visibility:'public'};return {message:visibility==='private'?'已保存为仅自己可见。':'微博已发布。',postId:p.id,navigate:{app:'weibo',tab:'latest',detail:'',photoId:'',repostOf:'',songId:'',query:''}};
}
export function reduceSocial(state,action,{acceptedSource=false}={}){
 assert(action&&typeof action.type==='string','操作格式不正确。');
 if(!/^(social|media|music)\./.test(action.type))return {state,result:{handled:false}};
 assert(typeof action.id==='string'&&/^[\w.:-]{1,160}$/.test(action.id)&&!['__proto__','constructor','prototype'].includes(action.id),'缺少有效操作编号。');
 const fingerprint=stable(action),receipt=Object.prototype.hasOwnProperty.call(state.receipts||{},action.id)?state.receipts[action.id]:null;
 if(receipt){assert(receipt.fingerprint===fingerprint,'同一操作编号不能更改参数。');return {state,result:{...copy(receipt.result),duplicate:true,replayed:true}};}
 assert(!(state.applied||[]).includes(action.id),'该操作编号已经用于另一个应用。');
 validateSocialState(state);
 const s=copy(state),a=action,me=a.type.startsWith('media.')?mediaOwner(s):active(s),OWN=ownAccounts(s);let result={message:'已更新。'};
 const app=a.type==='media.theme.set'?null:a.type.startsWith('music.')?'music':a.type.startsWith('media.')?'album':'weibo';if(s.config&&app)assert(s.config.apps.includes(app),'世界未启用这个应用。');
 if(!a.type.startsWith('music.')&&!a.type.startsWith('media.')&&!['social.search','social.settings','social.network.advance','social.npc.post','social.npc.comment','social.metrics','social.propagate'].includes(a.type))assert(OWN.has(me),'当前没有可操作的本人账号。');
 if(a.type.startsWith('media.'))assert(typeof me==='string'&&me,'个人媒体归属尚未配置。');
 if(a.type==='media.photo.share')assert(OWN.has(active(s))&&(!s.config||s.config.apps.includes('weibo')),'尚未配置可发博的本人账号或微博应用。');
 if(a.type==='music.share')assert(OWN.has(me)&&(!s.config||s.config.apps.includes('weibo')),'尚未配置可发博的本人账号或微博应用。');
 if(a.type==='social.network.advance')assert(acceptedSource,'正式送达只接受宿主已接纳的来源。');
 const mediaResult=performMediaExtension(s,a,{next})??performSocialExtension(s,a,{next,canRead:canReadPost},{acceptedSource});
 if(mediaResult)result=mediaResult;else switch(a.type){
  case 'social.npc.post':{
   assert(acceptedSource,'NPC内容只接受宿主已接纳的来源。');const author=account(s,a.authorId);assert(author&&!OWN.has(author.id),'NPC作者必须是已登记的非本人账号。');
   assert(typeof a.postId==='string'&&a.postId.length>0&&a.postId.length<=160&&!['__proto__','constructor','prototype'].includes(a.postId)&&!s.social.posts.some(p=>p.id===a.postId),'NPC新微博编号无效或已经存在。');
   const p={id:a.postId,authorId:author.id,text:text(a.text),visibility:'public',mediaIds:[],mediaGrants:[],repostOf:null,songId:null,likesBase:null,createdAt:stamp(s)};s.social.posts.unshift(p);result={message:'已接纳这一轮的公开内容。',postId:p.id};break;
  }
  case 'social.npc.comment':{
   assert(acceptedSource,'NPC内容只接受宿主已接纳的来源。');const author=account(s,a.authorId);assert(author&&!OWN.has(author.id),'NPC作者必须是已登记的非本人账号。');
   const p=s.social.posts.find(row=>row.id===a.postId);assert(canReadPost(s,p,author.id),'该NPC没有读取这条微博的依据。');const c={id:next(s,'comment'),postId:p.id,authorId:author.id,text:text(a.text,500),createdAt:stamp(s)};s.social.comments.push(c);
   if(p.authorId!==author.id)s.social.notifications.push({id:next(s,'notice'),kind:'social.comment',recipientId:p.authorId,actorId:author.id,postId:p.id,text:`${accountDisplayName(author)}评论了你的微博`,seen:false,withdrawn:false});result={message:'已接纳这一轮的评论。',commentId:c.id};break;
  }
  case 'social.settings':assert(typeof a.accidentalLikes==='boolean','请选择是否启用双击点赞。');s.social.accidentalLikes=a.accidentalLikes;result={message:a.accidentalLikes?'已启用双击图片点赞；可在送出前撤销。':'已关闭双击图片点赞。'};break;
  case 'social.draft.save':{const content=String(a.text??'');assert(content.length<=2000,'微博草稿不能超过2000字。');const visibility=a.visibility||s.social.drafts?.[me]?.visibility||'public';assert(['public','followers','private'].includes(visibility),'草稿可见范围无效。');s.social.drafts??={};s.social.drafts[me]={text:content,visibility};result={message:'草稿已保存。'};break;}
  case 'social.account': assert(OWN.has(a.accountId)&&account(s,a.accountId),'只能切换自己的已登记账号。');s.social.activeAccountId=a.accountId;result={message:`已切换到${accountDisplayName(account(s,a.accountId))}`,navigate:{app:'weibo',tab:'latest',detail:'',accountMenu:false,photoId:'',repostOf:'',songId:''}};break;
  case 'social.search':result={message:'已搜索当前手机中的微博。',navigate:{app:'weibo',tab:'search',query:text(a.query,100)}};break;
  case 'social.publish':result=publish(s,a);break;
  case 'social.delete':{const p=needPost(s,a.postId);assert(p.authorId===me,'只能删除当前账号自己的微博。');p.deleted=true;result={message:'这条微博已删除。',navigate:{app:'weibo',tab:'latest',detail:''}};break;}
  case 'social.comment':{const p=needPost(s,a.postId);const reply=a.replyTo?s.social.comments.find(x=>x.id===a.replyTo&&x.postId===p.id):null;assert(!a.replyTo||reply,'回复的评论不存在或不属于原帖。');const c={id:next(s,'comment'),postId:p.id,authorId:me,text:text(a.text,500),replyTo:reply?.id??null,createdAt:stamp(s)};s.social.comments.push(c);const recipientId=reply?.authorId??p.authorId;if(recipientId!==me)s.social.notifications.push({id:next(s,'notice'),kind:'social.comment',recipientId,actorId:me,postId:p.id,text:`${accountDisplayName(account(s,me))}回复了你的内容`,seen:false,withdrawn:false});result={message:'评论已发出。',navigate:{app:'weibo',tab:'post',detail:p.id}};break;}
  case 'social.follow':{assert(account(s,a.accountId)&&a.accountId!==me,'请选择其他账号。');assert(!(s.social.blocks?.[me]??[]).includes(a.accountId)&&!(s.social.blocks?.[a.accountId]??[]).includes(me),'已拉黑的账号不能关注。');const on=toggle(list(s.social.follows,me),a.accountId);if(on)s.social.notifications.push({id:next(s,'notice'),kind:'social.follow',recipientId:a.accountId,actorId:me,postId:null,text:accountDisplayName(account(s,me))+'关注了你',seen:false,withdrawn:false});result={message:on?'已关注。':'已取消关注。'};break;}
  case 'social.bookmark':{needPost(s,a.postId);const on=toggle(list(s.social.bookmarks,me),a.postId);result={message:on?'已收藏微博。':'已取消收藏。'};break;}
  case 'social.like':{
   needPost(s,a.postId);const current=list(s.social.likes,me),before=current.includes(a.postId),value=toggle(current,a.postId);
   const pending=[...s.social.pending].reverse().find(x=>x.kind==='like'&&x.actorId===me&&x.postId===a.postId&&x.status==='queued');
   if(pending&&value===pending.previous){pending.status='cancelled';pending.cancelledAt=stamp(s);result={message:'已在送出前撤销，不会产生点赞通知。'};}
   else{if(pending)pending.value=value;else s.social.pending.push({id:next(s,'like'),kind:'like',actorId:me,postId:a.postId,value,previous:before,status:'queued',createdAt:stamp(s)});result={message:value?'赞已记下，等待送出。':'取消已记下；若赞已送出，将再发送取消。'};}
   break;
  }
  case 'social.network.advance':{
   let changed=0;
   for(const p of s.social.pending){
    if(p.status==='queued'){p.status='sent';changed++;}
    else if(p.status==='sent'){
     p.status='accepted';const accepted=list(s.social.acceptedLikes,p.actorId),has=accepted.includes(p.postId);if(has!==p.value)toggle(accepted,p.postId);
     const post=s.social.posts.find(x=>x.id===p.postId);
     if(p.value&&post&&post.authorId!==p.actorId){const n={id:next(s,'notice'),kind:'social.like',recipientId:post.authorId,actorId:p.actorId,postId:p.postId,text:`${accountDisplayName(account(s,p.actorId))}赞了你的微博`,seen:false,withdrawn:false};s.social.notifications.push(n);p.notificationId=n.id;}
     if(!p.value)for(const n of s.social.notifications)if(n.kind==='social.like'&&n.actorId===p.actorId&&n.postId===p.postId)n.withdrawn=true;
     changed++;
    }else if(p.status==='accepted'&&p.value&&p.notificationId){const n=s.social.notifications.find(x=>x.id===p.notificationId);if(n)n.seen=true;p.status='notification-seen';changed++;}
   }
   result={message:changed?'已按本轮回执更新送达状态。':'当前没有需要推进的社交动作。'};break;
  }
  case 'social.notification.read':{const n=s.social.notifications.find(x=>x.id===a.notificationId&&x.recipientId===me);assert(n,'当前账号没有这条通知。');n.seen=true;for(const p of s.social.pending)if(p.notificationId===n.id&&p.status==='accepted')p.status='notification-seen';result={message:'已读。'};break;}
  case 'media.photo.add':{const p=a.photo;assert(p&&typeof p.id==='string'&&!s.media.photos.some(x=>x.id===p.id),'相片编号无效或已存在。');assert(p.source==='file'&&typeof p.assetId==='string'&&p.assetId&&p.ownerId===me&&p.visibility==='private','新导入相片必须属于当前账号并保留私密。');s.media.photos.push({id:p.id,assetId:p.assetId,name:text(p.name,100),source:'file',ownerId:me,visibility:'private',mime:String(p.mime||''),...(typeof p.savedAt==='string'?{savedAt:p.savedAt}:{}),createdAt:stamp(s)});result={message:'已导入到当前账号的私密相册。',navigate:{app:'album',tab:'all',detail:p.id}};break;}
  case 'media.photo.favorite':{const p=needPhoto(s,a.photoId);assert(ownPhoto(s,p),'这不是当前账号的相片。');const key=`${p.ownerId}:${p.id}`,on=toggle(s.media.favoritePhotos,key);result={message:on?'已收藏相片。':'已取消收藏。'};break;}
  case 'media.photo.share':{const p=needPhoto(s,a.photoId);assert(ownPhoto(s,p),'只能分享当前账号的相片。');result={message:'请选择本次微博的可见范围。',navigate:{app:'weibo',tab:'compose',photoId:p.id,repostOf:'',songId:'',detail:'',visibility:'private'}};break;}
  case 'music.song.add':{const p=a.song;assert(p&&typeof p.id==='string'&&!s.media.songs.some(x=>x.id===p.id),'歌曲编号无效或已存在。');s.media.songs.push({id:p.id,ownerId:mediaOwner(s),visibility:p.visibility==='public'?'public':'private',title:text(p.title,100),artist:String(p.artist||'本地导入'),album:String(p.album||'我的音乐'),cover:'album',audioId:p.audioId?String(p.audioId):null,...(Number.isFinite(p.duration)&&p.duration>=0?{duration:p.duration}:{})});result={message:'已加入音乐库。',navigate:{app:'music',tab:'library',detail:p.id}};break;}
  case 'music.source.attach':{const song=needSong(s,a.songId);assert(typeof a.mediaId==='string'&&a.mediaId,'缺少已保存的音源编号。');song.audioId=a.mediaId;if(Number.isFinite(a.duration)&&a.duration>=0)song.duration=a.duration;else delete song.duration;result={message:'已关联导入音源。',navigate:{app:'music',tab:'library',detail:song.id}};break;}
  case 'music.favorite':{needSong(s,a.songId);const on=toggle(s.media.favoriteSongs,a.songId);result={message:on?'已加入喜欢的音乐。':'已移出喜欢的音乐。'};break;}
  case 'music.playlist.create':{const p={id:next(s,'playlist'),name:text(a.name,40),songIds:[]};s.media.playlists.push(p);result={message:'歌单已创建。',navigate:{app:'music',tab:'playlists',detail:p.id}};break;}
  case 'music.playlist.add':{const p=s.media.playlists.find(x=>x.id===a.playlistId);assert(p,'歌单不存在。');needSong(s,a.songId);if(!p.songIds.includes(a.songId))p.songIds.push(a.songId);result={message:'已加入歌单。'};break;}
  case 'music.playlist.remove':{const p=s.media.playlists.find(x=>x.id===a.playlistId);assert(p,'歌单不存在。');p.songIds=p.songIds.filter(x=>x!==a.songId);result={message:'已从歌单移除。'};break;}
  case 'music.share':{const sharedSong=needSong(s,a.songId);result={message:'写一句分享吧。',navigate:{app:'weibo',tab:'compose',songId:a.songId,photoId:'',repostOf:'',detail:'',visibility:sharedSong.visibility==='private'?'private':'public'}};break;}
  default:throw new Error('暂不支持这项社交操作。');
 }
 s.applied=[...(s.applied||[]),action.id];s.revision=(s.revision||0)+1;s.receipts??={};s.receipts[action.id]={fingerprint,result:copy(result),at:s.clock.totalMinutes};if(Array.isArray(s.audit))s.audit.push({id:action.id,at:s.clock.totalMinutes,type:action.type,message:result.message});validateSocialState(s);return {state:s,result};
}
const timeLabel=(s,p)=>Number.isInteger(p?.createdAt?.day)&&Number.isInteger(p?.createdAt?.minute)?`${p.createdAt.day}日 ${phoneTimeText(s,p.createdAt.minute)}`:'故事时间未配置';
function photoMarkup(s,p,h,extra=''){
 const url=h.mediaUrl(p.id);
 if(url&&String(p.mime??'').startsWith('video/'))return `<video class="social-photo ${extra}" src="${h.esc(url)}" controls playsinline preload="metadata" aria-label="${h.esc(p.name)}"></video>`;
 if(url)return `<img class="social-photo ${extra}" src="${h.esc(url)}" alt="${h.esc(p.name)}">`;
 if(p.source==='art')return `<div class="social-photo social-illustration ${extra}" role="img" aria-label="${h.esc(p.name)}，原创插画">${h.art(p.art||'photo')}<span>插画</span></div>`;
 return `<div class="social-photo social-missing ${extra}">原图暂不可用<br><small>请重新导入原文件</small></div>`;
}
function visibilityLabel(p){return p.visibility==='private'?'仅自己可见':p.visibility==='followers'?'关注者可见':'公开';}
function postMarkup(s,p,h,{detail=false}={}){
 const a=account(s,p.authorId),me=active(s),liked=(s.social.likes[me]||[]).includes(p.id),saved=(s.social.bookmarks[me]||[]).includes(p.id),comments=s.social.comments.filter(x=>x.postId===p.id);
 const likes=postCounts(s,p).likes;
 const media=(p.mediaIds||[]).map(id=>s.media.photos.find(x=>x.id===id)).filter(Boolean).map(photo=>`<div class="social-post-image" data-like-post="${h.esc(p.id)}">${photoMarkup(s,photo,h)}</div>`).join('');
 const original=p.repostOf?s.social.posts.find(x=>x.id===p.repostOf):null,quoted=p.repostSnapshot;
 const song=p.songId?s.media.songs.find(x=>x.id===p.songId):null;
 return `<article class="social-post"><header>${h.btn(h.avatar(a),'nav',{app:'weibo',tab:'profile',detail:a.id},'social-avatar-button')}<div class="social-author">${h.btn(h.esc(accountDisplayName(a)),'nav',{app:'weibo',tab:'profile',detail:a.id},'social-name')}<span>${timeLabel(s,p)} · ${visibilityLabel(p)}</span></div>${p.authorId!==me?h.btn((s.social.follows[me]||[]).includes(p.authorId)?'已关注':'+ 关注','social.follow',{accountId:p.authorId},'social-follow'):''}</header><div class="social-post-text">${h.esc(p.text).replace(/\n/g,'<br>')}</div>${media?`<div class="social-post-images">${media}</div>`:''}${p.repostOf?`<div class="social-repost">${quoted?`<b>${h.esc(accountMention(account(s,quoted.authorId)))}</b><p>${h.esc(quoted.text)}</p><small>转发时的第 ${quoted.version} 版</small>`:canReadPost(s,original)?`<b>${h.esc(accountMention(account(s,original.authorId)))}</b><p>${h.esc(original.text)}</p>${h.btn('查看原微博','nav',{app:'weibo',tab:'post',detail:original.id},'social-link')}`:'原微博已不可见，转发记录仍保留。'}</div>`:''}${song?`<div class="social-song-share">${h.art(song.cover||'album')}<div><b>${h.esc(song.title)}</b><small>${h.esc(song.artist)} · 音乐分享</small></div>${h.btn(h.icon('play'),'nav',{app:'music',tab:'library',detail:song.id},'social-icon-button')}</div>`:''}<footer>${h.btn(`${h.icon('share')} 转发`,'nav',{app:'weibo',tab:'compose',repostOf:p.id,photoId:'',songId:'',visibility:p.visibility==='public'?'public':'private'},'social-action')}${h.btn(`${h.icon('comment')} ${comments.length||'评论'}`,'nav',{app:'weibo',tab:'post',detail:p.id},'social-action')}${h.btn(`${h.icon('heart')} ${likes||'赞'}`,'social.like',{postId:p.id},`social-action ${liked?'is-liked':''}`)}${h.btn(h.icon('star'),'social.bookmark',{postId:p.id},`social-action social-save ${saved?'is-saved':''}`)}</footer>${detail&&p.authorId===me?`<div class="social-own-controls">${h.btn('编辑','nav',{app:'weibo',tab:'edit',detail:p.id},'social-link')+h.btn('置顶 / 取消','social.pin',{postId:p.id},'social-link')+h.btn('删除这条微博','social.delete',{postId:p.id},'social-delete')}</div>`:''}</article>`;
}
function queueMarkup(s,h){
 const operations=s.social.pending.filter(x=>x.actorId===active(s)).slice(-4).reverse();if(!operations.length)return '';
 const names={queued:'待送出',sent:'已送出',accepted:'已送达','notification-seen':'对方已看见',cancelled:'送出前已撤销'};
 return `<details class="social-delivery"><summary>最近的点赞 · ${names[operations[0].status]}</summary>${operations.map(x=>`<div><span>${x.value?'点赞':'取消赞'}</span><b>${names[x.status]}</b></div>`).join('')}<p>送出前可合并撤销；对方已看见的通知会保留。</p><small>等待宿主下一轮正式接纳。</small></details>`;
}
function compose(s,ui,h){
 const photo=ui.photoId?s.media.photos.find(x=>x.id===ui.photoId&&(x.ownerId===active(s)||x.ownerId===s.media.ownerId)):null, song=ui.songId?s.media.songs.find(x=>x.id===ui.songId):null;
 const draft=s.social.drafts?.[active(s)];const selected=ui.visibility||draft?.visibility||(photo?'private':'public');
 return `<section class="social-compose"><h2>分享这一刻</h2><p class="muted">使用 ${h.esc(accountDisplayName(account(s,active(s))))} 发布</p><form data-action="social.publish"><textarea name="text" rows="6" maxlength="2000" required placeholder="有什么想说的？">${h.esc(draft?.text||(song?`分享歌曲《${song.title}》`:''))}</textarea>${photo?`<div class="social-compose-photo">${photoMarkup(s,photo,h)}</div><input type="hidden" name="photoId" value="${h.esc(photo.id)}">`:''}${ui.repostOf?`<input type="hidden" name="repostOf" value="${h.esc(ui.repostOf)}"><p class="muted">转发原微博，保留来源引用。</p>`:''}${song?`<input type="hidden" name="songId" value="${h.esc(song.id)}"><div class="chip">♫ ${h.esc(song.title)}</div>`:''}<label class="field">谁可以看<select name="visibility"><option value="public" ${selected==='public'?'selected':''}>公开</option><option value="followers" ${selected==='followers'?'selected':''}>关注者可见</option><option value="private" ${selected==='private'?'selected':''}>仅自己可见</option></select></label>${song?.visibility==='private'?'<label class="social-consent"><input type="checkbox" name="allowPublicSong">允许这一次向所选范围分享私密音乐；原作品权限保留。</label>':''}${photo&&photo.visibility!=='public'?'<label class="social-consent"><input type="checkbox" name="allowPublicPhoto">允许这一次把该私密相片分享给所选范围；相册原件仍为私密。</label>':''}<button type="submit" class="primary full-width">发布微博</button></form></section>`;
}
function weibo(s,ui,h){
 const me=active(s),a=account(s,me),OWN=ownAccounts(s),tab=ui.tab||'recommend',unread=s.social.notifications.filter(x=>x.recipientId===me&&!x.seen).length;
 let body='';
 if(tab==='compose')body=compose(s,ui,h);
 else if(tab==='evidence'){const rows=(s.social.evidence??[]).filter(x=>x.visibility==='public'||x.snapshot.authorId===me||x.actorId===me);body='<section class="card"><h2>传播记录</h2>'+rows.map(x=>`<article><h3>${h.esc({screenshot:'截图事件',mention:'提及事件',forward:'传播事件'}[x.kind])}</h3><p>${h.esc(accountDisplayName(account(s,x.actorId)))} · ${timeLabel(s,x)}</p><blockquote>${h.esc(x.snapshot.text)}</blockquote><p>${h.esc(x.text)}</p><small>剧情已经确认的事件与当时内容；此记录不冒充实际图片文件。</small></article>`).join('')+(rows.length?'':'<p>尚无可见的传播事件。</p>')+'</section>';}
 else if(tab==='profile-edit'){body=`<section class="card"><h2>编辑账号</h2><form data-action="social.profile.edit"><p class="muted small">只填写现在知道的资料，其余可以以后补充。</p><label>显示名称<input name="name" value="${h.esc(a.name)}" maxlength="100" data-omit-unchanged placeholder="稍后填写"></label><label>账号标识<input name="handle" value="${h.esc(a.handle)}" maxlength="160" data-omit-unchanged placeholder="不含 @，可稍后填写"></label><label>简介<textarea name="bio" maxlength="1000" data-omit-unchanged>${h.esc(a.bio??'')}</textarea></label><button type="submit">保存资料</button></form></section>`;}
 else if(tab==='edit'){const p=s.social.posts.find(x=>x.id===ui.detail&&x.authorId===me&&!x.deleted);body=p?`<section class="card"><h2>编辑微博</h2><form data-action="social.edit"><input type="hidden" name="postId" value="${h.esc(p.id)}"><input type="hidden" name="expectedVersion" value="${p.version??1}"><textarea name="text" maxlength="2000" required>${h.esc(p.text)}</textarea><button type="submit">保存新版本</button></form></section>`:'<div class="empty">没有可编辑的本人内容。</div>';}
 else if(tab==='post'){
  const p=s.social.posts.find(x=>x.id===ui.detail);if(!canReadPost(s,p))body='<div class="empty">这条微博当前不可见。</div>';
  else body=postMarkup(s,p,h,{detail:true})+`<section class="social-comments"><h3>评论 ${s.social.comments.filter(x=>x.postId===p.id).length}</h3>${s.social.comments.filter(x=>x.postId===p.id&&!(s.social.blocks?.[me]??[]).includes(x.authorId)).sort((a,b)=>(b.likedBy?.length??0)-(a.likedBy?.length??0)).map(c=>`<div class="social-comment">${h.avatar(account(s,c.authorId))}<div><b>${h.esc(accountDisplayName(account(s,c.authorId)))}</b><p>${c.replyTo?'<small>回复楼内评论</small> ':''}${h.esc(c.text)}</p><small>${timeLabel(s,c)}</small>${h.btn('回复','ui',{replyTo:c.id},'social-link')}${h.btn('赞 '+(c.likedBy?.length??0),'social.comment.like',{commentId:c.id},'social-link')}</div></div>`).join('')}<form data-action="social.comment"><input type="hidden" name="postId" value="${h.esc(p.id)}">${ui.replyTo?`<input type="hidden" name="replyTo" value="${h.esc(ui.replyTo)}"><p>回复选中评论 ${h.btn('取消回复','ui',{replyTo:''},'social-link')}</p>`:''}<label class="field">写评论<textarea name="text" required maxlength="500" rows="2" placeholder="说点什么…"></textarea></label><button type="submit" class="primary">发送评论</button></form></section>`;
 }else if(tab==='messages'){
  const ns=s.social.notifications.filter(x=>x.recipientId===me).slice().reverse();body=`<section class="social-notices"><h2>消息</h2>${ns.length?ns.map(n=>`<article class="social-notice ${n.seen?'is-read':''}">${h.avatar(account(s,n.actorId))}<div><b>${h.esc(n.text)}</b><p>${n.seen?'已读':'未读'}${n.withdrawn?' · 后来取消了赞，通知记录保留':''}</p>${n.postId?h.btn('查看微博','nav',{app:'weibo',tab:'post',detail:n.postId},'social-link'):h.btn('查看账号','nav',{app:'weibo',tab:'profile',detail:n.actorId},'social-link')}${!n.seen?h.btn('标为已读','social.notification.read',{notificationId:n.id},'social-link'):''}</div></article>`).join(''):'<div class="empty">当前账号还没有消息。</div>'}</section>`;
 }else{
  let posts=visibleSocialFeed(s,{canRead:canReadPost,mode:tab,query:ui.query||'',accountId:ui.detail||me});let intro='';
  if(tab==='following')posts=posts.filter(p=>(s.social.follows[me]||[]).includes(p.authorId)||p.authorId===me);
  if(tab==='bookmarks')posts=posts.filter(p=>(s.social.bookmarks[me]||[]).includes(p.id));
  if(tab==='search'){const q=String(ui.query||'').toLocaleLowerCase();posts=posts.filter(p=>`${p.text} ${accountDisplayName(account(s,p.authorId))}`.toLocaleLowerCase().includes(q));intro=`<p class="social-search-result">当前可见内容中找到 ${posts.length} 条 · ${h.esc(ui.query||'')}</p>`;}
  if(tab==='profile'){
   const target=account(s,ui.detail||me)||a;posts=posts.filter(p=>p.authorId===target.id).sort((a,b)=>Number(b.id===target.pinnedPostId)-Number(a.id===target.pinnedPostId));intro=`<section class="social-profile"><div class="social-profile-cover">${h.art('city')}</div>${h.avatar(target)}<h2>${h.esc(accountDisplayName(target))}</h2>${displayText(target.handle)?`<p>@${h.esc(target.handle)}</p>`:''}${displayText(target.bio)?`<p>${h.esc(target.bio)}</p>`:''}<div><b>${posts.length}</b> 可见微博 · <b>${(s.social.follows[target.id]||[]).length}</b> 已知关注${Number.isSafeInteger(target.followersCount)?' · '+target.followersCount+' 粉丝':' · 粉丝总数未知'}</div>${target.id!==me?h.btn((s.social.follows[me]||[]).includes(target.id)?'已关注':'关注','social.follow',{accountId:target.id},'secondary')+h.btn((s.social.mutes?.[me]||[]).includes(target.id)?'取消屏蔽':'屏蔽动态','social.mute',{accountId:target.id},'secondary')+h.btn((s.social.blocks?.[me]||[]).includes(target.id)?'解除拉黑':'拉黑','social.block',{accountId:target.id},'secondary'):h.btn('我的收藏','nav',{app:'weibo',tab:'bookmarks',detail:''},'secondary')+h.btn('编辑资料','nav',{app:'weibo',tab:'profile-edit'},'secondary')+h.btn('传播记录','nav',{app:'weibo',tab:'evidence'},'secondary')}</section>`;
  }
  if(['following','recommend','latest','hot','topic'].includes(tab)){intro=h.tabs([{id:'following',label:'关注'},{id:'recommend',label:'推荐'},{id:'latest',label:'最新'},{id:'hot',label:'热搜'}],tab);if(tab==='hot')intro+='<section class="card"><h3>当前公开话题</h3>'+trendingTopics(s,canReadPost).map(t=>h.btn('#'+h.esc(t.name)+'# · '+t.postIds.length+'条','nav',{app:'weibo',tab:'topic',query:t.name},'social-link')).join('')+'<p class="muted">只按已有公开事件与故事时间排序，不随机生成热度。</p></section>';}
  body=intro+(posts.length?posts.map(p=>postMarkup(s,p,h)).join(''):'<div class="empty">这里暂时没有微博。</div>');
 }
 return `<div class="social-weibo"><header class="social-top"><div class="social-brand"><span>W</span><b>${h.esc(s.config?.appNames?.weibo||'微博')}</b></div>${h.btn(h.avatar(a),'ui',{accountMenu:!ui.accountMenu},'social-avatar-button')}</header>${ui.accountMenu?`<div class="social-account-menu"><b>切换账号</b>${s.social.accounts.filter(x=>OWN.has(x.id)).map(x=>h.btn(`${h.avatar(x)}<span>${h.esc(accountDisplayName(x))}<small>${h.esc(x.label||'本人账号')}</small></span>${x.id===me?'✓':''}`,'social.account',{accountId:x.id},'social-account-option')).join('')}<small>小号的私密微博和消息只在该账号内显示。</small></div>`:''}<form class="social-search" data-action="social.search"><input name="query" maxlength="100" placeholder="搜索当前手机中的微博" value="${tab==='search'?h.esc(ui.query||''):''}" required><button type="submit" aria-label="搜索">${h.icon('search')}</button></form>${body}${queueMarkup(s,h)}<nav class="social-bottom">${h.btn(`${h.icon('weibo')}<span>首页</span>`,'nav',{app:'weibo',tab:'recommend',detail:''},'social-bottom-button')}${h.btn(`${h.icon('plus')}<span>发微博</span>`,'nav',{app:'weibo',tab:'compose',photoId:'',songId:'',repostOf:''},'social-bottom-button social-compose-nav')}${h.btn(`${h.icon('bell')}<span>消息${unread?` ${unread}`:''}</span>`,'nav',{app:'weibo',tab:'messages',detail:''},'social-bottom-button')}${h.btn(`${h.icon('user')}<span>我</span>`,'nav',{app:'weibo',tab:'profile',detail:me},'social-bottom-button')}</nav></div>`;
}
export function renderSocial(state,ui,h){
 if(ui.app!=='weibo')return null;
 assert(state.social&&state.media,'社交资料缺失，未自动重置。');
 if(state.config&&!state.config.apps.includes(ui.app))return '<div class="empty">世界未启用这个应用。</div>';
 if(ui.app==='weibo'&&!active(state))return '<div class="empty">尚未配置本人账号。请在当前表单中填写本人的网络账号。</div>';
 return weibo(state,ui,h);
}
