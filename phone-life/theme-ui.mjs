// Theme choices only select safe local tokens and an owned media ID.
export const PHONE_THEMES=Object.freeze({
 world:{name:'跟随世界',description:'使用当前世界的画风',background:'#edf2f3',panel:'#ffffff',text:'#263442',accent:'#527e9a',muted:'#667b87',line:'#dce5e9',radius:19,font:'sans'},
 mist:{name:'晨雾',description:'清透的蓝灰与柔光',background:'#e7eff3',panel:'#f9fcff',text:'#244454',accent:'#46758d',muted:'#657d89',line:'#d2e0e7',radius:22,font:'sans'},
 night:{name:'夜航',description:'深色界面与月光',background:'#101b29',panel:'#1a293c',text:'#e3edf6',accent:'#8bbdd5',muted:'#a2b5c7',line:'#35485e',radius:18,font:'sans'},
 paper:{name:'旧信',description:'暖纸、墨色与细边框',background:'#e9dfcf',panel:'#fbf5e9',text:'#493c30',accent:'#8d603f',muted:'#7a6a58',line:'#d8c9b2',radius:7,font:'serif'},
 forest:{name:'林间',description:'低饱和绿与柔和米白',background:'#e1ebe3',panel:'#f6faf3',text:'#294638',accent:'#45745e',muted:'#607b69',line:'#c8d9cb',radius:24,font:'sans'},
});
const color=value=>typeof value==='string'&&/^#[a-f\d]{3,8}$/i.test(value)?value:null;
export function phoneThemeTokens(world={},selection={}){
 const preset=Object.hasOwn(PHONE_THEMES,selection.preset)?selection.preset:'world',base=PHONE_THEMES[preset];
 const t={...base};
 if(preset==='world')for(const key of ['background','panel','text','accent'])if(color(world[key]))t[key]=world[key];
 if(preset==='world'&&Number.isInteger(world.radius)&&world.radius>=0&&world.radius<=40)t.radius=world.radius;
 return {...t,preset};
}
export function applyPhoneTheme(element,world={},selection={},mediaUrl=()=> ''){
 const t=phoneThemeTokens(world,selection),url=selection.backgroundId?mediaUrl(selection.backgroundId):'';
 const safeUrl=typeof url==='string'&&/^blob:[^\s"'()]+$/.test(url)?url:'';
 const overlay=Number.isFinite(selection.overlay)?Math.max(0,Math.min(80,selection.overlay)):25;
 const tokens={'--bg':t.background,'--paper':t.panel,'--ink':t.text,'--accent':t.accent,'--muted':t.muted,'--line':t.line,'--soft':t.background,'--radius':t.radius+'px','--phone-radius':t.radius+'px','--phone-font':t.font==='serif'?'Georgia,"Noto Serif CJK SC","Songti SC",serif':'-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans CJK SC",sans-serif','--phone-wallpaper':safeUrl?`linear-gradient(rgb(0 0 0 / ${overlay/100}),rgb(0 0 0 / ${overlay/100})),url("${safeUrl}")`:'none','--phone-wallpaper-fit':selection.fit==='contain'?'contain':'cover'};
 for(const [key,value]of Object.entries(tokens))element.style.setProperty(key,value);
 element.dataset.phoneTheme=t.preset;element.dataset.phoneWallpaper=safeUrl?'true':'false';
 return t;
}
export function renderPhoneTheme(state,world,h){
 const selected=state.media.theme??{preset:'world',backgroundId:null,fit:'cover',overlay:25},own=new Set([state.social.activeAccountId,state.media.ownerId,state.config?.subjectId].filter(Boolean));
 const photos=state.media.photos.filter(p=>own.has(p.ownerId)&&p.source==='file'&&!p.deletedAt&&!p.purged&&!p.mime?.startsWith('video/'));
 const e=h.esc;
 return `<section class="phone-theme-settings"><div class="app-heading"><h2>手机画风</h2><p>外观选择随当前手机保存，背景只使用自己的媒体原件。</p></div><div class="theme-grid">${Object.entries(PHONE_THEMES).map(([id,t])=>h.btn(`<span class="theme-swatch" style="--swatch-bg:${t.background};--swatch-panel:${t.panel};--swatch-accent:${t.accent}"><i></i><i></i><i></i></span><strong>${e(t.name)}</strong><small>${e(t.description)}</small>${selected.preset===id||(!selected.preset&&id==='world')?'<span class="theme-selected">已选</span>':''}`,'theme.preset',{preset:id},'theme-choice')).join('')}</div><form class="card theme-background-form" data-action="theme.save"><h3>个人背景</h3><label class="field">背景图片<select name="backgroundId"><option value="">不使用图片</option>${photos.map(p=>`<option value="${e(p.id)}"${selected.backgroundId===p.id?' selected':''}>${e(p.name)}</option>`).join('')}</select></label><label class="field">显示方式<select name="fit"><option value="cover"${selected.fit!=='contain'?' selected':''}>铺满，允许边缘裁切</option><option value="contain"${selected.fit==='contain'?' selected':''}>显示完整图片</option></select></label><label class="field">背景遮罩强度<input name="overlay" type="range" min="0" max="80" step="5" data-number value="${e(selected.overlay??25)}"></label><div class="row"><button class="primary" type="submit">保存背景</button>${h.btn('导入背景图片','file.image')}</div><p class="muted small">设为背景不会公开照片，也不会改变原图。${photos.length?'':'尚未导入可用的背景图片。'}</p></form></section>`;
}
