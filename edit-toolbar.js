// Move the existing native controls, preserving listeners and closest(.mes_block).
// Native edit handlers locate the message by closest(), not a fixed parent depth.
export function createEditToolbarPlacement(document){
 const moved=new Map();
 function restore(node){
  const saved=moved.get(node);if(!saved)return;
  moved.delete(node);
  const {toolbar,anchor,hadClass}=saved;
  if(!hadClass)toolbar.classList.remove('tisya-edit-toolbar-bottom');
  // A host rerender may already have replaced either node. Never resurrect it.
  if(node.contains(toolbar)&&node.contains(anchor))anchor.replaceWith(toolbar);
  else anchor.remove();
 }
 function sync(node){
  if(!node)return;
  const textarea=node.querySelector('.edit_textarea'),block=textarea?.closest('.mes_block'),toolbar=node.querySelector('.mes_edit_buttons');
  const editing=!!block&&!!toolbar&&block.contains(toolbar)&&toolbar.closest('.mes')===node;
  const saved=moved.get(node);
  if(saved&&(!editing||saved.toolbar!==toolbar))restore(node);
  if(!editing)return;
  if(!moved.has(node)){
   const anchor=document.createComment('tisya native editor position');
   toolbar.before(anchor);
   moved.set(node,{toolbar,anchor,hadClass:toolbar.classList.contains('tisya-edit-toolbar-bottom')});
   toolbar.classList.add('tisya-edit-toolbar-bottom');
  }
  if(toolbar.parentElement!==block||block.lastElementChild!==toolbar)block.append(toolbar);
 }
 return {sync,restore,dispose(){for(const node of [...moved.keys()])restore(node);}};
}
