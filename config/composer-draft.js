// The host reads the composer for slash commands and bias even for an
// automatic normal generation. Keep the unsent draft outside that read.
export function isolateComposerDraft(document,{text='',scope='',getScope=()=>scope,onUnrestored=()=>{}}={}){
 const input=document.querySelector('#send_textarea');
 if(!input)throw Error('宿主输入框不存在');
 const saved={value:input.value,start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection,scrollTop:input.scrollTop,readOnly:input.readOnly};
 let active=true;
 const notify=()=>input.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
 input.readOnly=true;input.value=text;notify();
 return function restore(){
  if(!active)return false;active=false;
  input.readOnly=saved.readOnly;
  if(!input.isConnected||getScope()!==scope){onUnrestored({scope,...saved});return false;}
  input.value=saved.value;notify();input.setSelectionRange(saved.start,saved.end,saved.direction);input.scrollTop=saved.scrollTop;return true;
 };
}
