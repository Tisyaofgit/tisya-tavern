/** Compare persisted JSON values without treating object insertion order as data.
 * Arrays, field sets, types and values remain exact. Do not run foreign getters
 * or toJSON methods while checking a host readback.
 */
export function sameJsonValue(left, right) {
  const leftPath = new Set(), rightPath = new Set();
  function compare(a, b) {
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'string' || typeof a === 'boolean') return a === b;
    if (typeof a === 'number') return Number.isFinite(a) && Number.isFinite(b) && a === b;
    if (typeof a !== 'object') return false;
    if (leftPath.has(a) || rightPath.has(b)) return false;
    const arrays = Array.isArray(a);
    if (arrays !== Array.isArray(b)) return false;
    if (!arrays) {
      const plain = value => {const proto = Object.getPrototypeOf(value); return proto === null || Object.getPrototypeOf(proto) === null;};
      if (!plain(a) || !plain(b)) return false;
    }
    const fieldsA = Object.getOwnPropertyDescriptors(a), fieldsB = Object.getOwnPropertyDescriptors(b);
    const keysA = Reflect.ownKeys(fieldsA), keysB = Reflect.ownKeys(fieldsB);
    if (keysA.length !== keysB.length || keysA.some(key => typeof key !== 'string' || !Object.hasOwn(fieldsB, key))) return false;
    if (arrays && (fieldsA.length.value !== fieldsB.length.value || keysA.length !== fieldsA.length.value + 1)) return false;
    leftPath.add(a); rightPath.add(b);
    try {
      return keysA.every(key => {
        const fieldA = fieldsA[key], fieldB = fieldsB[key];
        if (!Object.hasOwn(fieldA, 'value') || !Object.hasOwn(fieldB, 'value')) return false;
        if (arrays && key === 'length') return true;
        if (!fieldA.enumerable || !fieldB.enumerable) return false;
        if (arrays && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= fieldsA.length.value)) return false;
        return compare(fieldA.value, fieldB.value);
      });
    } finally {leftPath.delete(a); rightPath.delete(b);}
  }
  return compare(left, right);
}
