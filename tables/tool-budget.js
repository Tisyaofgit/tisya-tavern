// One host-owned bound shared by the loop, read session and draft lifetime.
// Each model turn can return at most eight tools; counts are not HTTP charges.
export function archiveToolBudget(requested){
 const maxRounds=Number.isSafeInteger(requested)&&requested>=1?Math.min(requested,17):5;
 return {maxRounds,maxCalls:maxRounds*8,timeoutMs:Math.min(900000,Math.max(300000,maxRounds*60000))};
}
