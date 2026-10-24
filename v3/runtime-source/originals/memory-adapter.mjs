import { OriginalStoreError } from './original-store.mjs';

/** Test adapter only. This is not a TauriTavern or MVU persistence implementation. */
export function createMemoryAdapter() {
  const rows = new Map();
  const key = (bookId, id) => JSON.stringify([bookId, id]);
  const copy = value => value === undefined ? undefined : structuredClone(value);
  let tail = Promise.resolve();
  const serial = work => { const task = tail.then(work); tail = task.catch(() => {}); return task; };
  const assertExpected = (actual, expectedVersion) => {
    const version = actual?.version ?? 0;
    if (version !== expectedVersion) throw new OriginalStoreError('VERSION_CONFLICT', 'Memory adapter expected version mismatch', { actualVersion: version, expectedVersion });
  };
  return {
    capabilities: Object.freeze({ uniqueIds: true, conditionalWrites: true }),
    read: async ({ bookId, id }) => copy(rows.get(key(bookId, id))) ?? null,
    list: async ({ bookId }) => [...rows.values()].filter(row => row.bookId === bookId).map(copy),
    create: request => serial(() => {
      const k = key(request.bookId, request.id), previous = rows.get(k);
      if (previous) throw new OriginalStoreError('VERSION_CONFLICT', 'Memory adapter record already exists');
      assertExpected(previous, request.expectedVersion);
      if (request.entry.version !== 1) throw new OriginalStoreError('VERSION_CONFLICT', 'New record must start at version 1');
      rows.set(k, copy(request.entry));
      return { id: request.id, version: request.entry.version };
    }),
    update: request => serial(() => {
      const k = key(request.bookId, request.id), previous = rows.get(k);
      if (!previous) throw new OriginalStoreError('SOURCE_NOT_FOUND', 'Memory adapter record is absent');
      assertExpected(previous, request.expectedVersion);
      if (request.entry.version !== previous.version + 1) throw new OriginalStoreError('VERSION_CONFLICT', 'Update must increment storage version');
      rows.set(k, copy(request.entry));
      return { id: request.id, version: request.entry.version };
    }),
    // Explicit test hook for out-of-band edits and failed-readback regressions.
    unsafeMutateForTest: ({ bookId, id }, edit) => { const value = copy(rows.get(key(bookId, id))); edit(value); rows.set(key(bookId, id), value); },
    size: () => rows.size,
  };
}
