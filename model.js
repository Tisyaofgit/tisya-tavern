export function capture(context, id) {
    if (!Number.isInteger(id) || id < 0 || !context.chat[id]) throw new Error('消息尚未加载或已经删除');
    const message = context.chat[id];
    return { chatId: context.getCurrentChatId(), id, message, text: message.mes, swipe: message.swipe_id, length: context.chat.length };
}
export function validate(context, token, { tail = false } = {}) {
    if (context.getCurrentChatId() !== token.chatId || context.chat[token.id] !== token.message || context.chat[token.id]?.mes !== token.text || context.chat[token.id]?.swipe_id !== token.swipe) throw new Error('会话或消息已变化，请重新打开菜单');
    if (tail && context.chat.length !== token.length) throw new Error('消息数量已变化，请重新打开菜单');
    return context.chat[token.id];
}
export function groupContacts(characters, overrides) {
    const groups = new Map();
    characters.forEach((card, id) => {
        const tags = Array.isArray(card.tags) ? card.tags.filter(x => typeof x === 'string') : [];
        const group = overrides[card.avatar] ?? '未分组';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push({ id, avatar: card.avatar, name: card.name, tags });
    });
    return groups;
}
