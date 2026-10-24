import {createDisplayCache} from './display-cache.js';
import {readV3PublicEnvelope,readV3Block} from './v3/reply.mjs';
let revision=0;
const publicCache=createDisplayCache();
export const replyFormatRevision=()=>revision;
export function configureReplyFormats(){revision++;publicCache.clear();}
export function readPublicReplyEnvelope(source){return publicCache.read(source,()=>readV3PublicEnvelope(source));}
export function readReplyBlock(envelope,block){return readV3Block(envelope,block);}
// Runtime records belong to A/B/P. A message display never invents memory.
export function readReplyMemory(){return null;}
