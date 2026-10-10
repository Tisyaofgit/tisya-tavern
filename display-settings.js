import {CHAT_DEFAULTS,CHAT_FIELDS,JOURNEY_DEFAULTS,JOURNEY_FIELDS} from './visual-core.js';

// Global display preferences belong to the existing native extension settings.
// Only explicit overrides are stored. Original registered defaults stay read-only.
export const DISPLAY_DEFAULTS=Object.freeze({...CHAT_DEFAULTS,...JOURNEY_DEFAULTS});
export const DISPLAY_FIELDS=Object.freeze({...CHAT_FIELDS,...Object.fromEntries(Object.entries(JOURNEY_FIELDS).filter(([k])=>k!=='显示角色心理'))});
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function displayOverrides(settings){
 const blocks=settings.显示区块;if(blocks===undefined)return {};
 if(!plain(blocks))throw Error('显示区块配置损坏');
 const values=blocks.extensions;if(values===undefined)return {};
 if(!plain(values)||Object.entries(values).some(([k,v])=>!DISPLAY_FIELDS[k]?.includes(v)))throw Error('聊天显示配置损坏；未使用默认值覆盖');
 return {...values};
}
export function displayValues(settings){return {...DISPLAY_DEFAULTS,...displayOverrides(settings)};}
export function withDisplayOverrides(settings,custom){
 displayOverrides({显示区块:{extensions:custom}});
 return {...settings,显示区块:{...(settings.显示区块??{}),extensions:{...custom}}};
}
export function mountDisplaySettings(document,container,{getSettings,save,onApplied=()=>{}}){
 let alive=true,busy=false,base=JSON.stringify(displayOverrides(getSettings()));
 const make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const form=make('form'),fields=new Map(),status=make('p');status.setAttribute('role','status');form.className='tisya-display-settings';
 const initial=JSON.parse(base);
 for(const [key,values]of Object.entries(DISPLAY_FIELDS)){
  const label=make('label',key),select=make('select');select.setAttribute('aria-label',key);
  const text=v=>typeof v==='boolean'?(v?'开启':'关闭'):v;
  const option=(label,value)=>{const n=make('option',label);n.value=value;return n;};
  select.append(option('继承 · '+text(DISPLAY_DEFAULTS[key]),''));
  values.forEach((v,i)=>select.append(option(text(v),String(i))));
  select.value=Object.hasOwn(initial,key)?String(values.indexOf(initial[key])):'';label.append(select);form.append(label);fields.set(key,select);
 }
 const apply=make('button','应用'),reset=make('button','全部改为继承');apply.type='submit';reset.type='button';
 reset.onclick=()=>{if(alive&&!busy)for(const select of fields.values())select.value='';};
 form.append(status,apply,reset);container.replaceChildren(form);
 form.onsubmit=async e=>{
  e.preventDefault();if(!alive||busy)return;busy=true;apply.disabled=true;reset.disabled=true;
  let draft;
  try{
   if(JSON.stringify(displayOverrides(getSettings()))!==base)throw Error('显示配置已在其他位置修改，请重新打开此页后再应用。');
   draft=Object.fromEntries([...fields].filter(([,s])=>s.value!=='').map(([k,s])=>[k,DISPLAY_FIELDS[k][Number(s.value)]]));
   await save(draft);if(!alive)return;base=JSON.stringify(displayOverrides(getSettings()));onApplied();status.textContent='已应用并保存。';
  }catch(error){if(alive){try{if(draft&&JSON.stringify(displayOverrides(getSettings()))===JSON.stringify(draft))base=JSON.stringify(draft);}catch(readError){error=new Error(error.message+'；'+readError.message);}status.textContent=error.message;status.setAttribute('role','alert');}}
  finally{if(alive){busy=false;apply.disabled=false;reset.disabled=false;}}
 };
 return {dispose(){alive=false;form.onsubmit=null;reset.onclick=null;container.replaceChildren();}};
}
