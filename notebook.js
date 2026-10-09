import {inspectMessage,readerErrorText} from './reader.js';
import {capture,validate} from './model.js';

// This is a disposable view over loaded messages, never a state database.
// Search the same public fields that the reader displays, never the envelope.
export function publicJourneyText(view) {
    if(!view)return '';
    const parts=[],add=value=>{if(value!==null&&value!==undefined&&value!=='')parts.push(typeof value==='string'?value:JSON.stringify(value));};
    for(const m of view.memories){
        add(m.scene?.title);add(m.scene?.time?.start);add(m.scene?.time?.end);
        (m.scene?.places??[]).forEach(add);add(m.scene?.world);
        m.participants.forEach(add);add(m.summary);add(m.quote?.reference);add(m.quote?.text);
        m.results.forEach(add);add(m.impact);m.tags.forEach(add);
    }
    for(const c of view.characters)if(c.cognition.length){add(c.name);for(const r of c.cognition){add(r.content);add(r.source);add(r.certainty);}}
    const valueText=value=>typeof value==='string'?value:JSON.stringify(value);
    for(const c of view.changes){add(c.object);add(c.field);if(c.hasOldValue)add(valueText(c.oldValue));if(c.deleted)add('已移除');else if(c.hasNewValue)add(valueText(c.newValue));add(c.reason);}
    return parts.join('\n');
}

export function notebookEntry(context,id,mode) {
    const message=context.chat[id];
    if(!message||message.is_system||typeof message.mes!=='string')return null;
    const token=capture(context,id),data=inspectMessage(token.text);
    const result=mode==='memory'?data.journey:data.body;
    const text=result.error?'':mode==='memory'?publicJourneyText(result.value):result.value;
    if(!result.error&&!text?.trim())return null;
    return {token,text,error:result.error??null,name:message.is_user?'你':String(message.name??'角色')};
}

export function mountNotebook(document,container,{getContext,mode='notes',onRead,onLocate,onError}) {
    if(!['notes','memory'].includes(mode))throw new Error('未知的阅读页');
    const win=document.defaultView,make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const note=make('p',mode==='memory'?'公开记录按原消息所属回合展示，不代表当前状态。仅浏览当前会话已载入的内容。':'只读浏览当前会话已载入的对话消息，最近的消息在前。','tisya-note');
    const search=make('input');search.type='search';search.placeholder=mode==='memory'?'搜索公开记录':'搜索正文';search.setAttribute('aria-label',search.placeholder);
    const status=make('p','','tisya-note');status.setAttribute('role','status');
    const list=make('div',undefined,'tisya-notebook-list'),pager=make('nav',undefined,'tisya-notebook-pager');pager.setAttribute('aria-label','阅读分页');
    const previous=make('button','上一页'),next=make('button','下一页'),refresh=make('button','刷新');for(const b of [previous,next,refresh])b.type='button';pager.append(previous,next,refresh);
    container.classList.add('tisya-notebook');container.replaceChildren(note,search,status,list,pager);
    let alive=true,epoch=0,timer=null,snapshot=null,entries=[],page=0,loading=false,stale=false;
    function clearTimer(){if(timer!==null)win.clearTimeout(timer);timer=null;}
    function invalidate(){
        if(!alive)return;epoch++;clearTimer();entries=[];snapshot=null;loading=false;stale=true;
        list.replaceChildren();previous.disabled=next.disabled=true;search.disabled=true;
        status.textContent='会话内容已变化，请刷新后继续查看。';
    }
    function checkCurrent(){
        if(!alive||stale||!snapshot)return false;
        const ctx=getContext();
        if(ctx.getCurrentChatId()!==snapshot.chatId||ctx.chat.length!==snapshot.length){invalidate();return false;}
        for(let i=0;i<snapshot.length;i++){
            const before=snapshot.messages[i],now=ctx.chat[i];
            if(now!==before.message||now?.mes!==before.text||now?.swipe_id!==before.swipe||now?.name!==before.name||now?.is_user!==before.user||now?.is_system!==before.system){invalidate();return false;}
        }
        return true;
    }
    function invoke(entry,callback){
        if(!checkCurrent())return;
        try{validate(getContext(),entry.token);callback(entry.token,mode==='memory'?'journey':'body');}catch(error){onError(error);}
    }
    function render(){
        if(!checkCurrent()||loading)return;
        const query=search.value.trim().toLocaleLowerCase();
        const found=entries.filter(e=>!query||e.text.toLocaleLowerCase().includes(query));
        const pages=Math.max(1,Math.ceil(found.length/20));page=Math.min(page,pages-1);
        list.replaceChildren();
        for(const entry of found.slice(page*20,(page+1)*20)){
            const card=make('article',undefined,'tisya-notebook-card'),title=make('h3',`第 ${entry.token.id+1} 条 · ${entry.name}`);
            const preview=make('p',entry.error?readerErrorText(entry.error):entry.text.replace(/\s+/g,' ').trim().slice(0,180));
            if(entry.error)preview.setAttribute('role','status');
            const actions=make('div',undefined,'tisya-notebook-actions'),read=make('button',mode==='memory'?'查看本回合':'阅读正文'),locate=make('button','定位原文');
            for(const b of [read,locate])b.type='button';
            read.addEventListener('click',()=>invoke(entry,onRead));locate.addEventListener('click',()=>invoke(entry,onLocate));
            actions.append(read,locate);card.append(title,preview,actions);list.append(card);
        }
        status.textContent=found.length?`${found.length} 条可显示记录 · 第 ${page+1} / ${pages} 页`:query?'没有匹配的公开内容。':mode==='memory'?'已载入消息中没有可显示的公开回合记录。':'已载入消息中没有可显示的正文。';
        previous.disabled=page===0;next.disabled=page>=pages-1;
    }
    function refreshView(){
        if(!alive)return;epoch++;clearTimer();const ticket=epoch,ctx=getContext();
        entries=[];page=0;stale=false;loading=true;list.replaceChildren();search.disabled=true;previous.disabled=next.disabled=true;
        snapshot={chatId:ctx.getCurrentChatId(),length:ctx.chat.length,messages:Array.from(ctx.chat,m=>({message:m,text:m?.mes,swipe:m?.swipe_id,name:m?.name,user:m?.is_user,system:m?.is_system}))};
        let cursor=snapshot.length-1;status.textContent='正在读取已载入的消息…';
        function batch(){
            timer=null;if(!alive||ticket!==epoch||!checkCurrent())return;
            try{
                for(let count=0;count<12&&cursor>=0;count++,cursor--){const entry=notebookEntry(getContext(),cursor,mode);if(entry)entries.push(entry);}
                if(cursor>=0){timer=win.setTimeout(batch,0);return;}
                if(!checkCurrent())return;loading=false;search.disabled=false;render();
            }catch(error){epoch++;entries=[];snapshot=null;loading=false;stale=true;list.replaceChildren();status.textContent='读取失败，请刷新重试。';onError(error);}
        }
        timer=win.setTimeout(batch,0);
    }
    search.addEventListener('input',()=>{page=0;render();});
    previous.addEventListener('click',()=>{if(page>0){page--;render();}});
    next.addEventListener('click',()=>{page++;render();});refresh.addEventListener('click',refreshView);
    refreshView();
    return {checkCurrent,refresh:refreshView,invalidate,dispose(){alive=false;epoch++;clearTimer();entries=[];snapshot=null;container.replaceChildren();}};
}
