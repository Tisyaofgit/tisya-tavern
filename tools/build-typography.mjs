import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),vendor=path.join(root,'vendor/typography');
const provenance=JSON.parse(fs.readFileSync(path.join(vendor,'provenance.json'),'utf8'));
const modules=Object.keys(provenance.files).sort().map(id=>{
 const source=fs.readFileSync(path.join(vendor,id),'utf8');
 if(createHash('sha256').update(source).digest('hex')!==provenance.files[id])throw Error('Original typography changed: '+id);
 const dependencies=Object.fromEntries([...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(([,name])=>{
  const target=path.posix.normalize(path.posix.join(path.posix.dirname(id),name));
  if(!Object.hasOwn(provenance.files,target))throw Error('Unknown typography module: '+name);
  return [name,target];
 }));
 return `${JSON.stringify(id)}:[function(module,exports,require){\n${source}\n},${JSON.stringify(dependencies)}]`;
});
const output=`// Generated from byte-preserved Foundation r243 typography sources.\nconst typographyModules={${modules.join(',\n')}};\nconst typographyCache=new Map();\nfunction typographyRequire(id){if(typographyCache.has(id))return typographyCache.get(id).exports;const entry=typographyModules[id];if(!entry)throw Error('Unknown typography module');const module={exports:{}};typographyCache.set(id,module);entry[0](module,module.exports,name=>typographyRequire(entry[1][name]));return module.exports;}\nexport const {formatBody:decorateBody,bodyCSS}=typographyRequire('body-typography.cjs');\nexport const {formatMarks,MARK_CSS}=typographyRequire('prose-marks.cjs');\n`;
const dest=path.join(root,'typography-core.js');
if(process.argv.includes('--check')){if(fs.readFileSync(dest,'utf8')!==output)throw Error('Typography bundle stale');}else fs.writeFileSync(dest,output);
console.log('Typography bundle verified: '+modules.length+' original modules');
