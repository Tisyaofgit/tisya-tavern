import {chatPreview,chatTitle} from './layout.js';
import {homeAsset,mountHomeArt} from './home-art.js';
import {directoryState,directoryEntry,directoryToken} from './home-directory.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>`<img class="tisya-home-icon" src="${homeAsset(`icons/${name}.svg`)}" alt="" aria-hidden="true">`;
const route=(label,action,name,extra='')=>`<button type="button" data-tisya-action="${action}" ${extra}>${icon(name)}<span>${label}</span></button>`;
const BATCH=6,ROLE_BATCH=24;

// Native personas have no independent gender field. Read only an explicit
// self-description field, never pronouns, names, appearance, or other characters.
export function waterForm(description='') {
    const values=[...String(description).matchAll(/^\s*(?:性别|gender)\s*[:：]\s*(男(?:性)?|女(?:性)?|male|female)\s*$/gim)].map(m=>/^(男|male)/i.test(m[1])?'male':'female');
    const forms=new Set(values);
    return forms.size===1?{gender:values[0],explicit:true}:{gender:'female',explicit:false};
}

export function mountHome(document,container,{cards,profile={},listChats,thumbnail,chatDate=()=>null,onSelect,onError,current=()=>true,playing=true,effects,mountArt=mountHomeArt,requestTimeout=15000,preferences={}}={}) {
    directoryState(preferences);
    const window=document.defaultView, form=waterForm(profile.description);
    let disposed=false,cursor=0,loaded=0,query='',searchTimer=0,roleLimit=ROLE_BATCH,selecting=false;
    const requests=new Set(),states=cards.map(card=>({card:{...card,displayName:directoryEntry(preferences,card).名称||card.name,pinned:directoryEntry(preferences,card).置顶||0},chats:null,error:null,limit:BATCH,open:false,node:null})).sort((a,b)=>b.card.pinned-a.card.pinned);
    const alive=()=>!disposed&&current();
    container.classList.add('tisya-home-page');
    container.innerHTML=`<section class="tisya-home" aria-label="会话主页">
      <div class="tisya-home-art" aria-hidden="true"></div>
      <div class="tisya-home-body">
        <aside class="tisya-home-rail" aria-label="主页导航">
          <button type="button" class="tisya-home-profile" data-tisya-action="drawer:persona-management-button" aria-label="USER 个人资料"><span>USER</span><small>用户入口 ↗</small></button>
          <nav>${route('会话','home','chat','aria-current="page"')}${route('角色','contacts','character')}${route('群聊','groups','group')}${route('世界书','drawer:WI-SP-button','worldbook')}</nav>
          <div class="tisya-home-rail-bottom">${route('预设','drawer:ai-config-button','preset')}${route('设置','menu','settings')}</div>
        </aside>
        <div class="tisya-home-main">
          <header class="tisya-home-hero">${route('返回聊天','chat','back','class="tisya-home-back"')}<p class="tisya-home-brand">缇斯亚</p><h1>会话</h1><p class="tisya-home-subtitle">故事，仍在继续。</p></header>
          <label class="tisya-home-search">${icon('search')}<input type="search" aria-label="搜索角色或会话" placeholder="搜索角色或会话" autocomplete="off"></label>
          <section class="tisya-home-panel" aria-label="最近会话"><header><h2>最近会话</h2><span class="tisya-home-rule"></span>${route('刷新','home','refresh','class="tisya-home-refresh" aria-label="刷新会话列表"')}</header><p class="tisya-home-count" role="status" aria-live="polite"></p><div class="tisya-home-roles"></div><button type="button" class="tisya-home-more-roles" hidden>显示更多角色</button><p class="tisya-home-empty" hidden></p></section>
          <div class="tisya-home-notices"><p class="tisya-home-art-status" role="status" hidden></p></div>
          <footer class="tisya-home-dedication"><img src="${homeAsset('dedication.webp')}" alt="Per omne caelum, ad te. — Svāti" width="585" height="210"></footer>
        </div>
      </div>
    </section>`;
    const find=selector=>container.querySelector(selector),roles=find('.tisya-home-roles'),count=find('.tisya-home-count'),moreRoles=find('.tisya-home-more-roles'),empty=find('.tisya-home-empty');
    const size=()=>{if(alive())find('.tisya-home').style.setProperty('--tisya-home-height',`${container.clientHeight||window.innerHeight||700}px`);};
    const resize=typeof window.ResizeObserver==='function'?new window.ResizeObserver(size):null;resize?.observe(container);size();
    const artStatus=find('.tisya-home-art-status');
    const art=mountArt(document,find('.tisya-home-art'),{gender:form.gender,playing,effects,onError:error=>{if(alive()){artStatus.hidden=false;artStatus.textContent=error.message;}}});
    find('.tisya-home-dedication img').addEventListener('error',()=>{if(alive()){artStatus.hidden=false;artStatus.textContent='寄语素材未能读取，请更新完整扩展。';}});
    find('.tisya-home-dedication img').addEventListener('load',event=>{const image=event.target;if(alive()&&(image.naturalWidth!==585||image.naturalHeight!==210)){artStatus.hidden=false;artStatus.textContent='寄语素材尺寸不匹配，请更新完整扩展。';image.hidden=true;}});
    function matches(state){return !query||[state.card.name,state.card.displayName].some(name=>name.toLocaleLowerCase().includes(query))||(state.chats??[]).some(c=>c.search.includes(query));}
    function selectedChats(state){return !query||[state.card.name,state.card.displayName].some(name=>name.toLocaleLowerCase().includes(query))?state.chats??[]:(state.chats??[]).filter(c=>c.search.includes(query));}
    function createRole(state,index){
        const details=document.createElement('details');details.className='tisya-home-role';details.dataset.role=String(index);details.open=index<2;state.open=details.open;
        details.innerHTML=`<summary data-directory="${esc(directoryToken(state.card))}"><button type="button" class="tisya-home-role-open" data-tisya-action="card:${state.card.id}"><span class="tisya-home-portrait"><img alt="${esc(state.card.displayName)}角色卡图片" loading="lazy" decoding="async"><span hidden>图片不可用</span></span><span class="tisya-home-role-name">${state.card.pinned?'<small class="tisya-home-pin">置顶</small>':''}${esc(state.card.displayName)}</span></button><button type="button" class="tisya-home-role-count" data-expand="${index}" aria-label="展开或收起会话">读取中</button><button type="button" class="tisya-home-menu" data-tisya-action="directory-menu:${encodeURIComponent(directoryToken(state.card))}" aria-label="${esc(state.card.displayName)}操作菜单">${icon('chevron')}</button></summary><div class="tisya-home-role-body"></div>`;
        const image=details.querySelector('.tisya-home-portrait img');image.addEventListener('error',()=>{image.hidden=true;image.nextElementSibling.hidden=false;});
        try{image.src=thumbnail(state.card.avatar);}catch(error){image.hidden=true;image.nextElementSibling.hidden=false;image.nextElementSibling.textContent='图片读取失败';}
        details.addEventListener('toggle',()=>{if(!alive())return;state.open=details.open;renderRole(state,index);});
        state.node=details;return details;
    }
    function renderRole(state,index){
        if(!state.node)return;const details=state.node,body=details.querySelector('.tisya-home-role-body');
        details.querySelector('.tisya-home-role-count').textContent=state.error?'读取失败':state.chats?`${state.chats.length} 段`:'读取中';
        if(!details.open){body.replaceChildren();return;}
        if(state.error){body.innerHTML=`<p role="alert">${esc(state.error)}</p><button type="button" data-tisya-action="home">重新读取</button>`;return;}
        if(!state.chats){body.innerHTML='<p class="tisya-home-loading">正在读取会话…</p>';return;}
        const rows=selectedChats(state);
        body.innerHTML=`<div class="tisya-home-timeline">${rows.slice(0,state.limit).map(chat=>`<div class="tisya-home-chat-row" data-directory="${esc(directoryToken(state.card,chat.source))}"><button type="button" class="tisya-home-chat" data-home-card="${index}" data-home-chat="${chat.index}" ${selecting?'disabled':''}><span class="tisya-home-chat-dot"></span><span class="tisya-home-chat-copy"><strong>${chat.pinned?'<span class="tisya-home-pin">置顶 · </span>':''}${esc(chat.title)}</strong><small>${esc(chat.preview||'打开这段会话')}</small></span>${chat.date?`<time class="tisya-home-date">${esc(chat.date.day)}<small>${esc(chat.date.time)}</small></time>`:''}</button><button type="button" class="tisya-home-menu" data-tisya-action="directory-menu:${encodeURIComponent(directoryToken(state.card,chat.source))}" aria-label="${esc(chat.title)}操作菜单">${icon('chevron')}</button></div>`).join('')}</div>${!rows.length?'<p class="tisya-home-loading">'+(query?'没有匹配的会话':'还没有会话')+'</p>':''}${rows.length>state.limit?`<button type="button" class="tisya-home-more" data-more="${index}">再展开 ${Math.min(BATCH,rows.length-state.limit)} 段 · 余 ${rows.length-state.limit} 段</button>`:''}${!state.chats.length?`<button type="button" class="tisya-home-card-link" data-tisya-action="card:${state.card.id}">打开角色 / 新建会话 ↗</button>`:''}`;

    }
    function updateCount(){const total=states.reduce((n,s)=>n+(s.chats?.length??0),0),failed=states.filter(s=>s.error).length;count.textContent=`${cards.length} 位角色 · ${total} 段会话${loaded<cards.length?` · 正在读取 ${loaded}/${cards.length}`:failed?` · ${failed} 位读取失败`:''}`;}
    function renderRoles(){
        if(!alive())return;const visible=states.map((state,index)=>({state,index})).filter(({state})=>matches(state));
        // Reuse role nodes so arrivals for another character do not remove a
        // pressed chat button, reset focus, or steal an in-progress gesture.
        const selected=new Set(visible.slice(0,roleLimit).map(({state})=>state));
        for(const state of states)if(state.node)state.node.hidden=!selected.has(state);
        for(const {state,index}of visible.slice(0,roleLimit)){
            if(!state.node){roles.append(createRole(state,index));renderRole(state,index);}
            if(query&&!state.node.open){state.node.open=true;renderRole(state,index);}
        }
        moreRoles.hidden=visible.length<=roleLimit;moreRoles.textContent=`显示更多角色 · 余 ${Math.max(0,visible.length-roleLimit)} 位`;
        empty.hidden=visible.length>0;empty.textContent=cards.length?(loaded<cards.length?'仍在读取，其余会话稍后可搜索':'没有匹配的角色或会话'):'还没有角色。点左侧“角色”创建或导入。';updateCount();
    }
    const input=find('input[type=search]');
    input.addEventListener('input',()=>{window.clearTimeout(searchTimer);searchTimer=window.setTimeout(()=>{if(!alive())return;query=input.value.trim().toLocaleLowerCase();roleLimit=ROLE_BATCH;for(const state of states){state.limit=BATCH;if(state.node){state.node.open=query?matches(state):state.open;renderRole(state,states.indexOf(state));}}renderRoles();},120);});
    moreRoles.addEventListener('click',()=>{roleLimit+=ROLE_BATCH;renderRoles();});
    const click=async event=>{
        const button=event.target.closest('button');if(!button||!alive())return;
        if(button.hasAttribute('data-tisya-action')){if(button.closest('summary'))event.preventDefault();return;}
        if(button.hasAttribute('data-expand')){event.preventDefault();const state=states[Number(button.dataset.expand)];state.node.open=!state.node.open;return;}
        if(button.hasAttribute('data-more')){const index=Number(button.dataset.more),state=states[index];state.limit+=BATCH;renderRole(state,index);return;}
        if(!button.hasAttribute('data-home-chat')||selecting)return;
        const state=states[Number(button.dataset.homeCard)],chat=state?.chats?.[Number(button.dataset.homeChat)];if(!chat)return;
        selecting=true;for(const row of roles.querySelectorAll('[data-home-chat]'))row.disabled=true;
        try{await onSelect(state.card,chat.source);}catch(error){if(alive())onError(error);}finally{selecting=false;if(alive())for(const row of roles.querySelectorAll('[data-home-chat]'))row.disabled=false;}
    };
    roles.addEventListener('click',click);
    renderRoles();
    const ready=Promise.all(Array.from({length:Math.min(4,cards.length)},async()=>{
        while(alive()&&cursor<states.length){
            const index=cursor++,state=states[index],abort=new window.AbortController();requests.add(abort);
            const timer=window.setTimeout(()=>abort.abort(),requestTimeout);
            try{
                const chats=await listChats(state.card,abort.signal);
                if(!alive())return;
                state.chats=chats.map(source=>{const entry=directoryEntry(preferences,state.card,source),title=entry.名称||chatTitle(source.file_name,state.card.name),preview=chatPreview(source.mes),date=chatDate(source.last_mes);return {source,title,preview,date,pinned:entry.置顶||0,search:[source.file_name,title,preview].join(' ').toLocaleLowerCase()};}).sort((a,b)=>b.pinned-a.pinned||(b.date?.timestamp??0)-(a.date?.timestamp??0));
                state.chats.forEach((chat,index)=>{chat.index=index;});
            }catch(error){if(!alive())return;state.error=error.name==='AbortError'?'会话读取超时，请刷新':String(error.message??error);}
            finally{window.clearTimeout(timer);requests.delete(abort);}
            loaded++;renderRole(state,index);renderRoles();
        }
    }));
    return {ready,artReady:art.ready,refreshMotion(value,effects){art.setPlaying(value);if(effects)art.setEffects?.(effects);},dispose(){if(disposed)return;disposed=true;resize?.disconnect();window.clearTimeout(searchTimer);for(const request of requests)request.abort();requests.clear();art.dispose();roles.removeEventListener('click',click);container.classList.remove('tisya-home-page');}};
}
