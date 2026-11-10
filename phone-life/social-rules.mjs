const check=(v,m)=>{if(!v)throw new Error(m);};
const bounded=(v,max)=>{check(typeof v==='string'&&v.trim()&&v.trim().length<=max,'内容长度无效。');return v.trim();};
export const SOCIAL_WORLD_ACTIONS={
 'social.metrics':['postId','views','likes','comments','reposts','sourceId'],
 'social.propagate':['postId','actorId','kind','evidenceId','text'],
};
const localLikes=(s,p)=>Object.values(s.social.likes).filter(ids=>ids.includes(p.id)).length;
export function postCounts(s,p){
 const m=p.metrics,own=localLikes(s,p),comments=s.social.comments.filter(c=>c.postId===p.id).length,reposts=s.social.posts.filter(c=>c.repostOf===p.id&&!c.deleted).length;
 return m?{likes:Math.max(0,m.likes+own-m.localLikes),comments:Math.max(0,m.comments+comments-m.localComments),reposts:Math.max(0,m.reposts+reposts-m.localReposts),views:m.views}:{likes:p.likesBase==null?null:p.likesBase+own,comments,reposts,views:null};
}
export function topicsOf(p){return [...new Set([...(p.topics??[]),...Array.from(String(p.text??'').matchAll(/#([^#\n]{1,40})#/g),m=>m[1].trim())].filter(Boolean))];}
export function socialHeat(s,p){const c=postCounts(s,p),at=p.createdAt?.totalMinutes,age=Number.isFinite(at)?Math.max(0,s.clock.totalMinutes-at):0;return (c.likes+c.comments*2+c.reposts*3+Math.floor(c.views/100)+1)/(1+Math.floor(age/1440));}
export function visibleSocialFeed(s,{canRead,mode='latest',query='',accountId=null}={}){
 const me=s.social.activeAccountId,muted=s.social.mutes?.[me]??[];
 let rows=s.social.posts.filter(p=>canRead(s,p)&&(!muted.includes(p.authorId)||mode==='profile'));
 if(mode==='following')rows=rows.filter(p=>p.authorId===me||(s.social.follows[me]??[]).includes(p.authorId));
 if(mode==='profile')rows=rows.filter(p=>p.authorId===accountId);
 if(mode==='topic')rows=rows.filter(p=>topicsOf(p).includes(query));
 if(mode==='recommend'||mode==='hot')rows=rows.filter(p=>p.visibility==='public'||p.authorId===me).sort((a,b)=>socialHeat(s,b)-socialHeat(s,a)||(b.createdAt?.totalMinutes??0)-(a.createdAt?.totalMinutes??0)||a.id.localeCompare(b.id));
 else rows=rows.sort((a,b)=>(b.createdAt?.totalMinutes??0)-(a.createdAt?.totalMinutes??0));
 return rows;
}
export function trendingTopics(s,canRead){const topics=new Map();for(const p of visibleSocialFeed(s,{canRead,mode:'hot'})){if(p.visibility!=='public')continue;for(const name of topicsOf(p)){const row=topics.get(name)??{name,score:0,postIds:[]};row.score+=socialHeat(s,p);row.postIds.push(p.id);topics.set(name,row);}}return [...topics.values()].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,30);}
export function validateSocialExtensions(s){
 const people=new Set(s.social.accounts.map(a=>a.id)),posts=new Set(s.social.posts.map(p=>p.id));
 for(const key of ['mutes','blocks'])if(s.social[key]){check(typeof s.social[key]==='object'&&!Array.isArray(s.social[key]),'社交屏蔽记录无效。');for(const [who,rows]of Object.entries(s.social[key]))check(people.has(who)&&Array.isArray(rows)&&new Set(rows).size===rows.length&&rows.every(id=>people.has(id)&&id!==who),'社交屏蔽引用无效。');}
 const ids=new Set();for(const row of s.social.evidence??[]){check(row.id&&!ids.has(row.id)&&posts.has(row.postId)&&people.has(row.actorId)&&['public','private'].includes(row.visibility)&&row.snapshot&&typeof row.snapshot.text==='string','传播证据引用或快照无效。');ids.add(row.id);}
 for(const p of s.social.posts)if(p.metrics){for(const k of ['views','likes','comments','reposts','localLikes','localComments','localReposts'])check(Number.isSafeInteger(p.metrics[k])&&p.metrics[k]>=0,'传播统计无效。');check(typeof p.metrics.sourceId==='string'&&p.metrics.sourceId,'传播统计缺少来源。');}
 for(const c of s.social.comments){if(c.replyTo)check(s.social.comments.some(x=>x.id===c.replyTo&&x.postId===c.postId&&x.id!==c.id),'评论回复引用无效。');if(c.likedBy)check(Array.isArray(c.likedBy)&&new Set(c.likedBy).size===c.likedBy.length&&c.likedBy.every(id=>people.has(id)),'评论点赞引用无效。');}
 return true;
}
export function performSocialExtension(s,a,h,{acceptedSource=false}={}){
 const me=s.social.activeAccountId,people=s.social.accounts,post=id=>{const p=s.social.posts.find(x=>x.id===id);check(h.canRead(s,p),'该内容不可见。');return p;},stamp=()=>({...s.clock});
 switch(a.type){
  case 'social.comment.like':{const c=s.social.comments.find(x=>x.id===a.commentId);check(c,'评论不存在。');post(c.postId);check(!(s.social.blocks?.[me]??[]).includes(c.authorId),'该评论作者已被拉黑。');const rows=c.likedBy??=[],i=rows.indexOf(me);if(i<0)rows.push(me);else rows.splice(i,1);c.likedBy=rows;return {message:i<0?'已赞这条评论。':'已取消评论赞。'};}
  case 'social.mute':case 'social.block':{check(people.some(x=>x.id===a.accountId)&&a.accountId!==me,'请选择其他已登记账号。');const key=a.type==='social.mute'?'mutes':'blocks',map=s.social[key]??={},rows=map[me]??=[],i=rows.indexOf(a.accountId);if(i<0)rows.push(a.accountId);else rows.splice(i,1);map[me]=rows;s.social[key]=map;return {message:i<0?(key==='mutes'?'已屏蔽该账号的动态。':'已拉黑该账号，读取与互动边界生效。'):'已解除。'};}
  case 'social.profile.edit':{const row=people.find(x=>x.id===me);check(row,'本人账号不存在。');if(a.name!==undefined)row.name=bounded(a.name,100);if(a.bio!==undefined){check(typeof a.bio==='string'&&a.bio.length<=1000,'简介过长。');row.bio=a.bio;}if(a.avatarId!==undefined){const p=s.media.photos.find(x=>x.id===a.avatarId);check(p&&[me,s.media.ownerId].includes(p.ownerId)&&!p.deletedAt&&!p.purged,'头像原件不可用。');check(p.visibility==='public'||a.allowPublicPhoto===true||a.allowPublicPhoto==='on','私密头像需要明确授权公开。');row.avatarId=p.id;row.avatarGrant=true;}return {message:'账号资料已保存。'};}
  case 'social.edit':{const p=post(a.postId);check(p.authorId===me,'只能编辑当前账号自己的内容。');check(a.expectedVersion===undefined||Number(a.expectedVersion)===(p.version??1),'原帖已经更新，请重新核对。');const previous={version:p.version??1,text:p.text,visibility:p.visibility,topics:topicsOf(p),at:stamp()};if(a.text!==undefined)p.text=bounded(a.text,2000);if(a.visibility!==undefined){check(['public','followers','private'].includes(a.visibility),'可见范围无效。');if(p.visibility==='private'&&a.visibility!=='private'&&p.mediaIds.length)check(a.allowPublicPhoto===true||a.allowPublicPhoto==='on','公开私密媒体需再次授权。');p.visibility=a.visibility;if(p.visibility!=='private')p.mediaGrants=[...p.mediaIds];}p.version=(p.version??1)+1;(p.versions??=[]).push(previous);p.editedAt=stamp();return {message:'编辑已保存，原版本与历史转发仍保留。',navigate:{app:'weibo',tab:'post',detail:p.id}};}
  case 'social.pin':{const p=post(a.postId);check(p.authorId===me,'只能置顶自己的内容。');const row=people.find(x=>x.id===me);row.pinnedPostId=row.pinnedPostId===p.id?null:p.id;return {message:row.pinnedPostId?'已置顶这条微博。':'已取消置顶。'};}
  case 'social.metrics':{check(acceptedSource,'传播统计只接受已接纳的世界回执。');const p=s.social.posts.find(x=>x.id===a.postId);check(p&&p.visibility==='public'&&!p.deleted,'只能更新已有公开内容的统计。');for(const k of ['views','likes','comments','reposts'])check(Number.isSafeInteger(a[k])&&a[k]>=0&&a[k]<=1000000000,'传播统计须是有限非负整数。');check(typeof a.sourceId==='string'&&a.sourceId&&a.sourceId.length<=160,'传播统计缺少稳定来源。');const old=p.metrics;if(old?.sourceId===a.sourceId){check(['views','likes','comments','reposts'].every(k=>old[k]===a[k]),'同一统计来源不能改写数值。');return {message:'同一来源的传播统计已存在。'};}p.metrics={sourceId:a.sourceId,views:a.views,likes:a.likes,comments:a.comments,reposts:a.reposts,localLikes:localLikes(s,p),localComments:s.social.comments.filter(c=>c.postId===p.id).length,localReposts:s.social.posts.filter(c=>c.repostOf===p.id&&!c.deleted).length,at:stamp()};return {message:'已记录本轮绝对统计；已有本地互动不重复累加。'};}
  case 'social.propagate':{check(acceptedSource,'截图或传播只接受已接纳的世界事件。');const actor=people.find(x=>x.id===a.actorId);check(actor&&!(s.social.ownedAccountIds??[]).includes(actor.id),'传播者须为已登记的非本人账号。');const p=s.social.posts.find(x=>x.id===a.postId);check(h.canRead(s,p,actor.id),'传播者没有读取原内容的依据。');check(['screenshot','mention','forward'].includes(a.kind),'传播方式无效。');check(typeof a.evidenceId==='string'&&a.evidenceId&&a.evidenceId.length<=160,'传播证据缺少稳定编号。');check(!(s.social.evidence??[]).some(x=>x.id===a.evidenceId),'传播证据编号已存在。');const row={id:a.evidenceId,kind:a.kind,actorId:actor.id,postId:p.id,visibility:p.visibility==='public'?'public':'private',text:String(a.text??'').slice(0,1000),createdAt:stamp(),snapshot:{text:p.text,authorId:p.authorId,version:p.version??1,mediaIds:[...p.mediaIds],songId:p.songId??null}};(s.social.evidence??=[]).push(row);return {message:'传播事件与当时可见内容已冻结；不会因后来的删改消失。',evidenceId:row.id};}
  default:return null;
 }
}
