'use strict';
const {DISPLAY_FIELDS}=require('./display-registry.cjs');
const {EFFECTS,selectedEffects}=require('./chat-effects-options.cjs');
// Appearance editor consumes the existing display/profile services. No Codex
// records, new preference keys, auto-saves or replacement configuration store.
function mountAppearance({container,controller,initialOwner='extensions',waterURL,onApplied=()=>{},onError=()=>{},onStateChange=()=>{},fixedOwner=false}){
 const doc=container.ownerDocument,root=doc.createElement('section');root.className='tisya-appearance';container.append(root);
 let alive=true,busy=false,dirty=false,owner=initialOwner,defs=[],config=null,general=null,profiles={rows:[],revision:null},profileId='',name='',deleteArmed=null;
 const el=(tag,text,cls='')=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;n.className=cls;return n;};
 const status=el('p','正在读取外观配置…','appearance-status');status.setAttribute('role','status');
 const body=el('div',undefined,'appearance-body'),footer=el('footer');root.append(body,status,footer);
 function hint(text){if(alive)status.textContent=text;}
 function controls(){onStateChange();root.dataset.dirty=String(dirty);for(const n of root.querySelectorAll('button,input,select'))n.disabled=busy;const b=root.querySelector('[data-apply]');if(b)b.disabled=busy||!dirty;}
 function button(text,fn,parent=body){const n=el('button',text,'tui-feedback-surface');n.type='button';n.onclick=fn;parent.append(n);return n;}
 async function run(fn){if(!alive||busy)return;busy=true;controls();try{await fn();}catch(e){if(alive){hint('未完成：'+(e.code||e.message)+'；草稿保留。');onError(e);}}finally{busy=false;if(alive)controls();}}
 async function load(){general=await controller.call('display.inspect',{owner:'general'});const c=await controller.call('display.inspect',{owner}),p=await controller.call('profiles.list');if(!alive)return;config=c;profiles=p;dirty=false;draw();}
 function preview(target,value){const p=el('div',undefined,'appearance-preview');p.style.backgroundImage=`linear-gradient(#052b2470,#021d1bb0),url("${waterURL}")`;p.dataset.decoration=value.装饰程度;p.dataset.motion=String(value.动画效果);const h=el('strong','雾港 · 灯火未眠'),line=el('p','潮声穿过长街。');if(value.正文行距)line.style.lineHeight=String(value.正文行距);if(value.首行缩进!==undefined)line.style.textIndent=value.首行缩进+'em';p.append(h,line,el('span','本轮任务　 01','appearance-pill'));target.append(p);return p;}
 function draw(){if(!alive||!config)return;body.replaceChildren();footer.replaceChildren();
  body.append(el('p','雾港水域 · 分项应用','appearance-caption'));
  const tabs=el('nav',undefined,'appearance-tabs');tabs.setAttribute('aria-label','外观配置位置');tabs.hidden=fixedOwner;body.append(tabs);
  const options=[{id:'extensions',name:'旅程、扩展与背景'},...defs.filter(d=>d.id!=='extensions'),{id:'general',name:'通用设置'}];
  for(const d of options){const b=button(d.name,()=>{if(dirty){hint('先应用或放弃当前草稿，再切换位置。');return;}run(async()=>{owner=d.id;profileId='';await load();});},tabs);b.setAttribute('aria-pressed',String(owner===d.id));}
  const effective=owner==='general'?{...config.value}:{...general.effective.values,...defs.find(d=>d.id===owner).defaults,...config.value};preview(body,effective);
  body.append(el('p',owner==='extensions'?'旅程球与世界扩展可分别选择默认收起或展开。背景特效可以单独开启或组合，点触涟漪独立选择。':'只应用当前分项；其他区块、图鉴和已有排版保持各自配置。','appearance-note'));
  const grid=el('div',undefined,'appearance-options');body.append(grid);
  const effectKeys=['背景特效模式',...Object.keys(EFFECTS)];
  if(owner==='extensions'){
   const group=el('fieldset',undefined,'appearance-effects');group.append(el('legend','背景特效'));grid.append(group);
   const change=fn=>{fn();dirty=true;draw();hint('已选入草稿；应用后更新聊天特效。');};
   for(const value of ['自动轮换','自选组合','关闭']){const b=button(value,()=>change(()=>{config.value.背景特效模式=value;}),group);b.setAttribute('aria-pressed',String(effective.背景特效模式===value));}
   for(const key of Object.keys(EFFECTS)){
    const row=el('div',undefined,'appearance-effect-row');group.append(row);
    const b=button(key,()=>change(()=>{config.value[key]=effective.背景特效模式==='自选组合'?!effective[key]:true;config.value.背景特效模式='自选组合';}),row);b.setAttribute('aria-pressed',String(effective.背景特效模式==='自选组合'&&effective[key]));
    const solo=button('仅此',()=>change(()=>{for(const k of Object.keys(EFFECTS))config.value[k]=k===key;config.value.背景特效模式='自选组合';}),row);solo.setAttribute('aria-label','仅开启'+key);
   }
   button('恢复特效继承',()=>change(()=>{for(const key of effectKeys)delete config.value[key];}),group);
   const names=Object.entries(EFFECTS).filter(([,id])=>selectedEffects(effective,0).includes(id)).map(([key])=>key);
   group.append(el('small',effective.背景特效模式==='自动轮换'?'自动轮换雨、雪、萤火；水纹与涟漪常开。':'选中：'+(names.join('、')||'无背景动画')));
   if(!effective.动画效果)group.append(el('small','动画效果当前关闭；所选特效会保留，开启后播放。'));
  }
  const fields=owner==='general'?DISPLAY_FIELDS:{...DISPLAY_FIELDS,...defs.find(d=>d.id===owner).fields};
  for(const [key,rule]of Object.entries(fields)){
   if(owner==='extensions'&&effectKeys.includes(key))continue;
   const group=el('fieldset');group.append(el('legend',key));grid.append(group);
   const set=v=>{if(v===undefined)delete config.value[key];else config.value[key]=v;dirty=true;draw();hint('预览草稿；点击“应用到当前分项”保存。');};
   if(owner!=='general'){const b=button('继承',()=>set(undefined),group);b.setAttribute('aria-pressed',String(!Object.hasOwn(config.value,key)));}
   if(Array.isArray(rule))for(const v of rule){const b=button(typeof v==='boolean'?(v?'开启':'关闭'):String(v),()=>set(v),group);b.setAttribute('aria-pressed',String(Object.hasOwn(config.value,key)&&config.value[key]===v));}
   else{const n=el('input');n.type='number';n.min=rule.min;n.max=rule.max;n.value=config.value[key]??'';n.placeholder=String(config.effective.values[key]);n.setAttribute('aria-label',key);n.oninput=()=>{if(n.value==='')delete config.value[key];else config.value[key]=Number(n.value);dirty=true;controls();};group.append(n);}
   group.append(el('small','预览：'+(typeof effective[key]==='boolean'?(effective[key]?'开启':'关闭'):effective[key])+(Object.hasOwn(config.value,key)?' · 自定义':' · 继承')));
   if(['旅程球默认状态','世界扩展默认状态'].includes(key))group.append(el('small','用于新显示的区块；本条手动开合后，保留你的选择。'));
  }
  const saved=el('section',undefined,'appearance-profiles');saved.append(el('h3','已保存方案'));body.append(saved);
  const rows=profiles.rows.filter(p=>p.owner===owner);
  for(const p of rows){const tile=button(p.name,()=>run(async()=>{const value=await controller.call('profiles.load',{id:p.id,owner});if(!alive)return;profileId=p.id;name=p.name;config.value=value;dirty=true;draw();hint('方案已选入草稿；应用后才改变聊天。');}),saved);tile.classList.add('appearance-profile');tile.setAttribute('aria-pressed',String(profileId===p.id));}
  if(!rows.length)saved.append(el('p','此分项还没有保存方案。','appearance-note'));
  const input=el('input');input.placeholder='为这份方案命名';input.setAttribute('aria-label','方案名称');input.value=name;input.oninput=()=>{name=input.value;};saved.append(input);
  async function change(op){profiles=await controller.call('profiles.'+op,{id:profileId,owner,name:name.trim(),value:config.value,expected:profiles.revision,confirm:rows.find(p=>p.id===profileId)?.name});if(alive){draw();hint('方案已保存；未自动改动当前聊天。');}}
  button('另存方案',()=>run(()=>change('save')),saved);
  if(profileId){button('更新方案',()=>run(()=>change('update')),saved);button('改名',()=>run(()=>change('rename')),saved);button('删除方案',()=>{if(deleteArmed!==profileId){deleteArmed=profileId;hint('再点一次删除所选方案；已应用配置保留。');return;}run(()=>change('delete'));},saved);}
  const apply=button(owner==='general'?'保存通用设置':'应用到当前分项',()=>run(async()=>{const c=await controller.call('display.save',{owner,value:config.value,expected:config.revision});if(!alive)return;config=c;dirty=false;draw();await onApplied();hint('已保存并应用；其他分项未覆盖。');}),footer);apply.dataset.apply='';
  button('放弃草稿',()=>run(async()=>{await load();hint('已恢复保存值。');}),footer);controls();
 }
 const ready=run(async()=>{defs=await controller.call('components');await load();hint('主题 · 分项选择、预览与保存');});
 return {root,ready,requestLeave:()=>({allowed:!busy&&!dirty,reason:busy?'saving':dirty?'unsaved':null}),dispose(){alive=false;root.remove();}};
}
module.exports={mountAppearance};
