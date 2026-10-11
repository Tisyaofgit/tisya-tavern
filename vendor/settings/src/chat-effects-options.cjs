'use strict';
// Optional fields on the existing extensions display record. Resolving a
// registered default never writes it into an existing chat or saved profile.
const EFFECTS=Object.freeze({水纹:'water',涟漪:'ripples',斜雨:'rain',落雪:'snow',萤火:'fireflies'});
const CHAT_FIELDS=Object.freeze({背景特效模式:['自动轮换','自选组合','关闭'],水纹:[true,false],涟漪:[true,false],斜雨:[true,false],落雪:[true,false],萤火:[true,false],点触涟漪:[true,false],上条落点:['顶部','底部']});
const CHAT_DEFAULTS=Object.freeze({背景特效模式:'自选组合',水纹:true,涟漪:true,斜雨:false,落雪:false,萤火:true,点触涟漪:true,上条落点:'底部'});
function selectedEffects(values,time){
 if(values.背景特效模式==='关闭')return [];
 if(values.背景特效模式==='自动轮换'){
  const weather=['fireflies','rain','snow',null][Math.floor(time/22)%4];
  return ['water','ripples',...(weather?[weather]:[])];
 }
 if(values.背景特效模式!=='自选组合')throw Error('TISYA_EFFECT_MODE');
 return Object.entries(EFFECTS).filter(([key])=>values[key]===true).map(([,id])=>id);
}
module.exports={EFFECTS,CHAT_FIELDS,CHAT_DEFAULTS,selectedEffects};
