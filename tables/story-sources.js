import {sourceKind} from './source-provenance.js';
import {historyGroups} from '../config/tool-history.js';
import {sources} from './ledger.js';
import {check} from './schema.js';

// Preserve the historical parent/hash chain exactly. Removing an operational
// owner before hashing would invalidate every later source and ledger commit.
export async function storySources(chat,type='normal',projectToolTurns){
 const groups=historyGroups(chat,projectToolTurns),operational=new Set(groups.filter(g=>g.tool).flatMap(g=>g.indices));
 const raw=await sources(chat,type),unclassified=[];
 for(let i=0;i<raw.length;i++){const source=raw[i];if(source.role!=='assistant'||operational.has(source.floor-1))continue;const kind=await sourceKind(chat[source.floor-1]);if(['unknown','legacy'].includes(kind))unclassified.push({key:source.key,floor:source.floor,kind});if(kind==='utility'){operational.add(source.floor-1);for(let j=i-1;j>=0&&raw[j].role==='user';j--)operational.add(raw[j].floor-1);}}
 const excluded=raw.filter(s=>operational.has(s.floor-1));
 return {unclassified,chain:raw.filter(s=>!operational.has(s.floor-1)),operationalKeys:excluded.map(s=>s.key),operationalFloors:excluded.map(s=>s.floor)};
}

// Never silently hide an already accepted tool-derived fact. This is a
// compatibility stop, not an automatic migration or deletion of old records.
export function assertStoryLedger(origin,session,{operationalKeys}){
 if(!operationalKeys.length)return;
 const keys=new Set(operationalKeys),bad=key=>keys.has(key);
 const referenced=(session.commits??[]).some(c=>bad(c.source)||bad(c.contextSource))
  ||(session.branchSeed?.archivedSources??[]).some(bad)
  ||(session.branchSeed?.rows??[]).some(r=>bad(r.source))
  ||(origin.bases??[]).some(r=>bad(r.source));
 check(!referenced,'旧存档已引用工具或非剧情楼层，需先核对来源迁移；未自动删除、重算或写入档案。');
}
