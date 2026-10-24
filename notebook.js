import {inspectMessage,readerErrorText} from './reader.js';
import {capture,validate} from './model.js';
import {mountMemoryTimeline} from './v3/memory-timeline.mjs';

// This is a disposable view over loaded messages, never a state database.
// Search the same public fields that the reader displays, never the envelope.
export function publicJourneyText(view) {
 if(view?.recordSource!=='forms-live')return '';
 return [view.memories??[],view.characters??[],view.pool??[],view.changes??[]].flat().map(row=>JSON.stringify(row)).join('\n');
}

export function notebookEntry(context,id,mode,display={}) {
    const message=context.chat[id];
    if(!message||message.is_system||typeof message.mes!=='string')return null;
    const token=capture(context,id),data=inspectMessage(token.text,{showPsychology:display.显示角色心理===true,playerName:context.name1??null});
    if(mode==='memory')throw Error('记忆必须从当前表单归档读取');
    const result=data.body;
    const text=result.error?'':result.value;
    if(!result.error&&!text?.trim())return null;
    return {token,text,error:result.error??null,name:message.is_user?'你':String(message.name??'角色')};
}

export function mountNotebook(document,container,{getContext,getDisplay=()=>({}),mode='notes',onRead,onLocate,getJourney,getJourneyTimeline,getJourneyAnchor,onJourneySource,onError=()=>{}}) {
    if(!['notes','memory'].includes(mode))throw new Error('未知的阅读页');
    if(mode==='memory')return mountArchiveNotebook(document,container,{getContext,getDisplay,getJourneyTimeline,getJourneyAnchor,onJourneySource,onError});
    const win=document.defaultView,make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const note=make('p',mode==='memory'?'读者记录按原消息所属回合展示，不代表当前状态。仅浏览当前会话已载入的内容。':'只读浏览当前会话已载入的对话消息，最近的消息在前。','tisya-note');
    const search=make('input');search.type='search';search.placeholder=mode==='memory'?'搜索读者记录':'搜索正文';search.setAttribute('aria-label',search.placeholder);
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
        if(snapshot.psychology!==(getDisplay().显示角色心理===true)||snapshot.player!==(ctx.name1??null)){invalidate();return false;}
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
        status.textContent=found.length?`${found.length} 条可显示记录 · 第 ${page+1} / ${pages} 页`:query?'没有匹配的记录内容。':mode==='memory'?'已载入消息中没有可显示的回合记录。':'已载入消息中没有可显示的正文。';
        previous.disabled=page===0;next.disabled=page>=pages-1;
    }
    function refreshView(){
        if(!alive)return;epoch++;clearTimer();const ticket=epoch,ctx=getContext();
        entries=[];page=0;stale=false;loading=true;list.replaceChildren();search.disabled=true;previous.disabled=next.disabled=true;
        snapshot={psychology:getDisplay().显示角色心理===true,player:ctx.name1??null,chatId:ctx.getCurrentChatId(),length:ctx.chat.length,messages:Array.from(ctx.chat,m=>({message:m,text:m?.mes,swipe:m?.swipe_id,name:m?.name,user:m?.is_user,system:m?.is_system}))};
        let cursor=snapshot.length-1;status.textContent='正在读取已载入的消息…';
        function batch(){
            timer=null;if(!alive||ticket!==epoch||!checkCurrent())return;
            try{
                for(let count=0;count<12&&cursor>=0;count++,cursor--){const entry=notebookEntry(getContext(),cursor,mode,getDisplay());if(entry)entries.push(entry);}
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

function mountArchiveNotebook(document,container,{getContext,getDisplay,getJourneyTimeline,getJourneyAnchor,onJourneySource,onError}){
 let alive=true,snapshot=null,timeline=null;
 const stamp=()=>{const c=getContext();return {chat:c.chat,id:c.getCurrentChatId(),messages:c.chat.map(m=>[m,m.mes,m.swipe_id]),psychology:getDisplay().显示角色心理===true};};
 function invalidate(){if(!alive)return;snapshot=null;timeline?.dispose();timeline=null;container.replaceChildren();const p=document.createElement('p');p.className='tisya-note';p.textContent='会话内容已变化，请刷新后继续查看。';const b=document.createElement('button');b.type='button';b.textContent='刷新记忆';b.onclick=refresh;container.append(p,b);}
 function checkCurrent(){const now=stamp();if(!snapshot||snapshot.chat!==now.chat||snapshot.id!==now.id||snapshot.psychology!==now.psychology||snapshot.messages.length!==now.messages.length||snapshot.messages.some((r,i)=>r.some((v,j)=>v!==now.messages[i][j]))){invalidate();return false;}return true;}
 function refresh(){if(!alive)return;timeline?.dispose();container.replaceChildren();snapshot=stamp();try{timeline=mountMemoryTimeline(document,container,{read:getJourneyTimeline,currentAnchor:getJourneyAnchor,showPsychology:getDisplay().显示角色心理===true,onSource:onJourneySource?payload=>{if(!checkCurrent())throw Error('会话内容已变化');return onJourneySource(payload);}:undefined,onError});return timeline.settled();}catch(e){const p=document.createElement('p');p.textContent=e.message;container.append(p);onError(e);}}
 refresh();return {settled:()=>timeline?.settled()??Promise.resolve(),checkCurrent,refresh,invalidate,dispose(){alive=false;timeline?.dispose();container.replaceChildren();}};
}
