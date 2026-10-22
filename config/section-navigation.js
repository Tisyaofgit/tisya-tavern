// Keep live controls in place: moving between sections must not rebuild drafts.
export function mountSectionNavigation(document,content,{onTitle=()=>{},onShow=()=>{},title='设置'}={}){
 const sections=[...content.children].filter(n=>n.tagName==='FIELDSET'&&!n.hidden);
 if(sections.length<2)return null;
 content.dataset.sectionNavigation='';
 const intro=[...content.children].filter(n=>!sections.includes(n)),original=new Map(intro.map(n=>[n,n.hidden]));
 const menu=document.createElement('div'),bar=document.createElement('div'),back=document.createElement('button'),label=document.createElement('span');
 menu.className='tisya-section-menu';bar.className='tisya-section-heading';back.type='button';back.textContent='‹ 返回';back.setAttribute('aria-label','返回本页目录');bar.append(back,label);bar.hidden=true;content.prepend(menu,bar);
 let active=null;
 function show(section){active=section;menu.hidden=!!section;bar.hidden=!section;for(const n of sections)n.hidden=n!==section;for(const n of intro)n.hidden=section?true:original.get(n);label.textContent=section?.querySelector(':scope > legend')?.textContent??'';onTitle(section?label.textContent:title);onShow(section);}
 for(const section of sections){const b=document.createElement('button');b.type='button';b.className='tisya-section-link';const name=section.querySelector(':scope > legend')?.textContent??'设置项目';b.textContent=name+' ›';b.onclick=()=>show(section);menu.append(b);}
 back.onclick=()=>show(null);show(null);
 return {back(){if(!active)return false;show(null);return true;},dispose(){for(const n of sections)n.hidden=false;for(const [n,hidden]of original)n.hidden=hidden;menu.remove();bar.remove();delete content.dataset.sectionNavigation;}};
}
