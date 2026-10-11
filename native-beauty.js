// The host runs ordered display regex and its card/helper renderers. Keep their
// real nodes, listeners and iframe lifecycle; never clone or re-execute them.
export function preferNativeBeauty({message,native,structured,enabled=true,scripts=[]}){
 if(!enabled||message.is_system||structured)return false;
 if(native.querySelector('iframe,custom-style,style,script'))return true;
 const placement=message.is_user?1:2;
 return scripts.some(r=>r&&!r.disabled&&r.markdownOnly&&Array.isArray(r.placement)&&r.placement.includes(placement));
}

// Structured messages expose only their validated public body to the native
// display regex/Markdown/sanitizer pipeline. No hidden protocol block is rendered.
export function createNativeBodyFormatter({enabled,scripts,regex,format,contextKey=()=>null,onError=()=>{}}){
 const cache=new Map();return (body,message,node)=>{if(!enabled()||message.is_system)return null;const selected=scripts().filter(r=>!r.disabled&&r.markdownOnly&&r.placement?.includes(message.is_user?1:2));if(!selected.length)return null;const key=JSON.stringify([body,message.name,message.is_user,node.getAttribute('mesid'),contextKey(message,node),selected]);if(cache.has(key))return cache.get(key);let html=null;try{const prepared=regex(body,message,node);html=prepared===body?null:format(prepared,body,message,node);}catch(e){onError(e);return null;}cache.set(key,html);if(cache.size>50)cache.delete(cache.keys().next().value);return html;};
}
