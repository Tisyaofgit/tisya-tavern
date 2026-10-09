'use strict';
const {resourceError}=(()=>({resourceError:(code)=>Object.assign(new Error(code),{code})}))();
// A document owns decoded fonts. Page destruction ends this cache naturally;
// fragment refresh reuses it. Persistent bytes remain in tavo.file.
// Cache completed native faces, never Promises owned by a disposable iframe.
function createResourceRuntime({document,store,identity,manifest,isAlive}){
  const key=Symbol.for('dev.tisya.resources.fonts.v1');
  let cache=document[key];
  if(cache&&cache.identity!==identity)throw resourceError('TISYA_RESOURCE_CACHE_VERSION');
  if(!cache){cache={identity,fonts:new Map()};Object.defineProperty(document,key,{value:cache,configurable:true});}
  let imageTail=Promise.resolve(),fontTail=Promise.resolve(),disposed=false,decoding=0,maxDecoding=0;const fontJobs=new Map();
  const check=()=>{if(disposed||!isAlive())throw resourceError('TISYA_RESOURCE_DISPOSED');};
  function font(role){
    check();if(!['reading','wenkai'].includes(role))throw resourceError('TISYA_FONT_ROLE_UNKNOWN');const old=cache.fonts.get(role);if(old)return Promise.resolve(old);if(fontJobs.has(role))return fontJobs.get(role);
    const job=fontTail.then(async()=>{
      check();let bytes=await store.bytes('font:'+role);check();
      const family=role==='reading'?'Noto Serif CJK SC':'LXGW WenKai';
      const face=new document.defaultView.FontFace(family,bytes,{weight:'400',style:'normal',display:'swap'});bytes=null;
      await face.load();check();if(face.status!=='loaded')throw resourceError('TISYA_FONT_DECODE_FAILED');
      const shared=cache.fonts.get(role);if(shared)return shared;document.fonts.add(face);cache.fonts.set(role,face);return face;
    });
    fontJobs.set(role,job);fontTail=job.catch(()=>{});
    job.then(()=>fontJobs.delete(role),()=>fontJobs.delete(role));return job;
  }
  function assign(name,node,url,needed=()=>true){
    const job=imageTail.then(()=>new Promise((resolve,reject)=>{
      try{check();if(!needed())throw resourceError('TISYA_RESOURCE_VIEW_DISPOSED');}catch(e){reject(e);return;}
      const row=manifest[name];if(!row){reject(resourceError('TISYA_IMAGE_UNKNOWN'));return;}
      decoding++;maxDecoding=Math.max(maxDecoding,decoding);
      let timer;
      const end=(error)=>{clearTimeout(timer);node.removeEventListener('load',loaded);node.removeEventListener('error',failed);decoding--;
        if(error)reject(error);else{node._tisyaPending=false;resolve();}};
      const loaded=()=>{try{check();if(node.naturalWidth!==row.width||node.naturalHeight!==row.height)throw resourceError('PHONE_IMAGE_SIZE_MISMATCH');end();}catch(e){end(e);}};
      const failed=()=>end(resourceError('PHONE_IMAGE_LOAD_FAILED'));
      node.addEventListener('load',loaded);node.addEventListener('error',failed);
      timer=setTimeout(()=>end(resourceError('PHONE_IMAGE_LOAD_TIMEOUT')),30000);node.src=url;
    }));
    imageTail=job.catch(()=>{});return job;
  }
  return {font,assign,dispose:()=>{disposed=true;},report:()=>({fontFamilies:[...cache.fonts.keys()],imageConcurrency:decoding,maxImageConcurrency:maxDecoding})};
}
// A decoded FontFace may join several same-origin document FontFaceSets.
// Share verified faces, never reread the multi-megabyte files per content frame.
async function attachResourceFonts({document,runtime,roles,isAlive=()=>true}){
 const attached=[];
 try{
  for(const role of roles){const face=await runtime.font(role);if(!isAlive())throw resourceError('TISYA_RESOURCE_DISPOSED');if(face.status!=='loaded')throw resourceError('TISYA_FONT_DECODE_FAILED');document.fonts.add(face);attached.push(face);}
  return {dispose(){for(const face of attached)document.fonts.delete(face);attached.length=0;}};
 }catch(e){for(const face of attached)document.fonts.delete(face);throw e;}
}
// Only completed native images are shared across short-lived content frames.
// A decode promise belongs to its initiating frame and must never block a new one.
async function decodedResourceImage({document,url,name=url,width,height,isAlive=()=>true}){
 const key=Symbol.for('dev.tisya.decoded.images.v2');let state=document[key];
 if(!state){state={rows:new Map(),bytes:0,hits:0,misses:0};Object.defineProperty(document,key,{value:state,configurable:true});}
 if(!url)throw resourceError('TISYA_IMAGE_UNKNOWN');
 const id=JSON.stringify([url,width??null,height??null]),old=state.rows.get(id);
 const check=()=>{if(!isAlive())throw resourceError('TISYA_RESOURCE_DISPOSED');};check();
 if(old){state.rows.delete(id);state.rows.set(id,old);state.hits++;return old.image;}
 state.misses++;const image=new document.defaultView.Image();image.src=url;await image.decode();check();
 if(!image.naturalWidth||!image.naturalHeight||(width!==undefined&&image.naturalWidth!==width)||(height!==undefined&&image.naturalHeight!==height))throw resourceError('TISYA_IMAGE_DIMENSIONS:'+name);
 // Another frame may have finished first. Reuse its completed native object.
 const shared=state.rows.get(id);if(shared)return shared.image;
 const bytes=image.naturalWidth*image.naturalHeight*4,limit=96*1024*1024;
 while(state.rows.size&&(state.rows.size>=64||state.bytes+bytes>limit)){const first=state.rows.keys().next().value;state.bytes-=state.rows.get(first).bytes;state.rows.delete(first);}
 if(bytes<=limit){state.rows.set(id,{image,bytes});state.bytes+=bytes;}return image;
}
async function warmDisplayImages({document,identity,assets,manifest,names,isAlive=()=>true}){
 let cursor=0;
 async function worker(){while(cursor<names.length){const name=names[cursor++],row=manifest[name];if(!row)throw resourceError('TISYA_IMAGE_UNKNOWN');await decodedResourceImage({document,url:assets[name],name:identity+':'+name,width:row.width,height:row.height,isAlive});}}
 await Promise.all([worker(),worker()]);return decodedResourceReport(document);
}
function decodedResourceReport(document){const s=document[Symbol.for('dev.tisya.decoded.images.v2')];return s?{cached:s.rows.size,bytes:s.bytes,hits:s.hits,misses:s.misses}:{cached:0,bytes:0,hits:0,misses:0};}
// Clone an inert static shell, never a live view containing another reply's data.
function mountPresentationTemplate({document,root,layout,css}){
 const key=Symbol.for('dev.tisya.presentation.templates.v1');let cache=document[key];if(!cache){cache=new Map();Object.defineProperty(document,key,{value:cache,configurable:true});}
 const id=JSON.stringify([layout,css]);let value=cache.get(id);
 if(!value){const template=document.createElement('template');template.innerHTML=layout;let sheet=null;
  if('adoptedStyleSheets' in root){sheet=new document.defaultView.CSSStyleSheet();sheet.replaceSync(css);}
  value={template,sheet};if(cache.size>=3)cache.delete(cache.keys().next().value);cache.set(id,value);
 }
 if(value.sheet)root.adoptedStyleSheets=[...root.adoptedStyleSheets,value.sheet];else{const style=document.createElement('style');style.textContent=css;root.append(style);}
 const shell=document.createElement('div');shell.append(value.template.content.cloneNode(true));root.append(shell);return shell;
}
module.exports={createResourceRuntime,attachResourceFonts,warmDisplayImages,decodedResourceImage,decodedResourceReport,mountPresentationTemplate};
