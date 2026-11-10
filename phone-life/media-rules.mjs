// Personal media metadata lives inside the existing Matrix-backed life state.
// Binary assets remain in the host media store; no action deletes original bytes.
const check=(v,m)=>{if(!v)throw new Error(m);};
const bounded=(v,n=100)=>{check(typeof v==='string'&&v.trim()&&v.trim().length<=n,'名称或内容长度无效。');return v.trim();};
const owners=s=>new Set([s.social.activeAccountId,s.media.ownerId,s.config?.subjectId].filter(Boolean));
const photo=(s,id)=>{const p=s.media.photos.find(x=>x.id===id);check(p&&owners(s).has(p.ownerId),'当前人物没有这张相片。');return p;};
const current=s=>s.social.activeAccountId??s.media.ownerId;
const album=(s,id)=>{const a=(s.media.albums??[]).find(x=>x.id===id);check(a&&owners(s).has(a.ownerId),'当前人物没有这个相簿。');return a;};
const at=s=>({...s.clock});
const saved=v=>{if(v==null)return null;check(typeof v==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v)),'媒体保存时间须为实际UTC或含时区时间。');return v;};
const modes=new Set(['sequence','repeat-one','repeat-all','shuffle']);
const themes=new Set(['world','mist','night','paper','forest']);
export function validateMediaExtensions(s){
 const m=s.media,ids=new Set();
 for(const a of m.albums??[]){check(a&&typeof a.id==='string'&&!ids.has(a.id)&&typeof a.name==='string'&&typeof a.ownerId==='string','相簿身份或名称无效。');ids.add(a.id);}
 for(const p of m.photos){if(p.savedAt!=null)saved(p.savedAt);if(p.albumId!=null)check(ids.has(p.albumId),'相片引用的相簿不存在。');if(p.derivedFrom)check(m.photos.some(x=>x.id===p.derivedFrom&&x.id!==p.id),'相片原件引用不存在。');if(p.purged)check(p.deletedAt!=null,'清理的相片必须保留回收站墓碑。');}
 if(m.playback){const p=m.playback;check(p.songId===null||m.songs.some(x=>x.id===p.songId),'播放器引用的歌曲不存在。');check(Number.isFinite(p.position)&&p.position>=0&&Number.isFinite(p.volume)&&p.volume>=0&&p.volume<=1&&modes.has(p.mode),'播放器进度或模式无效。');check(Array.isArray(p.queue)&&p.queue.every(id=>m.songs.some(x=>x.id===id)),'播放队列引用无效。');}
 if(m.theme){const t=m.theme;check(themes.has(t.preset)&&['cover','contain'].includes(t.fit)&&Number.isFinite(t.overlay)&&t.overlay>=0&&t.overlay<=80,'手机主题设置无效。');if(t.backgroundId!=null)check(m.photos.some(p=>p.id===t.backgroundId&&p.source==='file'&&!String(p.mime??'').startsWith('video/')&&!p.purged&&p.deletedAt==null&&new Set([...(s.social.ownedAccountIds??[]),m.ownerId,s.config?.subjectId]).has(p.ownerId)),'手机背景原件引用无效。');}
 return true;
}
export function performMediaExtension(s,a,{next}){
 const m=s.media,me=current(s);let result;
 if(a.type==='media.album.create'){m.albums??=[];const name=bounded(a.name,60);check(!m.albums.some(x=>x.ownerId===me&&x.name===name),'已经有同名相簿。');const row={id:next(s,'album'),name,ownerId:me,createdAt:at(s)};m.albums.push(row);result={message:'相簿已创建。',albumId:row.id};}
 else if(a.type==='media.album.rename'){const row=album(s,a.albumId),name=bounded(a.name,60);check(!(m.albums??[]).some(x=>x.id!==row.id&&x.ownerId===row.ownerId&&x.name===name),'已经有同名相簿。');row.name=name;result={message:'相簿已改名。'};}
 else if(a.type==='media.album.delete'){const row=album(s,a.albumId);m.albums=m.albums.filter(x=>x.id!==row.id);for(const p of m.photos)if(p.albumId===row.id)p.albumId=null;result={message:'已删除相簿集合，全部相片仍保留。'};}
 else if(a.type==='media.photo.assign'){const p=photo(s,a.photoId);check(!p.purged&&p.deletedAt==null,'请先恢复相片。');if(a.albumId!=null)album(s,a.albumId);p.albumId=a.albumId??null;result={message:'相片分类已保存。'};}
 else if(a.type==='media.photo.trash'){const p=photo(s,a.photoId);check(p.deletedAt==null&&!p.purged,'相片已经在回收站。');p.deletedAt=at(s);if(m.theme?.backgroundId===p.id)m.theme.backgroundId=null;result={message:'已移到最近删除；历史分享和原件保留。'};}
 else if(a.type==='media.photo.restore'){const p=photo(s,a.photoId);check(p.deletedAt!=null&&!p.purged,'相片不在可恢复的最近删除中。');delete p.deletedAt;result={message:'相片已恢复。'};}
 else if(a.type==='media.photo.purge'){const p=photo(s,a.photoId);check(p.deletedAt!=null,'请先将相片移到最近删除。');p.purged=true;p.purgedAt=at(s);result={message:'已从个人相册隐藏；历史引用与原始资源仍保留。'};}
 else if(a.type==='media.photo.derive'){const original=photo(s,a.photoId),p=a.photo;check(original.deletedAt==null&&!original.purged,'原件已在回收站。');check(p&&typeof p.id==='string'&&p.id&&!m.photos.some(x=>x.id===p.id),'派生相片需要全新编号。');check(p.ownerId===me&&p.source==='file'&&typeof p.assetId==='string'&&p.assetId&&p.visibility==='private','派生相片必须属于当前人物并默认私密。');check(a.edit&&['crop','redact','annotate'].includes(a.edit.kind),'编辑类型无效。');check(JSON.stringify(a.edit).length<=16000,'编辑记录过长。');m.photos.push({id:p.id,assetId:p.assetId,name:bounded(p.name),mime:String(p.mime??''),ownerId:me,source:'file',visibility:'private',createdAt:at(s),savedAt:saved(p.savedAt),derivedFrom:original.id,edit:structuredClone(a.edit),albumId:original.albumId??null});result={message:'已保存编辑后的私密副本，原件保持不变。',photoId:p.id};}
 else if(a.type==='media.theme.set'){const t=a.theme;check(t&&themes.has(t.preset)&&['cover','contain'].includes(t.fit)&&Number.isFinite(t.overlay)&&t.overlay>=0&&t.overlay<=80,'主题设置无效。');if(t.backgroundId!=null){const p=photo(s,t.backgroundId);check(p.source==='file'&&!String(p.mime??'').startsWith('video/')&&p.deletedAt==null&&!p.purged,'请选择当前人物可用的实际图片原件。');}m.theme={preset:t.preset,backgroundId:t.backgroundId??null,fit:t.fit,overlay:t.overlay};result={message:'手机主题已保存，背景图片的可见权限没有改变。'};}
 else if(a.type==='music.playback.save'){check(a.songId===null||m.songs.some(x=>x.id===a.songId),'播放歌曲不存在。');check(Number.isFinite(a.position)&&a.position>=0&&a.position<=31536000&&Number.isFinite(a.volume)&&a.volume>=0&&a.volume<=1&&modes.has(a.mode),'实际播放进度、音量或模式无效。');check(Array.isArray(a.queue)&&a.queue.length<=1000&&a.queue.every(id=>m.songs.some(x=>x.id===id)),'播放队列引用无效。');const song=m.songs.find(x=>x.id===a.songId);check(!song?.duration||a.position<=song.duration+1,'播放位置超过实际曲长。');m.playback={songId:a.songId,position:a.position,volume:a.volume,mode:a.mode,queue:[...a.queue],updatedAt:at(s),history:[...new Set(Array.isArray(a.history)?a.history:(m.playback?.history??[]))].filter(id=>m.songs.some(x=>x.id===id)).slice(0,100)};result={message:'实际播放位置与队列已保存。'};}
 else if(a.type==='music.playlist.rename'){const row=m.playlists.find(x=>x.id===a.playlistId);check(row,'歌单不存在。');row.name=bounded(a.name,60);result={message:'歌单已改名。'};}
 else if(a.type==='music.playlist.delete'){check(m.playlists.some(x=>x.id===a.playlistId),'歌单不存在。');m.playlists=m.playlists.filter(x=>x.id!==a.playlistId);result={message:'歌单集合已删除，歌曲原件保留。'};}
 else if(a.type==='music.lyrics.set'){const song=m.songs.find(x=>x.id===a.songId);check(song,'歌曲不存在。');check(typeof a.lyrics==='string'&&a.lyrics.length<=50000,'歌词长度无效。');(song.lyricsHistory??=[]).push({lyrics:song.lyrics??'',at:at(s)});song.lyrics=a.lyrics;song.lyricsSource='user-import';result={message:'已保存导入歌词；仅实际时间标记参与同步。'};}
 else if(a.type==='music.comment'){const song=m.songs.find(x=>x.id===a.songId);check(song,'歌曲不存在。');const row={id:next(s,'music-comment'),authorId:me,text:bounded(a.text,1000),createdAt:at(s)};(song.comments??=[]).push(row);result={message:'评论已保存。',commentId:row.id};}
 else return null;
 validateMediaExtensions(s);return result;
}
