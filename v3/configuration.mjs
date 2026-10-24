import {tableSettings} from '../tables/schema.js';
import {nativeMvuDeclaration,nativeMvuFormats} from '../config/native-mvu.js';
import {isPrivateTisyaEntry} from '../config/private-materials.js';

const clone=structuredClone;
const check=(ok,message)=>{if(!ok)throw Object.assign(Error(message),{code:'V3_CONFIGURATION'});};
const ids=(value,name)=>{check(Array.isArray(value)&&value.every(id=>typeof id==='string'&&id),'Invalid '+name);return [...new Set(value)];};

/** Read-only projection of the existing store. Never saves aliases or another settings object. */
export function resolveRuntimeConfiguration({snapshot,target=globalThis,context,playerId,verifiedNativeRules}={}){
 check(snapshot?.world?.modes?.[snapshot.world.mode],'Current configuration snapshot is required');
 const world=snapshot.world,mode=world.modes[world.mode],tables=tableSettings(world),nativeMode=mode.nativeMvu??'auto';
 check(['auto','off'].includes(nativeMode),'原卡变量选项须为 auto 或 off');
 const companionMode=mode.缇斯亚聊天模式??'independent';check(['independent','with-story'].includes(companionMode),'小缇聊天模式须为 independent 或 with-story');
 // This is the sole stored MVU switch. The old narrative boolean and table bridge flag are not controls.
 const declaration=context?nativeMvuDeclaration(context,world):null;
 const nativeBridge=nativeMode==='auto'&&Boolean(target.Mvu||declaration);
 const nativeRules=verifiedNativeRules?.text??'';
 check(typeof nativeRules==='string','原卡变量规则须为已核验文本');
 if(nativeRules)check(Array.isArray(verifiedNativeRules.sources)&&verifiedNativeRules.sources.length>0,'原卡变量规则缺少实际来源');
 const result={
  revision:JSON.stringify([snapshot.key,snapshot.revision,playerId]),
  ...(playerId!==undefined?{playerId}:{}),
  enabled:tables.enabled,archiveEnabled:tables.archive,plotEnabled:tables.plot,offstageEnabled:tables.offstage,
  preferencesEnabled:tables.preferences,nativeMode,nativeBridge,companionMode,
  worldEnabled:tables.offstage,
  focusObjects:ids(tables.focusObjects,'剧情关注对象'),playerObjects:ids(tables.playerObjects,'玩家控制对象'),focusText:tables.focusText,
  nativeRules,
  ...(nativeRules?{nativeRuleSources:clone(verifiedNativeRules.sources)}:{}),
  preflightControls:{archiveEnabled:tables.archive,plotEnabled:tables.plot,preferenceConstraints:clone(tables.hardRules)},
  timeoutMs:600000
 };
 return result;
}

/** Reads enabled rules from the actual current card/book; no preference text is relabeled as a native rule. */
export async function readVerifiedNativeRules({snapshot,context}={}){
 check(snapshot?.world&&context,'Native rule reads require the actual world and host context');
 if((snapshot.world.modes[snapshot.world.mode].nativeMvu??'auto')==='off')return {text:'',sources:[]};
 const declaration=await nativeMvuFormats(context,snapshot.world);if(!declaration)return {text:'',sources:[]};
 const card=context.characters?.[context.characterId],selected=declaration.enabled.filter(entry=>!isPrivateTisyaEntry(entry)&&(/\[mvu_update\]/i.test(entry.comment??'')||/<UpdateVariable>[\s\S]*<JSONPatch>/i.test(entry.content??'')));
 const sources=[];
 for(const entry of selected){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(entry.content??'')));
  sources.push({kind:declaration.book?'worldbook':'card',...(declaration.book?{book:declaration.book}:{card:card?.avatar??null}),...(Number.isSafeInteger(entry.uid)?{uid:entry.uid}:{entryIndex:declaration.enabled.indexOf(entry)}),sha256:[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('')});
 }
 return {text:selected.map(entry=>String(entry.content??'').trim()).filter(Boolean).join('\n\n'),sources};
}

export const CONFIGURATION_SEMANTICS=Object.freeze({
 'world.modes[current].缇斯亚聊天模式':'independent sends one companion-only API request; with-story queues a companion message for the next normal story B request, without another API.',
 'world.modes.narrative.nativeMvu':'Only stored native-variable switch: off prevents bridging and checkpoints; auto detects the current native runtime/card declaration and requires actual host validation.',
 'world.tables.archive':'Automatic business archival; retained numbered originals and source identity are always preserved. Native settlement has its own owner.',
 'world.tables.plot':'Preflight creative-brief design; never creates a second API call.',
 'world.tables.offstage':'Source-timed offstage settlement only; player and onstage actors remain excluded.',
 'world.tables.preferences':'Preference analysis and confirmed preference projection.',
 'world.tables.focusObjects':'Stable V3 object-row IDs used by preflight focus and writer dossiers.',
 'world.focus':'External material references (card/persona/book/provider IDs), resolved by the material picker; never guessed into V3 object IDs.',
 'world.tables.hardRules':'User preference constraints, supplied independently from native-variable rules.'
});
