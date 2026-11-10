import {readFile,writeFile} from 'node:fs/promises';
import {bundledNativeBuiltinBook} from '../engine/builtin-books.mjs';
import {PHONE_FIELDS_GUIDE} from '../engine/template-book.mjs';

const check=process.argv.includes('--check');
const files=new Map([
 ...['templates','extensions','beauty'].map(id=>[
  `tisya-${{templates:'template',extensions:'extension',beauty:'beauty'}[id]}-book.json`,
  JSON.stringify(bundledNativeBuiltinBook(id),null,2)+'\n'
 ]),
 ['phone-fields.md',PHONE_FIELDS_GUIDE]
]);
for(const [name,content]of files){
 const file=new URL('../templates/'+name,import.meta.url);
 if(check){if(await readFile(file,'utf8')!==content)throw Error(name+' is stale; run npm run build:builtin-books');}
 else await writeFile(file,content);
}
console.log(JSON.stringify({files:[...files.keys()],checked:check}));
