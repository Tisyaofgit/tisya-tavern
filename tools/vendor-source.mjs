import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Logical provenance IDs stay stable when identical original bytes share storage.
export function verifiedVendorSource(directory,provenance,id){
 if(!Object.hasOwn(provenance.files,id))throw Error('Unknown vendor source: '+id);
 const raw=fs.readFileSync(path.resolve(directory,provenance.sourcePaths?.[id]??id),'utf8');
 if(createHash('sha256').update(raw).digest('hex')!==provenance.files[id])throw Error('Original vendor source changed: '+id);
 return raw;
}
