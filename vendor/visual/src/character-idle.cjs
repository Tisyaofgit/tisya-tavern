'use strict';

// Presentation clock only. Sparse blinks, a slow local snake sway and fin beat.
// The phone, hands and interaction targets never move with the idle pose.
function characterIdlePose(elapsed,reduced=false){
  if(reduced)return {frame:0,floatY:0,tailFrame:0,blink:false,angle:0,expression:'neutral',snakePhase:0,tailPhase:0,snakeGain:0,tailGain:0,leaningGain:0,snakeClock:0,leaningAngle:0,leaningLift:0};
  const t=Math.max(0,elapsed),blinkTime=t%17200;
  const blink=[2800,7400,13200].some(start=>blinkTime>=start&&blinkTime<start+160);
  return {frame:blink?1:16+Math.round(t%6400/400)%16,
    floatY:-1.2*Math.sin(t*Math.PI*2/5800),
    tailFrame:Math.round(t%8000/500)%16,blink,angle:0,expression:blink?'blink':'neutral',
    snakePhase:t*Math.PI*2/6400,tailPhase:t*Math.PI*2/8000,snakeGain:1,tailGain:1,leaningGain:1,snakeClock:t,leaningAngle:0,leaningLift:0};
}
module.exports={characterIdlePose};
