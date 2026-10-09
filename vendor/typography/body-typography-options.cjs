'use strict';
const markFields=Object.fromEntries(['标记美化',...require('./prose-marks.cjs').MARK_NAMES.map(n=>'标记'+n)].map(k=>[k,[true,false]]));
const BODY_FIELDS=Object.freeze({自动分段:[true,false],首行缩进:[0,1,2],正文行距:[1.6,1.8,2,2.2],段落间距:[0.5,0.8,1,1.5],对白高亮:[true,false],标点高亮:[true,false],...markFields});
const BODY_DEFAULTS=Object.freeze({自动分段:true,首行缩进:2,正文行距:1.8,段落间距:0.8,对白高亮:true,标点高亮:true,...Object.fromEntries(Object.keys(markFields).map(k=>[k,true]))});
function bodyOptions(display={}){
 const result={};for(const [key,values]of Object.entries(BODY_FIELDS)){const value=Object.hasOwn(display,key)?display[key]:BODY_DEFAULTS[key];if(!values.includes(value))throw Error('TISYA_BODY_OPTION_INVALID:'+key);result[key]=value;}return result;
}
module.exports={BODY_FIELDS,BODY_DEFAULTS,bodyOptions};
