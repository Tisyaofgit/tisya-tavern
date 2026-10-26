// Only call at a request-construction or response-validation boundary, before
// that boundary has made native/business writes. Keeping its journal is not a
// successful generation; settlement merely preserves the failed request.
export function markRequestFailureForSettlement(error,{guard,stage,phase,response}={}){
 if(!error||typeof error!=='object')return error;
 // Diagnostics consume this explicitly; routine error logging/serialization
 // must not publish a potentially private rejected model response.
 if(typeof response==='string')Object.defineProperty(error,'responseText',{value:response,writable:true,configurable:true,enumerable:false});
 if(error.workspaceRecoveryUnsafe===true)return error;
 try{guard();}catch{error.workspaceRecoveryUnsafe=true;return error;}
 if(error.name==='AbortError'||/^(?:WORKSPACE_|BINDING_)|_(?:CHANGED|MUTATED|OWNER|READBACK|CONFLICT|BUSY|DISPOSED|CANCELLED|TIMEOUT|OUTCOME_UNKNOWN)$/.test(error.code??'')){error.workspaceRecoveryUnsafe=true;return error;}
 error.preparationSettlementSafe=true;error.requestStage=stage;error.requestFailurePhase=phase;
 return error;
}
