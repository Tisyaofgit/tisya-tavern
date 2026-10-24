import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';

export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const acorn = {};
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'], {exports: acorn, module: {exports: acorn}});
const parse = text => acorn.parse(text, {ecmaVersion: 'latest', sourceType: 'module', ranges: true});

function visit(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (node.type) fn(node);
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'range'].includes(key)) continue;
    if (node.type === 'MemberExpression' && key === 'property' && !node.computed) continue;
    if (node.type === 'Property' && key === 'key' && !node.computed) continue;
    if (Array.isArray(value)) value.forEach(child => visit(child, fn));
    else if (value && typeof value === 'object') visit(value, fn);
  }
}

export function extract() {
  const root = new URL('../', import.meta.url).pathname;
  const sourcePath = path.join(root, 'mvu-reference/beta-artifact_bundle.js');
  const corePath = path.join(root, 'extracted/dist/lib.core.bundle.js');
  const json5Path = path.join(root, 'mvu-reference/json5-2.2.3-index.min.js');
  const source = fs.readFileSync(sourcePath, 'utf8'), ast = parse(source);
  const core = fs.readFileSync(corePath, 'utf8'), coreAst = parse(core);
  const json5 = fs.readFileSync(json5Path, 'utf8');
  if (hash(source) !== 'a5d6166d43a78c7fad05669864efd76852f58eea905814dcd89f8e1b29fa4b27') throw Error('Unreviewed MVU bundle hash');
  if (hash(core) !== '85a3c4840c11dc1ccaf67ceed0184749e6a53d39ae56124f64adc6deb1cc9ef1') throw Error('Unreviewed host core hash');
  if (hash(json5) !== '4bb96d9d53f380ac801819411b8c10868ac9a984de863e56402ac00c2289b9f1') throw Error('Unreviewed JSON5 dependency');
  const functions = new Map(ast.body.filter(n => n.type === 'FunctionDeclaration').map(n => [n.id.name, n]));
  const closure = new Set(['ln']);
  for (const name of closure) visit(functions.get(name), node => {
    if (node.type === 'Identifier' && functions.has(node.name)) closure.add(node.name);
  });
  const expected = ['ln','tn','rn','Jt','Kt','ct','ut','Ct','Qt','Xt','pt','dt','sn','wt','kt','At','Rt','Lt','Mt','en','Ut','nn','on','Zt'];
  if (JSON.stringify([...closure]) !== JSON.stringify(expected)) throw Error('Unreviewed parser closure');
  const rawApi = functions.get('Pr');
  const constants = ast.body.filter(n => n.type === 'VariableDeclaration'
    && n.declarations.some(d => ['gt', '_t', 'Vt'].includes(d.id.name)));
  const selected = [...closure].map(name => functions.get(name)).concat(rawApi, functions.get('an'), constants).sort((a,b) => a.start-b.start);
  const forbidden = [];
  for (const node of selected) visit(node, item => {
    if (item.type === 'ImportExpression' || item.type === 'ImportDeclaration') forbidden.push({start: item.start, type: item.type});
    if (item.type === 'Identifier' && ['fetch','XMLHttpRequest','WebSocket','document','window','localStorage','sessionStorage','process','require','eval','Function'].includes(item.name)) forbidden.push({start: item.start, name: item.name});
  });
  if (forbidden.length) throw Error(`Selected parser contains prohibited capability: ${JSON.stringify(forbidden)}`);
  const moduleObject = coreAst.body[0].declarations[0].init;
  const lodash = moduleObject.properties.find(n => n.key.value === 6746);
  if (!lodash || !core.slice(lodash.start, lodash.end).includes('__lodash_hash_undefined__')) throw Error('Host lodash module missing');
  const mvuModules=ast.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='it')).declarations.find(d=>d.id.name==='it').init;
  const utilities=mvuModules.properties.find(n=>n.key.value===8490);
  if(!utilities)throw Error('Original MVU parsing utility module missing');
  const manifest = {
    source: {path: sourcePath, sha256: hash(source), bytes: Buffer.byteLength(source), provenance: 'https://raw.githubusercontent.com/MagicalAstrogy/MagVarUpdate/beta/artifact/bundle.js'},
    hostCore: {path: corePath, sha256: hash(core), bytes: Buffer.byteLength(core)},
    json5: {path:json5Path,sha256:hash(json5),bytes:Buffer.byteLength(json5),provenance:'https://testingcf.jsdelivr.net/npm/json5@2.2.3/dist/index.min.js'},
    externalImports: ast.body.filter(n => n.type === 'ImportDeclaration').map(n => n.source.value),
    fullBundleSideEffects: ['remote module imports','automatic UI/store initialization','fetch /version','fetch /api/chats/export','window.parent Mvu publication','worldbook/message event registration','variable cleanup and write helpers'],
    selected: selected.map(n => ({name: n.id?.name ?? n.declarations.map(d=>d.id.name).join(','), start:n.start,end:n.end,sha256:hash(source.slice(n.start,n.end))})),
    lodash: {moduleId:6746,start:lodash.start,end:lodash.end,sha256:hash(core.slice(lodash.start,lodash.end))},
    mvuUtilities: {moduleId:8490,start:utilities.start,end:utilities.end,sha256:hash(source.slice(utilities.start,utilities.end))},
    parserClosure: [...closure], prohibitedCapabilitiesInSelectedSource: forbidden,
    fixtures: {yt:'klona boundary uses actual host lodash.cloneDeep for JSON input',eventEmit:'in-memory ordered async host callbacks',variableAPI:'isolated in-memory getVariables/replaceVariables only',substitudeMacros:'identity for test inputs without macros',Nt:'notification disabled, no extra analysis',xt:'translation key capture only',mathjs:'blocked on invocation',json5:'actual pinned JSON5 2.2.3 dependency',YAML:'blocked on invocation',jsonrepair:'blocked on invocation'},
    executionBoundary: 'AST-selected unchanged parser functions, public API factory, original MVU utility module 8490, host lodash module and pinned official JSON5 only; no full MVU startup, imports, UI mount or user data loaded',
    dependencyAudit: {lodash:'Pinned extracted module is self-contained; require.g resolves its global and dynamic fallback generation is disabled',json5:'Pinned official UMD is self-contained; no import, fetch, filesystem or DOM mutation; global detection resolves inside VM',mvuUtilities:'Original module 8490 is retained unchanged; JSONPatch arrays use its JSON5 branch; unavailable YAML/jsonrepair/math branches are blocked and recorded'},
    statement: 'Passing _.set/_.add and JSONPatch commands demonstrates the actual MVU parser path and callback ordering with host boundaries simulated. JSONPatch uses original MVU utility code and actual JSON5. It does not demonstrate full MVU initialization or untested imported parser dialects.'
  };
  return {manifest, parserSource:selected.map(n=>source.slice(n.start,n.end)).join('\n'), lodashSource:'function'+core.slice(lodash.value.start,lodash.value.end),json5Source:json5,utilitiesSource:'function'+source.slice(utilities.value.start,utilities.value.end)};
}
