import {isTableContinuity} from '../tables/continuity.js';
// Native card MVU remains the sole writer. This adapter supplies its contract
// and an immutable read of the selected message; it never runs card scripts.
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=text=>{throw Error(text);};
function scripts(rows){return (Array.isArray(rows)?rows:[]).flatMap(row=>row?.type==='folder'?scripts(row.value??row.scripts):[row]);}
export function nativeMvuDeclaration(context,world){
 if(!world||!isTableContinuity(world)&&world.context.owner==='tisya'&&!world.context.card||world.modes[world.mode].nativeMvu==='off')return null;
 const card=context.characters?.[context.characterId],data=card?.data??card;
 const active=scripts(data?.extensions?.tavern_helper?.scripts).filter(s=>s?.type==='script'&&s.enabled===true);
 const loader=active.find(s=>/https?:\/\/[^\s'"`]*\/MagVarUpdate(?:@|\/)/i.test(String(s.content??'')));
 if(!loader)return null;
 return {name:card.name??data.name??'当前角色卡',book:data.extensions?.world??'',entries:data.character_book?.entries??[],signature:JSON.stringify([card.avatar,active.map(s=>[s.id,s.content])])};
}
export async function nativeMvuFormats(context,world){
 const declaration=nativeMvuDeclaration(context,world);if(!declaration)return null;
 let entries=declaration.entries;
 if(declaration.book){
  if(typeof context.loadWorldInfo!=='function')fail('宿主缺少原卡 MVU 世界书读取接口。');
  const book=await context.loadWorldInfo(declaration.book);
  if(!plain(book?.entries))fail('原卡 MVU 关联世界书读取失败：'+declaration.book);
  entries=Object.values(book.entries);
 }
 const enabled=entries.filter(e=>e.enabled!==false&&e.disable!==true);
 return {...declaration,enabled,formats:enabled.filter(e=>/<UpdateVariable>[\s\S]*<JSONPatch>/i.test(e.content??'')).map(e=>String(e.content).trim())};
}
export async function prepareNativeMvu(context,world,type='normal',runtime=globalThis.Mvu,structured=true){
 const declaration=await nativeMvuFormats(context,world);if(!declaration)return null;
 if(isTableContinuity(world)&&!world.tables.nativeBridge)fail('原卡 MVU 已启用；仅表单接续须先接通原生变量桥。');
 if(typeof runtime?.getMvuData!=='function'||typeof runtime?.parseMessage!=='function')fail('角色卡已启用 MVU 脚本，但原生 MVU 尚未就绪。请检查酒馆助手的卡片脚本运行状态；缇斯亚没有关闭它，也不会代建变量存档。');
 let index=context.chat.length-1;if(['swipe','regenerate'].includes(type)&&!context.chat[index]?.is_user)index--;
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
 if(world.tables?.nativeBridge)return {...declaration,messageIndex:index,stateDigest:JSON.stringify(stat),text:'[原生变量由表单辅助API负责填写；插件生成更新块交原MVU解析。正文不得再输出变量命令，vars留空；状态供叙事参考。]\n<status_current_variables>\n'+JSON.stringify(stat)+'\n</status_current_variables>'};
 const enabled=declaration.enabled;
 const format=enabled.find(e=>/<UpdateVariable>[\s\S]*<JSONPatch>/i.test(e.content??''));
 if(!format)fail('原卡 MVU 的 JSONPatch 输出格式未启用或无法识别；原配置保留。');
 const rules=enabled.filter(e=>/\[mvu_update\]/i.test(e.comment??'')&&!/<JSONPatch>/i.test(e.content??'')).map(e=>String(e.content??'').trim()).filter(Boolean);
 return {...declaration,messageIndex:index,stateDigest:JSON.stringify(stat),text:[
  '[原卡 MVU：变量由原生脚本更新，缇斯亚只传递本轮提案；不得在 status 再写相同字段。]',
  '<status_current_variables>\n'+JSON.stringify(stat)+'\n</status_current_variables>',
  ...rules,
  ...declaration.formats,
  '原卡变量规则与格式按来源原样提供；由预设 TASK.START 分类、C.2 与 blk.vars 路由输出，原卡脚本负责结算。'
 ].join('\n\n')};
}
export function applySourceOutputRoutes(entries){
 const routes=`@COMPONENT_ROUTE 将已提供的组件按作用拆分：展示内容→@OUTPUT.extra；变量更新协议及操作→@OUTPUT.vars；当前状态记录→@OUTPUT.status。同一数据仅一个所有者，其余引用。混合组件拆开独立部分，保留源字段、类型、操作语法、标签与执行条件，不按卡名或脚本品牌筛选。
@VARIABLE_ROUTE 任何已启用且有写入依据的外部变量协议均可进入 vars。来源的“文末／回复末尾”只表示 vars 内的更新位置，不新增 reply 外输出；Analysis、推演及解释留在内部。缇斯亚自有状态执行器关闭不关闭原卡变量协议；无协议或无合法操作则为空。`;
 if(entries.tisya_task_start)entries.tisya_task_start=entries.tisya_task_start.replace(/^@(?:COMPONENT_ROUTE|VARIABLE_ROUTE) .*\n?/gm,'').replace('@HISTORY ',routes+'\n@HISTORY ');
 let text=entries.tisya_inner_chain;
 text=text.replace(/@VARS \{[\s\S]*?\n\}/,`@VARS {
消费 TASK.START 的 @OUTPUT.vars；按原卡或外部组件提供的协议生成有依据的操作，保留字段、类型、根路径、运算语法、次序和原生更新标签，不转换成另一种 MVU 方言。
所有变量更新只放在 reply 的 vars 内（extra 后、archive 前），不混进 extra/status，不在 </reply> 后追加；原生脚本为唯一结算者，不声称已执行。
原协议的 Analysis/思考/更新说明不输出。XML 或脚本协议用 <vars format="xml"> 原生更新块 </vars>；必要时以 CDATA 包住原生块而不改内容。JSON 字符串的 &/< 用 JSON unicode 转义，不用 XML 实体改值。
未知写入目标或缺依据→待办；无协议、明确关闭该原卡协议或无操作→<vars/>。缇斯亚自有状态执行器停用不禁用其他来源的变量协议。
}`);
 text=text.replace('@OPTION MVU disabled→only <vars/>;omit vars permission rows;do not move disabled operations to another block','@OPTION vars 有操作→替换模板的 <vars/> 为唯一 vars 块；可准确定位的 JSONPatch 目标记录 vars 权限；其他原生语法保留，不伪造 JSON Pointer。无操作→<vars/>。');
 text=text.replace('@INPUT source operation refs+blk.status write-owner refs+blk.extra operation refs','@INPUT @IN.output_refs.vars+source operation refs+blk.status write-owner refs+blk.extra operation refs');
 text=text.replace('@INPUT triggered source-component refs+@POV','@INPUT @IN.output_refs.extra+triggered source-component refs+@POV');
 text=text.replace('@INPUT applicable @SOURCE+registered native-state refs+source output-route refs','@INPUT @IN.output_refs.status+applicable @SOURCE+registered native-state refs+source output-route refs');
 entries.tisya_inner_chain=text;
}
