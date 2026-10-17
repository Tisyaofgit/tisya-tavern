export const transportError=(code,message)=>Object.assign(new Error(message),{code:code.startsWith('TISYA_')?code:'TISYA_TRANSPORT_'+code});
export function failTransport(code,message){throw transportError(code,message);}
