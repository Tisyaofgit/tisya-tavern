const rotate=(x,n)=>(x<<n)|(x>>>(32-n));
export function uuid5(name){
 const ns=Uint8Array.from('6ba7b8119dad11d180b400c04fd430c8'.match(/../g),x=>parseInt(x,16)),text=new TextEncoder().encode(name),length=16+text.length,n=Math.ceil((length+9)/64)*64,b=new Uint8Array(n);b.set(ns);b.set(text,16);b[length]=128;const d=new DataView(b.buffer);d.setUint32(n-8,Math.floor(length*8/2**32));d.setUint32(n-4,length*8>>>0);
 let h=[0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0],w=new Uint32Array(80);
 for(let at=0;at<n;at+=64){for(let i=0;i<16;i++)w[i]=d.getUint32(at+i*4);for(let i=16;i<80;i++)w[i]=rotate(w[i-3]^w[i-8]^w[i-14]^w[i-16],1);let [a,c,e,g,j]=h;for(let i=0;i<80;i++){const f=i<20?(c&e)|(~c&g):i<40?c^e^g:i<60?(c&e)|(c&g)|(e&g):c^e^g,k=i<20?0x5a827999:i<40?0x6ed9eba1:i<60?0x8f1bbcdc:0xca62c1d6,t=(rotate(a,5)+f+j+k+w[i])>>>0;j=g;g=e;e=rotate(c,30);c=a;a=t;}h=h.map((v,i)=>(v+[a,c,e,g,j][i])>>>0);}
 const out=Uint8Array.from(h.slice(0,4).flatMap(v=>[v>>>24,(v>>>16)&255,(v>>>8)&255,v&255]));out[6]=(out[6]&15)|80;out[8]=(out[8]&63)|128;const s=[...out].map(v=>v.toString(16).padStart(2,'0')).join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');
}
