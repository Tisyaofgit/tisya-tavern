// Vendored r243 files remain byte-preserved. These narrow host adaptations are
// applied only to the generated browser bundle and fail if source anchors drift.
export function adaptVisualSource(id,source){
 if(id==='src/pendant-rack.cjs'){
  const patches=[
   ['function register({id,title,region,panel,landing,cover,onToggle})','function register({id,title,region,panel,landing,cover,emptyCover=false,onToggle})'],
   ["else button.append(image('journey.svg','pendant-globe'));","else if(!emptyCover)button.append(image('journey.svg','pendant-globe'));"]
  ];
  for(const [from,to]of patches){if(source.split(from).length!==2)throw Error('Visual adaptation anchor changed: '+id);source=source.replace(from,to);}return source;
 }

 if(id==='src/water-motion.cjs'){
  const focus="listen(win,'focus',()=>{blurred=false;sync();});";
  const patches=[
   [focus,focus+"listen(doc,'focusin',()=>{if(blurred&&doc.hasFocus()){blurred=false;sync();}});"],
   ['let alive=true,ready=false,request=0,last=null,time=0,mode=\'auto\',manualPause=false,blurred=false,width=0,height=0,dpr=1,paints=0,scene=\'fireflies\',effects={...CHAT_DEFAULTS};','let alive=true,ready=false,request=0,last=null,time=0,mode=\'auto\',manualPause=false,blurred=false,width=0,height=0,dpr=1,paints=0,drawing=false,scene=\'fireflies\',effects={...CHAT_DEFAULTS};'],
   ['if(!ctx)return;ctx.clearRect(0,0,width,height);const active=enabled(canvas)?selectedEffects(effects,time):[];canvas.dataset.effects=active.join(\' \');if(!enabled(canvas))return;','if(!ctx)return false;ctx.clearRect(0,0,width,height);const active=enabled(canvas)?selectedEffects(effects,time):[];canvas.dataset.effects=active.join(\' \');if(!enabled(canvas))return false;'],
   ['ctx.restore();root.dataset.weather=scene;','ctx.restore();root.dataset.weather=scene;return true;'],
   ['const m=manifest.flame;if(!flame||!sheets.flame)return;','const m=manifest.flame;if(!flame||!sheets.flame)return false;const bounds=lampCanvas.getBoundingClientRect();if(bounds.width<=0||bounds.height<=0)return false;'],
   ['lampCanvas.dataset.tick=String(Math.round(q*1000));','lampCanvas.dataset.tick=String(Math.round(q*1000));return true;'],
   ['function draw(){environment();drawFlame(time);for(const a of actors){const r=a.node.getBoundingClientRect();if(r.bottom>=0&&r.top<=height)pose(a,time);}paints++;}','function draw(){let active=environment();active=drawFlame(time)||active;for(const a of actors){const r=a.node.getBoundingClientRect();if(r.bottom>=0&&r.top<=height&&r.width>0&&r.height>0){pose(a,time);active=true;}}paints++;return active;}'],
   ['function tick(now){request=0;if(!allowed()){last=null;return;}if(last!==null)time+=Math.min(.05,(now-last)/1000);last=now;draw();request=win.requestAnimationFrame(tick);}','function tick(now){request=0;if(!allowed()){last=null;drawing=false;return;}if(last!==null)time+=Math.min(.05,(now-last)/1000);last=now;drawing=draw();if(drawing)request=win.requestAnimationFrame(tick);else last=null;}']
  ];
  for(const [from,to]of patches){if(source.split(from).length!==2)throw Error('Visual adaptation anchor changed: '+id);source=source.replace(from,to);}return source;
 }
 if(id!=='src/character-reaction.cjs')return source;
 const patches=[
  ["if(pageHidden||!a?.visible||a.moving||doc.visibilityState==='hidden'||doc.hidden===true||!focused)return false;",
   "if(pageHidden||!a?.visible||a.moving||doc.visibilityState==='hidden'||doc.hidden===true)return false;\n    if(typeof doc.hasFocus==='function')focused=doc.hasFocus();\n    if(!focused)return false;"],
  ["on(win,'blur',()=>{focused=false;refresh();});on(win,'focus',()=>{focused=true;refresh();});",
   "on(win,'blur',()=>{focused=false;refresh();});on(win,'focus',()=>{focused=true;refresh();});\n  on(doc,'focusin',()=>refresh());"]
 ];
 for(const [from,to]of patches){if(source.split(from).length!==2)throw Error('Visual adaptation anchor changed: '+id);source=source.replace(from,to);}
 return source;
}
