import {digest,sha256} from './common.mjs';

export const messageSignature=({uid,role,text})=>digest({uid,role,text:text??''});

// Review stores an accepted, edited reply while the host retains the original
// message. Accept only a proven source/reply pair whose reply is the exact
// journal entry; arbitrary edited message text still fails closed.
export function acceptedMessageSource(bundle,entry,raw){
 const direct={uid:entry.uid,role:entry.role,text:raw};
 if(entry.signature===messageSignature(direct))return 'DIRECT';
 const sourceHash=sha256(raw),review=bundle?.turn_review;
 const candidates=[...(review?.decisions??[]),...(review?.legacy??[])];
 const match=candidates.find(item=>item?.uid===entry.uid&&item.active!==false&&item.sourceHash===sourceHash&&typeof item.reply==='string'&&entry.signature===messageSignature({uid:entry.uid,role:'assistant',text:item.reply}));
 return match?'REVIEWED':null;
}
