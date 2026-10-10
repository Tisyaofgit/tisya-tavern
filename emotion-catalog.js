// Byte-preserved approved r243 built-in emotions; one catalog for preview, hearts and prompt names.
export const EMOTIONS=Object.freeze([{"id":"tisya-emote-f9d3cc439c47ec2ffdf68fd6","name":"困倦","path":"assets/emotions/1.png","sha256":"f9d3cc439c47ec2ffdf68fd66fd1760b35bccdfae85f517baa51e679a2232efd","size":[333,312],"bytes":113674},{"id":"tisya-emote-117928046fe38ee876727e6a","name":"好奇","path":"assets/emotions/2.png","sha256":"117928046fe38ee876727e6a8cea54b94038958e6f78a0d0a18f55137f0206f8","size":[355,300],"bytes":117680},{"id":"tisya-emote-4e7fd96eadf5d0826fd39631","name":"开心","path":"assets/emotions/3.png","sha256":"4e7fd96eadf5d0826fd3963162e2d260ac825b87edf4ad6bc5b3c7826b22407e","size":[362,290],"bytes":119795},{"id":"tisya-emote-5358d8432a8d56afad195fb3","name":"怀疑","path":"assets/emotions/4.png","sha256":"5358d8432a8d56afad195fb3aaf347e727e83bb36de8925ddc3fa043a55313e1","size":[344,266],"bytes":109411},{"id":"tisya-emote-c5f336731185c1f45a5cd2e9","name":"惊讶","path":"assets/emotions/5.png","sha256":"c5f336731185c1f45a5cd2e9388073a92990d88a24c78ce3777f2623331b5ac8","size":[343,307],"bytes":115442},{"id":"tisya-emote-e3977a0c106df20d9c772370","name":"闹别扭","path":"assets/emotions/6.png","sha256":"e3977a0c106df20d9c772370207bcdec830cca2c998b47881a783643a7d448b4","size":[360,317],"bytes":120095}].map(row=>Object.freeze({...row,url:new URL('./'+row.path,import.meta.url).href})));
const services=new WeakMap();
export function emotionCatalog(document){
 if(services.has(document))return services.get(document);
 let state='loading',failure=null;const loaded=new Map();
 const ready=Promise.all(EMOTIONS.map(async row=>{
  const img=new document.defaultView.Image();img.src=row.url;
  await img.decode();
  if(img.naturalWidth!==row.size[0]||img.naturalHeight!==row.size[1])throw Error('表情图片尺寸不符：'+row.name);
  loaded.set(row.name,row);
 })).then(()=>{state='ready';}).catch(error=>{state='failed';failure=error;throw error;});ready.catch(()=>{});
 const service={ready,names(){if(state!=='ready')throw Error(state==='loading'?'表情图鉴仍在加载，请稍候':'表情图鉴加载失败，请更新扩展后重启');return EMOTIONS.map(r=>r.name);},async resolve(name){if(name===null)return null;await ready;const row=loaded.get(name);if(!row)throw Error('表情未收录：'+String(name));return row;},report:()=>({state,error:failure?.message??null})};services.set(document,service);return service;
}
export function mountEmotionAtlas(document,container){
 const catalog=emotionCatalog(document),title=document.createElement('p'),grid=document.createElement('div');let alive=true;
 title.textContent='内置表情 · 心声会按回复中的表情名使用对应原图。';grid.className='tisya-emotion-grid';container.replaceChildren(title,grid);
 for(const row of EMOTIONS){const card=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=row.url;img.alt=row.name;img.width=120;img.height=112;caption.textContent=row.name;card.append(img,caption);grid.append(card);}
 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='正在核对表情资源…';container.append(status);
 catalog.ready.then(()=>{if(alive)status.textContent='六张表情已就绪。';},()=>{if(alive){status.textContent='表情资源加载失败，请更新扩展后重启。';status.setAttribute('role','alert');}});
 const note=document.createElement('p');note.className='tisya-note';note.textContent='自建档案、资源编辑与角色绑定仍在移植中。';container.append(note);
 return {dispose(){alive=false;container.replaceChildren();}};
}
