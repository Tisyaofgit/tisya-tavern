import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {adaptReaderSource} from './reader-transforms.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),vendor=path.join(root,'vendor/foundation');
const provenance=JSON.parse(fs.readFileSync(path.join(vendor,'provenance.json'),'utf8'));
const modules=Object.keys(provenance.files).sort().map(id=>{
    const source=fs.readFileSync(path.join(vendor,id),'utf8');
    if(createHash('sha256').update(source).digest('hex')!==provenance.files[id])throw Error('Vendored source changed: '+id);
    const dependencies=Object.fromEntries([...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(([,name])=>{
        const target=path.posix.normalize(path.posix.join(path.posix.dirname(id),name));
        if(!Object.hasOwn(provenance.files,target))throw Error('Unknown dependency: '+name);
        return [name,target];
    }));
    return `${JSON.stringify(id)}:[function(module,exports,require){\n${adaptReaderSource(id,source)}\n},${JSON.stringify(dependencies)}]`;
});
const output=`// Generated from verified Foundation r243 sources plus explicit read-only adapters.\n// No eval, host access, storage writes, or dynamic dependency loading.\nimport {adaptReaderModule} from './reader-compat.js';\nconst foundationModules={\n${modules.join(',\n')}\n};\nconst foundationCache=new Map();\nfunction foundationRequire(id){\n if(foundationCache.has(id))return foundationCache.get(id).exports;\n const entry=foundationModules[id];if(!entry)throw Error('Unknown Foundation module');\n const module={exports:{}};foundationCache.set(id,module);\n entry[0](module,module.exports,name=>{if(!Object.hasOwn(entry[1],name))throw Error('Unknown Foundation dependency');return foundationRequire(entry[1][name]);});\n module.exports=adaptReaderModule(id,module.exports,foundationRequire);\n return module.exports;\n}\nexport const {isReplyMessage,extractXMLBody,parseDisplayEnvelope,xmlTokens,replyRegion}=foundationRequire('xml-envelope.cjs');\nexport const {projectJourney,projectJourneyEnvelope}=foundationRequire('journey-reader.cjs');\nexport const {countBody}=foundationRequire('body-count.cjs');\nexport const {read:readParagraphs}=foundationRequire('numbered-paragraphs.cjs');\nexport const {runDisplay}=foundationRequire('display-regex.cjs');\nexport const {strictJSON}=foundationRequire('strict-json.cjs');\nexport const {validate:validateMemoryProjection,visibleTask:visiblePending,validateLocators:validateMemoryLocators,validateLocator:validateMemoryLocator}=foundationRequire('memory-permissions.cjs');\n`;
const filename=path.join(root,'reader-core.js');
if(process.argv.includes('--check')){if(fs.readFileSync(filename,'utf8')!==output)throw Error('Reader bundle is stale');}
else fs.writeFileSync(filename,output);
console.log('Reader bundle verified against '+modules.length+' original modules with explicit read adapters');
