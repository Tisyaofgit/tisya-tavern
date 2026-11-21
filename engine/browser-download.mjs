// Browser downloads share realm selection, temporary-link cleanup and object
// URL revocation. Raw exports and JSON exports differ only in serialization.
export function downloadText(document,raw,name,type='application/octet-stream',options={}){
 const win=document.defaultView??globalThis,urlApi=options.urlApi??win.URL??globalThis.URL,BlobType=options.BlobType??win.Blob??globalThis.Blob;
 const url=urlApi.createObjectURL(new BlobType([raw],{type})),link=document.createElement('a');
 link.href=url;link.download=name;document.body?.append(link);link.click();link.remove();
 (options.setTimeout??win.setTimeout??globalThis.setTimeout)(()=>urlApi.revokeObjectURL(url),1000);
}

export function downloadJson(document,name,value,options){
 downloadText(document,JSON.stringify(value,null,2),name,'application/json',options);
}
