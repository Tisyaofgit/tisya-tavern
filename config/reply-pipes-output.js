import {simpleSheetInstructions,renderModelMaterial} from '../tables/simple-sheet.js';
const cellSheetInstructions=simpleSheetInstructions().split('\n例：')[0]
 .replace('使用分组简表填写结果，不输出 JSON、解释或省略号。根对象标题【结果】；每行依次写“1 字段名：值”，行号从1连续。','单元格表根标题【单元格】；每行依次写“1 编号：值”，行号从1连续，编号与〈格〉引用一致。子表内部每行仍为“1 字段名：值”。')
 .replace('根列表标题【结果·列表】；根标量标题【结果·值】，仅一行“1 值：值”。','此处根只用单元格编号表；列表和标量只能作为编号的值。');

export const PIPE_TEXT_RULES=String.raw`@PIPE_TEXT {
所有本插件生成的固定列表块使用 format="pipes" text="escaped"；body、extra、vars 的原卡内容不适用此转义约定。
一行一个记录，ASCII | 分列；文字不加 JSON 引号。文字内竖线写 \|，反斜线写 \\，换行写 \n，CR写 \r，制表符写 \t，名字中的顿号写 \、。随后按 XML 文本规则转义 & 和 <；不能以物理换行拆开单元格。
名字列表用顿号分隔；空列表写〈空列〉。可缺的元数据用 ~；要表达字面文本 ~ 或以〈开头的文字，加前缀〈文本〉。文本0、false、null保持文字；值字段中的数字用〈数值〉0，布尔用〈布尔〉false，业务空值用〈空值〉；旧值 ~ 仍表示未知，新值 ~ 仍只表示已成立的解除。
对象、复杂列表、带明确名单的权限或需保留首尾空格的文本：单元格写〈格〉1，在本块所有固定列记录之后写【单元格】，其下用分组简表保存“1 1：值”。更多单元格按行号继续“2 2：值”；编号从1连续，每个编号只引用一次；不用的单元格不得列出。子表与当前块绑定，不跨块引用。单元格为对象/列表时使用子表，不在格内嵌JSON。
单元格表与子表语法如下：
`+cellSheetInstructions+String.raw`
例如当前块中的〈格〉1引用以下具备类型的列表：
【单元格】
1 1：〈列表〉子表1

【子表1】
1 项：甲
2 项：乙
固定列记录中的权限简写仍为A/B/C/D/E/~；确有来源限定的复杂权限用〈格〉编号引用原四项权限结构或字段权限对象。格式转换不补人物知情、不放宽权限、不更改写入所有者。
memory 的权限定位：status 使用 类型、对象、字段；extra 使用 组件、字段；vars 保留本条实际原生JSON Pointer。复杂定位可用〈格〉编号引用原类型列表。
memory 场景固定五列：标题或~|起时刻或~|止时刻或~|地点列表或~|世界或~。标题title仍四列；未明确结束时刻不要补造。
}`;

// Apply after workflow selection, whose frozen upstream anchors still use the
// historical template. This is the last model-facing output grammar boundary.
export function applyEscapedPipeOutput(entries){
 let inner=entries.tisya_inner_chain;if(typeof inner!=='string'||!/<task format="pipes"/.test(inner))return entries;
 const outputDefinitions=[...inner.matchAll(/^@DEFINE @OUT:=(\{"kind":"structured",[^\n]*\})$/gm)];
 if(outputDefinitions.length!==1)throw Error('正文输出约束来源不唯一');
 const output=JSON.parse(outputDefinitions[0][1]);
 if(!output||Array.isArray(output)||output.kind!=='structured')throw Error('正文输出约束类型不匹配');
 inner=inner.replace(outputDefinitions[0][0],'@DEFINE @OUT:=\n'+renderModelMaterial(output));
 const replacements={
  ROWS:'ROWS:固定列按 @PIPE_TEXT；ASCII | 分列；一条记录一行，子表仅放所属块尾。',
  TEXT:'TEXT:文字不加JSON引号；特殊字符与字面保留值按 @PIPE_TEXT 转义。',
  LIST:'LIST:名字用顿号分隔，空列表〈空列〉，可缺元数据~；复杂列表按 @PIPE_TEXT 引用分组简表。',
  VALUES:'VALUES:文字、数值、布尔、空值和对象/列表按 @PIPE_TEXT 区分；对象/列表展开子表，禁止格内JSON。',
  VALUE:'VALUE:权限以外的~只标记可缺元数据；业务空值用〈空值〉、空列表用〈空列〉或子表；字段允许的空文字保留空格位，不把未知改成业务空值。',
  PERM:'PERM:简写权限A/B/C/D/E/~保持原义；明确范围或字段权限引用单元格表中的原类型结构，仍经权限校验；未知范围不猜公开。',
  SCENE:'SCENE:title四列；memory五列标题|起时刻|止时刻|地点|世界，未知端点~。',
  SCENE_DIFF:'SCENE_DIFF:仅title已足够定位且无独立时段时省略memory场景；否则填写五列并保留未知。'
 };
 for(const [name,text]of Object.entries(replacements))inner=inner.replace(new RegExp('^'+name+':[^\\n]*$','m'),()=>text);
 inner=inner.replace(/^权限 locator:[^\n]*$/m,'权限 locator:status→类型、对象、字段；vars→本条实际原生JSON Pointer；extra→组件、字段；限定同条真实输出目标，不替未知目标授权。');
 inner=inner.replace(/^权限：status\|\[([^\n]*)\]\|/gm,(_,parts)=>'权限：status|'+parts.replaceAll(',','、')+'|');
 inner=inner.replace(/^权限：extra\|\[([^\n]*)\]\|/gm,(_,parts)=>'权限：extra|'+parts.replaceAll(',','、')+'|');
 inner=inner.replace('场景：{标题或~}|{实际起止时间列表}|{地点列表或~}|{世界或~}','场景：{标题或~}|{起时刻或~}|{止时刻或~}|{地点列表或~}|{世界或~}');
 inner=inner.replace(/<(task|title|next|status|memory|actions) format="pipes"/g,'<$1 format="pipes" text="escaped"');
 inner=inner.replace('@FORMAT {',PIPE_TEXT_RULES+'\n\n@FORMAT {');
 entries.tisya_inner_chain=inner;return entries;
}
