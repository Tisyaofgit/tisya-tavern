/* Display-only, registered prose blocks. Canonical media records stay in the codex. */
(function(root){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL=value=>{
    const s=String(value||'').trim();
    return /^(?:https?:\/\/|blob:|data:image\/(?:png|jpeg|webp|gif|avif);base64,)/i.test(s)||(!/[:\\\s<>]/.test(s)&&!s.startsWith('//'))?s:'';
  };
  const aliases=x=>Array.isArray(x)?x.filter(v=>typeof v==='string'):typeof x==='string'?x.split(/[,，、\n]/).map(s=>s.trim()).filter(Boolean):[];
  function fromState(state){
    const scope=state?.runtime?.scope||{};
    const rows=id=>Object.entries(state?.tables?.[id]||{}).map(([id,r])=>({id,...r.values})).filter(r=>['world_ref','session_ref','branch_ref'].every(k=>!r[k]||r[k]===scope[k]));
    return {scope,characters:rows('T_CHAR_DOSSIER').map(r=>({id:r.id,name:r.name||r.id,aliases:aliases(r.aliases??r['别名']).concat(aliases(r['昵称'])),avatar:r.avatar||''})),media:Object.fromEntries(rows('T_SYS_MEDIA_ASSETS').map(r=>[r.id,r]))};
  }
  function characterRegistry(getState,resolveAsset=x=>x){
    function resolve(label){
      const s=getState()||{},list=s.characters||[],name=label.trim();
      const exact=list.filter(c=>c.id===name);
      const found=exact.length?exact:list.filter(c=>c.name===name||aliases(c.aliases).includes(name));
      return found.length===1?{character:found[0],state:s}:null;
    }
    function avatar(label,mood=''){
      const hit=resolve(label);if(!hit)return {entity:null,url:'',status:'unresolved'};
      const {character:c,state:s}=hit,t={entity:c.id,field:''},M=root.TisyaMediaBindings;
      const links=M?M.links(s.media,t,s.scope,mood):[];
      const image=x=>M.assetType(x.media)==='image';
      // An exact mood image wins; another mood must never leak into this line.
      const selected=links.find(x=>image(x)&&x.binding.variant===mood&&mood&&['expression','avatar'].includes(x.binding.use))
        ||links.find(x=>image(x)&&!x.binding.variant&&x.binding.use==='avatar')
        ||links.find(x=>image(x)&&x.binding.use==='portrait');
      const legacy=Object.values(s.media||{}).find(m=>m.entity_ref===c.id&&m.kind==='头像'&&!m.display_variant)
        ||Object.values(s.media||{}).find(m=>m.entity_ref===c.id&&m.kind==='立绘'&&!m.display_variant);
      const locator=selected?.media.asset_locator||legacy?.asset_locator||c.avatar||'';
      return {entity:c.id,url:safeURL(resolveAsset(locator)),status:locator?'bound':'missing',asset:selected?.id||null,presentation:M?.imagePresentation(selected?.media||legacy,selected?.binding)};
    }
    return {resolve,avatar};
  }
  // Code and authored HTML retain their own syntax and cannot create dialogue.
  function protectedSpans(source){
    const spans=[];let fence=null,offset=0;
    for(const line of source.match(/[^\n]*\n|[^\n]+$/g)||[]){
      const m=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line);
      if(fence){if(m&&m[1][0]===fence.char&&m[1].length>=fence.length&&!m[2].trim()){spans.push([fence.start,offset+line.length]);fence=null;}}
      else if(m)fence={char:m[1][0],length:m[1].length,start:offset};
      else if(/^(?: {4}|\t)/.test(line))spans.push([offset,offset+line.length]);
      offset+=line.length;
    }
    if(fence)spans.push([fence.start,source.length]);
    const inside=i=>spans.some(([a,b])=>i>=a&&i<b);
    // Preserve paired HTML elements (including nested same-name elements).
    const stack=[];const tags=/<\/?([a-zA-Z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>|<!--[\s\S]*?(?:-->|$)/g;
    for(const m of source.matchAll(tags)){
      if(inside(m.index))continue;const tag=m[1]?.toLowerCase();
      if(!tag){spans.push([m.index,m.index+m[0].length]);continue;}
      if(m[0].startsWith('</')){const i=stack.findLastIndex(x=>x.tag===tag);if(i>=0){spans.push([stack[i].start,m.index+m[0].length]);stack.splice(i);}else spans.push([m.index,m.index+m[0].length]);}
      else if(/\/$/.test(m[0].slice(0,-1))||['img','hr','br','input','meta','link','source','wbr'].includes(tag))spans.push([m.index,m.index+m[0].length]);
      else stack.push({tag,start:m.index});
    }
    if(stack.length)spans.push([stack[0].start,source.length]);
    for(let i=0;i<source.length;i++){
      if(source[i]!=='`'||inside(i))continue;let j=i+1;while(source[j]==='`')j++;const mark=source.slice(i,j);let end=source.indexOf(mark,j);
      while(end>=0&&(source[end-1]==='`'||source[end+mark.length]==='`'))end=source.indexOf(mark,end+mark.length);
      if(end>=0){spans.push([i,end+mark.length]);i=end+mark.length-1;}
    }
    return spans;
  }
  function dialogueAt(source,start){
    const m=/^【([^\[\]【】#\r\n]+)#([^【】#\r\n]+)】[ \t]*“/.exec(source.slice(start));
    if(!m||!m[1].trim()||!m[2].trim())return null;let i=start+m[0].length,depth=1;
    for(;i<source.length;i++){
      if(source[i]==='\\'){i++;continue;}
      if(source[i]==='“')depth++;
      if(source[i]==='”'&&!--depth)break;
      // Stop at another marker rather than swallowing an unfinished streamed line.
      if(source.startsWith('【',i)&&/^【[^\n】]+#[^\n】]+】/.test(source.slice(i)))return null;
    }
    if(depth)return null;
    return {start,end:i+1,name:m[1].trim(),mood:m[2].trim(),text:source.slice(start+m[0].length,i)};
  }
  function thoughtAt(source,start){
    let open=start,name='',mood='';
    if(source[start]==='【'){
      const m=/^【([^\[\]【】#\r\n]+)#([^【】#\r\n]+)】\s*■/.exec(source.slice(start));
      if(!m||!m[1].trim()||!m[2].trim())return null;
      name=m[1].trim();mood=m[2].trim();open=start+m[0].length-1;
    }else if(source[start]!=='■')return null;
    // A named block is one unit, including when its prefix is escaped or incomplete.
    else if(/【[^\[\]【】#\r\n]+#[^【】#\r\n]+】\s*$/.test(source.slice(0,start)))return null;
    for(let i=open+1;i<source.length;i++){
      if(source[i]==='\\'){i++;continue;}
      if(source[i]==='■')return i>open+1?{start,end:i+1,name,mood,text:source.slice(open+1,i)}:null;
      if(source[i]==='【'&&/^【[^\n】]+#[^\n】]+】/.test(source.slice(i)))return null;
    }
    return null;
  }
  function createRegistry(){
    const blocks=new Map();
    return {
      register(id,entry){blocks.set(id,{...entry,id});return()=>blocks.delete(id);},
      entries:()=>[...blocks.values()],
      project(source,options={}){
        const plain=options.literal?s=>esc(s.replace(/^\n+|\n+$/g,'')):s=>s;if(options.enabled===false)return plain(source);const spans=protectedSpans(source);let out='',cursor=0;
        for(let i=0;i<source.length;i++){
          const span=spans.find(([a,b])=>i>=a&&i<b);if(span){i=span[1]-1;continue;}
          let back=i;while(back&&source[back-1]==='\\')back--;if((i-back)%2)continue;
          for(const entry of blocks.values()){
            if(options[entry.option]===false||!(Array.isArray(entry.start)?entry.start:[entry.start]).includes(source[i]))continue;
            const match=entry.match(source,i);if(!match||spans.some(([a,b])=>a<match.end&&b>i))continue;
            out+=plain(source.slice(cursor,i))+entry.render(match,options);cursor=match.end;i=cursor-1;break;
          }
        }
        return out+plain(source.slice(cursor));
      }
    };
  }
  const registry=createRegistry();
  registry.register('tisya.content.dialogue',{start:'【',option:'dialogue',match:dialogueAt,render(m,o){
    const binding=o.characters?.avatar(m.name,m.mood)||{entity:null,url:''};
    const p=binding.presentation||root.TisyaMediaBindings.imagePresentation();
    const avatar=binding.url?'<img class="tisya-dialogue-avatar" src="'+esc(binding.url)+'" alt="'+esc(m.name)+'的头像" loading="lazy">':'';
    return '<span class="tisya-dialogue" data-tisya-block="dialogue" data-portrait-layout="'+p.layout+'" data-portrait-frame="'+p.frame+'" data-portrait-composition="'+p.composition+'" data-portrait-background="'+p.background+'" data-portrait-known="'+p.known+'" style="--portrait-focus-y:'+p.focusY+'%;--portrait-aspect:'+(p.aspect||'.75')+'"'+(binding.entity?' data-entity="'+esc(binding.entity)+'"':'')+'><span class="tisya-dialogue-portrait"><span class="tisya-dialogue-initial" aria-hidden="true">'+esc(Array.from(m.name)[0]||'？')+'</span>'+avatar+'</span><span class="tisya-dialogue-main"><span class="tisya-dialogue-heading"><strong>'+esc(m.name)+'</strong><span class="tisya-dialogue-mood">'+esc(m.mood)+'</span></span><span class="tisya-dialogue-text">'+esc('“'+m.text+'”')+'</span></span></span>';
  }});
  registry.register('tisya.content.thought',{start:['【','■'],option:'thought',match:thoughtAt,render(m,o){
    const entity=m.name?o.characters?.resolve(m.name)?.character.id:null;
    const heading=m.name?'<strong class="tisya-thought-name">'+esc(m.name)+'</strong><span class="tisya-thought-mood">'+esc(m.mood)+'</span><span class="tisya-thought-kind">心声</span>':'心声';
    return '<span class="tisya-inline-thought" data-tisya-block="thought"'+(entity?' data-entity="'+esc(entity)+'"':'')+'><span class="tisya-thought-label">'+heading+'</span><span>'+esc(m.text)+'</span></span>';
  }});
  async function hydratePortrait(img){
    const block=img.closest?.('[data-tisya-block="dialogue"]'),M=root.TisyaMediaBindings;
    if(!block||block.dataset.portraitKnown==='true')return;
    const url=img.currentSrc||img.src,info=await M.inspectImage(url);
    if(!block.isConnected||(img.currentSrc||img.src)!==url)return;
    const p=M.imagePresentation({}, {presentation:{composition:block.dataset.portraitComposition,background:block.dataset.portraitBackground}},{...info,width:info.width||img.naturalWidth,height:info.height||img.naturalHeight});
    block.dataset.portraitLayout=p.layout;block.dataset.portraitFrame=p.frame;block.dataset.portraitKnown=String(p.known);block.style.setProperty('--portrait-aspect',p.aspect||'.75');
  }
  if(root.document){
    if(root.__tisyaPortraitLoad)root.document.removeEventListener('load',root.__tisyaPortraitLoad,true);
    root.__tisyaPortraitLoad=e=>{if(e.target?.matches?.('.tisya-dialogue-avatar'))hydratePortrait(e.target);};
    root.document.addEventListener('load',root.__tisyaPortraitLoad,true);
    if(root.__tisyaPortraitError)root.document.removeEventListener('error',root.__tisyaPortraitError,true);
    root.__tisyaPortraitError=e=>{if(e.target?.matches?.('.tisya-dialogue-avatar'))e.target.remove();};
    root.document.addEventListener('error',root.__tisyaPortraitError,true);
    root.document.querySelectorAll('.tisya-dialogue-avatar').forEach(img=>{if(img.complete&&img.naturalWidth)hydratePortrait(img);});
  }
  const api={registry,createRegistry,characterRegistry,fromState,protectedSpans,dialogueAt,thoughtAt,safeURL,hydratePortrait};
  root.TisyaDialogueBlocks=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
