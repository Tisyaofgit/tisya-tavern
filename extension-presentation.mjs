import {normalizeRecordReference,MESSAGE_SUBTYPES} from './extension-preferences.mjs';
import {archiveLinkTextIndex} from './archive-links.mjs';

// Pure presentation of caller-authorized form projections. There are no state,
// network, ledger, or generation services in this module.
export const PRESENTATION_KINDS=Object.freeze([...MESSAGE_SUBTYPES,'forum','danmaku','theater','notice','rumor','settlement']);
const field=(key,label,type,extra={})=>({key,label,type,required:false,...extra});
export const PRESENTATION_RECORD_SCHEMA=Object.freeze({id:'T_DYN_MESSAGE_CONTENT',label:'消息内容与附件引用',partition:'III',sheet:'宿主与投影',purpose:'消息内容的关联子模板；转账和媒体只引用既有记录，不复制账本或原件。',fields:[
 field('row_uuid','稳定记录ID','ID',{required:true}),field('parent_item_ref','所属网络条目','REF',{ref:'X_NETWORK_ITEMS'}),field('kind','内容类型','ENUM',{enum:[...MESSAGE_SUBTYPES],required:true}),
 field('title','标题','TEXT'),field('text','正文或语音文稿','LONG_TEXT'),field('sender_ref','发出主体','REF',{ref:'T_SYS_ENTITIES'}),field('recipient_ref','接收主体','REF',{ref:'T_SYS_ENTITIES'}),
 field('media_ref','媒体记录','REF',{ref:'T_SYS_MEDIA_ASSETS'}),field('transfer_ref','转账记录','REF',{ref:'X_FIN_TRANSACTIONS'}),field('source_label','来源名称','TEXT'),field('source_url','来源地址','TEXT'),
 field('story_time','故事时间文字','TEXT'),field('visibility','可见范围','ENUM',{enum:['public','private']}),field('owner_ref','归属主体','REF',{ref:'T_SYS_ENTITIES'}),field('audience_refs','明确可读主体','REF_LIST')
 ],parent_table:'X_NETWORK_ITEMS',parent_field:'parent_item_ref',common_fields_access:'by_common_contract'});
const accessFields=()=>[field('visibility','可见范围','ENUM',{enum:['public','private']}),field('owner_ref','归属主体','REF',{ref:'T_SYS_ENTITIES'}),field('audience_refs','明确可读主体','REF_LIST')];
export const EXTENSION_BLOCK_SCHEMA=Object.freeze({id:'T_DYN_EXTENSION_BLOCKS',label:'扩展内容区块',partition:'III',sheet:'宿主与投影',purpose:'已接纳的小剧场、论坛或弹幕区块；书仅保存定义。',fields:[field('row_uuid','稳定记录ID','ID',{required:true}),field('kind','区块类型','ENUM',{enum:['forum','danmaku','theater','notice','rumor','settlement'],required:true}),field('title','标题','TEXT'),field('text','区块说明','LONG_TEXT'),field('story_time','故事时间文字','TEXT'),field('preference_ref','来源偏好','REF',{ref:'T_PREF_EXTENSION_PRESENTATION'}),...accessFields()],common_fields_access:'by_common_contract'});
export const EXTENSION_ITEM_SCHEMA=Object.freeze({id:'T_DYN_EXTENSION_ITEMS',label:'扩展内容条目',partition:'III',sheet:'宿主与投影',purpose:'关联区块的单条发言，稳定楼层和删除状态来自记录。',fields:[field('row_uuid','稳定记录ID','ID',{required:true}),field('block_ref','所属区块','REF',{ref:'T_DYN_EXTENSION_BLOCKS',required:true}),field('floor','稳定楼层','INTEGER'),field('author_ref','发言主体','REF',{ref:'T_SYS_ENTITIES'}),field('text','正文','LONG_TEXT'),field('quote_floor','引用楼层','INTEGER'),field('at_seconds','媒体时间秒','NUMBER'),field('story_time','故事时间文字','TEXT'),field('deleted','已删除','BOOLEAN'),...accessFields()],parent_table:'T_DYN_EXTENSION_BLOCKS',parent_field:'block_ref',common_fields_access:'by_common_contract'});
export const PRESENTATION_SCHEMAS=Object.freeze([PRESENTATION_RECORD_SCHEMA,EXTENSION_BLOCK_SCHEMA,EXTENSION_ITEM_SCHEMA]);
const names={text:'消息',transfer:'转账记录',voice:'语音',image:'图片',news:'新闻',forum:'论坛',danmaku:'弹幕',theater:'小剧场',notice:'公告',rumor:'风闻',settlement:'结算记录'};
const viewForKind={text:'messages',transfer:'messages',voice:'messages',image:'messages',news:'news',forum:'forum',danmaku:'danmaku',theater:'theater',notice:'notice',rumor:'rumor',settlement:'settlement'};
const fail=(code,message)=>{throw Object.assign(new Error(message),{code:'TISYA_PRESENTATION_'+code});};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const text=(v,label,{optional=false,max=100000}={})=>{if(v==null&&optional)return '';if(typeof v!=='string'||v.length>max)fail('VALUE',label+'不是合法文字');return v;};
const esc=v=>String(v??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const referenceEqual=(wanted,actual)=>wanted.tableId===actual.tableId&&wanted.recordId===actual.recordId&&(!Object.hasOwn(wanted,'snapshotId')||wanted.snapshotId===actual.snapshotId)&&(!Object.hasOwn(wanted,'revision')||wanted.revision===actual.revision);
export function resolveRecordReference(reference,{projections=[],contextKey,historical=true}={}){
 const ref=normalizeRecordReference(reference,{historical});
 if(typeof contextKey!=='string'||!contextKey)fail('CONTEXT','呈现须绑定当前会话分支');
 if(!Array.isArray(projections))fail('PROJECTIONS','记录投影须为列表');
 const found=[];
 for(const p of projections){
  if(!plain(p)||p.allowed!==true||p.contextKey!==contextKey||!plain(p.reference))continue;
  const actual=normalizeRecordReference(p.reference);
  if(referenceEqual(ref,actual))found.push(p);
 }
 if(found.length!==1)fail(found.length?'AMBIGUOUS':'UNAVAILABLE',found.length?'指定历史记录出现重复投影':'指定记录或历史快照当前不可读取');
 const p=found[0];if(!PRESENTATION_KINDS.includes(p.kind)||!plain(p.value))fail('PROJECTION','记录投影缺少已登记类型或字段');
 return {reference:structuredClone(p.reference),kind:p.kind,value:structuredClone(p.value),contextKey};
}
export function parsePresentationReference(parameter){
 if(typeof parameter!=='string'||!parameter.startsWith('@record'))return null;
 if(!parameter.startsWith('@record{')||!parameter.endsWith('}'))fail('REFERENCE_SYNTAX','记录标记须为 @record{JSON对象字段}');
 let value;try{value=JSON.parse(parameter.slice(7));}catch{fail('REFERENCE_SYNTAX','记录标记JSON无法解析');}
 if(!plain(value)||!PRESENTATION_KINDS.includes(value.kind))fail('REFERENCE_KIND','记录标记缺少已登记内容类型');
 const {kind,...reference}=value;return {kind,reference:normalizeRecordReference(reference,{historical:true})};
}
export function presentationReferenceParameter({kind,reference}){
 if(!PRESENTATION_KINDS.includes(kind))fail('REFERENCE_KIND','内容类型未登记');
 const ref=normalizeRecordReference(reference,{historical:true});
 const result='@record'+JSON.stringify({kind,...ref});if(/[〔〕]/u.test(result))fail('REFERENCE_SYNTAX','记录ID不能包含标记边界');return result;
}
function optional(v,label){return text(v,label,{optional:true});}
function count(value,label,max=200){if(value==null)return null;if(!Number.isSafeInteger(value)||value<0||value>max)fail('COUNT',label+'须为非负整数');return value;}
function safeUrl(value,kind){
 if(typeof value!=='string'||!value.trim())fail('MEDIA_URL','资源地址未提供');
 let url;try{url=new URL(value);}catch{fail('MEDIA_URL','资源地址须为登记后的完整地址');}
 if(!['http:','https:','blob:','file:','asset:','tauri:'].includes(url.protocol))fail('MEDIA_URL','资源地址协议未获支持');
 if(kind==='link'&&!['http:','https:'].includes(url.protocol))fail('MEDIA_URL','新闻来源链接须为HTTP或HTTPS地址');
 if(url.username||url.password)fail('MEDIA_URL','资源地址不能包含账号凭据');return url.href;
}
function resource(id,kind,{media=[],contextKey}){
 if(typeof id!=='string'||!id)fail('MEDIA_ID','资源ID无效');
 if(!Array.isArray(media))fail('MEDIA','资源投影须为列表');
 const rows=media.filter(r=>plain(r)&&r.id===id&&r.allowed===true&&r.contextKey===contextKey);
 if(rows.length!==1||rows[0].kind!==kind)fail('MEDIA_UNAVAILABLE','指定媒体资源当前不可读取');
 return {...rows[0],url:safeUrl(rows[0].url,kind)};
}
function stamp(v){const at=optional(v.at,'故事时间');return at?'<time>'+esc(at)+'</time>':'';}
function header(v,fallback){const title=optional(v.title,'标题')||fallback;return '<header>'+esc(title)+'</header>';}
function paragraphs(v){
 if(v.paragraphs!==undefined){if(!Array.isArray(v.paragraphs)||v.paragraphs.length>1000)fail('VALUE','正文段落格式无效');return v.paragraphs.map(s=>'<p>'+esc(text(s,'正文'))+'</p>').join('');}
 return v.text==null?'':'<p>'+esc(text(v.text,'正文'))+'</p>';
}
function transfer(v){
 const amount=v.amount??null;if(amount!==null&&(!Number.isFinite(amount)||amount<0))fail('AMOUNT','转账金额须为非负有限数值或未知');
 const currency=optional(v.currencyLabel,'货币名称'),sender=optional(v.sender,'付款主体'),recipient=optional(v.recipient,'收款主体'),status=optional(v.status,'转账状态');
 return header(v,'转账记录')+'<div class="tisya-presentation-amount">'+(amount===null?'金额未提供':esc(String(amount))+(currency?' '+esc(currency):'（币种未提供）'))+'</div><dl>'+(sender?'<dt>发出方</dt><dd>'+esc(sender)+'</dd>':'')+(recipient?'<dt>接收方</dt><dd>'+esc(recipient)+'</dd>':'')+'<dt>状态</dt><dd>'+esc(status||'未提供')+'</dd></dl>'+paragraphs(v)+stamp(v);
}
function voice(v,options){
 const transcript=optional(v.transcript??v.text,'语音文稿');let output=header(v,'语音');
 if(v.resourceId==null)output+='<p class="tisya-presentation-muted">语音文稿 · '+(v.resourceUnavailable?'音源暂不可用':'未提供音源')+'</p>';
 else{const r=resource(v.resourceId,'audio',options);output+='<audio controls preload="none" src="'+esc(r.url)+'" aria-label="'+esc(optional(v.title,'标题')||r.name||'语音音源')+'"></audio>';}
 if(transcript)output+='<div class="tisya-presentation-transcript">'+esc(transcript)+'</div>';
 return output+stamp(v);
}
function image(v,options){
 let output=header(v,'图片');if(v.resourceId==null)output+='<p class="tisya-presentation-muted">'+(v.resourceUnavailable?'图片资源暂不可用':'未提供图片资源')+'</p>';
 else{const r=resource(v.resourceId,'image',options);output+='<figure><img loading="lazy" src="'+esc(r.url)+'" alt="'+esc(optional(v.alt,'图片说明')||r.name||'图片')+'">'+(v.caption?'<figcaption>'+esc(text(v.caption,'图片说明'))+'</figcaption>':'')+'</figure>';}
 return output+paragraphs(v)+stamp(v);
}
function news(v){
 const publisher=optional(v.publisher,'发布者'),source=optional(v.sourceLabel,'来源标签');let output=header(v,'新闻')+'<div class="tisya-presentation-meta">'+esc(publisher)+(publisher&&v.at?' · ':'')+stamp(v)+'</div>';
 if(v.summary!=null)output+='<p class="tisya-presentation-summary">'+esc(text(v.summary,'摘要'))+'</p>';
 output+=paragraphs(v);
 if(v.sourceUrl!=null)output+='<p>来源：<a href="'+esc(safeUrl(v.sourceUrl,'link'))+'" target="_blank" rel="noopener noreferrer">'+esc(source||'查看来源')+'</a></p>';
 else output+='<p class="tisya-presentation-muted">来源：'+esc(source||'未提供')+'</p>';
 if(v.corrections!==undefined){if(!Array.isArray(v.corrections)||v.corrections.length>100)fail('VALUE','新闻更正记录无效');if(v.corrections.length)output+='<details><summary>更正记录</summary>'+v.corrections.map(c=>{if(!plain(c))fail('VALUE','更正记录字段无效');return '<p>'+esc(optional(c.at,'更正时间'))+' '+esc(text(c.text,'更正正文'))+'</p>';}).join('')+'</details>';}
 return output;
}
function itemRows(v){
 if(!Array.isArray(v.items)||v.items.length>10000)fail('ITEMS','扩展内容须为已存条目列表');const seen=new Set();
 return v.items.filter(row=>{if(!plain(row)||typeof row.id!=='string'||!row.id||seen.has(row.id))fail('ITEMS','条目缺少稳定ID或ID重复');seen.add(row.id);return row.allowed!==false;});
}
function forum(v,limit,reference){
 const rows=itemRows(v),floors=new Set();for(const row of rows){const n=count(row.floor,'楼层',10000000);if(n===null||floors.has(n))fail('FLOOR','论坛楼层缺失或重复');floors.add(n);}
 const shown=limit===null?rows:rows.slice(0,limit),visibleFloors=new Set(shown.map(r=>r.floor)),prefix='tisya-forum-'+encodeURIComponent(JSON.stringify(reference))+'-';
 return header(v,'论坛')+paragraphs(v)+'<ol class="tisya-presentation-forum">'+shown.map(row=>{
  let body=row.deleted===true?'<p class="tisya-presentation-muted">该层已删除</p>':'<p>'+esc(text(row.text,'楼层内容'))+'</p>';
  if(row.deleted!==true&&row.quote!=null){if(!plain(row.quote)||count(row.quote.floor,'引用楼层',10000000)===null)fail('QUOTE','引用楼层无效');const label=optional(row.quote.label,'引用标签')||'引用 #'+row.quote.floor;body=(visibleFloors.has(row.quote.floor)?'<a href="#'+esc(prefix+row.quote.floor)+'">'+esc(label)+'</a>':'<span class="tisya-presentation-muted">'+esc(label)+'（当前未展示）</span>')+body;}
  return '<li id="'+esc(prefix+row.floor)+'" data-floor="'+row.floor+'"><div class="tisya-presentation-meta"><span>#'+row.floor+'</span> '+esc(optional(row.author,'楼层作者'))+' '+stamp(row)+'</div>'+body+'</li>';
 }).join('')+'</ol>'+(shown.length<rows.length?'<p class="tisya-presentation-muted">显示 '+shown.length+' / '+rows.length+' 条已授权记录；其余历史保留。</p>':'');
}
function danmaku(v,limit,{playbackSeconds,windowSeconds=35}={}){
 let rows=itemRows(v);if(playbackSeconds!==undefined){if(!Number.isFinite(playbackSeconds)||playbackSeconds<0||!Number.isFinite(windowSeconds)||windowSeconds<0)fail('PLAYBACK','媒体时间须来自实际播放器');rows=rows.filter(row=>Number.isFinite(row.atSeconds)&&row.atSeconds<=playbackSeconds&&row.atSeconds>=playbackSeconds-windowSeconds);}
 const shown=limit===null?rows:limit===0?[]:rows.slice(-limit);
 return header(v,'弹幕')+'<ol class="tisya-presentation-danmaku" aria-label="已存弹幕">'+shown.map(row=>'<li><span>'+esc(optional(row.author,'弹幕署名')||'未署名')+'</span><p>'+esc(row.deleted===true?'该条已删除':text(row.text,'弹幕正文'))+'</p></li>').join('')+'</ol>'+(!shown.length?'<p class="tisya-presentation-muted">当前范围没有已存弹幕。</p>':'');
}
function theater(v,limit){const rows=itemRows(v),shown=limit===null?rows:rows.slice(0,limit);return header(v,'小剧场')+'<div class="tisya-presentation-theater">'+shown.map(row=>'<p><b>'+esc(optional(row.speaker??row.author,'发言者')||'未署名')+'</b> '+esc(row.deleted===true?'该条已删除':text(row.text,'小剧场正文'))+'</p>').join('')+'</div>';}
export function compilePresentation(request,options={}){
 if(!plain(request)||!PRESENTATION_KINDS.includes(request.kind))fail('KIND','呈现内容类型未登记');
 const config=options.config??options.configs?.[viewForKind[request.kind]]??(MESSAGE_SUBTYPES.includes(request.kind)?options.configs?.messages:null),display=config?.display??null;
 if(display){if(display.enabled===false||display.limit===0)return {hidden:true};if(!Array.isArray(display.kinds))fail('CONFIG','显示配置缺少内容类型');if(MESSAGE_SUBTYPES.includes(request.kind)&&!display.kinds.includes(request.kind))return {hidden:true};}
 const projection=resolveRecordReference(request.reference,options);if(projection.kind!==request.kind)fail('KIND','请求类型与已授权记录投影类型不一致');
 const limit=count(display?.limit??options.displayLimit,'显示条数'),tokens=display?.tokens??{};
 if(!plain(tokens)||Object.keys(tokens).some(k=>!['density','alignment','emphasis'].includes(k))||!['comfortable','compact'].includes(tokens.density??'comfortable')||!['start','center'].includes(tokens.alignment??'start')||!['existing','quiet'].includes(tokens.emphasis??'existing'))fail('TOKENS','未登记的呈现令牌');
 return {...projection,limit,tokens:{density:tokens.density??'comfortable',alignment:tokens.alignment??'start',emphasis:tokens.emphasis??'existing'}};
}
export function renderPresentation(request,options={}){
 const compiled=compilePresentation(request,options);if(compiled.hidden)return '';
 const {kind,value:v,limit,reference,tokens}=compiled;let body;
 if(kind==='transfer')body=transfer(v);
 else if(kind==='voice')body=voice(v,options);
 else if(kind==='image')body=image(v,options);
 else if(kind==='news')body=news(v);
 else if(kind==='forum')body=forum(v,limit,reference);
 else if(kind==='danmaku')body=danmaku(v,limit,options);
 else if(kind==='theater')body=theater(v,limit);
 else body=header(v,names[kind])+paragraphs(v)+stamp(v);
 const marker=['text','transfer','voice','image'].includes(kind)?'消息':kind==='news'||kind==='danmaku'?'播报':kind==='forum'?'档案':kind==='theater'?'事件':kind==='settlement'?'收获':'旁白';
 return '<section data-tisya-mark="'+marker+'" data-tisya-presentation="'+kind+'" data-density="'+tokens.density+'" data-alignment="'+tokens.alignment+'" data-emphasis="'+tokens.emphasis+'" data-no-terms="">'+body+'<small class="tisya-presentation-provenance">'+(reference.snapshotId!==undefined||reference.revision!==undefined?'已存历史记录':'当前记录预览')+'</small></section>';
}
export function presentationErrorNotice(error){return '<span class="tisya-resource-error" role="status">'+esc(error?.code==='TISYA_PRESENTATION_UNAVAILABLE'?'指定历史记录当前不可读取':error?.message??'记录呈现失败')+'</span>';}
// Called only on freshly created typography nodes. Caller records the authored
// nodes BEFORE formatMarks so arbitrary authored cards remain untouched.
export function projectPresentationMarks(root,{authoredNodes=new Set(),strict=false,onError=()=>{},...options}={}){
 let count=0;const errors=[],targets=[...root.querySelectorAll('[data-tisya-reference],[data-tisya-mark]')];
 for(const node of targets){if(!root.contains(node)||authoredNodes.has(node))continue;
  let parameter;if(node.hasAttribute('data-tisya-reference'))parameter=node.getAttribute('data-tisya-reference');
  else if(['消息','播报','档案','事件'].includes(node.getAttribute('data-tisya-mark')))parameter=[...node.children].find(c=>c.tagName==='HEADER')?.textContent;
  if(!parameter||!parameter.startsWith('@record'))continue;
  let html;try{const request=parsePresentationReference(parameter);if(!request)continue;
   if(!options.pending&&request.reference.snapshotId==='@message'){
    const binding=options.messageReferences?.find(r=>r.kind===request.kind&&r.tableId===request.reference.tableId&&r.recordId===request.reference.recordId),snapshotId=binding?.snapshotId??options.messageSnapshotId;
    if(typeof snapshotId!=='string'||!snapshotId)fail('UNAVAILABLE','本条消息没有已接纳的历史快照');request.reference.snapshotId=snapshotId;
   }
   html=options.pending?'<span class="tisya-resource-error" role="status">正在读取当时的记录。</span>':renderPresentation(request,options);
  }catch(error){if(strict)throw error;errors.push(error);onError(error);html=presentationErrorNotice(error);}
  const template=root.ownerDocument.createElement('template');template.innerHTML=html;node.replaceWith(template.content);count++;
 }
 return {count,errors};
}
export const PRESENTATION_CSS=`[data-tisya-presentation]{color:inherit}[data-tisya-presentation] p{white-space:pre-wrap;margin:.45em 0}[data-tisya-presentation] audio{display:block;width:100%;margin:.5em 0}[data-tisya-presentation] img{display:block;max-width:100%;height:auto;border-radius:.3em}[data-tisya-presentation] figure{margin:.5em 0}[data-tisya-presentation] figcaption,.tisya-presentation-meta,.tisya-presentation-muted,.tisya-presentation-provenance{font-size:.8em;opacity:.78}.tisya-presentation-amount{font-size:1.5em;font-variant-numeric:tabular-nums}.tisya-presentation-transcript{white-space:pre-wrap;border-left:2px solid #bfb48466;padding-left:.7em}.tisya-presentation-forum,.tisya-presentation-danmaku{list-style:none;padding:0;margin:0}.tisya-presentation-forum>li{border-top:1px solid #bfb48444;padding:.65em 0}.tisya-presentation-danmaku>li{display:flex;gap:.8em;align-items:baseline;padding:.3em .5em;background:#789d871a;margin:.25em 0;border-radius:.3em}.tisya-presentation-danmaku>li>span{flex-shrink:0;max-width:35%;overflow-wrap:anywhere;font-size:.8em;color:var(--tisya-dialogue-color,#ffedbf)}[data-tisya-presentation][data-density=compact]{padding:.4em .65em}[data-tisya-presentation][data-alignment=center]>header{text-align:center}[data-tisya-presentation][data-emphasis=quiet]{background:transparent}.tisya-presentation-provenance{display:block;margin-top:.65em}`;


const ARCHIVE_SKIP='a,button,code,pre,script,style,textarea,input,select,option,iframe,object,embed,noscript,template,[contenteditable],[data-tisya-reference],[data-tisya-presentation],[data-tisya-no-archive-links],[data-tisya-archive-anchor]';
const archiveInteractionState=new WeakMap();
let archiveTooltipSequence=0;
const archivePathElement=(event,attribute)=>event.composedPath().find(node=>node?.hasAttribute?.(attribute));
function placeArchiveTooltip(anchor){
 const rect=anchor.getBoundingClientRect(),win=anchor.ownerDocument.defaultView,width=win?.innerWidth??1024;
 anchor.dataset.archivePlace=rect.top<240?'below':'above';
 anchor.dataset.archiveAlign=rect.left<170?'left':rect.right>width-170?'right':'center';
}
function setArchiveTooltip(state,anchor,open,restoreFocus=false){
 if(open){for(const other of [...state.open])if(other!==anchor)setArchiveTooltip(state,other,false);state.open.add(anchor);placeArchiveTooltip(anchor);}
 else state.open.delete(anchor);
 anchor.dataset.archiveOpen=String(open);const trigger=anchor.querySelector('[data-tisya-archive-link]');trigger?.setAttribute('aria-expanded',String(open));if(restoreFocus)trigger?.focus({preventScroll:true});
}
function archiveInteractions(document){
 if(archiveInteractionState.has(document))return;
 const state={open:new Set()};archiveInteractionState.set(document,state);
 document.addEventListener('click',event=>{
  const trigger=archivePathElement(event,'data-tisya-archive-link');
  if(trigger){event.preventDefault();const anchor=trigger.closest('[data-tisya-archive-anchor]');setArchiveTooltip(state,anchor,anchor.dataset.archiveOpen!=='true');return;}
  const close=archivePathElement(event,'data-tisya-archive-close');
  if(close){event.preventDefault();const anchor=close.closest('[data-tisya-archive-anchor]');setArchiveTooltip(state,anchor,false,true);return;}
  const open=archivePathElement(event,'data-tisya-archive-open');
  if(open){event.preventDefault();const anchor=open.closest('[data-tisya-archive-anchor]'),tableId=open.getAttribute('data-table-id'),recordId=open.getAttribute('data-record-id');setArchiveTooltip(state,anchor,false);const launch=document.defaultView?.Tisya?.archive?.open;if(typeof launch==='function'&&tableId&&recordId)Promise.resolve(launch({tableId,recordId}));return;}
  for(const anchor of [...state.open])if(!event.composedPath().includes(anchor))setArchiveTooltip(state,anchor,false);
 });
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;const anchor=archivePathElement(event,'data-tisya-archive-anchor')??[...state.open].at(-1);if(anchor){event.preventDefault();setArchiveTooltip(state,anchor,false,true);}
 });
 const place=event=>{const trigger=archivePathElement(event,'data-tisya-archive-link');if(trigger)placeArchiveTooltip(trigger.closest('[data-tisya-archive-anchor]'));};
 document.addEventListener('pointerover',place);document.addEventListener('focusin',place);
}
function archiveTooltip(document,name,entry){
 const anchor=document.createElement('span');anchor.className='tisya-archive-anchor';anchor.dataset.tisyaArchiveAnchor='';anchor.dataset.archiveOpen='false';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='tisya-archive-link';trigger.dataset.tisyaArchiveLink='';trigger.setAttribute('aria-expanded','false');trigger.textContent=name;
 const tooltip=document.createElement('span'),id='tisya-archive-tip-'+(++archiveTooltipSequence);tooltip.id=id;tooltip.className='tisya-archive-tooltip';tooltip.dataset.tisyaArchiveTooltip='';tooltip.setAttribute('role','tooltip');trigger.setAttribute('aria-controls',id);trigger.setAttribute('aria-label',name+'：查看'+entry.kind+'档案');
 const heading=document.createElement('span');heading.className='tisya-archive-tooltip-heading';
 const titles=document.createElement('span');titles.className='tisya-archive-tooltip-titles';
 const kind=document.createElement('span');kind.className='tisya-archive-tooltip-kind';kind.textContent=entry.kind;
 const title=document.createElement('span');title.className='tisya-archive-tooltip-title';title.textContent=entry.title;titles.append(kind,title);
 const close=document.createElement('button');close.type='button';close.className='tisya-archive-tooltip-close';close.dataset.tisyaArchiveClose='';close.setAttribute('aria-label','关闭'+entry.title+'档案提示');close.textContent='×';heading.append(titles,close);tooltip.append(heading);
 for(const [label,value] of entry.fields??[]){const row=document.createElement('span'),term=document.createElement('span'),detail=document.createElement('span');row.className='tisya-archive-tooltip-field';term.className='tisya-archive-tooltip-label';detail.className='tisya-archive-tooltip-value';term.textContent=label;detail.textContent=value;row.append(term,detail);tooltip.append(row);}
 if(typeof document.defaultView?.Tisya?.archive?.open==='function'){
  const open=document.createElement('button');open.type='button';open.className='tisya-archive-tooltip-open';open.dataset.tisyaArchiveOpen='';open.dataset.tableId=entry.reference.tableId;open.dataset.recordId=entry.reference.recordId;open.textContent='在当前图鉴中打开 →';tooltip.append(open);
 }
 anchor.append(trigger,tooltip);return anchor;
}
const asciiWord=value=>typeof value==='string'&&/[A-Za-z0-9_]/u.test(value);
function archiveBoundary(text,start,end,name){
 return !(start>0&&asciiWord(name[0])&&asciiWord(text[start-1]))&&!(end<text.length&&asciiWord(name.at(-1))&&asciiWord(text[end]));
}
export function projectArchiveLinks(root,{archiveLinks=null,contextKey=null}={}){
 if(!root||!archiveLinks)return;
 const index=archiveLinkTextIndex({entries:(archiveLinks.entries??[]).filter(entry=>entry?.allowed===true&&entry.contextKey===contextKey&&entry.reference?.snapshotId)});if(!index.length)return;
 const document=root.ownerDocument,walker=document.createTreeWalker(root,4),nodes=[];
 while(walker.nextNode()){const node=walker.currentNode;if(node.parentElement?.closest(ARCHIVE_SKIP))continue;if(node.nodeValue?.trim())nodes.push(node);}
 for(const node of nodes){
  const source=node.nodeValue,fragment=document.createDocumentFragment();let cursor=0,from=0,matched=false;
  while(cursor<source.length){
   const found=index.find(({name})=>source.startsWith(name,cursor)&&archiveBoundary(source,cursor,cursor+name.length,name));
   if(!found){cursor++;continue;}
   matched=true;fragment.append(document.createTextNode(source.slice(from,cursor)),archiveTooltip(document,found.name,found.entry));cursor+=found.name.length;from=cursor;
  }
  if(matched){fragment.append(document.createTextNode(source.slice(from)));node.replaceWith(fragment);}
 }
 archiveInteractions(document);
}
export const ARCHIVE_LINK_CSS=`.tisya-archive-anchor{position:relative;display:inline}.tisya-archive-link{appearance:none;display:inline;vertical-align:baseline;margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:inherit;font:inherit;line-height:inherit;letter-spacing:inherit;text-align:inherit;text-transform:none;white-space:inherit;min-width:0;min-height:0;width:auto;height:auto;cursor:pointer;text-decoration:none}.tisya-archive-link:hover,.tisya-archive-link:focus-visible{color:var(--tisya-dialogue-color,#9b6a30);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:.2em;outline:none;background:color-mix(in srgb,var(--tisya-dialogue-color,#b98b4b) 9%,transparent)}.tisya-archive-tooltip{position:absolute;z-index:80;bottom:calc(100% + 9px);left:50%;display:none;width:min(320px,calc(100vw - 32px));max-height:min(440px,58vh);overflow:auto;padding:14px 16px 13px;border:1px solid #b9a47b66;border-radius:10px;background:var(--tisya-archive-tooltip-bg,#fffdf7);box-shadow:0 12px 38px #251b1240;color:var(--tisya-archive-tooltip-text,#342c25);font-family:var(--tisya-global-font,TisyaReading),TisyaReading,serif;font-size:14px;font-style:normal;font-weight:400;line-height:1.65;letter-spacing:0;text-align:left;white-space:normal;transform:translateX(-50%);overflow-wrap:anywhere}.tisya-archive-anchor[data-archive-place=below]>.tisya-archive-tooltip{bottom:auto;top:calc(100% + 9px)}.tisya-archive-anchor[data-archive-align=left]>.tisya-archive-tooltip{left:0;transform:none}.tisya-archive-anchor[data-archive-align=right]>.tisya-archive-tooltip{left:auto;right:0;transform:none}.tisya-archive-anchor[data-archive-open=true]>.tisya-archive-tooltip{display:block}.tisya-archive-tooltip-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding-bottom:8px;border-bottom:1px solid #b9a47b44}.tisya-archive-tooltip-titles{display:block;min-width:0}.tisya-archive-tooltip-kind{display:block;margin-bottom:2px;color:#8b6c40;font-size:11px;letter-spacing:.12em}.tisya-archive-tooltip-title{display:block;color:#32261d;font-size:18px;font-weight:650;line-height:1.35}.tisya-archive-tooltip-close{flex:0 0 36px;width:36px;height:36px;margin:-8px -10px -5px 0;padding:0;border:0;border-radius:50%;background:transparent;color:#6f6255;font:24px/1 sans-serif;cursor:pointer}.tisya-archive-tooltip-close:hover,.tisya-archive-tooltip-close:focus-visible{background:#9c7a4520;outline:2px solid #9c7a4544;outline-offset:-2px}.tisya-archive-tooltip-field{display:block;margin-top:9px}.tisya-archive-tooltip-label{display:block;margin-bottom:1px;color:#887764;font-size:11px}.tisya-archive-tooltip-value{display:block;white-space:pre-wrap}.tisya-archive-tooltip-open{display:block;margin:12px 0 0;padding:7px 0 0;width:100%;border:0;border-top:1px solid #b9a47b44;background:transparent;color:#785a31;font:inherit;text-align:left;cursor:pointer}.tisya-archive-tooltip-open:hover,.tisya-archive-tooltip-open:focus-visible{text-decoration:underline;outline:none}@media (hover:hover) and (pointer:fine){.tisya-archive-anchor:hover>.tisya-archive-tooltip,.tisya-archive-anchor:focus-within>.tisya-archive-tooltip{display:block}}@media (pointer:coarse){.tisya-archive-tooltip-close{flex-basis:44px;width:44px;height:44px}.tisya-archive-link{min-height:24px}.tisya-archive-tooltip-open{min-height:44px;padding-top:10px}}@media (max-width:480px){.tisya-archive-tooltip{max-height:52vh;padding:13px 14px;font-size:14px}}`;
