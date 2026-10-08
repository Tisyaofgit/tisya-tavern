import { iconMarkup } from './icons.js';

// Port of Foundation r243 chat-navigation.cjs: physical reading order and a
// destination cursor. The existing composer owns the controls and geometry.
export function readingIndex(rects, top, bottom) {
    if (!rects.length) return -1;
    const middle=(top+bottom)/2;let best=-1,area=-1,distance=Infinity;
    rects.forEach((r,i)=>{
        const visible=Math.max(0,Math.min(bottom,r.bottom)-Math.max(top,r.top));
        const d=middle<r.top?r.top-middle:middle>r.bottom?middle-r.bottom:0;
        if(visible>area+.5||Math.abs(visible-area)<=.5&&d<distance){best=i;area=visible;distance=d;}
    });
    return best;
}

export function mountMessageNavigation(document, { getLanding = () => '底部', onNavigate = () => {} } = {}) {
    const chat=document.getElementById('chat'),parent=document.getElementById('leftSendForm'),win=document.defaultView;
    if(!chat||!parent)throw new Error('消息导航尚未就绪');
    const buttons={};
    for(const [id,label] of [['previous','上一条消息'],['next','下一条消息']]) {
        const button=document.createElement('button');button.id=`tisya-${id}-message`;button.type='button';
        button.dataset.tisyaShortcut=id;button.className='tisya-nav-button tisya-icon-button';
        button.innerHTML=iconMarkup(id);button.setAttribute('aria-label',label);button.title=label;
        button.addEventListener('click',()=>go(id));buttons[id]=button;
    }
    const attachment=document.getElementById('tisya-attach');
    if(attachment?.parentElement===parent)attachment.after(buttons.previous,buttons.next);else parent.prepend(buttons.previous,buttons.next);
    let alive=true,frame=0,cursor=null,targets={previous:null,next:null},geometry=null,current=-1;
    const observed=new Set();
    const resize=typeof win.ResizeObserver==='function'?new win.ResizeObserver(()=>{cursor=null;schedule();}):null;
    resize?.observe(chat);
    function rows() {
        const list=[...chat.querySelectorAll(':scope > .mes[mesid]')].filter(node=>node.getClientRects().length&&node.getBoundingClientRect().height>0);
        for(const node of observed)if(!list.includes(node)){resize?.unobserve(node);observed.delete(node);}
        for(const node of list)if(!observed.has(node)){resize?.observe(node);observed.add(node);}
        return list.map(node=>({node,rect:node.getBoundingClientRect()})).sort((a,b)=>a.rect.top-b.rect.top||a.rect.bottom-b.rect.bottom);
    }
    function update() {
        if(!alive)return;
        const box=chat.getBoundingClientRect(),viewport=win.visualViewport;
        const top=Math.max(box.top,viewport?.offsetTop??0),bottom=Math.min(box.bottom,(viewport?.offsetTop??0)+(viewport?.height??win.innerHeight));
        geometry={top:top+16,bottom:bottom-16,scale:chat.offsetHeight?box.height/chat.offsetHeight:1};
        const list=rows();
        if(bottom-top<=32||box.width<=0){cursor=null;current=-1;targets={previous:null,next:null};}
        else {
            const atCursor=cursor&&list.some(row=>row.node===cursor.node)&&Math.abs(chat.scrollTop-cursor.position)<2&&Math.abs(cursor.node.getBoundingClientRect().top-cursor.anchor)<2&&cursor.top===geometry.top&&cursor.bottom===geometry.bottom;
            if(atCursor)current=list.findIndex(row=>row.node===cursor.node);
            else {
                cursor=null;const last=list.at(-1)?.rect;
                const latestEndVisible=last&&last.bottom<=bottom+1&&last.bottom>top&&last.top<bottom;
                current=latestEndVisible?list.length-1:readingIndex(list.map(row=>row.rect),geometry.top,geometry.bottom);
            }
            targets={previous:current>0?list[current-1].node:null,next:current>=0&&current<list.length-1?list[current+1].node:null};
        }
        const landing=getLanding()==='顶部'?'顶部':'底部';
        for(const [id,button] of Object.entries(buttons)) {
            const label=targets[id]?(id==='previous'?'上一条消息'+landing:'下一条消息顶部'):list.length?(id==='previous'?'已到最早载入的消息':'已到最新载入的消息'):'暂无已载入消息';
            button.disabled=!targets[id];button.setAttribute('aria-disabled',String(!targets[id]));button.setAttribute('aria-label',label);button.title=label;
        }
    }
    function go(direction) {
        update();const target=targets[direction];if(!alive||!target)return;
        const rect=target.getBoundingClientRect(),toTop=direction==='next'||getLanding()==='顶部';
        const delta=toTop?rect.top-geometry.top:rect.bottom-geometry.bottom;
        chat.scrollTo({top:chat.scrollTop+delta/geometry.scale,behavior:'instant'});
        cursor={node:target,position:chat.scrollTop,anchor:target.getBoundingClientRect().top,top:geometry.top,bottom:geometry.bottom};
        update();onNavigate();
    }
    function schedule(){if(alive&&!frame)frame=win.requestAnimationFrame(()=>{frame=0;update();});}
    function reset(){cursor=null;schedule();}
    const observer=new win.MutationObserver(schedule);observer.observe(chat,{childList:true,subtree:true});
    chat.addEventListener('scroll',schedule,{passive:true});win.addEventListener('resize',reset);win.visualViewport?.addEventListener('resize',reset);win.visualViewport?.addEventListener('scroll',reset);
    update();
    return {update,reset,report:()=>({current,previous:!!targets.previous,next:!!targets.next}),dispose(){
        alive=false;if(frame)win.cancelAnimationFrame(frame);observer.disconnect();resize?.disconnect();observed.clear();cursor=null;targets={previous:null,next:null};
        chat.removeEventListener('scroll',schedule);win.removeEventListener('resize',reset);win.visualViewport?.removeEventListener('resize',reset);win.visualViewport?.removeEventListener('scroll',reset);Object.values(buttons).forEach(button=>button.remove());
    }};
}
