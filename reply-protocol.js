// Explicit read-only protocol dispatch. A failed V3 parse never retries an old decoder.
import {displayReplySource} from './display-repair.js';
import {runDisplay as legacyDisplay} from './reader-core.js';
import {runV3Display,isV3ReplyCandidate} from './six/reply.mjs';
export const usesV3Reply=source=>typeof source==='string'&&/<think\b[^>]*\bphase\s*=/i.test(source);
export function runReplyDisplay(options){return usesV3Reply(options.source)?runV3Display(options):legacyDisplay({...options,source:displayReplySource(options.source),opening:options.opening??!isV3ReplyCandidate(options.source)});}
