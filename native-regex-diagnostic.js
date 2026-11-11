// Read-only metadata. Callbacks must only return snapshots; never refresh,
// compile, match, format, mutate, or execute rules. No input text is returned.
const own = (object, key) => {
 try {
  if (object === null || !['object', 'function'].includes(typeof object)) return {state: 'missing'};
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return !descriptor ? {state: 'missing'} : !('value' in descriptor) ? {state: 'unreadable'} : {state: 'known', value: descriptor.value};
 } catch { return {state: 'unreadable'}; }
};
const at = (object, key) => own(object, key).value;
const now = () => new Date().toISOString();
const validCount = value => Number.isSafeInteger(value) && value >= 0;
const known = value => ({state: 'known', value});
const unknown = reason => ({state: 'unknown', value: null, reason});
function field(object, key, accepts) {
 const item = own(object, key);
 return item.state !== 'known' ? unknown(item.state) : accepts(item.value) ? known(item.value) : unknown('invalid');
}
const boolean = (object, key) => field(object, key, value => typeof value === 'boolean');
const count = (object, key) => field(object, key, validCount);
const tally = () => ({true: 0, false: 0, unknown: 0});
const tri = item => item.state === 'known' ? item.value : null;
const add = (counts, value) => { counts[value === true ? 'true' : value === false ? 'false' : 'unknown']++; };
const and = (...values) => values.includes(false) ? false : values.includes(null) ? null : true;
function arrayLength(value) {
 try { return Array.isArray(value) ? count(value, 'length') : unknown('not-array'); }
 catch { return unknown('unreadable'); }
}
function placementAllows(rule, placement, budget) {
 const item = own(rule, 'placement'), length = arrayLength(item.value);
 if (item.state !== 'known' || length.state !== 'known' || placement === null || length.value > 32) return null;
 let incomplete = false;
 for (let index = 0; index < length.value; index++) {
  if (budget.remaining-- <= 0) return null;
  const entry = own(item.value, String(index));
  if (entry.state !== 'known') incomplete = true;
  else if (entry.value === placement) return true;
 }
 return incomplete ? null : false;
}
function rules(value, placement, reason, budget) {
 const length = arrayLength(value);
 const result = {status: 'unknown', reason: reason ?? (length.state === 'unknown' ? length.reason : null), total: null,
  disabled: null, markdownOnly: null, placementEligible: null, metadataEligible: null};
 if (reason || length.state !== 'known') return result;
 result.total = length.value;
 if (length.value > 10000) return {...result, reason: 'scan-limit'};
 Object.assign(result, {status: 'available', reason: null, disabled: tally(), markdownOnly: tally(), placementEligible: tally(), metadataEligible: tally()});
 for (let index = 0; index < length.value; index++) {
  if (budget.remaining-- <= 0) {
   for (const key of ['disabled', 'markdownOnly', 'placementEligible', 'metadataEligible']) result[key].unknown += length.value - index;
   result.status = 'partial'; result.reason = 'scan-limit'; break;
  }
  const row = own(value, String(index)), disabled = tri(boolean(row.value, 'disabled')), markdown = tri(boolean(row.value, 'markdownOnly'));
  const placementMatch = placementAllows(row.value, placement, budget);
  add(result.disabled, disabled); add(result.markdownOnly, markdown); add(result.placementEligible, placementMatch);
  add(result.metadataEligible, and(disabled === null ? null : !disabled, markdown, placementMatch));
 }
 return result;
}
// A supplied callback may return a native Promise. We use its intrinsic then,
// never a snapshot's arbitrary .then getter or foreign thenable implementation.
async function snapshot(item, timeoutMs) {
 if (item.state !== 'known') return {status: 'unknown', reason: item.state, readAtUtc: now()};
 if (typeof item.value !== 'function') return {status: 'available', value: item.value, readAtUtc: now()};
 let timer;
 const operation = new Promise(resolve => {
  const success = value => resolve({status: 'available', value, readAtUtc: now()});
  const failure = () => resolve({status: 'unknown', reason: 'callback-error', readAtUtc: now()});
  try {
   const value = item.value();
   try { Promise.prototype.then.call(value, success, failure); }
   catch { success(value); }
  } catch { failure(); }
 });
 try { return await Promise.race([operation, new Promise(resolve => { timer = setTimeout(() => resolve({status: 'unknown', reason: 'timeout', readAtUtc: now()}), timeoutMs); })]); }
 finally { clearTimeout(timer); }
}
function contextEvidence(contextResult, themeResult) {
 const context = contextResult.value, theme = themeResult.value;
 const chat = own(context, 'chatId'), extension = own(context, 'extensionSettings'), disabled = own(extension.value, 'disabledExtensions');
 const result = {basis: 'raw-context-and-config', contextStatus: contextResult.status, contextReadAtUtc: contextResult.readAtUtc,
  themeStatus: themeResult.status, themeReadAtUtc: themeResult.readAtUtc, sourceCapturedAtUtc: unknown('not-provided'), effectivePipelineVerified: false,
  chatIdPresent: chat.state !== 'known' ? unknown(chat.state) : ['string', 'number', 'undefined'].includes(typeof chat.value) || chat.value === null ? known(!!chat.value) : unknown('invalid'),
  themeNativeRegex: boolean(theme, 'nativeRegex'), regexExtensionDisabled: unknown(disabled.state !== 'known' ? disabled.state : 'not-array')};
 const length = arrayLength(disabled.value);
 if (disabled.state === 'known' && length.state === 'known' && length.value <= 10000) {
  let found = false, incomplete = false;
  for (let index = 0; index < length.value; index++) {
   const item = own(disabled.value, String(index));
   if (item.state !== 'known') incomplete = true;
   else if (item.value === 'regex') found = true;
   else if (typeof item.value !== 'string') incomplete = true;
  }
  result.regexExtensionDisabled = found ? known(true) : incomplete ? unknown('incomplete') : known(false);
 }
 if (contextResult.status === 'unknown') result.chatIdPresent = result.regexExtensionDisabled = unknown(contextResult.reason);
 if (themeResult.status === 'unknown') result.themeNativeRegex = unknown(themeResult.reason);
 return result;
}
/**
 * All options use own data properties. context and theme accept raw snapshots
 * or read-only callbacks; isUser is the current message's boolean. characterPresent,
 * characterAllowed and presetAllowed are optional boolean permission snapshots.
 * nativeDisplay.state/report
 * and hostRules.{allowedOnly,all}.{all,global,preset,scoped} accept snapshots or
 * read-only callbacks. Host scope callbacks must use the verified host getter;
 * omitted scopes remain unknown. NativeDisplay callbacks must NOT refresh it.
 * Flags are strict booleans: missing/nonboolean values remain unknown rather
 * than silently substituting defaults. Eligible counts do not establish matches
 * or depth/substitution/compilation/runtime success. The caller discards stale
 * reports after navigation; these independent reads are not an atomic snapshot.
 */
export async function collectNativeRegexDiagnostic(options = {}) {
 const startedAtUtc = now();
 const limit = at(options, 'timeoutMs'), timeoutMs = Number.isFinite(limit) ? Math.max(1, Math.min(5000, limit)) : 1500;
 const isUser = boolean(options, 'isUser'), placement = isUser.state === 'known' ? isUser.value ? 1 : 2 : null;
 const native = at(options, 'nativeDisplay'), host = at(options, 'hostRules');
 const keys = ['all', 'global', 'preset', 'scoped'], modes = ['allowedOnly', 'all'];
 const reads = [snapshot(own(options, 'context'), timeoutMs), snapshot(own(options, 'theme'), timeoutMs), snapshot(own(native, 'state'), timeoutMs), snapshot(own(native, 'report'), timeoutMs)];
 for (const mode of modes) for (const key of keys) reads.push(snapshot(own(at(host, mode), key), timeoutMs));
 const [context, theme, state, report, ...hosts] = await Promise.all(reads);
 const budget = {remaining: 20000};
 const stateValue = state.status === 'available' ? state.value : null;
 const currentRules = rules(at(stateValue, 'scripts'), placement, state.status === 'unknown' ? state.reason : undefined, budget);
 const nativeField = (source, key, accepts) => source.status === 'unknown' ? unknown(source.reason) : field(source.value, key, accepts);
 const output = {schema: 'tisya.native-regex-diagnostic/1', startedAtUtc, timeoutMs,
  boundaries: {readOnly: true, regexExecuted: false, pipelineRefreshed: false, matchingVerified: false, rawSettingsAreEffective: false, atomicSnapshot: false},
  message: {isUser, placement: placement === null ? unknown(isUser.reason) : known(placement)},
  context: {...contextEvidence(context, theme),
   characterPresent: boolean(options, 'characterPresent'), characterAllowed: boolean(options, 'characterAllowed'), presetAllowed: boolean(options, 'presetAllowed')},
  nativeDisplay: {basis: 'existing-pipeline-snapshot', stateStatus: state.status, reportStatus: report.status,
   stateReadAtUtc: state.readAtUtc, reportReadAtUtc: report.readAtUtc, pipelineLastRefreshedAtUtc: unknown('not-exposed'),
   enabled: nativeField(state, 'enabled', value => typeof value === 'boolean'),
   preparedEntryCount: nativeField(report, 'rules', validCount),
   revision: nativeField(report, 'revision', validCount), currentScriptCount: currentRules.total === null ? unknown(currentRules.reason) : known(currentRules.total), currentRules},
  hostRules: {basis: 'host-getter-snapshots', allowedOnlyFiltersExtensionDisabled: false, allowedOnly: {}, all: {}}};
 let index = 0;
 for (const mode of modes) for (const key of keys) {
  const item = hosts[index++];
  output.hostRules[mode][key] = {...rules(item.value, placement, item.status === 'unknown' ? item.reason : undefined, budget), readAtUtc: item.readAtUtc,
   sourceCapturedAtUtc: unknown('not-provided')};
 }
 output.finishedAtUtc = now();
 return output;
}
