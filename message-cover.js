// Read-only card portrait lookup. Group messages must carry a stable card avatar ID.
export function messageCardCover(context,message,thumbnail,mediaAtlas=null){
 if(message?.is_user||message?.is_system)return null;
 const cards=context?.characters??[];
 const card=context?.groupId!=null&&context.groupId!==''
  ?cards.find(c=>typeof message?.original_avatar==='string'&&c.avatar===message.original_avatar)
  :cards[context?.characterId];
 if(card&&mediaAtlas){const bound=mediaAtlas.avatar(card.name);if(bound?.url)return bound.url;}
 if(typeof card?.avatar!=='string'||!card.avatar.trim()||card.avatar==='none')return null;
 return thumbnail(card.avatar);
}
