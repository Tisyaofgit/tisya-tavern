'use strict';
// Only view state crosses the opaque card boundary; it cannot request host work.
const CARD_MOTION_CSS='html[data-tisya-card-paused] *,html[data-tisya-card-paused] *::before,html[data-tisya-card-paused] *::after{animation-play-state:paused!important;transition:none!important}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-play-state:paused!important;transition:none!important}}';
function validCardFolds(value){return Array.isArray(value)&&value.length<=2048&&value.every(v=>typeof v==='boolean');}
module.exports={CARD_MOTION_CSS,validCardFolds};
