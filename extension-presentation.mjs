import {normalizeRecordReference,MESSAGE_SUBTYPES} from './extension-preferences.mjs';

// Pure presentation of caller-authorized form projections. There are no state,
// network, ledger, or generation services in this module.
export const PRESENTATION_KINDS=Object.freeze([...MESSAGE_SUBTYPES,'forum','danmaku','theater','notice','rumor','settlement']);
const names={text:'消息',transfer:'转账记录',voice:'语音',image:'图片',news:'新闻',forum:'论坛',danmaku:'弹幕',theater:'小剧场',notice:'公告',rumor:'风闻',settlement:'结算记录'};
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
 if(v.resourceId==null)output+='<p class="tisya-presentation-muted">语音文稿 · 未提供音源</p>';
 else{const r=resource(v.resourceId,'audio',options);output+='<audio controls preload="none" src="'+esc(r.url)+'" aria-label="'+esc(optional(v.title,'标题')||r.name||'语音音源')+'"></audio>';}
 if(transcript)output+='<div class="tisya-presentation-transcript">'+esc(transcript)+'</div>';
 return output+stamp(v);
}
function image(v,options){
 let output=header(v,'图片');if(v.resourceId==null)output+='<p class="tisya-presentation-muted">未提供图片资源</p>';
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
 const {config}=options,display=config?.display??null;
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
   if(!options.pending&&request.reference.snapshotId==='@message'){if(typeof options.messageSnapshotId!=='string'||!options.messageSnapshotId)fail('UNAVAILABLE','本条消息没有已接纳的历史快照');request.reference.snapshotId=options.messageSnapshotId;}
   html=options.pending?'<span class="tisya-resource-error" role="status">正在读取当时的记录。</span>':renderPresentation(request,options);
  }catch(error){if(strict)throw error;errors.push(error);onError(error);html=presentationErrorNotice(error);}
  const template=root.ownerDocument.createElement('template');template.innerHTML=html;node.replaceWith(template.content);count++;
 }
 return {count,errors};
}
export const PRESENTATION_CSS=`[data-tisya-presentation]{color:inherit}[data-tisya-presentation] p{white-space:pre-wrap;margin:.45em 0}[data-tisya-presentation] audio{display:block;width:100%;margin:.5em 0}[data-tisya-presentation] img{display:block;max-width:100%;height:auto;border-radius:.3em}[data-tisya-presentation] figure{margin:.5em 0}[data-tisya-presentation] figcaption,.tisya-presentation-meta,.tisya-presentation-muted,.tisya-presentation-provenance{font-size:.8em;opacity:.78}.tisya-presentation-amount{font-size:1.5em;font-variant-numeric:tabular-nums}.tisya-presentation-transcript{white-space:pre-wrap;border-left:2px solid #bfb48466;padding-left:.7em}.tisya-presentation-forum,.tisya-presentation-danmaku{list-style:none;padding:0;margin:0}.tisya-presentation-forum>li{border-top:1px solid #bfb48444;padding:.65em 0}.tisya-presentation-danmaku>li{display:flex;gap:.8em;align-items:baseline;padding:.3em .5em;background:#789d871a;margin:.25em 0;border-radius:.3em}.tisya-presentation-danmaku>li>span{flex-shrink:0;max-width:35%;overflow-wrap:anywhere;font-size:.8em;color:var(--tisya-dialogue-color,#ffedbf)}[data-tisya-presentation][data-density=compact]{padding:.4em .65em}[data-tisya-presentation][data-alignment=center]>header{text-align:center}[data-tisya-presentation][data-emphasis=quiet]{background:transparent}.tisya-presentation-provenance{display:block;margin-top:.65em}`;
