// Names only select an intake category. They do not grant authority, permissions
// or prove that prose is an initialized ledger.
export function archivePrefixRole(book,entry=''){
 const roles={基点:'core',原点:'origin',存档:'session',图鉴:'atlas'};
 for(const name of [entry,book]){
  const match=String(name??'').trim().match(/^(?:缇斯亚\s*)?(?:【|\[)?(基点|原点|存档|图鉴)(?:书)?(?=$|[\s·：:／/【】\[\]_-])/u);
  if(match)return roles[match[1]];
 }return null;
}
