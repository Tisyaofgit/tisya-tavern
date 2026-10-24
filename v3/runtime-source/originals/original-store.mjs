const SCHEMA = 'tisya.original/1';
const PURPOSES = new Set(['archive-task', 'tool-read']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class OriginalStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OriginalStoreError';
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details) => { throw new OriginalStoreError(code, message, details); };
const assert = (condition, code, message, details) => { if (!condition) fail(code, message, details); };
const own = (value, key) => Object.hasOwn(value, key);
const clone = value => structuredClone(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function jsonData(value, label = 'value', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'INVALID_DATA', `${label} must be finite`);
    return;
  }
  assert(Array.isArray(value) || plain(value), 'INVALID_DATA', `${label} must be plain JSON data`);
  assert(!ancestors.has(value), 'INVALID_DATA', `${label} contains a cycle`);
  ancestors.add(value);
  if (Array.isArray(value)) assert(Object.keys(value).length === value.length, 'INVALID_DATA', `${label} must be a dense array`);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    assert(typeof key === 'string' && !FORBIDDEN_KEYS.has(key), 'INVALID_DATA', `${label} has an unsafe key`);
    if (Array.isArray(value)) assert(/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length, 'INVALID_DATA', `${label} has a non-index array key`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert(descriptor && own(descriptor, 'value'), 'INVALID_DATA', `${label} has an accessor`);
    assert(descriptor.enumerable, 'INVALID_DATA', `${label} has a hidden field`);
    jsonData(descriptor.value, `${label}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const sameJson = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function text(value, label) {
  assert(typeof value === 'string' && value.length > 0, 'INVALID_ARGUMENT', `${label} must be a nonempty string`);
  return value;
}

function scope(value) {
  assert(plain(value), 'INVALID_SCOPE', 'A chat and branch scope is required');
  return { chatId: text(value.chatId, 'chatId'), branchId: text(value.branchId, 'branchId') };
}

function identity(value) {
  const result = scope(value);
  result.messageId = text(value.messageId, 'messageId');
  return result;
}

function sameScope(a, b) { return a.chatId === b.chatId && a.branchId === b.branchId; }
function sameIdentity(a, b) { return sameScope(a, b) && a.messageId === b.messageId; }

// Hash exact JavaScript UTF-16 code units, including lone surrogates.
export async function sha256Utf16(value) {
  assert(typeof value === 'string', 'INVALID_ARGUMENT', 'Hash input must be text');
  assert(globalThis.crypto?.subtle, 'HASH_UNAVAILABLE', 'WebCrypto SHA-256 is required');
  const bytes = new Uint8Array(value.length * 2);
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    bytes[i * 2] = unit & 255;
    bytes[i * 2 + 1] = unit >>> 8;
  }
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
}

function linesOf(source) {
  const lines = [];
  let start = 0;
  const breaks = /\r\n|\n|\r/g;
  for (const match of source.matchAll(breaks)) {
    lines.push({ start, end: match.index, breakEnd: match.index + match[0].length, text: source.slice(start, match.index) });
    start = match.index + match[0].length;
  }
  lines.push({ start, end: source.length, breakEnd: source.length, text: source.slice(start) });
  return lines;
}

const blank = line => /^[^\S\r\n]*$/u.test(line);
function marker(line) {
  const match = /^(\d+)(?:([^\S\r\n]+)(.*))?$/u.exec(line);
  if (!match) return null;
  return { digits: match[1], number: Number(match[1]), inline: match[3] !== undefined && match[3].length > 0,
    prefix: match[1].length + (match[2]?.length ?? 0), content: match[3] ?? '' };
}

function fenceAfter(line, state) {
  if (state) {
    const match = /^ {0,3}(`+|~+)[\t ]*$/.exec(line);
    return match && match[1][0] === state.character && match[1].length >= state.length ? null : state;
  }
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { character: match[1][0], length: match[1].length };
}

/** Parse numbered prose without changing any source code unit. Offsets are UTF-16. */
export function parseNumberedBody(source) {
  assert(typeof source === 'string' && source.length > 0, 'EMPTY_BODY', 'A complete numbered body is required');
  const lines = linesOf(source), markers = [];
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const found = fence ? null : marker(line.text);
    if (found) {
      assert(/^[1-9]\d*$/.test(found.digits) && Number.isSafeInteger(found.number), 'INVALID_NUMBER', 'Paragraph numbers must be positive integers without leading zeroes', { line: index + 1 });
      markers.push({ ...found, line: index });
    }
    fence = fenceAfter(found?.inline ? found.content : line.text, fence);
  }
  assert(!fence, 'UNCLOSED_FENCE', 'A fenced block is not closed');
  assert(markers.length > 0, 'UNNUMBERED_BODY', 'This body has no numbered paragraphs');
  assert(lines.slice(0, markers[0].line).every(line => blank(line.text)), 'UNNUMBERED_PREFIX', 'Text before paragraph 1 is not numbered');
  const paragraphs = [];
  for (let i = 0; i < markers.length; i++) {
    const current = markers[i], endLine = markers[i + 1]?.line ?? lines.length;
    assert(current.number === i + 1, 'NUMBER_SEQUENCE', 'Paragraph numbers must run consecutively from 1', { expected: i + 1, actual: current.number });
    let first = current.inline ? current.line : current.line + 1;
    let last = endLine - 1;
    while (first <= last && blank(lines[first].text)) first++;
    while (last >= first && blank(lines[last].text)) last--;
    assert(first <= last, 'EMPTY_PARAGRAPH', 'A numbered paragraph is empty', { number: current.number });
    const contentStart = first === current.line ? lines[first].start + current.prefix : lines[first].start;
    const contentEnd = lines[last].end;
    let localFence = null, gap = false;
    for (let lineIndex = first; lineIndex <= last; lineIndex++) {
      const value = lineIndex === current.line ? lines[lineIndex].text.slice(current.prefix) : lines[lineIndex].text;
      if (!localFence && blank(value)) gap = true;
      else if (!localFence && gap) fail('UNNUMBERED_PARAGRAPH', 'An additional natural paragraph has no number', { number: current.number, line: lineIndex + 1 });
      localFence = fenceAfter(value, localFence);
    }
    paragraphs.push({ number: current.number, blockStart: lines[current.line].start,
      blockEnd: markers[i + 1] ? lines[endLine].start : source.length, contentStart, contentEnd });
  }
  return Object.freeze(paragraphs.map(Object.freeze));
}

/** Index eligible historical prose in-place. Store the complete original;
 * control blocks and wrapper markup never become archival evidence. */
export function parseHistoricalBody(source){
 assert(typeof source==='string'&&source.trim(),'EMPTY_BODY','History source is empty');
 const denied=/<(task|next|status|memory|vars|extra|actions|archive|title|think|thinking|analysis|world_thinking|character_mode|character_thinking|UpdateVariable|JSONPatch)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi;
 const removed=[];let masked=source;
 for(const match of source.matchAll(denied))removed.push([match.index,match.index+match[0].length]);
 for(const match of source.matchAll(/<\/?(?:reply|body)(?:\s[^>]*)?>/gi))removed.push([match.index,match.index+match[0].length]);
 const chars=source.split('');for(const [a,b]of removed)for(let i=a;i<b;i++)chars[i]='\u0000';masked=chars.join('');
 assert(!/<\/?(?:task|next|status|memory|vars|extra|actions|archive|title|think|thinking|analysis|world_thinking|character_mode|character_thinking|UpdateVariable|JSONPatch)\b/i.test(masked),'HISTORY_CONTROL_BLOCK','Historical control block is incomplete');
 const result=[];let cursor=0;
 const add=(a,b)=>{while(a<b&&/\s/.test(source[a]))a++;while(b>a&&/\s/.test(source[b-1]))b--;if(a<b)result.push({number:result.length+1,blockStart:a,blockEnd:b,contentStart:a,contentEnd:b});};
 // Blank lines and removed control blocks split references without touching raw bytes.
 for(const split of masked.matchAll(/\u0000+|(?:\r\n|(?<!\r)\n|\r(?!\n))[ \t]*(?:\r\n|(?<!\r)\n|\r(?!\n))/g)){add(cursor,split.index);cursor=split.index+split[0].length;}
 add(cursor,source.length);assert(result.length,'EMPTY_BODY','History contains no eligible prose');return result;
}

function numbers(value, count) {
  assert(Array.isArray(value), 'INVALID_SELECTION', 'Paragraph selection must be an integer list');
  let previous = 0;
  for (const number of value) {
    assert(Number.isSafeInteger(number) && number > previous && number <= count, 'INVALID_SELECTION', 'Select existing paragraphs once, in source order', { number, paragraphCount: count });
    previous = number;
  }
  return [...value];
}

function referenceShape(value) {
  assert(plain(value), 'INVALID_REFERENCE', 'A versioned original reference is required');
  assert(Object.keys(value).every(key => ['entryId', 'revision', 'hash', 'paragraphs'].includes(key)), 'INVALID_REFERENCE', 'Original reference contains unknown fields');
  text(value.entryId, 'entryId');
  assert(integer(value.revision) && value.revision > 0 && /^[a-f0-9]{64}$/.test(value.hash), 'INVALID_REFERENCE', 'Original reference needs a revision and SHA-256 hash');
  numbers(value.paragraphs, Number.MAX_SAFE_INTEGER);
  return value;
}

function metadata(entry) {
  const data = entry.original;
  return { entryId: entry.id, version: entry.version, identity: clone(data.identity), revision: data.revision,
    hash: data.hash, format: data.format, paragraphCount: data.paragraphs.length, deleted: data.deleted,
    sourceRevision: data.sourceRevision, ...(data.displayFloor === undefined ? {} : { displayFloor: data.displayFloor }) };
}

/** Adapters declare either conditional writes or one managed writer's check/write/readback scope. */
export function createOriginalStore({ adapter, bookId, digest = sha256Utf16 }) {
  text(bookId, 'bookId');
  for (const method of ['read', 'create', 'update', 'list']) assert(typeof adapter?.[method] === 'function', 'INVALID_ADAPTER', `Adapter.${method} is required`);
  const conditionalWrites = adapter.capabilities?.conditionalWrites === true;
  const managedSingleWriter = adapter.capabilities?.managedSingleWriter === true
    && adapter.capabilities?.consistencyScope === 'single-controller';
  assert(adapter.capabilities?.uniqueIds === true && (conditionalWrites || managedSingleWriter),
    'ADAPTER_CAPABILITY', 'Adapter must enforce unique IDs and declare conditional writes or a single-controller writer');
  const writeGuarantee = conditionalWrites ? 'conditional-writes' : 'managed-single-writer';
  let tail = Promise.resolve();
  const serial = work => { const result = tail.then(work); tail = result.catch(() => {}); return result; };
  const makeId = async value => 'original:' + await digest(JSON.stringify([bookId, value.chatId, value.branchId, value.messageId]));

  async function inspect(entry, requestedScope) {
    jsonData(entry, 'stored original');
    assert(entry?.bookId === bookId && entry.original?.schema === SCHEMA, 'WRONG_STORE', 'Record does not belong to this original store');
    const data = entry.original, id = identity(data.identity);
    assert(sameScope(id, requestedScope), 'SCOPE_MISMATCH', 'Original belongs to another chat or branch');
    assert(entry.id === await makeId(id), 'IDENTITY_MISMATCH', 'Original identity does not match its stable entry ID');
    assert(integer(entry.version) && entry.version > 0 && integer(data.revision) && data.revision > 0, 'CORRUPT_RECORD', 'Original revisions are invalid');
    assert(typeof entry.content === 'string' && ['numbered','historical'].includes(data.format) && typeof data.deleted === 'boolean', 'CORRUPT_RECORD', 'Original content metadata is invalid');
    text(data.sourceRevision, 'stored sourceRevision');
    assert(plain(data.lastMutation) && ['put', 'delete'].includes(data.lastMutation.kind)
      && typeof data.lastMutation.id === 'string' && data.lastMutation.id.length > 0
      && /^[a-f0-9]{64}$/.test(data.lastMutation.fingerprint), 'CORRUPT_RECORD', 'Original mutation receipt is invalid');
    assert(entry.disable === true && entry.constant === false && Array.isArray(entry.key) && entry.key.length === 0
      && Array.isArray(entry.keysecondary) && entry.keysecondary.length === 0 && entry.probability === 0,
    'AUTOINJECTION_ENABLED', 'Original storage must remain disabled for automatic context injection');
    assert(data.hash === await digest(entry.content), 'CONTENT_HASH_MISMATCH', 'Original content changed without its versioned metadata');
    const parsed = data.deleted ? [] : data.format==='historical'?parseHistoricalBody(entry.content):parseNumberedBody(entry.content);
    assert(!data.deleted || entry.content === '', 'CORRUPT_RECORD', 'Deleted original still has active content');
    assert(sameJson(parsed, data.paragraphs), 'PARAGRAPH_INDEX_MISMATCH', 'Stored paragraph offsets do not match the original');
    return entry;
  }

  async function load(entryId, requestedScope, { allowDeleted = false } = {}) {
    text(entryId, 'entryId');
    const entry = await adapter.read({ bookId, id: entryId });
    assert(entry !== null && entry !== undefined, 'SOURCE_NOT_FOUND', 'Original source was not found', { entryId });
    await inspect(entry, requestedScope);
    assert(allowDeleted || !entry.original.deleted, 'SOURCE_DELETED', 'Original source has been deleted', { entryId, revision: entry.original.revision });
    return entry;
  }

  function checkVersion(entry, expectedVersion) {
    assert(integer(expectedVersion), 'EXPECTED_VERSION_REQUIRED', 'Supply the last observed storage version, or 0 when creating');
    const actualVersion = entry?.version ?? 0;
    assert(actualVersion === expectedVersion, 'VERSION_CONFLICT', 'Original storage version changed', { expectedVersion, actualVersion });
  }

  function checkReference(entry, reference) {
    referenceShape(reference);
    assert(reference.entryId === entry.id && reference.revision === entry.original.revision && reference.hash === entry.original.hash,
      'STALE_REFERENCE', 'Original content changed; this paragraph reference is stale',
      { entryId: entry.id, requestedRevision: reference.revision, currentRevision: entry.original.revision });
  }

  async function persist(previous, next) {
    const receipt = previous
      ? await adapter.update({ bookId, id: next.id, expectedVersion: previous.version, entry: clone(next) })
      : await adapter.create({ bookId, id: next.id, expectedVersion: 0, entry: clone(next) });
    assert(receipt?.id === next.id && receipt?.version === next.version, 'WRITE_RECEIPT_MISMATCH', 'Adapter did not confirm the requested record version', { entryId: next.id, expectedVersion: next.version });
    const actual = await adapter.read({ bookId, id: next.id });
    if (actual) jsonData(actual, 'write readback');
    assert(actual && sameJson(actual, next), 'WRITE_READBACK_MISMATCH', 'Written original differs from its actual readback', { entryId: next.id, expectedVersion: next.version });
    await inspect(actual, next.original.identity);
    return metadata(actual);
  }

  async function put(input, historical=false) {
    jsonData(input, 'original input');
    const id = identity(input.identity), entryId = await makeId(id);
    text(input.operationId, 'operationId');
    text(input.sourceRevision, 'sourceRevision');
    assert(typeof input.content === 'string' && input.content.length > 0, 'EMPTY_BODY', 'A complete original body is required');
    const format = historical?'historical':'numbered';
    assert(!own(input, 'format') || input.format === format, 'INVALID_FORMAT', 'Original format must be numbered');
    if (own(input, 'displayFloor')) assert(integer(input.displayFloor), 'INVALID_ARGUMENT', 'displayFloor must be a nonnegative integer');
    const paragraphs = historical?parseHistoricalBody(input.content):parseNumberedBody(input.content);
    const fingerprint = await digest(JSON.stringify(['put', id, input.content, format, input.sourceRevision, input.displayFloor ?? null]));
    const previous = await adapter.read({ bookId, id: entryId });
    if (previous) await inspect(previous, id);
    if (previous?.original.lastMutation?.id === input.operationId) {
      assert(previous.original.lastMutation.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', 'The same operation ID was reused with different content');
      return { status: 'replayed', ...metadata(previous) };
    }
    checkVersion(previous, input.expectedVersion);
    const sourceChanged = !previous || previous.original.deleted || previous.content !== input.content
      || previous.original.format !== format || previous.original.sourceRevision !== input.sourceRevision;
    const floorChanged = previous?.original.displayFloor !== input.displayFloor;
    if (previous && !sourceChanged && !floorChanged) return { status: 'unchanged', ...metadata(previous) };
    const next = { id: entryId, bookId, version: (previous?.version ?? 0) + 1,
      content: input.content, disable: true, constant: false, key: [], keysecondary: [], probability: 0,
      original: { schema: SCHEMA, identity: id, revision: (previous?.original.revision ?? 0) + (sourceChanged ? 1 : 0),
        hash: await digest(input.content), format, paragraphs: clone(paragraphs), sourceRevision: input.sourceRevision,
        ...(input.displayFloor === undefined ? {} : { displayFloor: input.displayFloor }), deleted: false,
        lastMutation: { id: input.operationId, fingerprint, kind: 'put' } } };
    return { status: previous ? 'updated' : 'created', ...await persist(previous, next) };
  }

  async function remove(input) {
    jsonData(input, 'delete input');
    const requestedScope = scope(input.scope);
    text(input.operationId, 'operationId');
    const previous = await load(input.entryId, requestedScope, { allowDeleted: true });
    const fingerprint = await digest(JSON.stringify(['delete', previous.id]));
    if (previous.original.lastMutation?.id === input.operationId) {
      assert(previous.original.lastMutation.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', 'The same operation ID was reused for another mutation');
      return { status: 'replayed', ...metadata(previous) };
    }
    checkVersion(previous, input.expectedVersion);
    if (previous.original.deleted) return { status: 'unchanged', ...metadata(previous) };
    const next = clone(previous);
    next.version++;
    next.content = '';
    next.original.revision++;
    next.original.hash = await digest('');
    next.original.paragraphs = [];
    next.original.deleted = true;
    next.original.lastMutation = { id: input.operationId, fingerprint, kind: 'delete' };
    return { status: 'deleted', ...await persist(previous, next) };
  }

  async function read(input) {
    jsonData(input, 'read input');
    const requestedScope = scope(input.scope);
    assert(PURPOSES.has(input.purpose), 'READ_PURPOSE_DENIED', 'Original text is available only to an archive task or an explicit tool read');
    const entry = await load(input.entryId, requestedScope);
    if (input.reference) checkReference(entry, input.reference);
    const result = metadata(entry);
    if (input.paragraphs !== undefined) {
      const chosen = numbers(input.paragraphs, entry.original.paragraphs.length);
      return { ...result, selected: chosen.map(number => {
        const span = entry.original.paragraphs[number - 1];
        return { number, text: entry.content.slice(span.contentStart, span.contentEnd),
          span: { start: span.contentStart, end: span.contentEnd } };
      }) };
    }
    return { ...result, content: entry.content, paragraphIndex: clone(entry.original.paragraphs) };
  }

  async function makeReference(input) {
    jsonData(input, 'reference input');
    const entry = await load(input.entryId, scope(input.scope));
    if (input.source) checkReference(entry, input.source);
    return { entryId: entry.id, revision: entry.original.revision, hash: entry.original.hash,
      paragraphs: numbers(input.paragraphs, entry.original.paragraphs.length) };
  }

  async function resolveReference(input) {
    jsonData(input, 'resolve input');
    referenceShape(input.reference);
    return read({ entryId: input.reference.entryId, scope: input.scope, purpose: input.purpose,
      reference: input.reference, paragraphs: input.reference.paragraphs });
  }

  async function bindArchiveParagraphs(input) {
    jsonData(input, 'archival binding');
    const selectionField = input.selectionField ?? '原文段号';
    const referenceField = input.referenceField ?? '原文引用';
    text(selectionField, 'selectionField'); text(referenceField, 'referenceField');
    assert(!FORBIDDEN_KEYS.has(selectionField) && !FORBIDDEN_KEYS.has(referenceField) && selectionField !== referenceField,
      'INVALID_BINDING', 'Paragraph selection and reference fields must be distinct safe keys');
    const frozen = referenceShape(input.source);
    const entry = await load(frozen.entryId, scope(input.scope));
    checkReference(entry, frozen);
    assert(Array.isArray(input.proposal?.changes), 'INVALID_PROPOSAL', 'Archival proposal needs its changes list');
    const proposal = clone(input.proposal);
    for (const change of proposal.changes) {
      if (!plain(change?.values)) continue;
      const values = change.values;
      assert(!own(values, referenceField), 'HOST_OWNED_REFERENCE', 'The host binds original references; the model supplies paragraph numbers only');
      if (change.table === 'events') assert(!own(values, '原文段落'), 'RAW_ORIGINAL_WRITE', 'New archival output selects paragraph numbers instead of copying original text');
      if (!own(values, selectionField)) continue;
      assert(change.table === 'events', 'WRONG_SELECTION_TABLE', 'Original paragraph selection belongs to events');
      const selected = numbers(values[selectionField], entry.original.paragraphs.length);
      delete values[selectionField];
      if (selected.length) values[referenceField] = { entryId: entry.id, revision: entry.original.revision, hash: entry.original.hash, paragraphs: selected };
    }
    return proposal;
  }

  async function resolveEvidence(input) {
    jsonData(input, 'evidence input');
    const frozen = referenceShape(input.source);
    const entry = await load(frozen.entryId, scope(input.scope));
    checkReference(entry, frozen);
    const chosen = numbers(input.paragraphs, entry.original.paragraphs.length);
    assert(chosen.length > 0, 'EMPTY_EVIDENCE', 'An archival change requires at least one source paragraph');
    const selected = chosen.map(number => {
      const span = entry.original.paragraphs[number - 1];
      return { number, text: entry.content.slice(span.contentStart, span.contentEnd),
        span: { start: span.contentStart, end: span.contentEnd } };
    });
    const start = selected[0].span.start, end = selected.at(-1).span.end;
    if(entry.original.format==='historical') {
      const spans=parseHistoricalBody(entry.content.slice(start,end));
      assert(spans.length===chosen.length&&spans.every((p,i)=>entry.content.slice(start+p.contentStart,start+p.contentEnd)===selected[i].text),'HISTORY_EVIDENCE','Historical evidence must select consecutive prose paragraphs');
      for(let i=1;i<selected.length;i++)assert(/^\s*$/.test(entry.content.slice(selected[i-1].span.end,selected[i].span.start)),'HISTORY_EVIDENCE','Historical evidence cannot span a control block');
    }
    return { reference: { entryId: entry.id, revision: entry.original.revision, hash: entry.original.hash, paragraphs: chosen },
      selected, envelope: { text: entry.content.slice(start, end), start, end } };
  }

  async function getMetadata(input) {
    jsonData(input, 'metadata input');
    return metadata(await load(input.entryId, scope(input.scope), { allowDeleted: input.includeDeleted === true }));
  }

  async function listMetadata(input) {
    jsonData(input, 'list input');
    const requestedScope = scope(input.scope);
    const entries = await adapter.list({ bookId, scope: requestedScope });
    assert(Array.isArray(entries), 'INVALID_ADAPTER_RESULT', 'Adapter.list must return records');
    const output = [];
    for (const entry of entries) {
      jsonData(entry, 'listed original');
      if (entry?.bookId !== bookId || entry?.original?.schema !== SCHEMA) continue;
      if (!sameScope(identity(entry.original.identity), requestedScope)) continue;
      await inspect(entry, requestedScope);
      if (!entry.original.deleted || input.includeDeleted === true) output.push(metadata(entry));
    }
    return output;
  }

  return Object.freeze({
    writeGuarantee,
    entryIdFor: value => { jsonData(value, 'identity'); return makeId(identity(value)); },
    put: input => serial(() => put(input)),
    putHistory: input => serial(() => put(input,true)), remove: input => serial(() => remove(input)),
    read: input => serial(() => read(input)), metadata: input => serial(() => getMetadata(input)),
    listMetadata: input => serial(() => listMetadata(input)), reference: input => serial(() => makeReference(input)),
    resolveReference: input => serial(() => resolveReference(input)),
    bindArchiveParagraphs: input => serial(() => bindArchiveParagraphs(input)),
    resolveEvidence: input => serial(() => resolveEvidence(input)),
  });
}
