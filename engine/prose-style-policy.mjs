import {digest} from './common.mjs';

// Match the whole known shipped prompt. Any user edit, including a custom
// instruction around a stock clause, stays untouched. Explicit saved overrides
// are excluded by compilePrompts before this request-only projection.
export const PROSE_STYLE_REVISIONS=Object.freeze([
  {
    "identifier": "tisya_pref_style",
    "legacyDigest": "a8a9bf067c82a157fe66692ea8794fecda764fe5d56463ba4211b284c0343e89",
    "before": "@GRAMMAR.DENSITY := Context-adaptive syntax & high information density:\n  1. In objective third-person scene narration, write in complete, grammatically grounded fiction sentences with explicit subjects and clear spatial choreography—banning disembodied RP shorthand and never restating the same beat or emotion in different words.\n  2. In spoken dialogue, inner thoughts, or any in-world vernacular/documentary medium, adapt sentence length, fragmentation, pauses, and colloquial texture directly to the speaker's live state and the medium's native ecosystem—never flattening live speech or in-world vernacular into stiff, uniform essay prose.\n",
    "after": "@GRAMMAR.DENSITY := Context-adaptive syntax and expressive precision:\n  1. In scene narration, keep subjects, spatial relations, and physical continuity clear. Give attention to the details that matter to the viewpoint: atmosphere, sensory impressions, appearance, gesture, and authorized thought can develop one moment across several sentences without advancing the plot or changing a relationship.\n  2. Let sentence length, rhythm, pauses, and imagery follow attention and emotional texture. Quiet observation and sustained feeling are valid; a recurring detail may deepen through a changed association or perspective. Avoid interchangeable adjectives and synonymous padding rather than demanding a new event in every sentence.\n  3. In spoken dialogue, inner thoughts, and in-world documentary media, follow the speaker's own cadence and the medium's conventions, including fragments or colloquial pauses where natural. Keep inner access within the selected viewpoint and agency rules.\n"
  },
  {
    "identifier": "tisya_pref_plot",
    "legacyDigest": "0a4eb4fe13931b6b0bc398bc8f1faabb3c9572d5f41872a2dd1234613d1fa63e",
    "before": "@CLIMAX.INK_BASE := Ratio-scaled expressive fullness (`65%–95%` of the `[min, max]` span) & zero structural templates:\n  1. DYNAMIC LENGTH TARGETING: For the active `<body min=\"MIN\" max=\"MAX\">` range (unless overridden by `@STOP.GATE` or an explicit short-scene request from `@U`), aim naturally for the `65%–95%` upper-middle zone of the span (`MIN + 0.65*(MAX - MIN)` to `MIN + 0.95*(MAX - MIN)`, strictly staying above `MIN`, and pushing to `90%–100%` of `MAX` during climaxes).\n  2. ORGANIC INTERACTION DENSITY OVER TEMPLATES: Strictly ban mechanical paragraph or chapter templates—never pad length with mandatory opening weather/scenery descriptions, and never close paragraphs or scenes with thematic summaries or value-elevation commentary (`严禁起手凑数环境描写与结尾总结升华`). Earn full length purely by letting the live interaction play out across sufficient back-and-forth turns, concrete object handling, mid-exchange interruptions, and immediate physical/emotional reactions.\n",
    "after": "@CLIMAX.INK_BASE := Ratio-scaled expressive fullness (`65%–95%` of the `[min, max]` span) & zero structural templates:\n  1. DYNAMIC LENGTH TARGETING: For the active `<body min=\"MIN\" max=\"MAX\">` range (unless overridden by `@STOP.GATE` or an explicit short-scene request from `@U`), aim naturally for the `65%–95%` upper-middle zone of the span (`MIN + 0.65*(MAX - MIN)` to `MIN + 0.95*(MAX - MIN)`, strictly staying above `MIN`, and pushing to `90%–100%` of `MAX` during climaxes).\n  2. SCENE-LED FULLNESS: Let the scene earn its length through meaningful exchange, atmosphere, sensory attention, viewpoint-appropriate psychology, appearance and gesture, object handling, or the quiet duration of an established feeling. Several paragraphs may dwell on the same moment while making its texture clearer. Use setting details when they matter to perception or mood; an unhurried opening and a quiet ending are both available. Avoid interchangeable description, mandatory scenery openings, repeated explanations, and closing moral summaries. Do not invent extra events, escalations, decisions, or questions to meet a length target.\n"
  },
  {
    "identifier": "tisya_kb_techniques",
    "legacyDigest": "a32012b7ef5f970d52f432f63a8664e303497c883142daa8fadc7d37cbebe8ee",
    "before": "@TECH.PROGRESSION := Non-repetitive causal progression: ensure every paragraph introduces a new action beat, spatial shift, or emotional escalation; once a sensory detail or psychological state is established, immediately build upon it rather than paraphrasing it.\n",
    "after": "@TECH.PROGRESSION := Continuous, non-redundant scene development: preserve the causal and spatial thread while allowing attention to dwell on atmosphere, sensory impressions, appearance, gesture, and viewpoint-appropriate thought. An established feeling or relationship can remain steady across several paragraphs; detail may accumulate or gain new associations without a new action, location change, or emotional escalation. Move forward when the scene's actions and circumstances call for it, and trim synonymous padding rather than cutting meaningful stillness.\n"
  }
]);

export function resolveProseStyleText(identifier,text){
 const revision=PROSE_STYLE_REVISIONS.find(row=>row.identifier===identifier);
 if(!revision||digest(text)!==revision.legacyDigest)return text;
 return text.replace(revision.before,()=>revision.after);
}
