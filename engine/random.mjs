import initial from './random-default.json' with {type:'json'};
import {clone,fail} from './common.mjs';
// CPython Random.getstate v3 / MT19937. Imported saves keep the exact next die.
export function roll(state,sides){
 if(!Number.isSafeInteger(sides)||sides<=0)fail('CHECK_SIDES','骰面须为正整数');
 const saved=state.rng_state??=clone(initial);if(saved[0]!==3||saved[1]?.length!==625)fail('RNG_STATE','随机数状态格式不受支持');const a=saved[1];
 const uint=()=>{let index=a[624];if(index>=624){for(let i=0;i<624;i++){const y=(a[i]&0x80000000)|(a[(i+1)%624]&0x7fffffff);a[i]=(a[(i+397)%624]^(y>>>1)^((y&1)?0x9908b0df:0))>>>0;}index=0;}let y=a[index++];a[624]=index;y^=y>>>11;y^=(y<<7)&0x9d2c5680;y^=(y<<15)&0xefc60000;y^=y>>>18;return y>>>0;};
 const bits=BigInt(sides).toString(2).length;let v;do{v=0n;for(let at=0;at<bits;at+=32){const remaining=Math.min(32,bits-at);v|=BigInt(uint()>>>(32-remaining))<<BigInt(at);}}while(v>=BigInt(sides));return Number(v)+1;
}
