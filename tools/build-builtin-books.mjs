import {readFile,writeFile} from 'node:fs/promises';
import {bundledNativeBuiltinBook} from '../engine/builtin-books.mjs';
import {PHONE_FIELDS_GUIDE,TEMPLATE_GUIDE} from '../engine/template-book.mjs';
import {WORLD_FORM_TEMPLATE,CHARACTER_FORM_TEMPLATE} from '../engine/builtin-book-data.mjs';

const check=process.argv.includes('--check');
const files=new Map([
 ...['templates','extensions','beauty'].map(id=>[
  `tisya-${{templates:'template',extensions:'extension',beauty:'beauty'}[id]}-book.json`,
  JSON.stringify(bundledNativeBuiltinBook(id),null,2)+'\n'
 ]),
 ['phone-fields.md',PHONE_FIELDS_GUIDE],
 ['form-authoring.md',TEMPLATE_GUIDE+'\n'],
 ['world-form.json',JSON.stringify(WORLD_FORM_TEMPLATE,null,2)+'\n'],
 ['character-form.json',JSON.stringify(CHARACTER_FORM_TEMPLATE,null,2)+'\n']
]);
for(const [name,content]of files){
 const file=new URL('../templates/'+name,import.meta.url);
 if(check){if(await readFile(file,'utf8')!==content)throw Error(name+' is stale; run npm run build:builtin-books');}
 else await writeFile(file,content);
}
console.log(JSON.stringify({files:[...files.keys()],checked:check}));
