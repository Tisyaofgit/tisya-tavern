import {mountActionChoice} from './actions.js';
import {readReplyDetails,mountHeartBlock,mountAuditBlock,replyControlsCSS} from './reply-details.js';
import {formatProse,proseCSS} from './prose.js';
import {mountWorldExtra,extraCSS} from './world-extra.js';
import {isReplyMessage,extractXMLBody,parseDisplayEnvelope,projectJourney,countBody,readParagraphs,strictJSON} from './reader-core.js';

export const readerErrorCode=error=>[error?.code,error?.message].find(code=>typeof code==='string'&&code.length<=96&&/^TIS(?:YA|HA)_[A-Z0-9_]+$/.test(code))??'TISYA_READER_INVALID';
export function readerErrorText(code){
    const safe=readerErrorCode({code});
    const message=safe==='TISYA_JOURNEY_MEMORY_UNSUPPORTED'?'本条记忆格式不受支持，无法核验公开权限。':safe==='TISHA_OUTPUT_SIZE'?'消息过长，无法打开阅读页。':/^TISHA_OUTPUT_|^TISYA_HANDOFF_|^TISYA_PIPES_|^TISHA_JSON_/.test(safe)?'消息结构不完整或格式不符合协议。':/^TISYA_MEMORY5_|^TISYA_JOURNEY_|^TISYA_PERMISSION_/.test(safe)?'回合记录未通过权限或原文引用校验。':safe==='TISYA_READER_ACTIONS_INVALID'?'行动列表格式不完整。':safe==='TISYA_READER_FORMAT'||/^TISYA_MARK_/.test(safe)?'正文排版失败。':'本条内容未通过阅读校验。';
    return `${message}原消息仍保留。（${safe}）`;
}
const attempt=fn=>{try{return {value:fn()};}catch(error){return {error:readerErrorCode(error)};}};
const candidate=source=>/^\s*(?:<!--[\s\S]*?-->\s*)*<(?:reply|output|think|thinking|world_thinking|character_mode|character_thinking|task|next|status|memory|actions)\b/i.test(source);

// Reply-local, read-only projection. Never return task/audit/raw memory as a
// fallback, including when a structured reply is partial or malformed.
export function inspectMessage(source) {
    if(typeof source!=='string'||source.length>2000000)return {structured:true,body:{error:'TISHA_OUTPUT_SIZE'},journey:{error:'TISHA_OUTPUT_SIZE'},actions:{error:'TISHA_OUTPUT_SIZE'}};
    const structured=isReplyMessage(source)||candidate(source);
    const body=structured?attempt(()=>extractXMLBody(source)):{value:source};
    if(Object.hasOwn(body,'value')) {
        body.count=attempt(()=>countBody(body.value,'字'));
        body.paragraphs=attempt(()=>readParagraphs(body.value));
    }
    if(!structured)return {structured:false,body,journey:{value:null},actions:{value:[]}};
    const journey=attempt(()=>projectJourney(source));
    const actions=attempt(()=>{
        const envelope=parseDisplayEnvelope(source),next=strictJSON(envelope.blocks.next);
        if(!Array.isArray(next?.actions)||next.actions.some(row=>!row||typeof row.text!=='string'||!row.text.trim()||typeof row.type!=='string'||typeof row.source!=='string'))throw Object.assign(Error(),{code:'TISYA_READER_ACTIONS_INVALID'});
        return next.actions.map(({text,type})=>({text,type}));
    });
    return {structured,body,journey,actions,details:attempt(()=>readReplyDetails(source))};
}

export function mountMessageReader(document, container, {source,formatBody,onChooseAction,getActionMode,setActionMode,initialTab='body'}) {
    const data=inspectMessage(source);
    let alive=true,actionChoice=null,extraView=null;
    const make=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined&&text!==null)el.textContent=String(text);if(className)el.className=className;return el;};
    const note=text=>make('p',text,'tisya-note');
    const failure=(target,label,code)=>{const el=note(`${label}暂不可用。${readerErrorText(code)}`);el.setAttribute('role','status');target.append(el);};
    const tabs=make('div',null,'tisya-reader-tabs');tabs.setAttribute('aria-label','阅读内容');
    const panel=make('div',null,'tisya-reader-panel');panel.id='tisya-reader-panel';panel.setAttribute('role','region');
    const buttons=new Map();
    for(const [key,label]of [['body','正文'],['journey','本回合'],['actions','行动'],['checks','心声与核验'],['extra','世界扩展']]) {
        const b=make('button',label);b.type='button';b.dataset.readerTab=key;b.setAttribute('aria-controls',panel.id);
        b.addEventListener('click',()=>render(key));tabs.append(b);buttons.set(key,b);
    }
    const proseStyle=make('style');proseStyle.textContent=proseCSS+replyControlsCSS+extraCSS+' .tisya-reader .action-mode-control{margin:0 0 12px}.tisya-reader .heart-bubble{color:inherit;background:#15463c;border:1px solid #a3be9d4b;border-radius:20px}.tisya-reader .heart-dots{display:flex;justify-content:center;gap:4px}.tisya-reader .heart-dots i{width:4px;height:4px;border-radius:50%;background:#a3be9d4b}.tisya-reader .heart-dots .active{background:#dfc88d}.tisya-reader .audit-ledger{padding:8px}.tisya-reader .audit-bead{margin:8px 0}.tisya-reader .status-orb{margin-right:6px}';
    container.classList.add('tisya-reader');container.replaceChildren(proseStyle,tabs,panel);
    const field=(target,label,value)=>{if(value===null||value===undefined||value==='')return;const p=make('p');p.append(make('strong',label+'：'),make('span',value));target.append(p);};
    const scene=(target,value)=>{
        if(!value)return;
        if(value.title)target.append(make('h3',value.title));
        const time=[value.time?.start,value.time?.end].filter(Boolean).join(' — ');
        const meta=[time,...(value.places??[]),value.world].filter(Boolean).join(' · ');
        if(meta)target.append(note(meta));
    };
    const valueText=value=>typeof value==='string'?value:JSON.stringify(value);
    function renderBody(){
        if(data.body.error){failure(panel,'正文',data.body.error);return;}
        if(data.body.count.error)failure(panel,'字数',data.body.count.error);
        else panel.append(note(`${data.body.count.value} 字`));
        const text=make('div',null,'tisya-reader-body');
        try {
            const paragraphs=data.body.paragraphs.value;
            if(paragraphs?.length)for(const p of paragraphs){
                const section=make('section',null,'tisya-reader-paragraph'),number=make('span',p.id,'tisya-paragraph-number'),content=make('div');
                number.hidden=true;number.setAttribute('aria-hidden','true');section.dataset.paragraph=p.id;content.innerHTML=formatProse(document,p.raw,formatBody);section.append(number,content);text.append(section);
            }
            else text.innerHTML=formatProse(document,data.body.value,formatBody);
            panel.append(text);
        } catch {failure(panel,'正文排版','TISYA_READER_FORMAT');}
    }
    function renderJourney(){
        if(data.journey.error){failure(panel,'回合记录',data.journey.error);return;}
        const view=data.journey.value;
        panel.append(note('记录对应所选消息这一回合。'));
        if(!view||!view.memories.length&&!view.characters.some(c=>c.cognition.length)&&!view.changes.length){panel.append(note('本条没有可显示的公开回合记录。'));return;}
        for(const memory of view.memories){
            const card=make('article',null,'tisya-reader-card');scene(card,memory.scene);
            field(card,'在场',memory.participants.join('、'));if(memory.summary)card.append(make('p',memory.summary));
            if(memory.quote){const details=make('details'),summary=make('summary','原文 · '+memory.quote.reference);details.append(summary,make('blockquote',memory.quote.text));card.append(details);}
            if(memory.results.length){const list=make('ul');memory.results.forEach(result=>list.append(make('li',result)));card.append(list);}
            field(card,'影响',memory.impact);if(memory.tags.length)card.append(note(memory.tags.join(' · ')));panel.append(card);
        }
        for(const character of view.characters){
            if(!character.cognition.length)continue;
            const card=make('article',null,'tisya-reader-card');card.append(make('h3',character.name));
            for(const record of character.cognition){card.append(make('p',record.content));field(card,record.certainty||'来源',record.source);}
            panel.append(card);
        }
        if(view.changes.length){panel.append(make('h3','本回合变动'));for(const change of view.changes){
            const card=make('article',null,'tisya-reader-card');card.append(make('h4',`${change.object} · ${change.field}`),note(change.kind==='setting'?'设定变动':'状态变动'));
            if(change.hasOldValue)field(card,'此前',valueText(change.oldValue));
            if(change.deleted)card.append(make('p','已移除'));
            else if(change.hasNewValue)field(card,'此后',valueText(change.newValue));
            field(card,'原因',change.reason);panel.append(card);
        }}
    }
    function renderActions(){
        if(data.actions.error){failure(panel,'行动建议',data.actions.error);return;}
        if(!data.actions.value.length){panel.append(note('本条没有行动建议。'));return;}
        panel.append(note('点选后填入输入框，发送前可以继续修改。'));
        actionChoice=mountActionChoice(document,panel,{rows:data.actions.value,onChoose:onChooseAction,getMode:getActionMode,setMode:setActionMode});
    }
    function render(key){
        if(!alive)return;actionChoice?.dispose();actionChoice=null;extraView?.dispose();extraView=null;panel.replaceChildren();
        for(const [id,b]of buttons)b.setAttribute('aria-pressed',String(id===key));
        panel.setAttribute('aria-label',buttons.get(key).textContent);
        if(key==='body')renderBody();else if(key==='journey')renderJourney();else if(key==='actions')renderActions();else if(key==='extra'){extraView=mountWorldExtra(document,panel,{source,structured:data.structured,formatBody});}else {if(data.details?.error)failure(panel,'心声与核验',data.details.error);else if(data.details?.value){const value=data.details.value;mountHeartBlock(document,panel,value.taskHeart,{label:'开篇心声'});mountAuditBlock(document,panel,value.audit);mountHeartBlock(document,panel,value.nextHeart,{label:'收篇心声'});if(!value.taskHeart.items.length&&!value.nextHeart.items.length)panel.append(note('本条心声为关闭或沉默。'));}else panel.append(note('本条没有心声与核验区块。'));}
        panel.scrollTop=0;
    }
    render(buttons.has(initialTab)?initialTab:'body');
    return {dispose(){alive=false;actionChoice?.dispose();extraView?.dispose();container.replaceChildren();buttons.clear();}};
}
