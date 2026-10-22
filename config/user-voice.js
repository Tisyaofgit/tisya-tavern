// Optional global preferences. Absence preserves existing behavior; opening
// settings does not materialize defaults or infer preferences from dialogue.
export const USER_VOICE_FIELDS=Object.freeze(['用户口癖保留','用户叙事口吻延续']);
export function validateUserVoice(mode){
 for(const key of USER_VOICE_FIELDS)if(mode?.[key]!==undefined&&typeof mode[key]!=='boolean')throw Error(key+'须为开启或关闭，原设置保留');
}
export function userVoiceRules(mode){
 validateUserVoice(mode);
 return {
  speechHabits:mode?.用户口癖保留===true?'Preserve the user\'s established catchphrases, forms of address and speech rhythm when authorized to render their speech, subject to explicit constraints. Do not transfer them to other speakers or infer a permanent preference from one fictional utterance.':'',
  narration:mode?.用户叙事口吻延续===true?'Follow the user\'s current narrative voice in rhythm, register and phrasing where compatible with explicit constraints. Use actual narration as style evidence, not dialogue or out-of-character instructions; copy no events, change neither viewpoint nor output language, and expand no authority over the player.':'',
 };
}
// Compatibility hook for the existing staged preset. New preference-slot
// assemblers consume userVoiceRules directly, once in each owning category.
export function applyUserVoiceGuidance(text,compiled,mode){
 const rules=Object.values(userVoiceRules(mode)).filter(Boolean);
 if(!compiled.prose||!rules.length)return text;
 const anchor='[INNER]\n';
 if(typeof text!=='string'||text.split(anchor).length!==2)throw Error('用户表达偏好的预设入口不匹配，未发送缺失规则的请求');
 return text.replace(anchor,anchor+'[USER.VOICE]\n'+rules.join('\n')+'\n[/USER.VOICE]\n');
}
