import {createArchiveQuerySession} from '../../../tables/archive-query.js';
import {registerArchiveQueryTools} from '../../../tables/archive-tools.js';

/** Bind actual archive methods and optional original reads to one authorized snapshot. */
export function createBoundArchiveQueries({view,context,originals,originalScope,authorizeRow,authorizeField,authorizeMetadata,allowRawReads=false,guard,sourceOrder,limits}) {
  if(typeof guard!=='function'||typeof authorizeRow!=='function'||typeof authorizeField!=='function')throw Error('Explicit query authorization and live guard are required');
  view=structuredClone(view);context=structuredClone(context);originalScope=structuredClone(originalScope);
  const rows=new Map(view.rows.map(row=>[row.id,row]));
  const readSource=allowRawReads?async id=>{
    await guard();
    const row=rows.get(id),ref=row?.values?.原文引用;
    const visible = row && ref && authorizeRow(row,context) === true
      && [['原文引用'],...['entryId','revision','hash','paragraphs'].map(k=>['原文引用',k])].every(path=>authorizeField(row,path,context) === true);
    if(!visible)throw Error('Original source is not authorized for this record');
    const resolved=await originals.resolveReference({reference:ref,scope:originalScope,purpose:'tool-read'});
    await guard();
    return {id:`${ref.entryId}@${ref.revision}#${ref.paragraphs.join(',')}`,text:resolved.selected.map(p=>p.text).join('\n\n')};
  }:null;
  // Base query guards are synchronous. Async source checks also run around dispatch.
  let active=true;
  const session=createArchiveQuerySession({view,context,authorizeRow,authorizeField,authorizeMetadata:authorizeMetadata??null,sourceOrder,guard:()=>{if(!active)throw Error('Archive snapshot is closed');},readSource,limits});
  return {
    async query(method,args){if(!active)throw Error('Archive snapshot is closed');await guard();if(!['list_archive','describe_fields','search_archive','read_archive'].includes(method))throw Error('Unknown archive method');const result=await session[method](args);await guard();return result;},
    register(host,{isActive}){return registerArchiveQueryTools(host,Object.fromEntries(['list_archive','describe_fields','search_archive','read_archive'].map(method=>[method,args=>this.query(method,args)]).concat([['dispose',()=>this.dispose()]])),{isActive:()=>active&&isActive()});},
    dispose(){active=false;session.dispose();},
  };
}
