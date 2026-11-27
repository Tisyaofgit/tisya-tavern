import {quotedHistory} from './history-layers.mjs';
import {sha256,fail} from './common.mjs';
import {matrixRecordVisible} from './prompt-boundary.mjs';
import {characterSubject} from './character-knowledge.mjs';
import {materialKnown as known} from './narrative-material.mjs';
import {eventCodes} from './record-identity.mjs';

const eventTable='T_DYN_EVENTS';
const value=(row,key)=>known(row,key)?row.values[key]:undefined;
const words=text=>(text.normalize('NFKC').toLowerCase().match(/[a-z0-9][a-z0-9_-]{3,}|[\p{Script=Han}]{4,}/gu)??[]);
const han=/^[\p{Script=Han}]+$/u;
function queryTerms(query){
 const found=new Set();
 for(const word of words(query)){
  if(!han.test(word)){found.add(word);continue;}
  for(let i=0;i<=word.length-4;i++)found.add(word.slice(i,i+4));
 }
 return [...found];
}
function triggerText(state,eventId,row){
 const stored=value(row,'trigger_cues'),ids=Array.isArray(stored)?stored:[stored];
 return ids.flatMap(id=>{
  const detail=state.tables.M_LIST_VALUES?.[id];
  if(!detail)return [];
  if(value(detail,'owner_table')!==eventTable||value(detail,'owner_row_uuid')!==eventId||value(detail,'owner_field')!=='trigger_cues')return [];
  const text=value(detail,'text_value');return typeof text==='string'&&text.trim()?[text]:[];
 });
}

export function recallNarrativePassages(state,scope,history,messages,decisions=[]){
 const command=history.recentSituation.currentUser?.text;
 if(!command||characterSubject(scope))return '';
 const excluded=new Set([...history.window.sourceIds,history.recentSituation.assistant?.id]);
 const selected=new Map(messages.filter(m=>m.role==='assistant'&&!m.hidden&&!excluded.has(m.id)).map(m=>[m.id,m]));
 const normalized=command.normalize('NFKC').toLowerCase(),terms=queryTerms(command),codes=eventCodes(state);
 const formal=new Set((state.runtime.archive_queue??[]).filter(batch=>batch.status==='formal').map(batch=>batch.source_key));
 const candidates=new Map();
 for(const [id,row]of Object.entries(state.tables[eventTable]??{})){
  if(!matrixRecordVisible(state,eventTable,id,scope)||['L2','L3'].includes(value(row,'lock_level')))continue;
  const evidence=row.metadata?.archive_source,source=state.runtime.sources?.[evidence?.source_key],message=selected.get(evidence?.entry_id);
  if(!source||!message||!formal.has(evidence.source_key)||source.branch!==(scope.branch_ref??'main')||
     source.entry_id!==message.id||source.revision!==evidence.revision||source.body_sha256!==evidence.body_sha256)continue;
  const messageHash=sha256(message.text);
  const reviewed=decisions.some(decision=>decision.active!==false&&decision.uid===message.id&&decision.sourceHash===messageHash&&
   typeof decision.reply==='string'&&(decision.reply===source.reply_raw||sha256(decision.reply)===source.host_message_sha256));
  if(source.reply_raw!==message.text&&source.host_message_sha256!==messageHash&&!reviewed)continue;
  const storyTime=state.tables.M_WORLD_TIME?.[value(row,'story_time')]?.values??{},range=state.tables.M_TIME_RANGES?.[value(row,'time_span')]?.values??{};
  const timeText=value(row,'time_original_text')??storyTime.original_text??'',domain=value(row,'timeline_domain')??'',code=codes.get(id)??'';
  const timelineText=[domain,timeText,value(row,'spine_digest'),...triggerText(state,id,row)].filter(Boolean).join('\n').normalize('NFKC').toLowerCase();
  const triggered=triggerText(state,id,row).some(text=>normalized.includes(text.trim().normalize('NFKC').toLowerCase()))||[domain,timeText].some(text=>text&&normalized.includes(String(text).normalize('NFKC').toLowerCase()));
  const fragments=(source.fragments??[]).filter(f=>evidence.paragraphs?.includes(f.paragraph_id));
  for(const fragment of fragments){
   const raw=fragment.raw_block,searchable=raw.normalize('NFKC').toLowerCase();
   if(!triggered&&!terms.some(term=>searchable.includes(term)||timelineText.includes(term)))continue;
   if(sha256(source.body_raw)!==source.body_sha256||sha256(raw)!==fragment.sha256||
      source.body_raw.slice(fragment.source_start,fragment.source_end)!==raw)
    fail('SOURCE_INTEGRITY','已归档召回段落与原文校验不一致',{source_key:evidence.source_key,paragraph:fragment.paragraph_id});
   candidates.set(message.id+'#'+fragment.paragraph_id,{floor:message.floor,number:fragment.chunk_index,raw,code,timeText,domain,turn:range.start_turn??null});
  }
 }
 const picked=[...candidates.values()].sort((a,b)=>(b.turn??-1)-(a.turn??-1)||b.floor-a.floor||a.number-b.number).slice(0,3);
 if(!picked.length)return '';
 return '统一时间轴召回\n'+picked.map(f=>'e'+f.code+(f.domain?'〈'+f.domain+'〉':'')+(f.timeText?'['+f.timeText+']':'')+' 第 '+f.floor+' 层 P'+f.number+'\n'+quotedHistory(f.raw.replace(/^\s*\d+[ \t]+/u,'').trim())).join('\n\n');
}
