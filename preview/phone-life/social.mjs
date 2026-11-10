// Demo identity and media fixtures; production never calls this seed.
export {reduceSocial,renderSocial,validateSocialState,canReadPost} from '../../phone-life/social.mjs';
export function socialSeed(){
 return {
  social:{ownedAccountIds:['me','alt'],ownerPersonId:'player',activeAccountId:'me',accidentalLikes:false,drafts:{me:{text:'',visibility:'public'},alt:{text:'',visibility:'public'}},accounts:[
   {id:'me',name:'林间',handle:'linjian',personId:'player',bio:'记录一些正在发生的事',color:'#6387ac'},
   {id:'alt',name:'今晚不加班',handle:'latehour',personId:'player',bio:'私人碎碎念，熟人别来。',color:'#9d7caa'},
   {id:'yu',name:'余舟',handle:'yuzhou',personId:'yu',bio:'路过也会停一下。摄影 / 城市散步',color:'#607b79'},
   {id:'cafe',name:'日落咖啡',handle:'sunsetcafe',personId:'cafe',bio:'转角那间。营业到晚上十点。',color:'#be8255'}],
   follows:{me:['yu','cafe'],alt:['yu']},likes:{me:[],alt:[]},bookmarks:{me:[],alt:[]},acceptedLikes:{me:[],alt:[]},
   posts:[
    {id:'p-cafe',authorId:'cafe',text:'今天的栗子拿铁有了。\n老板说试喝不算上班，我已经试了第三杯。',visibility:'public',mediaIds:['photo-coffee'],likesBase:18,createdAt:{day:9,minute:1065}},
    {id:'p-yu',authorId:'yu',text:'下楼买个东西，结果走到天黑。\n这一张留给今天。',visibility:'public',mediaIds:['photo-city'],likesBase:7,createdAt:{day:9,minute:1050}},
    {id:'p-me',authorId:'me',text:'有没有人懂，刚把外套收起来，气温就降了。',visibility:'public',mediaIds:[],likesBase:3,createdAt:{day:9,minute:1020}},
    {id:'p-alt',authorId:'alt',text:'本来只想看一眼，怎么又刷了半个小时。',visibility:'private',mediaIds:[],likesBase:0,createdAt:{day:9,minute:1015}}],
   comments:[{id:'c-seed',postId:'p-me',authorId:'yu',text:'懂。现在在风里等车。',createdAt:{day:9,minute:1028}}],
   notifications:[{id:'n-seed',kind:'social.comment',recipientId:'me',actorId:'yu',postId:'p-me',text:'余舟评论了你的微博',seen:false,withdrawn:false}],pending:[]},
  media:{photos:[
   {id:'photo-city',name:'晚风经过街口',ownerId:'yu',visibility:'public',source:'illustration',art:'city'},
   {id:'photo-coffee',name:'靠窗的位置',ownerId:'cafe',visibility:'public',source:'illustration',art:'coffee'},
   {id:'photo-me-city',name:'走过的街道',ownerId:'me',visibility:'private',source:'illustration',art:'city'},
   {id:'photo-me-night',name:'晚安之前',ownerId:'me',visibility:'private',source:'illustration',art:'night'},
   {id:'photo-me-day',name:'今天的小片刻',ownerId:'me',visibility:'private',source:'illustration',art:'photo'},
   {id:'photo-alt',name:'只留给自己的相片',ownerId:'alt',visibility:'private',source:'illustration',art:'night'}],
   songs:[{id:'song-night',title:'夜色经过',artist:'余舟',album:'城市短篇',cover:'night',audioId:null},
    {id:'song-home',title:'回家那一段路',artist:'林间',album:'未完成的日记',cover:'city',audioId:null},
    {id:'song-window',title:'窗边的下午',artist:'日落咖啡',album:'店里的歌',cover:'coffee',audioId:null}],
   playlists:[{id:'playlist-evening',name:'晚上慢慢听',songIds:['song-night','song-home']}],favoritePhotos:[],favoriteSongs:[]}
 };
}
