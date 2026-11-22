import {digest,sha256} from './common.mjs';

export const messageSignature=({uid,role,text})=>digest({uid,role,text:text??''});

// Review stores an accepted, edited reply while the host retains the original
// message. Accept only a proven source/reply pair whose reply is the exact
// journal entry; arbitrary edited message text still fails closed.
export function acceptedMessageSource(bundle,entry,raw){
 const direct={uid:entry.uid,role:entry.role,text:raw};
 if(entry.signature===messageSignature(direct))return 'DIRECT';
 const sourceHash=sha256(raw),review=bundle?.turn_review,signature=reply=>messageSignature({uid:entry.uid,role:'assistant',text:reply});
 const matches=item=>item?.uid===entry.uid&&item.active!==false&&item.sourceHash===sourceHash&&typeof item.reply==='string'&&entry.signature===signature(item.reply);
 if((review?.decisions??[]).some(matches))return 'REVIEWED';
 // The accepted runtime source is the canonical provenance record; optional
 // review projections must not become a second source of truth.
 const sources=Object.values(bundle?.state?.runtime?.sources??{}).filter(source=>
  source?.entry_id===entry.uid&&source.revision===entry.revision&&source.host_message_sha256===sourceHash&&
  typeof source.reply_raw==='string'&&entry.signature===signature(source.reply_raw)
 );
 if(sources.length===1)return 'SOURCE';
 return (review?.legacy??[]).some(matches)?'REVIEWED':null;
}
