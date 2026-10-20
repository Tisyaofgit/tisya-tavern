// A stopped host request may never settle its original UI promise. Cancel the
// plugin's continuation independently, but keep history locked until the host's
// real generation-idle gate confirms that generation has left its critical path.
export function createGenerationOperations({waitForIdle}){
 const runs=new Set();
 const stopped=()=>Object.assign(Error('生成已停止；现有消息和版本保留'),{name:'AbortError'});
 async function run(fn){
  const controller=new AbortController(),signal=controller.signal;
  const check=()=>{if(signal.aborted)throw signal.reason;};
  const operation={controller};runs.add(operation);
  async function wait(start,{host=false}={}){
   check();let abort,settled=false;
   const cancelled=new Promise((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});});
   let started;try{check();started=start();}catch(error){started=Promise.reject(error);}
   const pending=Promise.resolve(started).then(value=>{settled=true;return value;},error=>{settled=true;throw error;});
   try{const result=await Promise.race([pending,cancelled]);check();return result;}
   catch(error){if(host&&signal.aborted){await waitForIdle();signal.reason.hostSettled=settled;throw signal.reason;}throw error;}
   finally{signal.removeEventListener('abort',abort);}
  }
  try{return await fn({check,wait,host:start=>wait(start,{host:true}),signal});}
  finally{runs.delete(operation);}
 }
 return {run,stop(){for(const operation of runs)operation.controller.abort(stopped());},active:()=>runs.size};
}
