// Bind to the owning document; no global DOM, HTML parsing or cross-frame nodes.
export function elements(document){
 return (tag,text,className)=>{
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(className)node.className=className;
  return node;
 };
}
