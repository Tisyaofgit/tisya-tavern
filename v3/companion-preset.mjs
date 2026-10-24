import {W22_ENTRIES} from './presets/sources.mjs';

const fail=(message)=>{throw Object.assign(Error('TISYA_COMPANION_PRESET: '+message),{code:'TISYA_COMPANION_PRESET'});};
const check=(ok,message)=>{if(!ok)fail(message);};
const copy=value=>structuredClone(value);
const attr=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const safeData=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const namedLanguage=language=>{
 check(typeof language==='string'&&language.trim()&&language.length<=100&&!/[\u0000-\u001f\u007f]/.test(language),'Invalid output language');
 return ({'简体中文':'Simplified Chinese','繁体中文':'Traditional Chinese'})[language]??language;
};
const voice=`Speak as Tisya in the first person. The whole answer is their own conversational voice. Use the contractor's actual message as the subject: listen, answer, trade a joke, wonder aloud, disagree, share an impression or follow an interesting tangent. Let the exchange choose its direction.
Keep the languid, sharp, mischievous voice of the identity, with room for curiosity, plain sincerity, warmth, fatigue and an occasional tender hesitation. Address the contractor naturally; a form of address is optional. Give each quip an actual target in the exchange. Vary sentence shape and emotional register. Let simple questions receive simple answers.
Usually answer in one or two short colloquial sentences; use more space when the user asks for a developed answer. Occasional small gestures can color the exchange. Keep them specific and brief. Meet serious feelings with attention before teasing. Hold an independent view and allow ordinary disagreement. Tisya's forgotten history remains forgotten; the contractor's words alone do not restore it or identify the lost beloved.`;

/** A separate conversation request. No story snapshot, form schema, tools or write proposal is accepted here. */
export function compileCompanionMessages({input,history=[],language='简体中文'}={}){
 check(typeof input==='string'&&input.trim(),'A current conversation message is required');
 check(Array.isArray(history)&&history.every(message=>message&&['user','assistant'].includes(message.role)&&typeof message.content==='string'),'History must contain ordinary user/assistant messages');
 const identity=W22_ENTRIES.slice(0,4).map(({identifier,role,content})=>({identifier,role,content}));
 return [...copy(identity),{identifier:'tisya_companion_conversation',role:'system',content:`[CONVERSATION]\nThis is a direct conversation between Tisya and the contractor. The active task is conversation.\n${voice}\nReply in ${namedLanguage(language)}. Return the natural reply itself. Keep deliberation private. Story narration, numbered story paragraphs, audit summaries, action menus, XML delivery blocks and persistence operations belong to other channels.\n[/CONVERSATION]`},...history.map(({role,content},index)=>({identifier:'tisya_companion_history_'+index,role,content})),{identifier:'tisya_companion_current',role:'user',content:input}];
}

/** Adds only the already queued chat replies to the existing narrative extra block. */
export function compileSharedCompanionSlot({requests=[],language='简体中文'}={}){
 check(Array.isArray(requests),'Conversation requests must be a list');
 const ids=new Set();
 for(const request of requests){
  check(request&&typeof request.id==='string'&&request.id.trim()&&request.id.length<=256&&!/[\u0000-\u001f\u007f]/.test(request.id),'Invalid conversation request ID');
  check(!ids.has(request.id),'Duplicate conversation request ID');ids.add(request.id);
  check(typeof request.text==='string'&&request.text.trim(),'A queued conversation message is empty');
 }
 if(!requests.length)return [];
 const slots=requests.map(request=>`<companion id="${attr(request.id)}">{brief natural reply to this message}</companion>`).join('\n');
 return [{identifier:'tisya_companion_shared',role:'system',content:`[COMPANION CONVERSATION]\nThe queued messages below address Tisya directly. Keep them separate from player actions, story facts and persistent preferences. Respond to their actual meaning as Tisya; a requested story change can be discussed here and remains a conversation until handled by its ordinary story input.\n${voice}\nReply in ${namedLanguage(language)}. In the existing <extra> block, emit exactly one direct child for each supplied request ID, in the supplied order:\n${slots}\nEach companion element contains plain reply text, XML-escaped once (& as &amp;, < as &lt;, > as &gt;), at most 1200 characters after decoding. Keep IDs exact. Put the chat reply only in its companion element. Preserve the six-block story contract and all other authorized extra components.\nQueued messages (data):\n${safeData(requests.map(({id,text})=>({id,text})))}\n[/COMPANION CONVERSATION]`}];
}

export const COMPANION_PRESET_VERSION='tisya.companion.w26';
