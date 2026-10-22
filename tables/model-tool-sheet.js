import {parseSimpleSheet,renderModelMaterial,simpleSheetInstructions} from './simple-sheet.js';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
// The provider envelope remains JSON. Only the business payload is a sheet;
// after decoding it follows the existing query/proposal validation unchanged.
export function sheetToolDefinition(definition){
 return {...definition,description:definition.description+'\n工具业务参数填写在唯一 sheet 字符串中。以下是本工具允许的字段与约束；省略未使用字段，不增加说明字段。\n'+simpleSheetInstructions()+'\n'+renderModelMaterial(definition.parameters),parameters:{type:'object',additionalProperties:false,required:['sheet'],properties:{sheet:{type:'string',description:'完整中文分组简表；根节点为本工具业务参数对象，复杂条件、列表与草案展开为子表。'}}}};
}
export function parseToolSheetInput(envelope){
 if(!object(envelope)||Object.keys(envelope).length!==1||typeof envelope.sheet!=='string')throw Error('工具封套仅允许一个 sheet 字符串');
 const value=parseSimpleSheet(envelope.sheet);
 if(!object(value))throw Error('工具业务参数简表根节点须为对象');
 return value;
}
export const toolSheetResult=value=>renderModelMaterial(value);
