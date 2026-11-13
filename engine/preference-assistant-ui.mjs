export function renderPreferenceAssistant(document,full,{assistant,group,initial,control,editor,config,put,onCopy,button,input,field,el}){
 if(!assistant)return;
  const goal=input('',()=>{}),result=el('div');goal.setAttribute('aria-label',group.label+' · 缇斯亚修改方向');
  full.append(field('让缇斯亚新建／改写',goal),button('生成偏好草稿',async()=>{
   const captured=JSON.stringify({config,rows:editor.rows,text:control.value});result.replaceChildren();
   try{const draft=await assistant({goal:goal.value,name:initial?.name??group.label,text:control.value,category:group.section});
    if(JSON.stringify({config,rows:editor.rows,text:control.value})!==captured){const error=Error('本页草稿已变化，生成结果未覆盖原文');error.rawResponse=draft.rawResponse;throw error;}
    result.append(el('p',draft.answer),el('h4',draft.name+' · '+draft.category));
    for(const [label,text]of [['修改前',draft.before.text],['生成草稿',draft.text]]){const details=el('details');details.open=label==='生成草稿';const raw=el('pre',text);raw.style.cssText='white-space:pre-wrap;font:inherit';details.append(el('summary',label),raw);result.append(details);}
    const raw=el('details');raw.append(el('summary','查看模型原答'),el('pre',draft.rawResponse));result.append(raw,button('将草稿填入编辑框',()=>{if(JSON.stringify({config,rows:editor.rows,text:control.value})!==captured)throw Error('本页草稿已经变化，请重新生成或手动复制原答');control.value=draft.text;put(draft.text);result.append(el('p','已填入，点击底部保存才会生效。'));}),button('将草稿另存为自定义项',()=>{if(JSON.stringify({config,rows:editor.rows,text:control.value})!==captured)throw Error('本页草稿已经变化，请重新生成或手动复制原答');onCopy(group,draft.name,draft.text);}));
   }catch(error){const raw=el('pre',error.rawResponse??'本次未取得模型原答');raw.style.cssText='white-space:pre-wrap;font:inherit';result.append(el('p',error.message),raw);throw error;}
  }),result);
 
}
