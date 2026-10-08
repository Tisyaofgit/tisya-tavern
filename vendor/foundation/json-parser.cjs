'use strict';
// JSON.parse无法保留同层重键证据；原文先做完整语法解析并拒绝解码后同名键。
function createStrictJSON({maxDepth=512,nullPrototype=false,onError=null,bareStrings=false}={}){
 return function parse(text){
 if(typeof text!=='string')throw TypeError('JSON原文必须为字符串');let pos=0;
 const error=(message,kind='syntax')=>{if(onError)return onError(kind,pos,message);throw Error('JSON '+pos+': '+message);};
 const ws=()=>{while(/[\x20\t\r\n]/.test(text[pos]??'!'))pos++;};
 function string(){const start=pos++;for(;;){const c=text[pos++];if(c===undefined)error('字符串未闭合');if(c==='\\'){if(pos>=text.length)error('转义未闭合');pos++;continue;}if(c==='"'){try{return JSON.parse(text.slice(start,pos));}catch{error('非法字符串');}}}}
 function key(){if(text[pos]==='"')return string();if(!bareStrings)error('对象键必须是字符串');const start=pos;while(pos<text.length&&!/[:,{}\[\]"\r\n]/.test(text[pos]))pos++;const k=text.slice(start,pos).trim();if(!k)error('对象键不能为空');return k;}
 function value(depth=0){if(depth>maxDepth)error('嵌套过深','depth');ws();const c=text[pos];
  if(c==='"')return string();
  if(c==='{'){pos++;const result=nullPrototype?Object.create(null):{},keys=new Set();ws();if(text[pos]==='}'){pos++;return result;}for(;;){ws();const name=key();if(keys.has(name))error('重复键 '+name,'duplicate');keys.add(name);ws();if(text[pos++]!==':')error('缺少冒号');const v=value(depth+1);Object.defineProperty(result,name,{value:v,writable:true,enumerable:true,configurable:true});ws();const end=text[pos++];if(end==='}')return result;if(end!==',')error('对象缺少逗号或闭括号');}}
  if(c==='['){pos++;const result=[];ws();if(text[pos]===']'){pos++;return result;}for(;;){result.push(value(depth+1));ws();const end=text[pos++];if(end===']')return result;if(end!==',')error('数组缺少逗号或闭括号');}}
  const start=pos;while(pos<text.length&&!(bareStrings?(depth===0?/[\]}]/:/[,\]}]/):/[\x20\t\r\n,\]}]/).test(text[pos]))pos++;const token=text.slice(start,pos).trim();if(!token){if(bareStrings&&depth===0)return '';error('缺少值');}
  if(bareStrings){
   if(token==='null')return null;if(token==='true')return true;if(token==='false')return false;
   if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)){const n=Number(token);if(!Number.isFinite(n))error('非法数值','number');return n;}
   if(token==='~'||/^(?:NaN|[+-]?Infinity)$/.test(token)||/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d*)?$/.test(token))error('非法值 '+token.slice(0,32));
   if(/[\[\]{}\r\n]/.test(token))error('文本或结构未正确分隔');return token;
  }
  let v;try{v=JSON.parse(token);}catch{error('非法值 '+token.slice(0,32));}if(v!==null&&typeof v!=='number'&&typeof v!=='boolean')error('非法值 '+token.slice(0,32));if(typeof v==='number'&&!Number.isFinite(v))error('非法值 '+token.slice(0,32),'number');return v;
 }
 const result=value();ws();if(pos!==text.length)error('多余尾随内容');return result;
}
}
module.exports={createStrictJSON};
