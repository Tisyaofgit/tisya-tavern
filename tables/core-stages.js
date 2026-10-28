import {check,copy} from './schema.js';
import {branchSeed} from './branches.js';

// A stage is a stored snapshot, never a guessed age or a subtraction from the
// current dossier. Future-only referenceRows do not belong to that life stage.
export function coreStageView(loaded,anchorId=null){
 if(anchorId===null||anchorId==='')return {view:loaded.view,stage:null};
 check(typeof anchorId==='string','人生阶段必须是已保存时间锚的身份');
 const matches=(loaded.origin.data.timelineAnchors??[]).filter(a=>a.id===anchorId);
 check(matches.length===1,'所选人生阶段不存在或不唯一，请重新选择时间锚');
 const anchor=matches[0];branchSeed(anchor);
 return {view:{...loaded.view,registry:copy(anchor.registry),rows:copy(anchor.rows)},
  stage:{anchor:anchor.id,version:anchor.version,name:anchor.name,worldTime:anchor.worldTime??null,sourceSession:anchor.sourceSession,sourceCommit:anchor.sourceCommit??null}};
}
