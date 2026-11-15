// Read-only projection of the production catalog for the independent preview.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {programOwnedTable,creationFieldAllowed} from '../../engine/prompt-boundary.mjs';
const input=new URL('../../engine/catalog.json',import.meta.url),bytes=fs.readFileSync(input),raw=JSON.parse(bytes);
const catalog=raw.tables.map(t=>({id:t.id,label:t.label,partition:t.partition??'EXT',program:programOwnedTable(t.id,t),fields:t.fields.map(f=>({key:f.key,label:f.label,type:f.type,description:f.description??'',readonly:programOwnedTable(t.id,t)||!creationFieldAllowed(f)||f.editable===false,enum:f.enum??f.options,min:f.minimum,max:f.maximum,ref:f.ref}))}));
fs.writeFileSync(new URL('./catalog.js',import.meta.url),'window.TISYA_FORM_CATALOG='+JSON.stringify(catalog).replaceAll('<','\\u003c')+';\n');
fs.writeFileSync(new URL('./evidence/catalog-source.json',import.meta.url),JSON.stringify({source:'engine/catalog.json',sha256:createHash('sha256').update(bytes).digest('hex'),tables:catalog.length,fields:catalog.reduce((n,t)=>n+t.fields.length,0),editable:catalog.reduce((n,t)=>n+t.fields.filter(f=>!f.readonly).length,0)},null,2)+'\n');
