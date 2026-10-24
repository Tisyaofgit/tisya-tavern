import {archivePrefixRole} from '../tables/archive-prefix.js';
import {sameJsonValue} from './runtime-source/host/json-value.mjs';

const copy=structuredClone;
const check=(ok,message)=>{if(!ok)throw Error(message);};
const fields=['name','description','personality','scenario','system_prompt','post_history_instructions'];
const managedKeys=['tisyaBook','tisyaNamespace','tisyaBindingIntent','tisyaDraft','tisyaOriginal','tisyaTableLedger'];
const legacyManaged=new Set(['缇斯亚 · 表单数据','【图鉴／静态】存档最新版','【图鉴／数据】存档最新版','【图鉴／动态快照】存档最新版','【图鉴／记忆】存档最新版','【原点】初始档案','【基点】核心版本','【存档】时间锚与变更路径']);
const executable=text=>/<%|^\s*@@preprocessing/m.test(text);
const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const entryName=entry=>entry.comment??entry.name??'';
const isManaged=(entry,legacyProjection=false)=>managedKeys.some(key=>Object.hasOwn(entry.extensions??{},key))||entryName(entry)==='缇斯亚 · 表单数据'||legacyProjection&&legacyManaged.has(entryName(entry));
function hasLegacyProjection(entries){const journals=entries.filter(entry=>entryName(entry)==='缇斯亚 · 表单数据');check(journals.length<=1,'绑定资料中的旧表单数据条目重复，请先核对');if(!journals.length)return false;const entry=journals[0];let value;try{value=JSON.parse(entry.content);}catch{throw Error('绑定资料中的旧表单数据已损坏，请先核对；未将其投影作为初始化定义');}check((entry.enabled===false||entry.disable===true)&&value?.format==='tisya.tables/1'&&['origin','session'].includes(value.kind)&&Number.isSafeInteger(value.revision)&&value.revision>=0,'绑定资料中的旧表单数据身份无效，请先核对');return !!value.archiveView;}
const identity=context=>({chatId:context.chatId??null,groupId:context.groupId??null,cardId:context.characters?.[context.characterId]?.avatar??null});

/** Read only the current card's definitions and explicitly bound worldbooks.
 * Persona, greetings, examples, chat history and global/chat/persona lorebooks
 * belong to their own operations and never become initialization evidence.
 */
export function createInitializationSourceProvider({getContext,getLinkedWorldbookNames,readWorldbook}={}){
 check(typeof getContext==='function','初始化缺少当前角色卡读取接口');
 async function read({signal}={}){
  signal?.throwIfAborted();const context=getContext(),owner=identity(context),card=copy(context.characters?.[context.characterId]);
  check(!context.groupId,'请先打开一个角色卡会话，再读取该卡的初始化资料');check(card&&typeof card.avatar==='string'&&card.avatar,'当前角色卡尚未就绪');
  const guard=()=>{signal?.throwIfAborted();check(sameJsonValue(owner,identity(getContext())),'读取初始化资料期间角色卡或会话已切换');};
  check(typeof getLinkedWorldbookNames==='function'&&typeof readWorldbook==='function','宿主的角色卡世界书读取接口尚未接入');
  const names=await getLinkedWorldbookNames(card.avatar);guard();check(Array.isArray(names)&&names.every(name=>typeof name==='string'&&name.trim()),'角色卡绑定世界书列表无效');
  const unique=[...new Set(names)],data=card.data??card,cardFields={},embedded=[],sourceBooks=[],bookSummary=[],rawBooks=[];
  let disabled=0,runtime=0,managed=0;
  for(const field of fields){const value=data[field]??card[field];if(value!==undefined){check(typeof value==='string','角色卡字段不是文本：'+field);if(value)cardFields[field]=value;}}
  const cardEntries=data.character_book?.entries??[];check(Array.isArray(cardEntries),'角色卡内嵌世界书条目无效');
  function eligible(entry,legacyProjection=false){check(entry&&typeof entry==='object','世界书条目无效');if(isManaged(entry,legacyProjection)){managed++;return false;}if(entry.enabled===false||entry.disable===true){disabled++;return false;}check(entry.content===undefined||typeof entry.content==='string','世界书条目正文不是文本');if(executable(entry.content??'')){runtime++;return false;}return true;}
  const embeddedProjection=hasLegacyProjection(cardEntries);
  for(const [index,entry] of cardEntries.entries())if(eligible(entry,embeddedProjection)&&entry.content)embedded.push({path:'/data/character_book/entries/'+index,id:entry.id??entry.uid??index,name:entryName(entry),content:entry.content});
  for(const name of unique){
   const document=await readWorldbook(name);guard();check(document&&document.entries&&typeof document.entries==='object'&&!Array.isArray(document.entries),'绑定世界书无法完整读取：'+name);rawBooks.push({name,document:copy(document)});
   const beforeDisabled=disabled,legacyProjection=hasLegacyProjection(Object.values(document.entries));let included=0;
   for(const [key,entry] of Object.entries(document.entries))if(eligible(entry,legacyProjection)&&entry.content){const label=entryName(entry),uid=entry.uid??key,role=archivePrefixRole(name,label);sourceBooks.push({book:name,entry:label,uid,content:entry.content,...role?{archiveRole:role}:{},sourcePath:[name,uid]});included++;}
   bookSummary.push({name,entries:included,disabledEntries:disabled-beforeDisabled});
  }
  guard();const current=getContext().characters?.[getContext().characterId];check(sameJsonValue(card,current),'读取初始化资料期间角色卡内容已改变，请重新读取');
  const sourceCardRaw={fields:cardFields,entries:embedded},sourceCard=[...Object.entries(cardFields).map(([key,value])=>'CARD.'+key+'\n'+value),...embedded.map(entry=>'CARD.DEFINITION '+(entry.name||entry.id)+'\n'+entry.content),...sourceBooks.map(entry=>'来源：'+entry.book+' / '+entry.entry+'\n'+entry.content)].join('\n\n');
  check(sourceCard.trim(),'当前角色卡和绑定世界书没有可读取的有效定义');
  const notes=[...(disabled?[`已排除 ${disabled} 项停用资料。`]:[]),...(runtime?[`${runtime} 项动态模板须由宿主展开，本次未执行或用其脚本充当定义。`]:[]),...(managed?[`已排除 ${managed} 项缇斯亚存档数据，避免将当前进度倒填成卡模板。`]:[])];
  return {basis:canonical({identity:owner,card,books:rawBooks,names:unique}),definitionBasis:canonical({identity:{cardId:owner.cardId,groupId:owner.groupId},sourceCardRaw,sourceBooks,names:unique}),sourceCard,sourceCardRaw,sourceBooks,summary:{kind:'native-card',card:{id:card.avatar,name:data.name??card.name??card.avatar},books:bookSummary,counts:{cardFields:Object.keys(cardFields).length,entries:embedded.length+sourceBooks.length,disabled,runtime,managed},characters:sourceCard.length,notes}};
 }
 async function assertFresh(snapshot,{signal}={}){const current=await read({signal});check(sameJsonValue(snapshot.basis,current.basis),'角色卡或绑定世界书已改变，请重新读取并生成初始化草稿');return current;}
 return Object.freeze({read,assertFresh});
}
