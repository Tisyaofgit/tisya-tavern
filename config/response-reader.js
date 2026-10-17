// Shared bounded, cancellable UTF-8 read. Protocol interpretation stays with callers.
export async function readResponseText(response,{signal,guard,limit,limitError,captureBytes=false}){
 signal.throwIfAborted();guard();
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true}),chunks=[];
 let text='',size=0,rejectAbort;
 const interrupted=new Promise((_,reject)=>{rejectAbort=reject;});interrupted.catch(()=>{});
 const abort=()=>{rejectAbort(signal.reason);reader.cancel(signal.reason).catch(()=>{});};
 signal.addEventListener('abort',abort,{once:true});
 try{
  for(;;){
   guard();signal.throwIfAborted();
   const next=await Promise.race([reader.read(),interrupted]);
   guard();signal.throwIfAborted();if(next.done)break;
   size+=next.value.byteLength;if(size>limit)throw limitError();
   if(captureBytes)chunks.push(next.value);
   text+=decoder.decode(next.value,{stream:true});
  }
  text+=decoder.decode();return {text,chunks,bytes:size};
 }finally{signal.removeEventListener('abort',abort);reader.cancel().catch(()=>{});reader.releaseLock();}
}
