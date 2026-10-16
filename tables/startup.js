import {check,copy} from './schema.js';
import {project} from './ledger.js';
import {personaStamp} from './persona.js';
import {uuid} from './books.js';

// An opening is an immutable, explicitly initialized baseline, never a copy of
// the latest playthrough. Native user identity is part of its source binding.
export function registerOpening(origin,session,commit,{avatar,persona,cardSource}){
 check(typeof avatar==='string'&&avatar,'初始化缺少角色卡身份');
 const view=project(origin,session,[]),lastChanges=new Map(session.commits.flatMap(c=>c.changes).map(c=>[c.id,c]));
 const opening=copy(commit);opening.depends=null;opening.source=null;opening.contextSource=null;
 opening.changes=view.rows.map(row=>{const prior=lastChanges.get(row.id);return prior?.origin?{id:row.id,before:null,origin:prior.origin}:{id:row.id,before:null,after:copy(row)};});
 opening.anchors=copy(view.anchors);for(const anchor of opening.anchors)anchor.group=opening.id;
 const pins=opening.changes.flatMap(c=>c.origin?[c.origin]:[]);
 project(origin,{...session,commits:[opening],pins,branchSeed:undefined},[]);
 const template={id:uuid('opening'),revision:origin.revision,avatar,cardSource:copy(cardSource),persona:copy(persona),personaBinding:copy(session.personaBinding??null),registry:copy(session.registry),pins,commit:opening,createdAt:new Date().toISOString()};
 origin.openings??=[];origin.openings.push(template);return template;
}
export function matchingOpening(origin,avatar,persona,cardSource){
 return (origin.openings??[]).findLast(x=>x.avatar===avatar&&JSON.stringify(x.cardSource)===JSON.stringify(cardSource)&&personaStamp(x.persona)===personaStamp(persona))??null;
}
export function applyOpening(origin,session,template,{avatar,persona,cardSource}){
 check(!session.commits.length&&!session.branchSeed&&!(session.pins??[]).length,'当前存档已有进度，不能重新套用开局');
 check(template?.avatar===avatar&&JSON.stringify(template.cardSource)===JSON.stringify(cardSource)&&personaStamp(template.persona)===personaStamp(persona),'角色卡或 user 定义与开局不一致，请先重新初始化');
 const next=copy(session),commit=copy(template.commit);commit.id=uuid('commit');commit.depends=null;
 for(const anchor of commit.anchors){anchor.id=uuid('anchor');anchor.group=commit.id;}
 next.registry=copy(template.registry);next.schemaPinned=true;next.pins=copy(template.pins);next.commits=[commit];
 if(template.personaBinding)next.personaBinding=copy(template.personaBinding);
 next.openingBinding={id:template.id,revision:template.revision,avatar,appliedRevision:next.revision,at:new Date().toISOString()};
 next.templateInitialization={mode:'reuse',at:next.openingBinding.at,registryVersion:template.revision,notes:['复用已确认原点开局；未继承旧会话的事件或成长']};
 project(origin,next,[]);return next;
}

// An untouched automatically applied opening is safe to replace only through
// an explicit restore preview. Any intervening save invalidates that preview.
export function canRestoreInto(session){
 if(session.branchSeed)return false;
 if(!session.commits.length&&!(session.pins??[]).length)return true;
 return session.templateInitialization?.mode==='reuse'&&session.openingBinding?.appliedRevision===session.revision&&session.commits.length===1&&session.commits[0].kind==='init';
}
