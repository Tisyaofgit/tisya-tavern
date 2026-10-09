'use strict';
// A single live pearl per panel. Folding preserves the card document and its
// state; rack layout and ornament animation never write narrative data.
function mountPendantRack({root,assets}){
 const doc=root.ownerDocument,win=doc.defaultView,rail=root.querySelector('.pendant-hooks'),dock=rail.closest('.pendant-dock');
 const rows=new Map(),reduced=win.matchMedia('(prefers-reduced-motion: reduce)');let alive=true,paused=false,ticket=0,animations=[],frame=0,last=null,time=0;
 const element=(tag,cls)=>{const n=doc.createElement(tag);n.className=cls;return n;};
 const image=(name,cls)=>{if(!assets[name])throw Error('TISYA_CONTROL_ASSET_REQUIRED');const n=element('img',cls);n.src=assets[name];n.alt='';n.draggable=false;return n;};
 function moving(row){return row.available&&row.motion&&!row.expanded&&!row.node.dataset.moving;}
 function paint(row){row.sway.style.transform=`rotate(${row.angle}deg)`;row.tassel.style.transform=`rotate(${row.tail}deg)${row.side<0?" scaleX(-1)":""}`;}
 // A shared monotonic clock and two coupled damped pendulums. A touch adds
 // velocity instead of replacing the pose, so repeated pokes never snap.
 function tick(now){
  frame=0;if(!alive||paused||reduced.matches||doc.hidden){last=null;return;}
  const dt=last===null?0:Math.min(.12,(now-last)/1000);last=now;time+=dt;
  for(const row of rows.values()){
   if(!moving(row))continue;
   const rest=row.side*(1.05*Math.sin(time*1.04)+.24*Math.sin(time*.63));
   const steps=Math.max(1,Math.ceil(dt/.012)),step=dt/steps;
   for(let i=0;i<steps;i++){row.velocity+=((rest-row.angle)*20-row.velocity*2.4)*step;row.angle+=row.velocity*step;const tailTarget=-row.velocity*.065;row.tailVelocity+=((tailTarget-row.tail)*38-row.tailVelocity*3.8)*step;row.tail+=row.tailVelocity*step;}paint(row);
   if(row.pokedAt!==null&&time-row.pokedAt>3.2){row.pokedAt=null;delete row.node.dataset.poked;}
  }
  if([...rows.values()].some(moving))frame=win.requestAnimationFrame(tick);else last=null;
 }
 function sync(){if(frame)win.cancelAnimationFrame(frame);frame=0;last=null;if(alive&&!paused&&!reduced.matches&&!doc.hidden&&[...rows.values()].some(moving))frame=win.requestAnimationFrame(tick);}
 function layout(){
  const compact=[...rows.values()].some(r=>r.available&&r.expanded);dock.dataset.compact=String(compact);
  for(const row of rows.values()){
   row.hook.hidden=!row.available;row.hook.dataset.occupied=String(!row.expanded);
   row.region.hidden=!row.available||!row.expanded;row.region.dataset.minimized=String(!row.expanded);
   row.panel.hidden=!row.expanded;row.node.dataset.expanded=String(row.expanded);row.node.dataset.compact=String(compact&&!row.expanded);
   row.button.setAttribute('aria-expanded',String(row.expanded));row.button.setAttribute('aria-label',(row.expanded?'收起':'展开')+row.title);row.button.title=row.button.getAttribute('aria-label');
   row.tasselButton.hidden=compact||row.expanded;row.tasselButton.disabled=!row.available;
   const target=row.expanded?row.landing:row.hook;if(row.node.parentNode!==target)target.append(row.node);
   row.node.hidden=!row.available;
  }
  sync();
 }
 function stopPoke(row){row.velocity=0;row.tailVelocity=0;row.angle=0;row.tail=0;row.pokedAt=null;paint(row);delete row.node.dataset.poked;}
 function cancel(){
  ticket++;for(const a of animations)a.cancel();animations=[];
  for(const row of rows.values()){delete row.node.dataset.moving;row.region.style.removeProperty('overflow');row.region.style.removeProperty('pointer-events');}
 }
 function setExpanded(id,value,{animate=false}={}){
  const row=rows.get(id);if(!alive||!row||row.expanded===value)return;
  const before=new Map([...rows.values()].map(r=>[r,r.button.getBoundingClientRect()])),regionHeight=row.region.getBoundingClientRect().height;
  cancel();for(const r of rows.values())stopPoke(r);row.expanded=value;layout();
  if(!animate||paused||reduced.matches||!row.motion||!row.available||!row.node.animate)return;
  const current=ticket,options={duration:480,easing:'cubic-bezier(.22,.72,.22,1)'};
  // FLIP each actual pearl. When one panel opens, the other loses its crescent
  // and tassel and becomes a compact orb at its original rail end.
  for(const r of rows.values()){
   const a=before.get(r),b=r.button.getBoundingClientRect();if(!r.available||!a.width||!b.width||(r!==row&&r.expanded))continue;
   const n=r.node.getBoundingClientRect();r.node.style.transformOrigin=`${b.left+b.width/2-n.left}px ${b.top+b.height/2-n.top}px`;r.node.dataset.moving='true';
   const dx=a.left+a.width/2-b.left-b.width/2,dy=a.top+a.height/2-b.top-b.height/2;
   animations.push(r.node.animate([{transform:`translate(${dx}px,${dy}px) scale(${a.width/b.width})`},{transform:'none'}],options));
  }
  if(value){
   animations.push(row.panel.animate([{clipPath:'inset(0 0 100% 0)',opacity:.25},{clipPath:'inset(0)',opacity:1}],{...options,delay:60,fill:'backwards'}));
  }else if(regionHeight){
   // Keep the existing document alive during the closing roll, then hide it.
   row.region.hidden=false;row.panel.hidden=false;row.region.style.overflow='clip';row.region.style.pointerEvents='none';
   animations.push(row.region.animate([{height:regionHeight+'px',clipPath:'inset(0)',opacity:1},{height:'0px',clipPath:'inset(0 0 100% 0)',opacity:.1}],{...options,fill:'both'}));
  }
  Promise.all(animations.map(a=>a.finished.catch(()=>{}))).then(()=>{if(alive&&ticket===current){cancel();layout();}});
 }
 function poke(row){
  if(!alive||paused||!row.available||row.expanded||row.tasselButton.hidden||reduced.matches||!row.motion)return;
  row.node.dataset.poked='true';row.pokedAt=time;
  row.velocity=Math.max(-75,Math.min(75,row.velocity+row.side*52));
  row.tailVelocity-=row.side*24;sync();
 }
 function register({id,title,region,panel,landing,cover,onToggle}){
  if(rows.has(id))throw Error('TISYA_PENDANT_DUPLICATE');
  const hook=element('div','pendant-hook'),node=element('div','moon-pendant'),sway=element('div','pendant-sway'),moon=element('div','pendant-moon'),button=element('button','pendant-pearl');
  hook.dataset.pendant=id;node.dataset.pendant=id;button.id=id+'-toggle';button.type='button';button.setAttribute('aria-controls',panel.id);
  sway.append(image('pendant-chain.png','pendant-chain'));moon.append(image('pendant-moon.png','pendant-crescent'));
  if(cover){const im=element('img','pendant-cover');im.src=cover;im.alt='';im.draggable=false;button.append(im);}
  else button.append(image('journey.svg','pendant-globe'));
  const tasselButton=element('button','pendant-tassel-touch'),tassel=image('pendant-tassel.png','pendant-tassel');tasselButton.type='button';tasselButton.setAttribute('aria-label','轻摇'+title+'流苏');tasselButton.append(tassel);
  moon.append(button);sway.append(moon,tasselButton);node.append(sway);hook.append(node);rail.append(hook);
  const row={hook,node,sway,moon,button,tassel,tasselButton,region,panel,landing,title,available:true,expanded:false,motion:true,side:id==='journey'?-1:1,angle:0,velocity:0,tail:0,tailVelocity:0,pokedAt:null};rows.set(id,row);layout();
  button.onclick=e=>{if(alive&&row.available){onToggle(!row.expanded,e);if(e.detail===0)button.focus({preventScroll:true});}};
  tasselButton.onclick=e=>{e.stopPropagation();poke(row);};return row;
 }
 function stopMotion(){cancel();for(const row of rows.values())stopPoke(row);layout();}
 const mediaChange=()=>{if(reduced.matches)stopMotion();else sync();};reduced.addEventListener('change',mediaChange);doc.addEventListener('visibilitychange',sync);
 return {register,setExpanded,setAvailable(id,value){const row=rows.get(id);if(!row||row.available===value)return;cancel();row.available=value;layout();},setMotion(id,value){const row=rows.get(id);if(!row)return;row.motion=value;row.node.dataset.motion=String(value);if(!value)stopMotion();else sync();},pause(value){paused=value;dock.classList.toggle('suspended',value);for(const row of rows.values())row.node.classList.toggle('suspended',value);if(value)stopMotion();else sync();},dispose(){alive=false;if(frame)win.cancelAnimationFrame(frame);cancel();doc.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',mediaChange);for(const row of rows.values()){stopPoke(row);row.button.onclick=null;row.tasselButton.onclick=null;row.node.remove();row.hook.remove();}rows.clear();}};
}
module.exports={mountPendantRack};
