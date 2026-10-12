// Native card MVU remains the sole writer. This adapter supplies its contract
// and an immutable read of the selected message; it never runs card scripts.
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=text=>{throw Error(text);};
function scripts(rows){return (Array.isArray(rows)?rows:[]).flatMap(row=>row?.type==='folder'?scripts(row.value??row.scripts):[row]);}
export function nativeMvuDeclaration(context,world){
 if(!world?.context.card||world.modes[world.mode].nativeMvu==='off')return null;
 const card=context.characters?.[context.characterId],data=card?.data??card;
 const active=scripts(data?.extensions?.tavern_helper?.scripts).filter(s=>s?.type==='script'&&s.enabled===true);
 const loader=active.find(s=>/https?:\/\/[^\s'"`]*\/MagVarUpdate(?:@|\/)/i.test(String(s.content??'')));
 if(!loader)return null;
 return {name:card.name??data.name??'当前角色卡',book:data.extensions?.world??'',entries:data.character_book?.entries??[],signature:JSON.stringify([card.avatar,active.map(s=>[s.id,s.content])])};
}
export async function prepareNativeMvu(context,world,type='normal',runtime=globalThis.Mvu){
 const declaration=nativeMvuDeclaration(context,world);if(!declaration)return null;
 if(typeof runtime?.getMvuData!=='function'||typeof runtime?.parseMessage!=='function')fail('角色卡已启用 MVU 脚本，但原生 MVU 尚未就绪。请检查酒馆助手的卡片脚本运行状态；缇斯亚没有关闭它，也不会代建变量存档。');
 let index=context.chat.length-1;if(type==='swipe'&&!context.chat[index]?.is_user)index--;
 let current;
 for(;index>=0;index--){
  if(context.chat[index]?.is_system)continue;
  const value=runtime.getMvuData({type:'message',message_id:index});
  if(value&&Object.hasOwn(value,'stat_data')){
   if(!plain(value.stat_data))fail('原卡 MVU 当前消息变量损坏；未创建或重置任何变量。');
   current=value;break;
  }
 }
 if(!current)fail('原卡 MVU 尚无可读取的消息变量，请先完成原卡开场初始化。');
 const stat=structuredClone(current.stat_data);
 let entries=declaration.entries;
 if(declaration.book){
  if(typeof context.loadWorldInfo!=='function')fail('宿主缺少原卡 MVU 世界书读取接口。');
  const book=await context.loadWorldInfo(declaration.book);
  if(!plain(book?.entries))fail('原卡 MVU 关联世界书读取失败：'+declaration.book);
  entries=Object.values(book.entries);
 }
 const enabled=entries.filter(e=>e.enabled!==false&&e.disable!==true);
 const format=enabled.find(e=>/<UpdateVariable>[\s\S]*<JSONPatch>/i.test(e.content??''));
 if(!format)fail('原卡 MVU 的 JSONPatch 输出格式未启用或无法识别；原配置保留。');
 const rules=enabled.filter(e=>/\[mvu_update\]/i.test(e.comment??'')&&!/<JSONPatch>/i.test(e.content??'')).map(e=>String(e.content??'').trim()).filter(Boolean);
 return {...declaration,messageIndex:index,stateDigest:JSON.stringify(stat),text:[
  '[原卡 MVU：变量由原生脚本更新，缇斯亚只传递本轮提案；不得在 status 再写相同字段。]',
  '<status_current_variables>\n'+JSON.stringify(stat)+'\n</status_current_variables>',
  ...rules,
  '原卡更新接口：只依据本轮实际结果生成一组 JSONPatch 操作；保留原卡字段、类型、约束和操作次序。禁止输出分析过程或声称补丁已经结算。结构化回复将唯一 <UpdateVariable><JSONPatch>JSON 数组</JSONPatch></UpdateVariable> 放在 vars 内；纯正文回复将唯一更新块放在文末。无实际更新时不编造操作。'
 ].join('\n\n')};
}
export function applyNativeMvuContract(entries){
 let text=entries.tisya_inner_chain;
 text=text.replace(/@VARS \{[\s\S]*?\n\}/,`@VARS {
原卡 MVU 已声明，结算由原生脚本负责；缇斯亚自有执行器开关不覆盖原卡。
有适用更新时仅在 vars 中输出一组 <UpdateVariable><JSONPatch> 严格 JSON 操作数组 </JSONPatch></UpdateVariable>，不输出 Analysis，不复制到其他块。
沿用已提供原卡的字段、类型、约束、初值与操作顺序；无更新→<vars/>；缺依据→待办，不编造初始化。
支持原卡 replace/delta/insert/remove/move；JSON 字符串中的 &/< 用 JSON unicode 转义，禁止 XML 实体改变变量值。
更新只是提案，实际结算由原生 MVU 回执确认；status 不重复写相同变量。
}`);
 text=text.replace('@OPTION MVU disabled→only <vars/>;omit vars permission rows;do not move disabled operations to another block','@OPTION 原卡 MVU 有操作→用 <vars format="xml"><UpdateVariable><JSONPatch>JSON 数组</JSONPatch></UpdateVariable></vars> 替换 <vars/>；每个实际目标在 memory 写 权限：vars|JSON Pointer|权限；无操作→<vars/>。');
 entries.tisya_inner_chain=text;
}
