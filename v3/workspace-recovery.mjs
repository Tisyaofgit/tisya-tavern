// Physical synchronization has its own receipt. A later configuration problem
// must not turn that receipt into a claimed failed worldbook write.
export async function recoverWorkspace({books,configurationBook,onConfigurationChanged=()=>{}},...args){
 const before=books.workspaceState?.();
 let result;
 try{result=await books.syncWorkspace(...args);}
 catch(error){if(!error.workspaceRecovery){error.message='工作区同步未完成'+(error.code?' ['+error.code+']':'')+'：'+error.message;error.workspaceRecovery=true;}throw error;}
 const recovery={...result,workspaceSynced:true};
 if(!configurationBook)return recovery;
 const state=configurationBook.read();
 if(state.draft)return {...recovery,configuration:{ready:state.ready,draftPending:true}};
 if(before?.pendingBooks?.length||state.ready===false){
  try{await configurationBook.hydrate({initializeIfMissing:false});onConfigurationChanged();}
  catch(error){return {...recovery,configuration:{ready:false,error:{code:error.code??'CONFIGURATION_ERROR',message:error.message}}};}
 }
 return {...recovery,configuration:{ready:configurationBook.read().ready}};
}
