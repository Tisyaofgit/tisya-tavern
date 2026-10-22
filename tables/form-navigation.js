// Editor pages are siblings; Back preserves the same input nodes and readers.
export function formNavigation(document,parent,label='字段编辑'){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const root=el('div'),style=el('style'),bar=el('div'),back=el('button','‹ 返回'),title=el('strong'),path=el('small'),outlet=el('div');
 root.className='tisya-field-editor';style.textContent='.tisya-field-editor{min-width:0;width:100%;max-width:100%}.tisya-field-editor [hidden]{display:none!important}.tisya-field-editor .tisya-field-editor-bar{display:flex;align-items:center;gap:8px;min-width:0;margin:4px 0 12px}.tisya-field-editor .tisya-field-editor-bar strong{min-width:0;overflow-wrap:anywhere}.tisya-field-editor .tisya-field-editor-bar button{flex:0 0 auto;margin:0}.tisya-field-editor-page{min-width:0;max-width:100%}.tisya-field-editor-page>.tisya-value{border:0;padding:0;margin:0}.tisya-field-link{display:block;width:100%;text-align:left;min-width:0}.tisya-field-item{min-width:0;margin:12px 0;border-bottom:1px solid #52716544;padding-bottom:8px}.tisya-field-item>label{margin-top:4px}.tisya-field-editor-path{font-size:12px;opacity:.8}';
 back.type='button';back.setAttribute('aria-label','返回上一级字段');bar.className='tisya-field-editor-bar';bar.append(back,title);path.className='tisya-field-editor-path';root.append(style,bar,path,outlet);parent.append(root);
 const pages=new Set();let current;
 function page(name,owner=null,entry=null){const node=el('div');node.className='tisya-field-editor-page';node.dataset.editorPage=name;node.hidden=true;outlet.append(node);const p={node,name,owner,entry};pages.add(p);return p;}
 const home=page(label);
 function refresh(p){if(!p?.summary||!p.description)return;try{p.description.textContent=p.summary();}catch{p.description.textContent='尚有待填写内容';}}
 function show(p){if(!pages.has(p))return;refresh(current);current=p;for(const q of pages)q.node.hidden=q!==p;back.hidden=!p.owner;title.textContent=p.name;const trail=[];for(let ancestor=p.owner;ancestor;ancestor=ancestor.owner)trail.unshift(ancestor.name);path.textContent=trail.join(' / ');path.hidden=!trail.length;root.dataset.currentPage=p.name;for(const q of pages)if(q.owner===p)refresh(q);}
 function open(parentNode,name,owner=current??home){const link=el('button'),label=el('span',name+' ›'),description=el('small');description.style.cssText='display:block;opacity:.8;white-space:normal';link.append(label,description);link.type='button';link.className='tisya-field-link';link.setAttribute('aria-label','编辑 '+name);parentNode.append(link);const p=page(name,owner,link);p.label=label;p.description=description;link.onclick=()=>show(p);return p;}
 function remove(p){for(const q of [...pages])if(q.owner===p)remove(q);if(current===p)show(p.owner??home);p.entry?.remove();p.node.remove();pages.delete(p);}
 function clear(node){for(const p of [...pages])if(p.entry&&node.contains(p.entry))remove(p);node.replaceChildren();}
 back.onclick=()=>{if(current?.owner)show(current.owner);};show(home);
 return {root,home,open,show,clear,remove,get current(){return current;},describe(p,summary){p.summary=summary;refresh(p);},rename(p,name){p.name=name;p.node.dataset.editorPage=name;if(p.entry){p.label.textContent=name+' ›';p.entry.setAttribute('aria-label','编辑 '+name);}if(current===p)title.textContent=name;}};
}
