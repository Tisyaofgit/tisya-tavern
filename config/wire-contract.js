// The compact permission spelling is user-facing wire syntax. Scoped policies
// remain supported for explicit audience/field overrides, never required merely
// to make a compact record parse. Keep the frozen upstream source unchanged.
function once(text,from,to){if(text.split(from).length!==2)throw Error('回复格式来源锚点不匹配');return text.replace(from,to);}
export function applyWireContract(entries){
 let registry=entries.tisya_registry;
 registry=once(registry,
  '@PERM := [level,read_auth,emit_auth,knowers];level=A/B/C/D/E/null;other cells=bracketed lists of scoped audience/subject names or null;names need no quotation marks;[]=known none,null=unresolved;never treat unresolved as public',
  '@PERM := one compact grade A/B/C/D/E or ~;A and ~ mean public;B/C/D/E retain their M.08 classification and do not by themselves authorize reader display or other characters;lowercase grades are readable;~ means public only in a permission cell. Explicit scoped form [level,read_auth,emit_auth,knowers] remains available for source-established audiences: level=A/B/C/D/E/null,other cells=bracketed name lists or null;[]=known none,null=unresolved;never invent a scope or treat unresolved as public');
 registry=once(registry,
  'grade alone grants neither read nor emit;no evidence→retain null+@GAP for dependent use',
  'compact A/~ require established public availability;compact B–E allow internal narrative/record organization only,not inferred character knowledge or public display;use an explicit scoped form when source-authorized audiences must be carried;no evidence→[null,null,null,null]+@GAP');
 registry=once(registry,'public field requires "读者" in emit_auth plus authorized fragment/context','public field requires compact A/~ or explicit "读者" in emit_auth plus authorized fragment/context');
 registry=once(registry,'internal stage requires its purpose in read_auth','internal stage requires compact-grade internal-purpose access or its purpose in explicit read_auth');
 entries.tisya_registry=registry;
 let inner=entries.tisya_inner_chain;
 inner=once(inner,'PERM:权限 cells use @PERM or @FIELD_PERM;array scopes retain list types;unresolved cells retain null,!guess public access','PERM:权限 cells accept one A/B/C/D/E or ~;~ is public here;explicit scoped @PERM and @FIELD_PERM remain valid;keep source restrictions and unknowns,!guess public access');
 inner=once(inner,'LIST:顿号-separated names/items;known-empty=[],unavailable optional list=~;','LIST:顿号-separated names/items or bracketed comma-separated string lists;known-empty=[],unavailable optional list=~;');
 inner=once(inner,'VALUE:~ marks schema-permitted unavailable optional metadata;','VALUE:outside permission cells,~ marks schema-permitted unavailable optional metadata;');
 inner=inner.replace('serialize A—E/read_auth/emit_auth/knowers','serialize compact A–E/~ or source-established scoped permissions per @M.08');
 if(inner.includes('MVU is disabled;do not emit MVU operations')){
  inner=once(inner,'权限：vars|{已输出操作的实际JSON Pointer}|{本操作权限}\n','');
  inner=once(inner,'@OPTION valid variable operations replace <vars/> with <vars format="json">...</vars>;final output contains actual operations only','@OPTION MVU disabled→only <vars/>;omit vars permission rows;do not move disabled operations to another block');
 }
 inner=inner.replace('@OPTION permission rows require actual targets;', '@OPTION status权限定位必须是[已登记类型,已登记对象,字段]三项；单独JSON Pointer只能属于实际输出的vars操作；叙事状态自带权限，不另造status权限行。permission rows require actual targets;');
 inner=inner.replace('opening←actual input/task;closing←completed progress',
  'opening/task：只针对用户本轮任务、指令与扮演选择进行输入评价；回应用户评价只在此直接回应实际聊天。closing/next：只针对本轮正文已经发生的剧情、互动和结果进行剧情吐槽。两轮分别撰写、各有对象与新内容；禁止复制、近义改写或回放开篇心声，禁止把预计剧情写成已发生。');
 inner=inner.replace('one content row/applicable enabled direction at each position','one content row per applicable selected direction at its assigned position only;task receives 输入评价/回应用户评价,next receives 剧情吐槽;do not require the same directions at both positions');
 for(const part of ['task','next']){
  const re=new RegExp('(<'+part+' format="pipes"[^>]*>)([\\s\\S]*?)(</'+part+'>)');
  inner=inner.replace(re,(_,open,body,close)=>{
   const lines=body.split('\n').filter(line=>!line.startsWith('心声：有内容|')||(part==='task'?!line.includes('|剧情吐槽|'):line.includes('|剧情吐槽|')));
   if(!lines.some(line=>line.startsWith('心声：')))lines.push('心声：关闭');
   return open+lines.join('\n')+close;
  });
 }
 entries.tisya_inner_chain=inner;
}
