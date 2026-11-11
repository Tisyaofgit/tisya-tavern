// Only declared literal tag groups enter model material. Regex implementation,
// replacement HTML and scripts remain owned by the native display pipeline.
const blocked=new Set(['reply','task','anchor','title','body','extra','cells','vars','archive','actions','status','memory','next','think','updatevariable','jsonpatch','analysis','html','head','script','style','iframe']);
export function displayFormatGroups(rules,depth=0){
 const groups=[],seen=new Set();
 for(const row of rules??[]){
  if(!row||row.disabled||row.promptOnly===true||!row.markdownOnly||!row.placement?.includes(2))continue;
  if(row.minDepth!=null&&Number(row.minDepth)>=0&&depth<Number(row.minDepth)||row.maxDepth!=null&&Number(row.maxDepth)>=0&&depth>Number(row.maxDepth))continue;
  const pattern=String(row.findRegex??''),tags=[];let inClass=false,escaped=false,ambiguous=false;
  for(let i=0;i<pattern.length;i++){
   const c=pattern[i];if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}
   if(c==='['){inClass=true;continue;}if(c===']'&&inClass){inClass=false;continue;}if(inClass)continue;
   if(c==='|'){ambiguous=true;break;}
   if(c!=='<'||pattern.slice(i-2,i)==='(?')continue;
   const m=/^<(\\\/|\/)?([\p{L}_][\p{L}\p{N}\p{M}_.:-]*)(\/?)>/u.exec(pattern.slice(i));
   if(!m||m[2].includes('.')){ambiguous=true;break;}tags.push({name:m[2],close:!!m[1],self:!!m[3]});i+=m[0].length-1;
  }
  if(ambiguous||!tags.length||tags.some(t=>blocked.has(t.name.toLowerCase())))continue;
  const stack=[],roots=[];let valid=true;
  for(const tag of tags){if(tag.close){if(stack.pop()!==tag.name){valid=false;break;}}else{if(!stack.length)roots.push(tag);if(!tag.self)stack.push(tag.name);}}
  if(!valid||stack.length||!roots.length)continue;
  const signature=JSON.stringify(tags);if(seen.has(signature))continue;seen.add(signature);
  groups.push({tags:tags.map(t=>t.close?'</'+t.name+'>':'<'+t.name+(t.self?'/':'')+'>')});
 }
 return groups;
}
export function displayFormatMaterial(rules,depth=0){
 const groups=displayFormatGroups(rules,depth);if(!groups.length)return '';
 return '[NATIVE.DISPLAY.FORMATS]\n当前允许的显示正则可明确识别以下标签组。仅在本轮角色卡、世界书或用户要求该组件时输出，内容和字段顺序沿用对应格式定义；独立面板完整同组放在 extra，正文内联组件保留在 body。未定义的内容不从正则猜补。\n'+groups.map((g,i)=>'组'+(i+1)+'：'+g.tags.join(' ')).join('\n')+'\n[/NATIVE.DISPLAY.FORMATS]';
}
