// Keep the same public-body projection and its regex provenance in lockstep.
// Offsets refer to the final displayed body, after CDATA and numbering removal.
export function projectBodyRuns(runs,readParagraphs,{tolerant=false}={}){
 const slice=(rows,start,end)=>{const out=[];let at=0;for(const row of rows){const stop=at+row.text.length;if(stop>start&&at<end)out.push({...row,text:row.text.slice(Math.max(0,start-at),end-at)});at=stop;if(at>=end)break;}return out;};
 let rows=runs.filter(r=>r.owner==='body'&&!r.boundary).map(r=>({text:r.text,ruleName:r.ruleName??null}));
 const raw=rows.map(r=>r.text).join(''),unwrapped=[];let cursor=0;
 for(const match of raw.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)){unwrapped.push(...slice(rows,cursor,match.index),...slice(rows,match.index+9,match.index+match[0].length-3));cursor=match.index+match[0].length;}
 unwrapped.push(...slice(rows,cursor,raw.length));rows=unwrapped;
 const body=rows.map(r=>r.text).join('');let paragraphs;
 try{paragraphs=readParagraphs(body);}catch(error){if(!tolerant)throw error;}
 if(paragraphs?.length)rows=paragraphs.flatMap((p,index)=>[...(index?[{text:'\n\n',ruleName:null}]:[]),...slice(rows,p.start,p.end)]);
 return rows;
}
