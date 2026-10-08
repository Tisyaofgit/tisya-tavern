import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountMessageNavigation,readingIndex} from '../navigation.js';

function fixture(heights,{reverse=false,landing='底部'}={}) {
    const w=new Window({width:400,height:800}),d=w.document;
    d.body.innerHTML='<div id="chat"></div><div id="leftSendForm"><button id="tisya-attach"></button></div>';
    const chat=d.getElementById('chat'),area={left:0,top:0,right:400,bottom:800,width:400,height:800};
    const total=heights.reduce((a,b)=>a+b,0);let scroll=0;
    const move=value=>{scroll=Math.max(0,Math.min(Math.max(total-800,0),value));};
    chat.getBoundingClientRect=()=>area;Object.defineProperty(chat,'offsetHeight',{value:800});
    Object.defineProperty(chat,'scrollTop',{get:()=>scroll,set:move});chat.scrollTo=options=>move(options.top);
    let offset=0;const nodes=heights.map((height,id)=>{
        const node=d.createElement('div'),start=offset;offset+=height;node.className='mes';node.setAttribute('mesid',id);
        node.getBoundingClientRect=()=>({...area,top:start-scroll,bottom:start+height-scroll,height});
        node.getClientRects=()=>[node.getBoundingClientRect()];chat.append(node);return node;
    });
    if(reverse)nodes.slice().reverse().forEach(node=>chat.append(node));
    let selectedLanding=landing,navigated=0;
    const nav=mountMessageNavigation(d,{getLanding:()=>selectedLanding,onNavigate:()=>navigated++});
    return {w,d,nav,nodes,move,previous:d.getElementById('tisya-previous-message'),next:d.getElementById('tisya-next-message'),setLanding:value=>selectedLanding=value,get scroll(){return scroll;},get navigated(){return navigated;},dispose(){nav.dispose();w.happyDOM.abort();}};
}

test('reading position uses the dominant visible message, including short user turns',()=>{
    assert.equal(readingIndex([{top:-2000,bottom:-300},{top:-290,bottom:700},{top:720,bottom:1300}],16,784),1);
    assert.equal(readingIndex([{top:-1000,bottom:100},{top:110,bottom:530},{top:540,bottom:3000}],16,784),1);
    assert.equal(readingIndex([],16,784),-1);
});
test('previous lands at previous bottom; controls are persistent, named and icon-only',()=>{
    const f=fixture([1200,2500,1300]);f.move(3000);f.nav.update();assert.equal(f.nav.report().current,1);
    assert.equal(f.previous.textContent,'');assert.match(f.previous.getAttribute('aria-label'),/上一条/);
    assert.equal(f.previous.previousElementSibling.id,'tisya-attach');assert.equal(f.next.previousElementSibling,f.previous);
    f.previous.click();assert.equal(f.scroll,416);assert.equal(f.navigated,1);assert.equal(f.nodes[0].getBoundingClientRect().bottom,784);
    assert.equal(f.previous.disabled,true);assert.equal(f.next.disabled,false);f.dispose();assert.equal(f.d.querySelector('.tisya-nav-button'),null);
});
test('destination cursor survives consecutive navigation; manual scroll changes the reading position',()=>{
    const f=fixture([1500,600,2300,1300]);f.move(3900);f.nav.update();f.previous.click();assert.equal(f.nav.report().current,1);
    f.previous.click();assert.equal(f.nodes[0].getBoundingClientRect().bottom,784);assert.equal(f.nav.report().current,0);
    f.move(3900);f.setLanding('顶部');f.nav.update();f.previous.click();assert.equal(f.nodes[1].getBoundingClientRect().top,16);
    f.previous.click();assert.equal(f.scroll,0);assert.equal(f.previous.disabled,true);
    f.move(3900);f.nav.update();assert.equal(f.previous.disabled,false);f.dispose();
});
for(const landing of ['顶部','底部'])test('reverse DOM follows physical reading order at '+landing,()=>{
    const f=fixture([1500,1200,1800],{reverse:true,landing});f.move(3700);f.nav.update();assert.equal(f.nav.report().current,2);
    f.previous.click();assert.equal(f.nav.report().current,1);assert.equal(f.nodes[1].getBoundingClientRect()[landing==='顶部'?'top':'bottom'],landing==='顶部'?16:784);
    f.previous.click();assert.equal(f.nav.report().current,0);assert.equal(f.previous.disabled,true);f.dispose();
});
test('short latest message wins over an older long tail when its end is visible',()=>{
    const f=fixture([1500,30]);f.move(1530);f.nav.update();assert.equal(f.nav.report().current,1);assert.equal(f.next.disabled,true);
    f.previous.click();assert.equal(f.nodes[0].getBoundingClientRect().bottom,784);assert.equal(f.nav.report().current,0);f.dispose();
});
test('next goes to next top and reverses previous without losing the cursor',()=>{
    const f=fixture([1500,600,2300,1300]);f.move(3900);f.nav.update();f.previous.click();f.next.click();
    assert.equal(f.nav.report().current,2);assert.equal(f.nodes[2].getBoundingClientRect().top,16);
    f.next.click();assert.equal(f.nav.report().current,3);assert.equal(f.nodes[3].getBoundingClientRect().top,16);assert.equal(f.next.disabled,true);
    const before=f.scroll;f.next.click();assert.equal(f.scroll,before);f.previous.click();assert.equal(f.nodes[2].getBoundingClientRect().bottom,784);f.dispose();
});
test('empty chat, removed messages and chat reset never keep a stale target',()=>{
    const empty=fixture([]);assert.equal(empty.previous.disabled,true);assert.equal(empty.next.disabled,true);empty.dispose();
    const f=fixture([1500,600,2300,1300]);f.move(3900);f.nav.update();f.previous.click();f.nodes[1].remove();f.nav.update();assert.equal(f.nav.report().current,0);
    f.nodes.forEach(node=>node.remove());f.nav.reset();f.nav.update();assert.equal(f.previous.disabled,true);assert.equal(f.next.disabled,true);f.dispose();
});
