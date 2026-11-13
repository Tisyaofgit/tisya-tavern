import {clone} from './common.mjs';

// One active workspace, exact input bytes. The caller still reads authoritative
// storage before lookup. Revisions alone cannot identify mutable host evidence.
export function snapshotProjection(project){
 let previousKey,previousValue;
 const run=(...args)=>{
  const key=JSON.stringify(args);
  if(key===previousKey)return clone(previousValue);
  const value=project(...args);
  previousValue=clone(value);previousKey=key;
  return value;
 };
 run.clear=()=>{previousKey=undefined;previousValue=undefined;};
 return run;
}
