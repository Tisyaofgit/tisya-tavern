import {check} from './schema.js';
// Older hosts support only `current` for character-worldbook binding.
// Keep the saved avatar ID; adapt only calls that really target that card.
export function characterWorldbookScope(card,getContext,outerGuard=()=>{}){
 const snapshot=()=>{const c=getContext?.();return c?{chat:c.chatId,group:c.groupId,card:c.characters?.[c.characterId]?.avatar}:null;};
 const initial=snapshot(),current=!!initial&&!initial.group&&initial.card===card;
 const guard=()=>{outerGuard();if(current)check(JSON.stringify(initial)===JSON.stringify(snapshot()),'当前角色或会话已切换，世界书绑定已停止');};
 guard();return {target:current?'current':card,guard};
}
