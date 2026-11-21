// Exact, non-overlapping text locations shared by source projection and
// native-boundary validation. Empty needles never manufacture a zero-width hit.
export function occurrences(text,needle){
 const found=[];
 if(!needle)return found;
 for(let at=0;(at=text.indexOf(needle,at))!==-1;at+=needle.length)found.push(at);
 return found;
}
