// Native card rendering may append its status marker after GENERATION_ENDED.
// The display suffix is not a narrative edit or a new selected candidate.
export const isOnePassReply=s=>typeof s==='string'&&/^\s*<reply\b[^>]*\bid=["']tisya-onepass-1["']/.test(s);
export function onePassStoryText(value){
 const text=String(value??'');if(!isOnePassReply(text))return text;
 const ending=/<\/reply>\s*(?:<StatusPlaceHolderImpl\s*\/>\s*)?$/.exec(text);
 return ending?text.slice(0,ending.index+8):text;
}
