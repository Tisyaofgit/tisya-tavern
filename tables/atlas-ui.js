import {isObjectType} from './schema.js';
import {createAtlas} from './atlas.js';
// Shared atlas renderer: standalone demo or an explicitly authorized host snapshot.
export function mountArchiveAtlas(root,data,{download=()=>{},beforeRead=()=>{},onFault=null,onIdentity=null}={}){
 const doc=root.ownerDocument;let page='atlas',layer='session',category=null,query='',selected=null,tab='core',audience=data.live?'author':'reader',theme='light',path=[],trail=[];
 const win=doc.defaultView;let pending=Promise.resolve();
 const failure=error=>{if(onFault)onFault(error);else notify(error.message);};
 const act=fn=>{pending=Promise.resolve().then(beforeRead).then(fn).catch(failure);return pending;};
 const icons={atlas:'◈',saves:'⌁',cores:'◇',overview:'⊞',changes:'⌁'};
 const labels={atlas:'图鉴',saves:'存档',cores:'基点',overview:'总览',changes:'变更'};
 function el(tag,text,cls){const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
 function button(text,fn,cls=''){const b=el('button',text,cls);b.type='button';b.addEventListener('click',()=>{if(data.live)act(fn);else try{fn();}catch(error){failure(error);}});return b;}
 const field=(name,value)=>{const g=el('div',undefined,'field');g.append(el('dt',name),el('dd',renderValue(value)));return g;};
 function pathLabel(valuePath){const key=valuePath.at(-1);return typeof key==='number'?'第 '+(key+1)+' 项':String(key);}
 function currentFrame(){return {page,layer,category,query,selected,tab,audience,path:[...path],scroll:win.scrollY,focus:doc.activeElement?.dataset?.navKey??null};}
 function resetTrail(){selected=null;path=[];trail=[];}
 function restore(frame){({page,layer,category,query,selected,tab,audience,path}=frame);render();win.scrollTo(0,frame.scroll??0);if(frame.focus){const focus=[...root.querySelectorAll('[data-nav-key]')].find(e=>e.dataset.navKey===frame.focus);focus?.focus({preventScroll:true});}}
 function visit(id,nextPath=[]){atlas().detail(id);trail.push(currentFrame());selected=id;path=[...nextPath];tab=nextPath.length||atlas().detail(id).record.table!=='objects'?'dossier':'core';page='atlas';render();win.scrollTo(0,0);}
 function back(){if(trail.length)restore(trail.pop());else{resetTrail();render();win.scrollTo(0,0);}}
 function jump(index){const frame=trail[index];trail=trail.slice(0,index);restore(frame);}
 function recordLink(target,cls='reference-link'){const b=button(target.name+' ↗',()=>visit(target.id),cls);b.setAttribute('aria-label','打开'+target.name);b.dataset.navKey='record:'+target.id;return b;}
 function displayValue(value,valuePath,detail){
  const ref=detail.references.find(r=>JSON.stringify(r.path)===JSON.stringify(valuePath));
  if(ref)return recordLink(ref.target);
  if(value===null||value===undefined||value===''||Array.isArray(value)&&!value.length)return el('span','待补充','muted');
  if(Array.isArray(value)){const list=el('div',undefined,'value-list');value.forEach((v,i)=>list.append(displayValue(v,[...valuePath,i],detail)));return list;}
  if(typeof value==='object'){
   const label=pathLabel(valuePath),b=button('',()=>visit(selected,valuePath),'subobject-card');b.setAttribute('aria-label','打开子项：'+label);b.dataset.navKey='path:'+JSON.stringify(valuePath);
   b.append(el('span',label,'subobject-name'),el('span',Object.keys(value).length+' 项 · 点击展开 ↗','muted'));return b;
  }
  return el('span',String(value));
 }
 function dataField(name,value,valuePath,detail){const g=el('div',undefined,'field'),dd=el('dd');dd.append(displayValue(value,valuePath,detail));g.append(el('dt',name),dd);return g;}
 function breadcrumbs(d){const nav=el('nav',undefined,'breadcrumbs');nav.setAttribute('aria-label','阅读路径');
  trail.forEach((f,i)=>{const name=f.selected?(f.path.length?pathLabel(f.path):atlas().detail(f.selected).record.values.名称):labels[f.page];const b=button(name,()=>jump(i));b.setAttribute('aria-label','返回路径：'+name);nav.append(b,el('span','/','crumb-divider'));});
  nav.append(el('span',path.length?pathLabel(path):d.record.values.名称,'crumb-current'));return nav;
 }

 function renderValue(value){if(value===null||value===undefined||value===''||Array.isArray(value)&&!value.length)return '待补充';if(typeof value!=='object')return String(value);if(Array.isArray(value))return value.map(renderValue).join('；');return Object.entries(value).map(([k,v])=>k+'：'+renderValue(v)).join('\n');}
 function atlas(){return createAtlas({view:{registry:layer==='origin'?(data.originRegistry??data.registry):data.registry,rows:layer==='origin'?data.originRows:layer==='save'?data.savedRows:data.rows},context:{layer},authorizeRow:r=>audience==='author'||r.access.readers.includes('读者'),authorizeField:()=>true});}
 function tags(values){const wrap=el('div',undefined,'tags');for(const value of values)wrap.append(el('span',value));return wrap;}
 function top(){const head=el('header',undefined,'topbar');const brand=el('div',undefined,'brand');brand.append(el('span','缇','seal'),el('span','缇斯亚 / 档案馆'));head.append(brand,button(theme==='light'?'夜读':'日读',()=>{theme=theme==='light'?'dark':'light';root.dataset.theme=theme;render();},'quiet'));return head;}
 function navigation(){const nav=el('nav',undefined,'navigation');nav.setAttribute('aria-label','档案馆导航');for(const id of (data.live?['atlas','changes']:['overview','atlas','saves','cores'])){const b=button('',()=>{page=id;resetTrail();render();},page===id?'active':'');b.append(el('span',icons[id],'nav-icon'),el('span',labels[id]));b.setAttribute('aria-current',page===id?'page':'false');nav.append(b);}return nav;}
 function heading(eyebrow,title,description){const h=el('div',undefined,'heading');h.append(el('p',eyebrow,'eyebrow'),el('h1',title),el('p',description,'lede'));return h;}
 function layerSwitch(){const bar=el('div',undefined,'scopebar');const select=el('select');select.setAttribute('aria-label','资料层');for(const [id,label]of [['session','当前存档 · '+data.branch],['origin','原点 · 世界初始档案'],...(!data.live?[['save','存档 · 渡口清晨']]:[])]){const o=el('option',label);o.value=id;select.append(o);}select.value=layer;select.addEventListener('change',()=>{const next=select.value;const change=()=>{layer=next;resetTrail();render();};if(data.live)act(change);else change();});const permission=button(audience==='reader'?'读者视图':'作者视图',()=>{audience=audience==='reader'?'author':'reader';resetTrail();render();},'quiet');permission.setAttribute('aria-label','切换读取视图');bar.append(select);if(!data.live)bar.append(permission);return bar;}
 function collection(){const area=el('section',undefined,'collection');area.append(heading('WORLD ATLAS / '+(data.live?data.world:'青溪渡'),'众生与万象','从一个名字，读到它的来处。'),layerSwitch());const tools=el('div',undefined,'searchbar'),search=el('input');search.placeholder='寻找名字、别名或档案中的细节';search.value=query;search.type='search';search.setAttribute('aria-label','搜索图鉴');tools.append(el('span','⌕'),search);area.append(tools);const filters=el('div',undefined,'filters');filters.setAttribute('aria-label','图鉴分类');area.append(filters);const grid=el('div',undefined,'card-grid'),count=el('p',undefined,'result-count');area.append(count,grid);
  function refresh(){const list=atlas().list({query,category,limit:100});filters.replaceChildren();const all=button('全部',()=>{category=null;refresh();},!category?'selected':'');filters.append(all);for(const g of list.groups)filters.append(button(g.name+' '+g.count,()=>{category=g.id;refresh();},category===g.id?'selected':''));count.textContent=list.total+' 份可读档案';grid.replaceChildren();if(!list.total)grid.append(el('p','没有找到匹配的档案，试试其他名字。','empty'));
   for(const c of list.items){const card=button('',()=>{visit(c.id);},'archive-card '+c.accent);card.setAttribute('aria-label','打开'+c.name);card.dataset.navKey='record:'+c.id;const line=el('div',undefined,'card-top');line.append(el('span',c.typeName,'type'),el('span','↗','arrow'));card.append(line,el('h2',c.name),el('p',c.summary,'card-summary'),tags(c.tags));grid.append(card);}
  }search.addEventListener('input',()=>{const change=()=>{query=search.value;refresh();};if(data.live)act(change);else change();});refresh();return area;
 }
 function detail(){const d=atlas().detail(selected),r=d.record,v=r.values;const panel=el('section',undefined,'detail');panel.setAttribute('aria-label','档案详情');
  const toolbar=el('div',undefined,'detail-toolbar');toolbar.append(button(trail.length?'← 返回上一层':'← 返回图鉴',back,'back'));
  if(trail.length)toolbar.append(button('返回图鉴',()=>{const index=trail.findIndex(f=>f.page==='atlas'&&!f.selected);if(index>=0)jump(index);else{resetTrail();render();}},'quiet'));
  if(onIdentity&&data.live&&layer==='origin'&&r.table==='objects'&&isObjectType(data.originRegistry??data.registry,r,'character'))toolbar.append(button('用作用户身份',()=>onIdentity(r),'primary'));
  panel.append(toolbar,breadcrumbs(d));if(data.live)panel.append(layerSwitch());
  const hero=el('div',undefined,'detail-hero');hero.append(el('p',(layer==='session'?'当前存档':layer==='origin'?'原点档案':'历史存档')+' / '+(audience==='reader'?'读者可见':'作者查看'),'eyebrow'),el('h1',path.length?pathLabel(path):v.名称),tags(path.length?[v.名称,'档案子项']:v.标签??[]),el('p',path.length?'所属档案：'+v.名称:v.描述??(r.table==='objects'?'':d.kind),'lede'));panel.append(hero);
  const body=el('div',undefined,'detail-body');
  if(path.length){let child=v;for(const key of path){if(!child||!Object.hasOwn(child,key))throw Error('子项不存在或不可读取');child=child[key];}for(const [key,value]of Object.entries(child))body.append(dataField(key,value,[...path,key],d));panel.append(body);return panel;}
  const tabs=el('div',undefined,'detail-tabs');tabs.setAttribute('role','tablist');const choices=r.table==='objects'?[['core','核心'],['dossier','档案'],['history','履历'],['links','关联']]:[['dossier','记录'],['links','关联']];if(data.live&&layer==='session')choices.push(['changes','变更']);
  for(const [id,label]of choices){const b=button(label,()=>{tab=id;render();},id===tab?'selected':'');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(id===tab));tabs.append(b);}panel.append(tabs);
  if(tab==='core'){const core=v.属性?.人物核心;if(core){body.append(tags(core.性格核心标签??[]));const spiral=el('div',undefined,'spiral');spiral.append(el('p','欲望双螺旋','eyebrow'));const desires=core.欲望双螺旋??[];if(desires.length)desires.forEach((s,i)=>spiral.append(field('欲望 '+(i+1),s)));else spiral.append(el('p','尚待提炼','pending-title'),el('p','资料尚不足以确认相互牵引的多股核心欲望。','muted'));body.append(spiral,field('核心矛盾',core.核心矛盾));const mask=v.属性?.面具层;const block=el('div',undefined,'mask');block.append(el('h3','面具层'));if(mask&&Object.values(mask).some(Boolean))Object.entries(mask).forEach(([k,x])=>block.append(field(k,x)));else block.append(el('p','资料尚未给出明确的面具与真实落差。','muted'));body.append(block);}else body.append(field('档案摘要',v.描述));}
  if(tab==='dossier'){for(const s of d.sections){if(s.name==='属性'&&s.value&&typeof s.value==='object'){for(const [key,value]of Object.entries(s.value))body.append(dataField(key,value,['属性',key],d));}else body.append(dataField(s.name,s.value,[s.name],d));}body.append(field('记录版本',r.rev));}
  if(tab==='history'){const events=d.related.filter(x=>x.table==='events');if(!events.length)body.append(el('p','这一层尚未记录相关履历。','empty'));for(const e of events){const block=el('article',undefined,'timeline-item');block.append(el('p',e.values.时间??'时间待补','eyebrow'),recordLink(e,'record-title'),el('p',e.values.经过??''));if(e.values.影响)block.append(el('p',e.values.影响,'aftermath'));body.append(block);}}
  if(tab==='links'){
   if(!d.neighbors.length&&!d.related.length)body.append(el('p','尚无可读的关联记录。','empty'));
   if(d.neighbors.length){body.append(el('h3','相关对象'));const grid=el('div',undefined,'linked-grid');for(const target of d.neighbors){const card=el('article',undefined,'linked-object');card.append(recordLink(target),el('p',target.via.map(x=>x.label==='直接关联'?x.label:'共同记录 · '+x.label).join('；'),'muted'));grid.append(card);}body.append(grid);}
   const records=d.related.filter(x=>x.table!=='objects');if(records.length)body.append(el('h3','关联记录'));
   for(const item of records){const box=el('article',undefined,'link-card');box.append(el('p',item.kind,'eyebrow'),recordLink(item,'record-title'),el('p',item.values.证据??item.values.命题??item.values.经过??''));body.append(box);}
  }
  if(tab==='changes'){
   const changes=(data.trace??[]).filter(a=>a.row===r.id).reverse();
   if(!changes.length)body.append(el('p','这一层没有后续变更记录。','empty'));
   for(const change of changes){const item=el('article',undefined,'timeline-item');item.append(el('p',change.worldTime??'剧情时间未提供','eyebrow'),el('h3',({create:'新增',update:'修改',delete:'删除'})[change.operation]),field('来源',change.sourceFloor===null?'明确导入或手动记录':'第 '+change.sourceFloor+' 楼'),field('剧情依据',change.evidence),field('记录时间',change.recordedAt),field('存档路径',change.path.join(' / ')));
    for(const f of change.fields)item.append(field(f.path,(f.beforePresent?renderValue(f.before):'未设置')+' → '+(f.afterPresent?renderValue(f.after):'已移除')));
    for(const event of change.events){try{atlas().detail(event.id);item.append(recordLink(event));}catch{}}
    body.append(item);
   }
  }
  panel.append(body);return panel;
 }
 function changeHistory(){const box=el('section',undefined,'changes');box.append(heading('SAVE HISTORY / 时间锚','故事留下的改动','按当前线路查看新增、修订与删除。'));
  for(const change of [...(data.trace??[])].reverse()){
   const item=el('article',undefined,'timeline-item');item.append(el('p',change.worldTime??'剧情时间未提供','eyebrow'),el('h3',({create:'新增',update:'修改',delete:'删除'})[change.operation]+' · '+(change.after?.名称??change.before?.名称??change.row)),field('来源楼层',change.sourceFloor??'明确导入或手动记录'),field('剧情依据',change.evidence),field('修改前',change.before),field('修改后',change.after===null?'已从当前存档移除':change.after),field('存档路径',change.path.join(' / ')),field('记录时间',change.recordedAt));
   for(const target of [{id:change.row,name:'当前档案'},...(change.events??[])])try{atlas().detail(target.id);item.append(recordLink(target));}catch{}
   box.append(item);
  }if(!(data.trace??[]).length)box.append(el('p','当前线路尚无变更。','empty'));return box;
 }
 function overview(){const box=el('section',undefined,'overview');box.append(heading('ARCHIVE / 演示世界',data.world,'一条继承链，三个各司其职的层次。'));const rows=[['01','基点','保留是谁，以及为何如此。','人物的核心、欲望、矛盾与可携带成长。','cores'],['02','原点','在这个世界，成为怎样的存在。','世界化的身份、经历、规则与开局定义。','atlas'],['03','存档','记录这条故事真正走过的路。','选择的原点版本、已发生事件和当前变化。','saves']];for(const [n,name,title,desc,target]of rows){const card=button('',()=>{page=target;if(n==='02')layer='origin';render();},'layer-card');card.append(el('span',n,'layer-number'),el('div',name,'eyebrow'),el('h2',title),el('p',desc),el('span','查看'+name+' →','text-link'));box.append(card);}return box;}
 function saves(){const box=el('section',undefined,'saves');box.append(heading('BRANCHES / 存档','故事的分岔处','回望某个时点，保留每条路自己的变化。'));const current=el('article',undefined,'current-save');current.append(el('p','正在阅读','eyebrow'),el('h2',data.branch),el('p','青溪渡 · 当前线路'),button('打开当前图鉴',()=>{page='atlas';layer='session';render();},'primary'));box.append(current);const list=el('div',undefined,'save-list');list.append(el('h3','保留的起点'));for(const save of data.saves){const c=el('article',undefined,'save-card');c.append(el('div',save.time,'save-time'),el('h2',save.name),el('p',save.note),button('查看这个时点 →',()=>{page='atlas';layer='save';render();},'text-link'));list.append(c);}box.append(list);box.append(button('导出演示存档',()=>{download('青溪渡-界面演示.json',JSON.stringify({format:'tisya.atlas-ui-demo/1',...data},null,2));notify('已导出界面演示资料。');},'secondary'));box.append(el('p','此预览演示浏览与导出；正式存档的保存和恢复由已验证的档案服务处理。','fine'));return box;}
 function cores(){const box=el('section',undefined,'cores');box.append(heading('ESSENCE / 基点','不变的内核','身份可以世界化，核心意义逐项继承。'));for(const c of data.cores){const block=el('article',undefined,'core-card');block.append(el('p','人物基点 · 版本 '+c.version,'eyebrow'),el('h2',c.name));for(const t of c.traits)block.append(field(t.name,t.value==='？'?'待提炼':t.value));block.append(el('p','已映射原点：青溪渡 / 方鹿','core-link'),button('查看原点表达 →',()=>{layer='origin';resetTrail();visit('fanglu');},'text-link'));box.append(block);}return box;}
 function notify(text){const node=root.querySelector('[role="status"]');node.textContent=text;}
 function render(){root.dataset.theme=theme;const fragment=doc.createDocumentFragment();fragment.append(top());const shell=el('div',undefined,'shell');shell.append(navigation());const content=el('main',undefined,'content');if(page==='atlas'&&selected)content.append(detail());else content.append(page==='atlas'?collection():page==='overview'?overview():page==='saves'?saves():page==='changes'?changeHistory():cores());shell.append(content);fragment.append(shell);const footer=el('footer',data.live?'存档最新版 · 修订 '+data.revision+' · 更改请在当前表单填写':'独立交互预览 · 演示资料，不改动你的档案','preview-note');fragment.append(footer);const status=el('p',undefined,'toast');status.setAttribute('role','status');fragment.append(status);root.replaceChildren(fragment);}
 render();return {settled:()=>pending,state:()=>({page,layer,category,query,selected,tab,audience,path:[...path],trail:trail.map(f=>({...f,path:[...f.path]}))}),dispose:()=>{root.replaceChildren();}};
}
