// Finish candidate ownership before unrelated communication persistence yields.
// The native swipe promise may resolve before its async end listeners do.
export async function finishMatrixGeneration({host,revision,communication,onError}){
    const accepted=host.accepted();
    if(!accepted)revision.stopped();
    const delegated=revision.ended(accepted?'matrix':false);
    const settlement=delegated?host.defer():host.event(accepted?'GENERATION_ENDED':'GENERATION_STOPPED');
    communication.ended(accepted);
    await Promise.all([settlement,communication.finishNative(accepted).catch(onError)]);
}
