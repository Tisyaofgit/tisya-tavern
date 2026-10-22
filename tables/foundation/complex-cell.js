import {parseSimpleSheet,simpleSheetInstructions,formatSimpleSheet} from '../simple-sheet.js';
export const complexCell=definition=>['json','array','map','object'].includes(definition.type);
export function complexCellInstructions({markdown=false}={}){
 return '复杂格展开为完整简表，根节点就是该格的值，不额外套字段名。'+(markdown?'把简表各行放在同一 B 格，以 <br> 分行；格内竖线仍写\\|。':'先保留“行号 字段名：”空行，再将该格简表每一行统一加两个空格作为续行；其内子表标题也必须缩进两个空格。')+'未知仍留空；明确空值、空列表和空对象按简表类型填写。\n'+simpleSheetInstructions();
}
// Existing scalar spellings remain unambiguous. Arbitrary structures always go
// through the shared codec, then through the caller's original schema validator.
export function parseComplexCell(raw){
 if(raw==='null')return null;if(raw==='true'||raw==='false')return raw==='true';if(raw==='[]')return [];if(raw==='{}')return {};if(raw==='""')return '';
 if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)){const value=Number(raw);if(Number.isFinite(value))return value;}
 return parseSimpleSheet(raw);
}
export function complexShape(definition){
 const shape=d=>({类型:d.type,...(d.values?{选项:d.values}:{}),...(d.fields?{字段:Object.fromEntries(Object.entries(d.fields).map(([key,child])=>[key,shape(child)]))}:{}),...(d.items?{条目:shape(d.items)}:{}),...(d.required?{必填:true}:{}),...(d.min!==undefined?{最小:d.min}:{}),...(d.max!==undefined?{最大:d.max}:{})});
 return formatSimpleSheet(shape(definition));
}
