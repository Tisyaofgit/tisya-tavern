export const ACTION_MODES=Object.freeze([{id:'append',label:'续接输入框',short:'续接'},{id:'replace',label:'替换输入框',short:'替换'},{id:'send',label:'直接发送',short:'直发'}]);
const modeFor=id=>{const mode=ACTION_MODES.find(row=>row.id===id);if(!mode)throw Error('行动写入方式无效');return mode;};

// One explicit mode applies to a subsequent action click. Opening or changing
// the menu never changes the draft or sends anything.
export function mountActionChoice(document,container,{rows,onChoose,getMode,setMode=()=>{},quill,getPossibilityVisibility=()=>true,setPossibilityVisibility,onError=()=>{}}){
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 let alive=true,busy=false,mode=getMode?getMode():'append';const readMode=()=>getMode?getMode():mode;modeFor(mode);
 const controls=make('div',undefined,'action-mode-control'),toggle=make('button',undefined,'action-mode-toggle'),current=make('span'),menu=make('div',undefined,'action-mode-menu'),list=make('div',undefined,'actions tisya-reader-actions'),feedback=make('p','点击行动，按羽毛笔旁的当前模式执行。','action-feedback');
 toggle.type='button';toggle.setAttribute('aria-label','选择行动写入方式');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-haspopup','menu');
 if(quill){const img=make('img');img.src=quill;img.alt='';toggle.append(img);}toggle.append(current);menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','行动写入方式');feedback.setAttribute('role','status');
 const buttons=[],possibilityNodes=[];const readVisibility=()=>{const value=getPossibilityVisibility();if(typeof value!=='boolean')throw Error('可能走向显示配置无效');return value;};const visibility=typeof setPossibilityVisibility==='function'&&rows.some(row=>row.possibility)?make('button',undefined,'action-possibility-toggle'):null;
 if(visibility){visibility.type='button';visibility.setAttribute('aria-label','切换可能走向显示');visibility.style.cssText='min-height:44px;border:1px solid currentColor;border-radius:10px;padding:6px 12px;background:transparent;color:inherit;font:inherit;cursor:pointer';buttons.push(visibility);visibility.onclick=async()=>{if(!alive||busy)return;busy=true;buttons.forEach(n=>n.disabled=true);toggle.disabled=true;close();try{const expected=readVisibility();await setPossibilityVisibility(!expected,expected);if(!alive)return;if(readVisibility()!==!expected)throw Error('显示设置尚未保存，请重试。');render();feedback.textContent=readVisibility()?'已显示可能走向。':'只显示行动内容。';}catch(error){if(alive){feedback.textContent=error.message;onError(error);}}finally{busy=false;if(alive){buttons.forEach(n=>n.disabled=false);toggle.disabled=false;try{render();}catch(error){feedback.textContent=error.message;onError(error);}}}};}
 function render(){const show=readVisibility();for(const node of possibilityNodes){node.hidden=!show;node.style.setProperty('display',show?'block':'none','important');}if(visibility){visibility.textContent=show?'只看行动':'显示可能走向';visibility.setAttribute('aria-pressed',String(show));}current.textContent=modeFor(mode).short;toggle.title=modeFor(mode).label;for(const b of menu.children)b.setAttribute('aria-checked',String(b.dataset.mode===mode));}
 const close=()=>{menu.hidden=true;toggle.setAttribute('aria-expanded','false');};
 for(const row of ACTION_MODES){const b=make('button',row.label);b.type='button';b.dataset.mode=row.id;b.setAttribute('role','menuitemradio');b.onclick=async()=>{if(!alive||busy)return;try{await setMode(row.id);if(!alive)return;mode=row.id;render();close();toggle.focus({preventScroll:true});}catch(e){feedback.textContent=e.message;onError(e);}};menu.append(b);buttons.push(b);}
 toggle.onclick=()=>{if(!alive||busy)return;try{mode=readMode();modeFor(mode);render();menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));}catch(e){feedback.textContent=e.message;onError(e);}};
 controls.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.preventDefault();e.stopPropagation();close();toggle.focus({preventScroll:true});}else if(!menu.hidden&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const choices=[...menu.children],active=choices.indexOf(menu.getRootNode().activeElement??document.activeElement);const index=e.key==='Home'?0:e.key==='End'?choices.length-1:(active+(e.key==='ArrowDown'?1:choices.length-1)+choices.length)%choices.length;choices[index].focus();}});
 for(const [i,row]of rows.entries()){const b=make('button',undefined,'action');b.type='button';const copy=make('span',undefined,'text');if(row.type){const kind=make('small',row.type,'action-kind');kind.style.display='block';copy.append(kind);}copy.append(make('span',row.text,'action-text'));if(row.possibility){const turn=make('small',row.possibility,'action-possibility');turn.style.display='block';turn.style.opacity='.8';possibilityNodes.push(turn);copy.append(turn);}b.append(make('span',String(i+1).padStart(2,'0'),'number'),copy);b.onclick=async()=>{if(!alive||busy)return;busy=true;buttons.forEach(n=>n.disabled=true);toggle.disabled=true;close();try{mode=readMode();render();const result=await onChoose(row.text,mode);if(!alive)return;list.querySelectorAll('.action').forEach(n=>n.classList.toggle('selected',n===b));feedback.textContent=result?.message??(mode==='send'?'所选行动已交给原生发送。':mode==='replace'?'已替换输入框，尚未发送。':'已续接输入框，尚未发送。');}catch(e){if(alive){feedback.textContent=e.message;onError(e);}}finally{busy=false;if(alive){buttons.forEach(n=>n.disabled=false);toggle.disabled=false;}}};buttons.push(b);list.append(b);}
 controls.append(toggle,menu);if(visibility)controls.append(visibility);container.append(controls,list,feedback);render();
 return {refresh(){if(!alive||busy)return;mode=readMode();render();},dispose(){alive=false;controls.remove();list.remove();feedback.remove();}};
}

export async function executeAction({document,text,mode,validate,send}){
 modeFor(mode);if(typeof text!=='string'||!text.trim())throw Error('行动内容为空');validate();
 const input=document.querySelector('#send_textarea');if(!input||input.disabled)throw Error('宿主输入框当前不可用');
 const draft=input.value;
 if(mode==='send'&&draft.length)throw Error('输入框已有草稿；请先发送或清空，或切换为续接／替换。');
 if(mode==='send'&&text.trimStart().startsWith('/'))throw Error('行动以命令符开头，请先填入输入框检查后再发送。');
 const value=mode==='append'?draft+(draft&&!draft.endsWith('\n')?'\n':'')+text:text;
 validate();if(input.value!==draft)throw Error('输入草稿已变化，请重新选择行动');
 input.value=value;input.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
 if(mode==='send'){validate();if(input.value!==value)throw Error('输入草稿已变化，未发送');await send();}
 return {mode,value};
}
