import { HostAdapterError } from './worldbook-adapter.mjs';

const copy = value => structuredClone(value);
const stable = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const check = (ok, code, message) => { if (!ok) throw new HostAdapterError(code, message); };
const KEY = 'tisyaTableLedger';

/** A single disabled entry in book B is the only durable ledger store. */
export function createWorldbookTableStorage({ transport, bookId, owner, initialState }) {
  check(['readFresh', 'save', 'createEntry'].every(key => typeof transport?.[key] === 'function'), 'HOST_DEPENDENCY', 'Worldbook transport is required');
  check(typeof bookId === 'string' && bookId.length > 0 && Number.isSafeInteger(initialState?.revision) && initialState.revision === 0, 'LEDGER_INITIAL_STATE', 'A book ID and revision-zero initial ledger are required');
  check(owner && Object.keys(owner).length === 2 && ['chatId','branchId'].every(key => typeof owner[key] === 'string' && owner[key]), 'LEDGER_OWNER', 'Exact chatId and branchId are required for the table ledger');
  const expectedOwner = copy(owner);
  const initial = copy(initialState);
  let observed, tail = Promise.resolve();
  const serial = action => { const result = tail.then(action); tail = result.catch(() => {}); return result; };
  function find(data) {
    const entries = Object.values(data?.entries ?? {}).filter(entry => entry?.extensions?.[KEY]?.schema === 'tisya.ledger-storage/1');
    check(entries.length <= 1, 'DUPLICATE_LEDGER', 'Worldbook B has multiple ledger entries');
    return entries[0] ?? null;
  }
  function decode(entry) {
    if (!entry) return copy(initial);
    check(same(entry.extensions[KEY].owner, expectedOwner), 'LEDGER_OWNER', 'Worldbook B belongs to another chat or branch');
    check(entry.disable === true && entry.constant === false && entry.key?.length === 0 && entry.keysecondary?.length === 0 && entry.probability === 0, 'LEDGER_ACTIVATION_RISK', 'Private table ledger activation flags changed');
    let value; try { value = JSON.parse(entry.content); } catch { throw new HostAdapterError('LEDGER_FORMAT', 'Table ledger content is not JSON'); }
    check(Number.isSafeInteger(value?.revision) && value.revision === entry.extensions[KEY].revision, 'LEDGER_REVISION', 'Table ledger revision metadata differs');
    return value;
  }
  return Object.freeze({
    capabilities: Object.freeze({ managedSingleWriter: true, conditionalWrites: false, consistencyScope: 'single-controller', crossWindowAtomicity: false, verifiedWriteReadback: true }),
    read: () => serial(async () => { const state = decode(find(await transport.readFresh(bookId))); observed = copy(state); return state; }),
    compareAndWrite: (expectedRevision, next) => serial(async () => {
      const data = await transport.readFresh(bookId) ?? { entries: {} }, wire = find(data), current = decode(wire);
      check(current.revision === expectedRevision && next?.revision === expectedRevision + 1, 'LEDGER_CONFLICT', 'Table ledger revision changed');
      check(observed && same(current, observed), 'LEDGER_EXTERNAL_CHANGE', 'Table ledger changed after read');
      const target = wire ?? transport.createEntry(bookId, data);
      check(target && Number.isInteger(target.uid), 'WORLD_UID', 'Host did not allocate a ledger UID');
      Object.assign(target, { content: JSON.stringify(next), comment: 'Tisya W24 private ledger', disable: true, constant: false, vectorized: false, key: [], keysecondary: [], probability: 0, useProbability: true, excludeRecursion: true, preventRecursion: true });
      target.extensions = { ...(target.extensions ?? {}), [KEY]: { schema: 'tisya.ledger-storage/1', owner: expectedOwner, revision: next.revision } };
      await transport.save(bookId, data);
      const actual = decode(find(await transport.readFresh(bookId)));
      check(same(actual, next), 'LEDGER_READBACK', 'Table ledger readback differs from write');
      observed = copy(actual);
      // Explicit contract: this detached state is the exact fresh readback from
      // this write, not the submitted candidate or an arbitrary save result.
      return { revision: actual.revision, state: copy(actual) };
    }),
  });
}
