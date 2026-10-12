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
 entries.tisya_inner_chain=inner;
}
