// A short pressure-release chirp, created only by an eligible user gesture.
// Peak gain 0.009 (below -40 dBFS); no ambient playback or network resources.
export function createBubbleAudio(document,{onError=()=>{},random=Math.random}={}) {
 const win=document.defaultView;let context=null,enabled=true,dead=false,last=-Infinity,pending=0;
 const voices=new Set();
 function silence(){pending++;for(const voice of voices){try{voice.stop();}catch{}voice.disconnect();}voices.clear();}
 async function play() {
  if(dead||!enabled||document.hidden)return false;
  const now=win.performance.now();if(now-last<100)return false;last=now;
  const generation=++pending; // A delayed unlock never queues a burst of old taps.
  try{
   const Audio=win.AudioContext||win.webkitAudioContext;if(!Audio)throw Error('当前环境不支持点触音效，可在外观中关闭音效。');
   context??=new Audio();await context.resume();
   if(dead||!enabled||document.hidden||generation!==pending)return false;
   const start=context.currentTime,osc=context.createOscillator(),gain=context.createGain();
   osc.type='sine';osc.frequency.setValueAtTime(540+random()*110,start);osc.frequency.exponentialRampToValueAtTime(150+random()*30,start+.055);
   gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.009,start+.004);gain.gain.exponentialRampToValueAtTime(.0001,start+.055);gain.gain.linearRampToValueAtTime(0,start+.065);
   osc.connect(gain);gain.connect(context.destination);voices.add(osc);
   osc.onended=()=>{voices.delete(osc);osc.disconnect();gain.disconnect();};osc.start(start);osc.stop(start+.07);return true;
  }catch(error){if(!dead&&enabled){enabled=false;onError(error);}return false;}
 }
 const hidden=()=>{if(document.hidden){silence();if(context?.state==='running')void context.suspend().catch(onError);}};
 document.addEventListener('visibilitychange',hidden);
 return {play,setEnabled(value){enabled=!!value;if(!enabled)silence();},dispose(){if(dead)return;dead=true;enabled=false;silence();document.removeEventListener('visibilitychange',hidden);if(context)void context.close().catch(onError);context=null;}};
}
