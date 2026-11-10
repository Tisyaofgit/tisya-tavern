const need=(ok,message)=>{if(!ok)throw Error(message);};
export function normalizePhotoEdit(value={}){
 const kind=value.kind??'crop';need(['crop','redact','annotate'].includes(kind),'请选择裁剪、打码或标注。');
 const number=(key,otherwise)=>{const n=Number(value[key]??otherwise);need(Number.isFinite(n), '编辑区域必须是有效数字。');return n;};
 const x=number('x',0),y=number('y',0),width=number('width',100),height=number('height',100);
 need(x>=0&&y>=0&&width>0&&height>0&&x+width<=100&&y+height<=100,'区域须位于图片内，且宽高不能为零。');
 const color=['#ffffff','#111111','#e16b63','#e9c66b','#6ca7bf'].includes(value.color)?value.color:'#ffffff';
 const text=String(value.text??'').trim();if(kind==='annotate')need(text.length>0&&text.length<=200,'标注请填写1—200字。');
 return {kind,x,y,width,height,color,...(kind==='annotate'?{text}:{})};
}
export function photoEditPixels(edit,width,height){
 const e=normalizePhotoEdit(edit);need(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0,'图片尺寸不可用。');
 const x=Math.min(width-1,Math.floor(width*e.x/100)),y=Math.min(height-1,Math.floor(height*e.y/100));
 return {...e,x,y,width:Math.max(1,Math.min(width-x,Math.round(width*e.width/100))),height:Math.max(1,Math.min(height-y,Math.round(height*e.height/100)))};
}
export async function createPhotoDerivative(blob,edit,{win=globalThis.window,doc=globalThis.document}={}){
 need(blob&&blob.type?.startsWith('image/'),'只有已导入的图片可以编辑；请先补齐原件。');
 const e=normalizePhotoEdit(edit);let image,url,bitmap=false;
 try{
  if(typeof win.createImageBitmap==='function'){image=await win.createImageBitmap(blob);bitmap=true;}
  else {url=win.URL.createObjectURL(blob);image=await new Promise((resolve,reject)=>{const img=new win.Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('图片无法解码，原件已保留。'));img.src=url;});}
  const w=image.naturalWidth??image.width,h=image.naturalHeight??image.height;need(w*h<=48000000,'图片过大，请导入较小的版本再编辑。');
  const rect=photoEditPixels(e,w,h),canvas=doc.createElement('canvas');canvas.width=e.kind==='crop'?rect.width:w;canvas.height=e.kind==='crop'?rect.height:h;
  const context=canvas.getContext('2d');need(context,'当前浏览器不支持图片编辑。');
  if(e.kind==='crop')context.drawImage(image,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
  else {context.drawImage(image,0,0,w,h);if(e.kind==='redact'){context.fillStyle='#111111';context.fillRect(rect.x,rect.y,rect.width,rect.height);}else{context.fillStyle=e.color;context.strokeStyle='#000000b3';context.lineWidth=Math.max(2,w/500);context.font=`${Math.max(16,Math.round(w/22))}px sans-serif`;context.textBaseline='top';const lines=e.text.split('\n').slice(0,8);for(let i=0;i<lines.length;i++){const y=rect.y+i*Math.max(20,w/18);context.strokeText(lines[i],rect.x,y,rect.width);context.fillText(lines[i],rect.x,y,rect.width);}}}
  const result=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('编辑结果编码失败，原件已保留。')),'image/png'));
  return {blob:result,edit:e,width:canvas.width,height:canvas.height};
 }finally{if(bitmap)image?.close?.();if(url)win.URL.revokeObjectURL(url);}
}
export function renderPhotoEditor(photo,url,h){const e=h.esc;return `<h2>编辑副本</h2><p class="muted">裁剪、打码或标注会另存一张图片；原图和已有分享保持原样。</p><div class="photo-edit-preview"><img src="${e(url)}" alt="${e(photo.name)}"><div data-edit-region></div><span data-edit-caption></span></div><form data-action="media.edit.apply"><input type="hidden" name="photoId" value="${e(photo.id)}"><label class="field">编辑方式<select name="kind"><option value="crop">裁剪区域</option><option value="redact">区域打码</option><option value="annotate">文字标注</option></select></label><div class="form-grid">${[['x','左边距',0],['y','上边距',0],['width','区域宽度',100],['height','区域高度',100]].map(([name,label,value])=>`<label class="field">${label}（%）<input type="number" name="${name}" min="${name==='width'||name==='height'?1:0}" max="100" value="${value}" required></label>`).join('')}</div><label class="field">标注文字<textarea name="text" maxlength="200" placeholder="仅文字标注时填写"></textarea></label><label class="field">文字颜色<select name="color">${[['#ffffff','白色'],['#111111','黑色'],['#e16b63','朱红'],['#e9c66b','浅金'],['#6ca7bf','蓝灰']].map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><p class="photo-edit-warning" role="status"></p><button type="submit" class="primary">另存编辑副本</button></form>`;}
export function refreshPhotoEditPreview(root){
 const form=root.querySelector('form[data-action="media.edit.apply"]');if(!form)return;
 const values=Object.fromEntries([...form.elements].filter(e=>e.name).map(e=>[e.name,e.value]));
 const warning=root.querySelector('.photo-edit-warning'),region=root.querySelector('[data-edit-region]'),caption=root.querySelector('[data-edit-caption]');
 try{const e=normalizePhotoEdit({...values,...(values.kind==='annotate'&&!values.text?{text:'标注预览'}:{})});region.style.cssText=`left:${e.x}%;top:${e.y}%;width:${e.width}%;height:${e.height}%;`;region.dataset.kind=e.kind;caption.textContent=e.kind==='annotate'?e.text:'';caption.style.cssText=`left:${e.x}%;top:${e.y}%;color:${e.color};`;warning.textContent='';form.querySelector('[type="submit"]').disabled=false;}
 catch(error){warning.textContent=error.message;form.querySelector('[type="submit"]').disabled=true;}
}
