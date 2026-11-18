export const xmlText=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export function xmlSection(tag,text,{escaped=false}={}){
 if(!text)return '';
 return '<'+tag+'>\n'+(escaped?text:xmlText(text))+'\n</'+tag+'>';
}

export function appendXmlSection(section,tag,text,{escaped=false}={}){
 if(!section)return xmlSection(tag,text,{escaped});
 if(!text)return section;
 const boundary=section.match(/^<([A-Za-z][A-Za-z0-9_]*)>\n([\s\S]*)\n<\/\1>$/);
 if(!boundary)throw Error('追加资料缺少完整区块边界');
 return xmlSection(boundary[1],boundary[2]+'\n\n'+(escaped?text:xmlText(text)),{escaped:true});
}
