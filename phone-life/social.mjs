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
const mediaOwner=s=>active(s)??s.media.ownerId??s.config?.subjectId??null;
const ownPhoto=(s,p)=>!!p&&(p.ownerId===mediaOwner(s)||p.ownerId===s.media.ownerId||p.ownerId===s.config?.subjectId);

export function canReadPost(s,p,reader=active(s)){
 return !!p && !p.deleted && (p.authorId===reader || p.visibility==='public' || (p.visibility==='followers' && (s.social.follows[reader]||[]).includes(p.authorId)));
}
const needPost=(s,id)=>{const p=s.social.posts.find(x=>x.id===id);assert(canReadPost(s,p),'这条微博不存在，或当前账号没有查看权限。');return p;};
const needPhoto=(s,id)=>{const p=s.media.photos.find(x=>x.id===id);assert(p,'找不到这张相片。');return p;};
const needSong=(s,id)=>{const p=s.media.songs.find(x=>x.id===id);assert(p,'找不到这首歌。');return p;};
const toggle=(arr,id)=>{const n=arr.indexOf(id);if(n<0){arr.push(id);return true;}arr.splice(n,1);return false;};
export function validateSocialState(state){
 assert(state&&state.social&&state.media&&!Array.isArray(state.social)&&!Array.isArray(state.media),'社交或媒体存档结构不完整。');
 assert(state.clock&&((state.clock.day===null&&state.clock.minute===null)||(Number.isInteger(state.clock.day)&&state.clock.day>=1&&state.clock.day<=31&&Number.isInteger(state.clock.minute)&&state.clock.minute>=0&&state.clock.minute<1440)),'故事时点缺失或无效。');
 const s=state.social,m=state.media,OWN=ownAccounts(state);
 const arrays=['accounts','posts','comments','notifications','pending'];for(const k of arrays)assert(Array.isArray(s[k]),`社交存档缺少${k}列表。`);
 for(const k of ['photos','songs','playlists','favoritePhotos','favoriteSongs'])assert(Array.isArray(m[k]),`媒体存档缺少${k}列表。`);
 const ids=(rows,label)=>{const keys=rows.map(x=>x&&x.id);assert(keys.every(x=>typeof x==='string'&&x.length>0&&x.length<200)&&new Set(keys).size===keys.length,`${label}编号缺失或重复。`);return new Set(keys);};
 const people=ids(s.accounts,'账号'),posts=ids(s.posts,'微博'),photos=ids(m.photos,'相片'),songs=ids(m.songs,'歌曲');ids(s.comments,'评论');ids(s.notifications,'通知');ids(s.pending,'待发操作');ids(m.playlists,'歌单');
 assert(Array.isArray(s.ownedAccountIds)&&new Set(s.ownedAccountIds).size===s.ownedAccountIds.length&&[...OWN].every(x=>people.has(x))&&(OWN.size?OWN.has(s.activeAccountId):s.activeAccountId===null),'存档的本人账号不完整。');
 assert([...OWN].every(id=>s.accounts.find(x=>x.id===id).personId===s.ownerPersonId),'本人账号归属错误。');
 assert(s.accidentalLikes===undefined||typeof s.accidentalLikes==='boolean','手滑点赞设置无效。');
 if(s.drafts!==undefined){assert(s.drafts&&typeof s.drafts==='object'&&!Array.isArray(s.drafts),'微博草稿结构无效。');for(const [id,d] of Object.entries(s.drafts))assert(OWN.has(id)&&d&&typeof d.text==='string'&&d.text.length<=2000&&(d.visibility===undefined||['public','followers','private'].includes(d.visibility)),'微博草稿归属或内容无效。');}
 for(const p of s.accounts)assert(typeof p.name==='string'&&typeof p.handle==='string','账号名称或标识不完整。');
 for(const key of ['follows','likes','bookmarks','acceptedLikes']){
  assert(s[key]&&typeof s[key]==='object'&&!Array.isArray(s[key]),`社交存档的${key}结构错误。`);
  for(const who of OWN){const rows=s[key][who];assert(Array.isArray(rows)&&rows.every(x=>typeof x==='string')&&new Set(rows).size===rows.length,`${key}记录缺失或重复。`);assert(rows.every(x=>(key==='follows'?people:posts).has(x)),`${key}包含失效引用。`);}
 }
 for(const p of m.photos)assert((people.has(p.ownerId)||p.ownerId===m.ownerId||p.ownerId===state.config?.subjectId)&&['private','public'].includes(p.visibility)&&['illustration','file'].includes(p.source)&&typeof p.name==='string','相片归属、类型或可见范围不完整。');
 for(const p of s.posts){
  assert(people.has(p.authorId)&&typeof p.text==='string'&&['public','followers','private'].includes(p.visibility)&&Array.isArray(p.mediaIds)&&p.mediaIds.every(x=>photos.has(x)),'微博作者、正文、可见范围或媒体引用错误。');
  if(p.repostOf)assert(posts.has(p.repostOf)&&p.repostOf!==p.id,'原微博引用错误。');if(p.songId)assert(songs.has(p.songId),'微博中的歌曲引用错误。');
  for(const id of p.mediaIds){const photo=m.photos.find(x=>x.id===id);if(photo.visibility==='private')assert((photo.ownerId===p.authorId||(photo.ownerId===m.ownerId&&OWN.has(p.authorId)))&&(p.visibility==='private'||(p.mediaGrants||[]).includes(id)),'私密相片缺少该条微博的分享授权。');}
 }
 for(const c of s.comments)assert(posts.has(c.postId)&&people.has(c.authorId)&&typeof c.text==='string','评论引用或正文错误。');
 for(const n of s.notifications)assert(posts.has(n.postId)&&people.has(n.actorId)&&people.has(n.recipientId)&&typeof n.text==='string'&&typeof n.seen==='boolean','通知归属或来源错误。');
 for(const p of s.pending){assert(p.kind==='like'&&posts.has(p.postId)&&OWN.has(p.actorId)&&typeof p.value==='boolean'&&typeof p.previous==='boolean'&&['queued','sent','accepted','notification-seen','cancelled'].includes(p.status),'点赞收发记录不完整。');if(p.notificationId)assert(s.notifications.some(n=>n.id===p.notificationId),'点赞通知引用缺失。');}
 for(const song of m.songs)assert(typeof song.title==='string'&&typeof song.artist==='string'&&(song.audioId===null||typeof song.audioId==='string')&&(song.duration===undefined||(Number.isFinite(song.duration)&&song.duration>=0)),'歌曲或实际音源信息不完整。');
 for(const p of m.playlists)assert(typeof p.name==='string'&&Array.isArray(p.songIds)&&p.songIds.every(x=>songs.has(x))&&new Set(p.songIds).size===p.songIds.length,'歌单记录或歌曲引用错误。');
 assert(m.favoriteSongs.every(x=>songs.has(x))&&new Set(m.favoriteSongs).size===m.favoriteSongs.length,'音乐收藏引用错误。');
 assert(m.favoritePhotos.every(key=>typeof key==='string'&&[...new Set([...OWN,m.ownerId,state.config?.subjectId].filter(Boolean))].some(who=>key.startsWith(who+':')&&m.photos.some(p=>p.id===key.slice(who.length+1)&&p.ownerId===who)))&&new Set(m.favoritePhotos).size===m.favoritePhotos.length,'相片收藏归属错误。');
 return true;
}
function publish(s,a){
 const by=active(s),visibility=a.visibility||'public';assert(['public','followers','private'].includes(visibility),'请选择有效的可见范围。');
 const content=text(a.text),mediaIds=a.photoId?[String(a.photoId)]:[];
 for(const id of mediaIds){const p=needPhoto(s,id);assert((p.ownerId===by||p.ownerId===s.media.ownerId),'只能使用当前账号自己的相片。');assert(p.visibility==='public'||visibility==='private'||a.allowPublicPhoto===true||a.allowPublicPhoto==='on'||a.allowPublicPhoto==='true','这张相片是私密的。请明确勾选本次分享授权，或设为仅自己可见。');}
 if(a.repostOf){const original=needPost(s,a.repostOf);assert(original.visibility==='public'||visibility==='private','非公开微博的转发请保留为仅自己可见。');}
 if(a.songId)needSong(s,a.songId);
 const p={id:next(s,'post'),authorId:by,text:content,visibility,mediaIds,mediaGrants:visibility==='private'?[]:mediaIds,repostOf:a.repostOf||null,songId:a.songId||null,likesBase:0,createdAt:stamp(s)};
 s.social.posts.unshift(p);s.social.drafts??={};s.social.drafts[by]={text:'',visibility:'public'};return {message:visibility==='private'?'已保存为仅自己可见。':'微博已发布。',postId:p.id,navigate:{app:'weibo',tab:'latest',detail:'',photoId:'',repostOf:'',songId:'',query:''}};
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
 const app=a.type.startsWith('music.')?'music':a.type.startsWith('media.')?'album':'weibo';if(s.config)assert(s.config.apps.includes(app),'世界未启用这个应用。');
 if(!a.type.startsWith('music.')&&!a.type.startsWith('media.')&&!['social.search','social.settings','social.network.advance','social.npc.post','social.npc.comment'].includes(a.type))assert(OWN.has(me),'当前没有可操作的本人账号。');
 if(a.type.startsWith('media.'))assert(typeof me==='string'&&me,'个人媒体归属尚未配置。');
 if(a.type==='media.photo.share')assert(OWN.has(active(s))&&(!s.config||s.config.apps.includes('weibo')),'尚未配置可发博的本人账号或微博应用。');
 if(a.type==='music.share')assert(OWN.has(me)&&(!s.config||s.config.apps.includes('weibo')),'尚未配置可发博的本人账号或微博应用。');
 if(a.type==='social.network.advance')assert(!s.config||s.config.demo===true||acceptedSource,'正式送达只接受宿主已接纳的来源。');
 switch(a.type){
  case 'social.npc.post':{
   assert(acceptedSource,'NPC内容只接受宿主已接纳的来源。');const author=account(s,a.authorId);assert(author&&!OWN.has(author.id),'NPC作者必须是已登记的非本人账号。');
   assert(typeof a.postId==='string'&&a.postId.length>0&&a.postId.length<=160&&!['__proto__','constructor','prototype'].includes(a.postId)&&!s.social.posts.some(p=>p.id===a.postId),'NPC新微博编号无效或已经存在。');
   const p={id:a.postId,authorId:author.id,text:text(a.text),visibility:'public',mediaIds:[],mediaGrants:[],repostOf:null,songId:null,likesBase:null,createdAt:stamp(s)};s.social.posts.unshift(p);result={message:'已接纳这一轮的公开内容。',postId:p.id};break;
  }
  case 'social.npc.comment':{
   assert(acceptedSource,'NPC内容只接受宿主已接纳的来源。');const author=account(s,a.authorId);assert(author&&!OWN.has(author.id),'NPC作者必须是已登记的非本人账号。');
   const p=s.social.posts.find(row=>row.id===a.postId);assert(canReadPost(s,p,author.id),'该NPC没有读取这条微博的依据。');const c={id:next(s,'comment'),postId:p.id,authorId:author.id,text:text(a.text,500),createdAt:stamp(s)};s.social.comments.push(c);
   if(p.authorId!==author.id)s.social.notifications.push({id:next(s,'notice'),kind:'social.comment',recipientId:p.authorId,actorId:author.id,postId:p.id,text:`${author.name}评论了你的微博`,seen:false,withdrawn:false});result={message:'已接纳这一轮的评论。',commentId:c.id};break;
  }
  case 'social.settings':assert(typeof a.accidentalLikes==='boolean','请选择是否启用双击点赞。');s.social.accidentalLikes=a.accidentalLikes;result={message:a.accidentalLikes?'已启用双击图片点赞；可在送出前撤销。':'已关闭双击图片点赞。'};break;
  case 'social.draft.save':{const content=String(a.text??'');assert(content.length<=2000,'微博草稿不能超过2000字。');const visibility=a.visibility||s.social.drafts?.[me]?.visibility||'public';assert(['public','followers','private'].includes(visibility),'草稿可见范围无效。');s.social.drafts??={};s.social.drafts[me]={text:content,visibility};result={message:'草稿已保存。'};break;}
  case 'social.account': assert(OWN.has(a.accountId)&&account(s,a.accountId),'只能切换自己的已登记账号。');s.social.activeAccountId=a.accountId;result={message:`已切换到${account(s,a.accountId).name}`,navigate:{app:'weibo',tab:'latest',detail:'',accountMenu:false,photoId:'',repostOf:'',songId:''}};break;
  case 'social.search':result={message:'已搜索当前手机中的微博。',navigate:{app:'weibo',tab:'search',query:text(a.query,100)}};break;
  case 'social.publish':result=publish(s,a);break;
  case 'social.delete':{const p=needPost(s,a.postId);assert(p.authorId===me,'只能删除当前账号自己的微博。');p.deleted=true;result={message:'这条微博已删除。',navigate:{app:'weibo',tab:'latest',detail:''}};break;}
  case 'social.comment':{const p=needPost(s,a.postId);const c={id:next(s,'comment'),postId:p.id,authorId:me,text:text(a.text,500),createdAt:stamp(s)};s.social.comments.push(c);if(p.authorId!==me)s.social.notifications.push({id:next(s,'notice'),kind:'social.comment',recipientId:p.authorId,actorId:me,postId:p.id,text:`${account(s,me).name}评论了你的微博`,seen:false,withdrawn:false});result={message:'评论已发出。',navigate:{app:'weibo',tab:'post',detail:p.id}};break;}
  case 'social.follow':{assert(account(s,a.accountId)&&a.accountId!==me,'请选择其他账号。');const on=toggle(list(s.social.follows,me),a.accountId);result={message:on?'已关注。':'已取消关注。'};break;}
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
     if(p.value&&post&&post.authorId!==p.actorId){const n={id:next(s,'notice'),kind:'social.like',recipientId:post.authorId,actorId:p.actorId,postId:p.postId,text:`${account(s,p.actorId).name}赞了你的微博`,seen:false,withdrawn:false};s.social.notifications.push(n);p.notificationId=n.id;}
     if(!p.value)for(const n of s.social.notifications)if(n.kind==='social.like'&&n.actorId===p.actorId&&n.postId===p.postId)n.withdrawn=true;
     changed++;
    }else if(p.status==='accepted'&&p.value&&p.notificationId){const n=s.social.notifications.find(x=>x.id===p.notificationId);if(n)n.seen=true;p.status='notification-seen';changed++;}
   }
   result={message:changed?'已演示下一步送达状态；这是本地模拟。':'当前没有需要推进的社交动作。'};break;
  }
  case 'social.notification.read':{const n=s.social.notifications.find(x=>x.id===a.notificationId&&x.recipientId===me);assert(n,'当前账号没有这条通知。');n.seen=true;for(const p of s.social.pending)if(p.notificationId===n.id&&p.status==='accepted')p.status='notification-seen';result={message:'已读。'};break;}
  case 'media.photo.add':{const p=a.photo;assert(p&&typeof p.id==='string'&&!s.media.photos.some(x=>x.id===p.id),'相片编号无效或已存在。');assert(p.source==='file'&&p.ownerId===me&&p.visibility==='private','新导入相片必须属于当前账号并保留私密。');s.media.photos.push({id:p.id,name:text(p.name,100),source:'file',ownerId:me,visibility:'private',mime:String(p.mime||''),createdAt:stamp(s)});result={message:'已导入到当前账号的私密相册。',navigate:{app:'album',tab:'all',detail:p.id}};break;}
  case 'media.photo.favorite':{const p=needPhoto(s,a.photoId);assert(ownPhoto(s,p),'这不是当前账号的相片。');const key=`${p.ownerId}:${p.id}`,on=toggle(s.media.favoritePhotos,key);result={message:on?'已收藏相片。':'已取消收藏。'};break;}
  case 'media.photo.share':{const p=needPhoto(s,a.photoId);assert(ownPhoto(s,p),'只能分享当前账号的相片。');result={message:'请选择本次微博的可见范围。',navigate:{app:'weibo',tab:'compose',photoId:p.id,repostOf:'',songId:'',detail:'',visibility:'private'}};break;}
  case 'music.song.add':{const p=a.song;assert(p&&typeof p.id==='string'&&!s.media.songs.some(x=>x.id===p.id),'歌曲编号无效或已存在。');s.media.songs.push({id:p.id,title:text(p.title,100),artist:String(p.artist||'本地导入'),album:String(p.album||'我的音乐'),cover:'album',audioId:p.audioId?String(p.audioId):null,...(Number.isFinite(p.duration)&&p.duration>=0?{duration:p.duration}:{})});result={message:'已加入音乐库。',navigate:{app:'music',tab:'library',detail:p.id}};break;}
  case 'music.source.attach':{const song=needSong(s,a.songId);assert(typeof a.mediaId==='string'&&a.mediaId,'缺少已保存的音源编号。');song.audioId=a.mediaId;if(Number.isFinite(a.duration)&&a.duration>=0)song.duration=a.duration;else delete song.duration;result={message:'已关联导入音源。',navigate:{app:'music',tab:'library',detail:song.id}};break;}
  case 'music.favorite':{needSong(s,a.songId);const on=toggle(s.media.favoriteSongs,a.songId);result={message:on?'已加入喜欢的音乐。':'已移出喜欢的音乐。'};break;}
  case 'music.playlist.create':{const p={id:next(s,'playlist'),name:text(a.name,40),songIds:[]};s.media.playlists.push(p);result={message:'歌单已创建。',navigate:{app:'music',tab:'playlists',detail:p.id}};break;}
  case 'music.playlist.add':{const p=s.media.playlists.find(x=>x.id===a.playlistId);assert(p,'歌单不存在。');needSong(s,a.songId);if(!p.songIds.includes(a.songId))p.songIds.push(a.songId);result={message:'已加入歌单。'};break;}
  case 'music.playlist.remove':{const p=s.media.playlists.find(x=>x.id===a.playlistId);assert(p,'歌单不存在。');p.songIds=p.songIds.filter(x=>x!==a.songId);result={message:'已从歌单移除。'};break;}
  case 'music.share':needSong(s,a.songId);result={message:'写一句分享吧。',navigate:{app:'weibo',tab:'compose',songId:a.songId,photoId:'',repostOf:'',detail:'',visibility:'public'}};break;
  default:throw new Error('暂不支持这项社交操作。');
 }
 s.applied=[...(s.applied||[]),action.id];s.revision=(s.revision||0)+1;s.receipts??={};s.receipts[action.id]={fingerprint,result:copy(result),at:s.clock.totalMinutes};if(Array.isArray(s.audit))s.audit.push({id:action.id,at:s.clock.totalMinutes,type:action.type,message:result.message});validateSocialState(s);return {state:s,result};
}
const timeLabel=p=>Number.isInteger(p?.createdAt?.day)&&Number.isInteger(p?.createdAt?.minute)?`${p.createdAt.day}日 ${String(Math.floor(p.createdAt.minute/60)).padStart(2,'0')}:${String(p.createdAt.minute%60).padStart(2,'0')}`:'故事时间未配置';
function photoMarkup(s,p,h,extra=''){
 const url=h.mediaUrl(p.id);
 if(url)return `<img class="social-photo ${extra}" src="${h.esc(url)}" alt="${h.esc(p.name)}">`;
 if(p.source==='illustration')return `<div class="social-photo social-illustration ${extra}" role="img" aria-label="${h.esc(p.name)}，原创插画">${h.art(p.art||'photo')}<span>插画</span></div>`;
 return `<div class="social-photo social-missing ${extra}">原图暂不可用<br><small>请重新导入原文件</small></div>`;
}
function visibilityLabel(p){return p.visibility==='private'?'仅自己可见':p.visibility==='followers'?'关注者可见':'公开';}
function postMarkup(s,p,h,{detail=false}={}){
 const a=account(s,p.authorId),me=active(s),liked=(s.social.likes[me]||[]).includes(p.id),saved=(s.social.bookmarks[me]||[]).includes(p.id),comments=s.social.comments.filter(x=>x.postId===p.id);
 const likes=(p.likesBase||0)+Object.values(s.social.likes).filter(x=>x.includes(p.id)).length;
 const media=(p.mediaIds||[]).map(id=>s.media.photos.find(x=>x.id===id)).filter(Boolean).map(photo=>`<div class="social-post-image" data-like-post="${h.esc(p.id)}">${photoMarkup(s,photo,h)}</div>`).join('');
 const original=p.repostOf?s.social.posts.find(x=>x.id===p.repostOf):null;
 const song=p.songId?s.media.songs.find(x=>x.id===p.songId):null;
 return `<article class="social-post"><header>${h.btn(h.avatar(a),'nav',{app:'weibo',tab:'profile',detail:a.id},'social-avatar-button')}<div class="social-author">${h.btn(h.esc(a.name),'nav',{app:'weibo',tab:'profile',detail:a.id},'social-name')}<span>${timeLabel(p)} · ${visibilityLabel(p)}</span></div>${p.authorId!==me?h.btn((s.social.follows[me]||[]).includes(p.authorId)?'已关注':'+ 关注','social.follow',{accountId:p.authorId},'social-follow'):''}</header><div class="social-post-text">${h.esc(p.text).replace(/\n/g,'<br>')}</div>${media?`<div class="social-post-images">${media}</div>`:''}${p.repostOf?`<div class="social-repost">${canReadPost(s,original)?`<b>@${h.esc(account(s,original.authorId).name)}</b><p>${h.esc(original.text)}</p>${h.btn('查看原微博','nav',{app:'weibo',tab:'post',detail:original.id},'social-link')}`:'原微博已不可见，转发记录仍保留。'}</div>`:''}${song?`<div class="social-song-share">${h.art(song.cover||'album')}<div><b>${h.esc(song.title)}</b><small>${h.esc(song.artist)} · 音乐分享</small></div>${h.btn(h.icon('play'),'nav',{app:'music',tab:'library',detail:song.id},'social-icon-button')}</div>`:''}<footer>${h.btn(`${h.icon('share')} 转发`,'nav',{app:'weibo',tab:'compose',repostOf:p.id,photoId:'',songId:'',visibility:p.visibility==='public'?'public':'private'},'social-action')}${h.btn(`${h.icon('comment')} ${comments.length||'评论'}`,'nav',{app:'weibo',tab:'post',detail:p.id},'social-action')}${h.btn(`${h.icon('heart')} ${likes||'赞'}`,'social.like',{postId:p.id},`social-action ${liked?'is-liked':''}`)}${h.btn(h.icon('star'),'social.bookmark',{postId:p.id},`social-action social-save ${saved?'is-saved':''}`)}</footer>${detail&&p.authorId===me?`<div class="social-own-controls">${h.btn('删除这条微博','social.delete',{postId:p.id},'social-delete')}</div>`:''}</article>`;
}
function queueMarkup(s,h){
 const operations=s.social.pending.filter(x=>x.actorId===active(s)).slice(-4).reverse();if(!operations.length)return '';
 const names={queued:'待送出',sent:'已送出',accepted:'已送达','notification-seen':'对方已看见',cancelled:'送出前已撤销'};
 return `<details class="social-delivery"><summary>最近的点赞 · ${names[operations[0].status]}</summary>${operations.map(x=>`<div><span>${x.value?'点赞':'取消赞'}</span><b>${names[x.status]}</b></div>`).join('')}<p>送出前可合并撤销；对方已看见的通知会保留。</p>${!s.config||s.config.demo?h.btn('演示下一步送达','social.network.advance',{},'secondary')+'<small>本地演示，不会调用模型或发送真实通知。</small>':'<small>等待宿主下一轮正式接纳。</small>'}</details>`;
}
function compose(s,ui,h){
 const photo=ui.photoId?s.media.photos.find(x=>x.id===ui.photoId&&(x.ownerId===active(s)||x.ownerId===s.media.ownerId)):null, song=ui.songId?s.media.songs.find(x=>x.id===ui.songId):null;
 const draft=s.social.drafts?.[active(s)];const selected=ui.visibility||draft?.visibility||(photo?'private':'public');
 return `<section class="social-compose"><h2>分享这一刻</h2><p class="muted">使用 ${h.esc(account(s,active(s)).name)} 发布</p><form data-action="social.publish"><textarea name="text" rows="6" maxlength="2000" required placeholder="有什么想说的？">${h.esc(draft?.text||(song?`分享歌曲《${song.title}》`:''))}</textarea>${photo?`<div class="social-compose-photo">${photoMarkup(s,photo,h)}</div><input type="hidden" name="photoId" value="${h.esc(photo.id)}">`:''}${ui.repostOf?`<input type="hidden" name="repostOf" value="${h.esc(ui.repostOf)}"><p class="muted">转发原微博，保留来源引用。</p>`:''}${song?`<input type="hidden" name="songId" value="${h.esc(song.id)}"><div class="chip">♫ ${h.esc(song.title)}</div>`:''}<label class="field">谁可以看<select name="visibility"><option value="public" ${selected==='public'?'selected':''}>公开</option><option value="followers" ${selected==='followers'?'selected':''}>关注者可见</option><option value="private" ${selected==='private'?'selected':''}>仅自己可见</option></select></label>${photo&&photo.visibility!=='public'?'<label class="social-consent"><input type="checkbox" name="allowPublicPhoto">允许这一次把该私密相片分享给所选范围；相册原件仍为私密。</label>':''}<button type="submit" class="primary full-width">发布微博</button></form></section>`;
}
function weibo(s,ui,h){
 const me=active(s),a=account(s,me),OWN=ownAccounts(s),tab=ui.tab||'recommend',unread=s.social.notifications.filter(x=>x.recipientId===me&&!x.seen).length;
 let body='';
 if(tab==='compose')body=compose(s,ui,h);
 else if(tab==='post'){
  const p=s.social.posts.find(x=>x.id===ui.detail);if(!canReadPost(s,p))body='<div class="empty">这条微博当前不可见。</div>';
  else body=postMarkup(s,p,h,{detail:true})+`<section class="social-comments"><h3>评论 ${s.social.comments.filter(x=>x.postId===p.id).length}</h3>${s.social.comments.filter(x=>x.postId===p.id).map(c=>`<div class="social-comment">${h.avatar(account(s,c.authorId))}<div><b>${h.esc(account(s,c.authorId).name)}</b><p>${h.esc(c.text)}</p><small>${timeLabel(c)}</small></div></div>`).join('')}<form data-action="social.comment"><input type="hidden" name="postId" value="${h.esc(p.id)}"><label class="field">写评论<textarea name="text" required maxlength="500" rows="2" placeholder="说点什么…"></textarea></label><button type="submit" class="primary">发送评论</button></form></section>`;
 }else if(tab==='messages'){
  const ns=s.social.notifications.filter(x=>x.recipientId===me).slice().reverse();body=`<section class="social-notices"><h2>消息</h2>${ns.length?ns.map(n=>`<article class="social-notice ${n.seen?'is-read':''}">${h.avatar(account(s,n.actorId))}<div><b>${h.esc(n.text)}</b><p>${n.seen?'已读':'未读'}${n.withdrawn?' · 后来取消了赞，通知记录保留':''}</p>${h.btn('查看微博','nav',{app:'weibo',tab:'post',detail:n.postId},'social-link')}${!n.seen?h.btn('标为已读','social.notification.read',{notificationId:n.id},'social-link'):''}</div></article>`).join(''):'<div class="empty">当前账号还没有消息。</div>'}</section>`;
 }else{
  let posts=s.social.posts.filter(p=>canReadPost(s,p));let intro='';
  if(tab==='following')posts=posts.filter(p=>(s.social.follows[me]||[]).includes(p.authorId)||p.authorId===me);
  if(tab==='bookmarks')posts=posts.filter(p=>(s.social.bookmarks[me]||[]).includes(p.id));
  if(tab==='search'){const q=String(ui.query||'').toLocaleLowerCase();posts=posts.filter(p=>`${p.text} ${account(s,p.authorId).name}`.toLocaleLowerCase().includes(q));intro=`<p class="social-search-result">当前可见内容中找到 ${posts.length} 条 · ${h.esc(ui.query||'')}</p>`;}
  if(tab==='profile'){
   const target=account(s,ui.detail||me)||a;posts=posts.filter(p=>p.authorId===target.id);intro=`<section class="social-profile"><div class="social-profile-cover">${h.art('city')}</div>${h.avatar(target)}<h2>${h.esc(target.name)}</h2><p>@${h.esc(target.handle)}</p><p>${h.esc(target.bio)}</p><div><b>${posts.length}</b> 可见微博 · <b>${(s.social.follows[target.id]||[]).length}</b> 关注</div>${target.id!==me?h.btn((s.social.follows[me]||[]).includes(target.id)?'已关注':'关注','social.follow',{accountId:target.id},'secondary'):h.btn('我的收藏','nav',{app:'weibo',tab:'bookmarks',detail:''},'secondary')}</section>`;
  }
  if(['following','recommend','latest'].includes(tab))intro=h.tabs([{id:'following',label:'关注'},{id:'recommend',label:'推荐'},{id:'latest',label:'最新'}],tab);
  body=intro+(posts.length?posts.map(p=>postMarkup(s,p,h)).join(''):'<div class="empty">这里暂时没有微博。</div>');
 }
 return `<div class="social-weibo"><header class="social-top"><div class="social-brand"><span>W</span><b>${h.esc(s.config?.appNames?.weibo||'微博')}</b></div>${h.btn(h.avatar(a),'ui',{accountMenu:!ui.accountMenu},'social-avatar-button')}</header>${ui.accountMenu?`<div class="social-account-menu"><b>切换账号</b>${s.social.accounts.filter(x=>OWN.has(x.id)).map(x=>h.btn(`${h.avatar(x)}<span>${h.esc(x.name)}<small>${h.esc(x.label||'本人账号')}</small></span>${x.id===me?'✓':''}`,'social.account',{accountId:x.id},'social-account-option')).join('')}<small>小号的私密微博和消息只在该账号内显示。</small></div>`:''}<form class="social-search" data-action="social.search"><input name="query" maxlength="100" placeholder="搜索当前手机中的微博" value="${tab==='search'?h.esc(ui.query||''):''}" required><button type="submit" aria-label="搜索">${h.icon('search')}</button></form>${body}${queueMarkup(s,h)}<nav class="social-bottom">${h.btn(`${h.icon('weibo')}<span>首页</span>`,'nav',{app:'weibo',tab:'recommend',detail:''},'social-bottom-button')}${h.btn(`${h.icon('plus')}<span>发微博</span>`,'nav',{app:'weibo',tab:'compose',photoId:'',songId:'',repostOf:''},'social-bottom-button social-compose-nav')}${h.btn(`${h.icon('bell')}<span>消息${unread?` ${unread}`:''}</span>`,'nav',{app:'weibo',tab:'messages',detail:''},'social-bottom-button')}${h.btn(`${h.icon('user')}<span>我</span>`,'nav',{app:'weibo',tab:'profile',detail:me},'social-bottom-button')}</nav></div>`;
}
function album(s,ui,h){
 const me=mediaOwner(s),selected=s.media.photos.find(x=>x.id===ui.detail&&ownPhoto(s,x));
 if(selected)return `<section class="social-album-detail"><header class="app-heading">${h.btn(h.icon('back'),'ui',{detail:''},'social-icon-button')}<h2>${h.esc(selected.name)}</h2></header>${photoMarkup(s,selected,h)}${h.btn('查看原图','media.open',{photoId:selected.id},'social-link')}<p class="muted">${selected.visibility==='private'?'私密相片，只属于当前账号':'已公开的相片'} · ${selected.source==='illustration'?'原创演示插画':'已导入原图'}</p><div class="grid-2">${h.btn(`${h.icon('heart')} ${s.media.favoritePhotos.includes(`${selected.ownerId}:${selected.id}`)?'已收藏':'收藏'}`,'media.photo.favorite',{photoId:selected.id},'secondary')}${h.btn(`${h.icon('share')} 分享到微博`,'media.photo.share',{photoId:selected.id},'primary')}</div></section>`;
 let photos=s.media.photos.filter(x=>ownPhoto(s,x));if(ui.tab==='favorites')photos=photos.filter(x=>s.media.favoritePhotos.includes(`${x.ownerId}:${x.id}`));
 return `<section class="social-album"><header class="app-heading"><div><h2>相册</h2><p class="muted">${h.esc(account(s,me)?.name||s.identity?.name||'我的相册')} · ${photos.length}张</p></div>${h.btn(`${h.icon('plus')} 导入`,'file.image',{},'secondary')}</header>${h.tabs([{id:'all',label:'全部相片'},{id:'favorites',label:'收藏'}],ui.tab||'all')}<div class="social-photo-grid">${photos.map(p=>h.btn(`${photoMarkup(s,p,h)}<span>${h.esc(p.name)}</span>${p.visibility==='private'?'<small>私密</small>':''}`,'ui',{detail:p.id},'social-photo-tile')).join('')||'<div class="empty">还没有相片，导入一张吧。</div>'}</div><p class="social-footnote">导入默认私密；分享时单独选择本次可见范围。</p></section>`;
}
function music(s,ui,h){
 const song=s.media.songs.find(x=>x.id===ui.detail),playlist=s.media.playlists.find(x=>x.id===ui.detail),tab=ui.tab||'library';
 const songRow=(x,remove=false)=>`<article class="social-music-row">${h.btn(h.art(x.cover||'album'),'ui',{detail:x.id,tab:'library'},'social-music-thumb')}<div>${h.btn(h.esc(x.title),'ui',{detail:x.id,tab:'library'},'social-song-title')}<small>${h.esc(x.artist)}${x.audioId&&h.mediaUrl(x.audioId)?' · 有音源':' · 未关联音源'}</small></div>${remove?h.btn('移除','music.playlist.remove',{playlistId:playlist.id,songId:x.id},'social-link'):h.btn(h.icon('play'),x.audioId&&h.mediaUrl(x.audioId)?'player.play':'file.audio',{songId:x.id},'social-icon-button')}</article>`;
 let content='';
 if(song){const has=!!(song.audioId&&h.mediaUrl(song.audioId));content=`<div class="social-song-detail"><div class="social-record-cover">${h.art(song.cover||'album')}</div><h2>${h.esc(song.title)}</h2><p>${h.esc(song.artist)} · ${h.esc(song.album||'单曲')}</p><p class="muted">${has?'已关联真实本地音源': '还没有音源。选择音频文件后才能播放。'}</p><div class="social-music-actions">${h.btn(`${h.icon('heart')} ${s.media.favoriteSongs.includes(song.id)?'已喜欢':'喜欢'}`,'music.favorite',{songId:song.id},'secondary')}${h.btn(`${h.icon('play')} ${has?'播放':'选择音源'}`,has?'player.play':'file.audio',{songId:song.id},'primary')}${h.btn(h.icon('share'),'music.share',{songId:song.id},'secondary')}</div>${has?h.btn('更换音源','file.audio',{songId:song.id},'social-link'):''}<form class="social-add-playlist" data-action="music.playlist.add"><input type="hidden" name="songId" value="${h.esc(song.id)}"><label class="field">加入歌单<select name="playlistId">${s.media.playlists.map(x=>`<option value="${h.esc(x.id)}">${h.esc(x.name)}</option>`).join('')}</select></label><button type="submit" class="secondary">加入</button></form></div>`;}
 else if(playlist)content=`<div class="social-playlist-cover">${h.art('night')}<div><small>我的歌单</small><h2>${h.esc(playlist.name)}</h2><p>${playlist.songIds.length}首</p></div></div>${playlist.songIds.map(id=>s.media.songs.find(x=>x.id===id)).filter(Boolean).map(x=>songRow(x,true)).join('')||'<div class="empty">去作品页把喜欢的歌加进来。</div>'}`;
 else if(tab==='playlists')content=`<div class="social-playlists">${s.media.playlists.map(p=>h.btn(`${h.art('night')}<span><b>${h.esc(p.name)}</b><small>${p.songIds.length}首</small></span>`,'ui',{detail:p.id},'social-playlist-tile')).join('')}</div><form class="card" data-action="music.playlist.create"><label class="field">新建歌单<input name="name" required maxlength="40" placeholder="给这份心情起个名字"></label><button type="submit" class="primary">创建歌单</button></form>`;
 else{const songs=tab==='favorites'?s.media.songs.filter(x=>s.media.favoriteSongs.includes(x.id)):s.media.songs;content=songs.map(x=>songRow(x)).join('')||'<div class="empty">还没有收藏音乐。</div>';}
 return `<section class="social-music"><header class="app-heading">${ui.detail?h.btn(h.icon('back'),'ui',{detail:''},'social-icon-button'):''}<div><small>陪你走过这一程</small><h2>音乐</h2></div>${h.btn(`${h.icon('plus')} 导入`,'file.audio',{},'secondary')}</header>${!ui.detail?h.tabs([{id:'library',label:'音乐库'},{id:'playlists',label:'歌单'},{id:'favorites',label:'喜欢'}],tab):''}${content}<p class="social-footnote">${s.config?.demo===false?'作品资料来自角色档案或本机导入；播放只使用已关联的真实音频。':'作品名与封面为演示资料；播放只使用你导入的真实音频。'}</p></section>`;
}
export function renderSocial(state,ui,h){
 if(!['weibo','album','music'].includes(ui.app))return null;
 assert(state.social&&state.media,'社交资料缺失，未自动重置。');
 if(state.config&&!state.config.apps.includes(ui.app))return '<div class="empty">世界未启用这个应用。</div>';
 if(ui.app==='weibo'&&!active(state))return '<div class="empty">尚未配置本人账号。请在角色档案中填写手机初态。</div>';
 return ui.app==='weibo'?weibo(state,ui,h):ui.app==='album'?album(state,ui,h):music(state,ui,h);
}
