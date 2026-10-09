// Vendored r243 files remain byte-preserved. These narrow host adaptations are
// applied only to the generated browser bundle and fail if source anchors drift.
export function adaptVisualSource(id,source){
 if(id==='src/water-motion.cjs'){
  const from="listen(win,'focus',()=>{blurred=false;sync();});";
  const to=from+"listen(doc,'focusin',()=>{if(blurred&&doc.hasFocus()){blurred=false;sync();}});";
  if(source.split(from).length!==2)throw Error('Visual adaptation anchor changed: '+id);
  return source.replace(from,to);
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
