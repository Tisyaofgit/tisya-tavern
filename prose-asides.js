// Display-only projections of the existing ◆translation◆ / ■thought■ wire.
// Run on the sanitized host DOM, never on HTML strings or message storage.
const plainTags=new Set(['P','DIV','SECTION','EM','STRONG','B','I','U','S','SPAN','Q','BR']);
const blocks=new Set(['P','DIV','SECTION']);
const attr='data-tisya-aside';

export function decorateAsides(root,options={}){
 if(options.标记美化===false)return 0;
 const doc=root.ownerDocument,runs=[];let run=null,count=0;
 const breakRun=()=>{run=null;};
 const gap=()=>{if(run)run.text+='\n\n';};
 function walk(node){
  if(node.nodeType===3){if(!run){run={text:'',leaves:[]};runs.push(run);}run.leaves.push({node,start:run.text.length,end:run.text.length+node.length});run.text+=node.data;return;}
  if(node.nodeType!==1){breakRun();return;}
  // Authored cards, links, controls, media and code retain complete ownership.
  if(!plainTags.has(node.tagName)||node.attributes.length){breakRun();return;}
  if(blocks.has(node.tagName)||node.tagName==='BR')gap();
  for(const child of node.childNodes)walk(child);
  if(blocks.has(node.tagName)||node.tagName==='BR')gap();
 }
 for(const node of root.childNodes)walk(node);
 for(const group of runs){
  const pairs=[];const text=group.text;
  for(let i=0;i<text.length;i++){
   const mark=text[i];if(mark!=='◆'&&mark!=='■')continue;
   const end=text.indexOf(mark,i+1);if(end<0)continue;
   if(text.slice(i+1,end).trim()&&(mark!=='■'||options.标记内心!==false))pairs.push({start:i,end,kind:mark==='◆'?'translation':'thought'});
   i=end;
  }
  // Later ranges first: offsets in earlier text nodes remain stable.
  for(const pair of pairs.reverse()){
   const first=group.leaves.find(x=>x.start<=pair.start&&x.end>pair.start),last=group.leaves.find(x=>x.start<=pair.end&&x.end>pair.end);
   const range=doc.createRange();range.setStart(first.node,pair.start-first.start+1);range.setEnd(last.node,pair.end-last.start);
   const content=range.extractContents();
   // Keep all wrappers phrasing-safe even when a marker spans host paragraphs.
   for(const node of [...content.querySelectorAll('p,div,section')]){const span=doc.createElement('span');span.className='tisya-aside-paragraph';span.append(...node.childNodes);node.replaceWith(span);}
   const wrapper=doc.createElement('span');wrapper.setAttribute(attr,pair.kind);wrapper.setAttribute('role','note');wrapper.setAttribute('aria-label',pair.kind==='thought'?'心声':'翻译');
   const label=doc.createElement('span');label.className='tisya-aside-label';label.setAttribute('aria-hidden','true');label.textContent=pair.kind==='thought'?'心声':'译';
   const body=doc.createElement('span');body.className='tisya-aside-content';body.append(content);
   // Nested mixed markers are independently projected within their own content.
   count+=decorateAsides(body,options);
   wrapper.append(label,body);
   // Extraction leaves adjacent delimiters in one leaf, or the closing
   // delimiter at offset zero of the surviving last leaf.
   range.setStart(first.node,pair.start-first.start);range.setEnd(last.node,first.node===last.node?pair.start-first.start+2:1);
   range.deleteContents();range.insertNode(wrapper);count++;
  }
 }
 return count;
}

export const ASIDE_CSS=`
[data-tisya-prose-root] [data-tisya-aside]{--aside-gold:var(--tisya-gold,#dfc48c);box-sizing:border-box;position:relative;display:block;isolation:isolate;text-indent:0;white-space:normal;max-width:100%;overflow-wrap:anywhere;text-align:start;font-style:normal;font-weight:400;letter-spacing:.035em}
[data-tisya-aside] .tisya-aside-content{position:relative;display:block;min-width:0;white-space:pre-wrap;z-index:1;line-height:1.85}
[data-tisya-aside] .tisya-aside-paragraph{display:block;margin:0 0 .65em;white-space:pre-wrap}
[data-tisya-aside] .tisya-aside-paragraph:last-child{margin-bottom:0}
[data-tisya-aside] .tisya-aside-label{user-select:none;color:var(--aside-gold);font-style:normal;line-height:1}
[data-tisya-prose-root] [data-tisya-aside=translation]{display:grid;grid-template-columns:1.6em minmax(0,1fr);gap:.65em;align-items:start;margin:.25em 0 .9em 1.05em;padding:.2em 0 .15em 1.25em;font-size:.88em;color:var(--tisya-ink,#e9e4d0)}
[data-tisya-aside=translation]::before{content:'';position:absolute;left:0;top:-.75em;width:.85em;height:1.9em;border-left:1px solid var(--aside-gold);border-bottom:1px solid var(--aside-gold);opacity:.65}
[data-tisya-aside=translation]::after{content:'';position:absolute;left:-.23em;top:-1.2em;width:.42em;height:.42em;box-sizing:border-box;border:1px solid var(--aside-gold);transform:rotate(45deg);background:#09291f}
[data-tisya-aside=translation]>.tisya-aside-label{display:grid;place-items:center;width:1.6em;height:1.7em;margin-top:.08em;border:1px solid #bca57077;border-radius:.3em .08em .3em .08em;font-size:.9em;background:#21453530}
[data-tisya-aside=translation]>.tisya-aside-content::after{content:'';display:inline-block;width:2.2em;height:1px;margin:0 0 .3em .5em;background:linear-gradient(90deg,#d8bd7c80,transparent)}
[data-tisya-prose-root] [data-tisya-aside=thought]{margin:1.5em 0 1.65em;padding:1em .7em 1.3em 3.4em;min-height:7.8em;overflow:clip;color:var(--tisya-ink,#eee6cf);background:radial-gradient(ellipse at 83% 85%,#a4c69c15,transparent 30%),radial-gradient(ellipse at 76% 53%,#4484761c,transparent 58%)}
[data-tisya-aside=thought]::before{content:'';position:absolute;z-index:-1;pointer-events:none;inset:44% .35em .25em 2.8em;border-bottom:1px solid #c7b77877;border-radius:0 0 58% 40%;box-shadow:0 8px 12px -12px #e2dba5}
[data-tisya-aside=thought]::after{content:'';position:absolute;z-index:-1;pointer-events:none;right:.65em;bottom:.7em;width:38%;height:55%;border-bottom:1px solid #d4c18b55;border-radius:0 0 95% 10%;background:radial-gradient(ellipse at 75% 85%,#e4dda018,transparent 40%)}
[data-tisya-aside=thought]>.tisya-aside-label{position:absolute;left:.25em;top:1.25em;box-sizing:border-box;width:1.85em;min-height:4.25em;padding:.72em .3em;writing-mode:vertical-rl;letter-spacing:.48em;border:1px solid #c8b37599;border-radius:.6em .6em .55em .55em;background:linear-gradient(135deg,#1a493c88,#08291e77);font-size:.84em;text-align:center;box-shadow:inset 0 0 10px #c7b87508}
[data-tisya-aside=thought]>.tisya-aside-label::before{content:'';position:absolute;left:.35em;top:-1.25em;width:.95em;height:.95em;border-radius:50%;box-shadow:-.18em .12em 0 -.03em #dfc58f;transform:rotate(-26deg)}
[data-tisya-aside=thought]>.tisya-aside-label::after{content:'◇';position:absolute;left:calc(50% - .2em);bottom:-2.15em;width:.4em;height:1.9em;padding-top:1.35em;box-sizing:border-box;border-top:1px solid #bca67588;background:linear-gradient(#bca67588,#bca67588) center top/1px 1.4em no-repeat;writing-mode:horizontal-tb;font-size:.65em;line-height:1;letter-spacing:0}
`;
