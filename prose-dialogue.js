import './vendor/dialogue/media-bindings-model.cjs';
import './vendor/dialogue/dialogue-blocks.cjs';
export const dialogueBlocks=globalThis.TisyaDialogueBlocks;
const plainTags=new Set(['P','DIV','SECTION','EM','STRONG','B','I','U','S','SPAN','Q','BR']);
// Project only sanitized, unowned prose text. Code, links, authored cards and
// already decorated blocks retain their DOM and never become speaker metadata.
export function decorateDialogue(root,options={}){
 if(options.标记美化===false)return 0;
 const runs=[];let run=null,count=0;const doc=root.ownerDocument;
 function walk(node){
  if(node.nodeType===3){if(!run){run={text:'',leaves:[]};runs.push(run);}run.leaves.push({node,start:run.text.length,end:run.text.length+node.length});run.text+=node.data;return;}
  if(node.nodeType!==1||!plainTags.has(node.tagName)||node.attributes.length){run=null;return;}
  if(['P','DIV','SECTION','BR'].includes(node.tagName)&&run)run.text+='\n';
  for(const child of node.childNodes)walk(child);
  if(['P','DIV','SECTION','BR'].includes(node.tagName)&&run)run.text+='\n';
 }
 for(const node of root.childNodes)walk(node);
 for(const group of runs){
  const matches=[];
  for(let i=0;i<group.text.length;i++){
   if(group.text[i]!=='【')continue;let before=i;while(before&&group.text[before-1]==='\\')before--;if((i-before)%2)continue;
   const thought=dialogueBlocks.thoughtAt(group.text,i),dialogue=dialogueBlocks.dialogueAt(group.text,i),match=thought??dialogue;
   if(!match)continue;
   if(thought?options.署名心声!==false&&options.标记内心!==false:options.角色对白框!==false)matches.push({...match,thought:!!thought});
   i=match.end-1;
  }
  for(const match of matches.reverse()){
   const first=group.leaves.find(x=>x.start<=match.start&&x.end>match.start),last=group.leaves.find(x=>x.start<match.end&&x.end>=match.end);if(!first||!last)continue;
   const raw=group.text.slice(match.start,match.end),template=doc.createElement('template');template.innerHTML=dialogueBlocks.registry.project(raw,{characters:options.dialogueCharacters,literal:true});
   const range=doc.createRange();range.setStart(first.node,match.start-first.start);range.setEnd(last.node,match.end-last.start);range.deleteContents();range.insertNode(template.content);count++;
  }
 }
 return count;
}
