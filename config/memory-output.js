// One generation contract, shared by the live preset and its final reminder.
// This changes what the model is asked to write, never the permissions of an
// existing reply. All examples are neutral fixtures checked by the real reader.
export const MEMORY_DELIVERY='按本轮 MEMORY_WRITE 与输出模板交付记录。';

export const MEMORY_RULES=`@MEMORY_WRITE {
memory 是本轮已发生事实的记录，不是整块“作者后台”。先从本轮成稿选取有续接价值的事件，再按该事实本身判定权限；不要把历史回复当格式示范。
1. A=公开，B=现场实际接触，C=个人私有，D=定向秘密，E=作者后台。按事实来源保留等级；自己的认识、感受不是自己不可知的作者秘密，通常归 C。等级和人物实际接触共同约束人物复用，不决定读者界面是否显示。
2. 读者展示依 @READER_LAYER。个人心理只从用户明确提供或已选代演/视角授权产生，允许概括，不要求与正文逐字重复。
3. 人物各自保留知道、听闻、推测、误信和未知；读者可见不等于所有人物知情。未完事项、倒计时、未发生的推演及未来伏笔单列保存，不混进事件梗概、结果或影响；已发生的心理愿望也不等于未来结局。
4. 可选行有事实才写；不为填模板编造未完、倒计时或权限。
5. 一行一个记录。冒号后固定列数，ASCII | 分列。文本含竖线或换行时，整格写成严格 JSON 字符串，例如 "甲|乙" 或 "第一行\\n第二行"；裸文本的反斜杠不转义分隔符，不写反斜杠加竖线，不在一格内直接换行。随后按 XML 文本规则转义 & 和 <。名字列表用顿号或方括号字符串列表；不要在列表中放对象、null 或重复名字。
6. 事件：参与者列表|事件权限|梗概。标题、时刻、地点和世界默认沿用本条 title；不同场景才加“场景”。原文必须写本条 body 中真实存在的完整段号，如“原文：段落1、3”；选取已经交付给读者的完整正文段落，不把后台草案当作原文，不猜段号。
7. 关联、权限、未完、倒计时若需要，全部写在第一条“事件”之前。条件和失效紧跟所属倒计时；没有倒计时就不输出这两种行。结果、影响、认知、心理、原文、标签属于它们上方最近一条事件；不能把子行写在事件之前。
8. 未完只记录已成立且确实未完成的事项，与 next 的待办逐字使用同一个事项名称。没有成立的期限或必然条件就不写倒计时。只有担忧、可能、NPC打算时，不生成玩家义务或必然事件。
9. status 的叙事状态自带权限，不再写 status 权限注记。只有本条确实输出原生状态行，才按同一个[类型,对象,字段]生成注记；title 的当前时间不是原生状态写入。vars / extra 注记也必须匹配本条实际输出的操作或字段。无目标就省略，不能用占位路径填满。
可选行的准确格式（有事实才添加；花括号不出现在成稿）：
关联：{对象列表}|{关联本身的权限}
权限：status|[{本条原生类型},{对象},{字段}]|{字段权限}
权限：vars|{本条实际操作的JSON Pointer}|{操作权限}
权限：extra|[{本条实际组件},{字段}]|{字段权限}
未完：{待处理/完成/取消}|{与next一致的事项名称}|{对象列表}|{已成立触发条件}|{实际依据}|{事项权限}
倒计时：{天/轮}|{1至1000的整数}|{对象列表}|{地点或~}|{已经成立的必然事件}|{事项权限}
条件：{对象}|{已有公开字段}|{比较值}|{条件权限}
失效：{对象}|{已有公开字段}|{比较值}|{条件权限}
场景：{标题或~}|[{起时刻或null},{止时刻或null}]|{地点列表或~}|{世界或~}
结果：{选段未覆盖的实际结果}
影响：{独有新增后果}
伏笔：{埋下/推进/回收}|{对象列表}|{触发词}|{已发生依据}
认知：{主体}|{自我/对外}|{确认/听闻/推测/误信}|{认知权限}|{认识内容}|{来源与依据}
心理：{主体}|{心理权限}|{有续接价值的新增心理}|{触发与延续依据}
变动：{对象}|{字段}|{旧值或~}|{新值或解除~}|{变动权限}
变因：{设定变动依据}
标签：{标签列表}
按以上规则校验记录；输出不附入库回执。
}`;

export function applyMemoryOutputContract(inner){
 const re=/<memory format="pipes">[\s\S]*?<\/memory>/g;
 if([...inner.matchAll(re)].length!==1)throw Error('记忆输出模板来源不唯一');
 const template='<memory format="pipes">\n事件：{本轮实际参与者列表}|{按MEMORY_WRITE判定的事件权限}|{本轮已发生事件梗概}\n原文：段落{本条正文已核对且获准引用的完整段号；无可用选段则省略本行}\n</memory>';
 const rules=inner.includes('MVU is disabled;do not emit MVU operations')?MEMORY_RULES.replace('权限：vars|{本条实际操作的JSON Pointer}|{操作权限}\n',''):MEMORY_RULES;
 return inner.replace(re,template).replace('@ARCHIVE <archive/>',rules+'\n@ARCHIVE <archive/>');
}

export const MEMORY_EXAMPLE='事件：[队员甲,队员乙]|A|两人完成公开谢幕，随后返回后台。\n原文：段落1、3\n认知：队员甲|自我|确认|C|自己仍然有些紧张|本轮已获准叙述的个人感受';
// When the archival API owns events, the main model only retains ACL annotations
// needed by native components. It does not produce another narrative summary.
export function applyTableArchiveMemory(entries){
 let inner=entries.tisya_inner_chain;
 inner=inner.replace(/@MEMORY_WRITE \{[\s\S]*?\n\}/,'@MEMORY_WRITE {\n本轮事件、发现、认识及状态变化由辅助记忆归档 API 从正文填表。此处不重复写事件、经过、心理摘要、未完、倒计时或表行。memory 仅在本条原生状态、vars 或 extra 确实需要独立权限注记时保留匹配的权限行；无注记输出 <memory/>。保留实际类型/对象/字段及原生操作 JSON Pointer，不制造占位权限。\n}');
 inner=inner.replace(/<memory format="pipes">[\s\S]*?<\/memory>/,'<memory/>');
 entries.tisya_inner_chain=inner;return entries;
}
