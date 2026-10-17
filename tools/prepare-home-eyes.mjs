import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),{createCanvas,loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const root=fileURLToPath(new URL('../',import.meta.url)),source=root+'tools/art-sources/male-eyes-r5.png',image=await loadImage(source);
// Imagegen authored eye detail; deterministic mask only places it inside the
// existing eyeballs. The original portrait and its eyelids remain untouched.
const c=createCanvas(440,260),ctx=c.getContext('2d');ctx.scale(4,4);ctx.translate(-245,-115);ctx.save();ctx.beginPath();
ctx.ellipse(292.8,146.9,8.1,6.25,.43,0,Math.PI*2);ctx.clip();ctx.drawImage(image,245,115,110,65);ctx.restore();
ctx.save();ctx.beginPath();ctx.ellipse(330.4,165.3,3.05,5.4,.37,0,Math.PI*2);ctx.clip();ctx.drawImage(image,250.6,114,110,65);ctx.restore();
fs.writeFileSync(root+'/assets/home-v1/male-eye-detail.webp',c.toBuffer('image/webp',100));
