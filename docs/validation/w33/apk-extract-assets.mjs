import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {dirname,posix} from 'node:path';
const root='/workspace/scratch/289ae625ecae/apk-inspect';
const b=readFileSync(root+'/extracted/lib/arm64-v8a/libtauritavern_lib.so');
const manifestPath=root+'/decoded-manifest.json';
const results=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):[];
const q64=(offset)=>Number(b.readBigUInt64LE(offset));
const phoff=q64(32),phentsize=b.readUInt16LE(54),phnum=b.readUInt16LE(56),segments=[];
for(let i=0;i<phnum;i++){const p=phoff+i*phentsize;if(b.readUInt32LE(p)===1)segments.push({offset:q64(p+8),address:q64(p+16),size:q64(p+32)});}
function fileOffset(address){const segment=segments.find(s=>address>=s.address&&address<s.address+s.size);if(!segment)throw new Error('No file mapping for virtual address');return segment.offset+address-segment.address;}
function relocationFor(pathOffset,pathLength){
 const pointer=Buffer.alloc(8);pointer.writeBigUInt64LE(BigInt(pathOffset));let from=0;
 while(from<b.length){const a=b.indexOf(pointer,from);if(a<0)break;from=a+8;if(a<16||a+24>=b.length)continue;
  // ELF64 Rela {r_offset, r_info, r_addend}: R_AARCH64_RELATIVE = 1027.
  if(q64(a-8)!==1027)continue;const keyAddress=q64(a-16),dataAddress=q64(a+8);if(dataAddress!==keyAddress+16||q64(a+16)!==1027)continue;
  let keyEntry;try{keyEntry=fileOffset(keyAddress);}catch{continue;}if(q64(keyEntry+8)!==pathLength)continue;
  const dataOffset=q64(a+24),compressedSize=q64(keyEntry+24);if(compressedSize<=0||dataOffset+compressedSize>b.length)continue;
  return {dataOffset,compressedSize,keyAddress,relocationOffset:a-16};
 }
 return null;
}
export function extract(path){
 const prior=results.find(r=>r.path===path);if(prior)return readFileSync(prior.target,'utf8');
 let from=0;
 while(from<b.length){
  const a=b.indexOf(path,from);if(a<0)break;from=a+Buffer.byteLength(path);
  try{
   const relocation=relocationFor(a,Buffer.byteLength(path));const encodedStart=relocation?.dataOffset??from;
   const encodedEnd=relocation?encodedStart+relocation.compressedSize:undefined;
   const {buffer,engine}=brotliDecompressSync(b.subarray(encodedStart,encodedEnd),{info:true});
   const target=root+'/frontend'+path;mkdirSync(dirname(target),{recursive:true});writeFileSync(target,buffer);
   const r={path,path_offset:a,encoded_start:encodedStart,encoded_size:engine.bytesWritten,decoded_size:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex'),target,...(relocation?{relocation}:{} )};
   results.push(r);writeFileSync(manifestPath,JSON.stringify(results,null,2));return buffer.toString('utf8');
  }catch{}
 }
 throw new Error('No decodable embedded asset: '+path);
}
for(const path of process.argv.slice(2)){try{extract(path);console.log(results.find(r=>r.path===path));}catch(e){console.error(e.message);process.exitCode=1;}}
