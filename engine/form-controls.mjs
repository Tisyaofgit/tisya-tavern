// Keep the native picker and keyboard behavior, with a wrapping visible value.
export function selectControl(document,select){
 const box=document.createElement('span'),value=document.createElement('span');
 box.className='tisya-select';value.className='tisya-select-value';value.setAttribute('aria-hidden','true');
 const refresh=()=>{value.textContent=select.options[select.selectedIndex]?.textContent??'尚无可选条目';box.classList.toggle('is-disabled',select.disabled);};
 select.addEventListener('input',refresh);select.addEventListener('change',refresh);select.tisyaRefresh=refresh;
 box.append(select,value);refresh();return box;
}
