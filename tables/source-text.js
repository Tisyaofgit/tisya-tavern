// Exact string leaves, without JSON escaping. No defaults, inference or execution.
function stringLeaves(value){
 const leaves=[],active=new WeakSet();
 function visit(item){
  if(typeof item==='string'){leaves.push(item);return;}
  if(!item||typeof item!=='object')return;
  if(active.has(item))throw Error('基点来源包含循环引用');
  active.add(item);for(const child of Array.isArray(item)?item:Object.values(item))visit(child);active.delete(item);
 }
 visit(value);return leaves;
}
export function coreSourceText(value){return stringLeaves(value).join('\n');}
// Pass business values (and any explicit supplement), not row metadata.
// Evidence must occur inside one original leaf, never across joined fields.
export function coreSourceContains(value,evidence){return typeof evidence==='string'&&!!evidence.trim()&&stringLeaves(value).some(leaf=>leaf.includes(evidence));}
