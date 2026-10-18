// One registry drives selection, audition and pointer feedback. No ambient sound.
export const SOUNDS = Object.freeze({bubble:'气泡',drop:'水滴',splash:'溅落',piano:'琴键'});

export function synthesizeTouch(context, type, volume=.55, random=Math.random) {
  if (!Object.hasOwn(SOUNDS,type)) throw Error('未知音色');
  if (!Number.isFinite(volume)||volume<0||volume>1) throw Error('音量须在0—100%之间');
  const t=context.currentTime, voices=[], nodes=[];
  const master=context.createGain();master.gain.value=volume*.18;master.connect(context.destination);nodes.push(master);
  function envelope(node,peak,attack,decay,delay=0) {
    const gain=context.createGain(),start=t+delay;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(peak,start+attack);
    gain.gain.exponentialRampToValueAtTime(.0001,start+decay);gain.gain.linearRampToValueAtTime(0,start+decay+.015);
    node.connect(gain);gain.connect(master);nodes.push(gain,node);voices.push(node);
    node.start(start);node.stop(start+decay+.02);
  }
  function tone(a,b,peak,attack,decay,delay=0) {
    const osc=context.createOscillator();osc.type='sine';osc.frequency.setValueAtTime(a,t+delay);
    if(b!==a)osc.frequency.exponentialRampToValueAtTime(b,t+delay+Math.min(decay,.14));
    envelope(osc,peak,attack,decay,delay);
  }
  if(type==='bubble') tone(620+random()*60,165,.8,.004,.09);
  if(type==='drop') {tone(820,1580,.75,.002,.16);tone(2050,1100,.16,.003,.12,.012);}
  if(type==='splash') {
    const frames=Math.ceil(context.sampleRate*.26),buffer=context.createBuffer(1,frames,context.sampleRate),out=buffer.getChannelData(0);
    let low=0;for(let i=0;i<frames;i++){const white=random()*2-1;low=.86*low+.14*white;out[i]=low*2.4;}
    const noise=context.createBufferSource();noise.buffer=buffer;envelope(noise,.7,.012,.26);
    tone(680,310,.24,.004,.18);tone(1250,730,.12,.004,.15,.045);
  }
  if(type==='piano') {
    const f=[261.626,293.665,329.628,391.995,440][Math.floor(random()*5)];
    // A struck note with independently decaying partials; explicitly synthesized.
    [1,2.001,3.004,4.01,5.02].forEach((m,i)=>tone(f*m,f*m,[.65,.22,.10,.035,.015][i],.003,[.95,.65,.42,.24,.15][i]));
  }
  let stopped=false,remaining=voices.length;
  function dispose(){if(stopped)return;stopped=true;for(const v of voices){try{v.stop();}catch{}}for(const n of nodes)n.disconnect();}
  for(const v of voices)v.onended=()=>{if(--remaining===0)dispose();};
  return {dispose,duration:type==='piano'?.98:type==='splash'?.3:.2};
}

export function createTouchAudio(document,{onError=()=>{},random=Math.random}={}) {
  const win=document.defaultView;let context=null,enabled=true,dead=false,generation=0,last=-Infinity;
  const active=new Set();
  function silence(){generation++;for(const voice of active)voice.dispose();active.clear();}
  async function play(type='drop',volume=.55) {
    if(dead||!enabled||document.hidden)return false;
    if(win.performance.now()-last<90)return false;last=win.performance.now();const token=++generation;
    try {
      if(!Object.hasOwn(SOUNDS,type))throw Error('未知音色');
      const Audio=win.AudioContext||win.webkitAudioContext;if(!Audio)throw Error('当前浏览器不支持音效');
      context??=new Audio();await context.resume();
      if(dead||!enabled||document.hidden||token!==generation)return false;
      // Avoid overlapping taps becoming unexpectedly loud.
      for(const voice of active)voice.dispose();active.clear();
      const voice=synthesizeTouch(context,type,volume,random);active.add(voice);
      win.setTimeout(()=>active.delete(voice),voice.duration*1000+150);return true;
    }catch(error){onError(error);return false;}
  }
  const hidden=()=>{if(document.hidden){silence();if(context?.state==='running')void context.suspend().catch(onError);}};
  document.addEventListener('visibilitychange',hidden);
  return {play,setEnabled(value){enabled=!!value;if(!enabled)silence();},dispose(){if(dead)return;dead=true;silence();document.removeEventListener('visibilitychange',hidden);if(context)void context.close().catch(onError);}};
}
