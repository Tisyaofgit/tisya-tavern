// Build transcripts only from the rows selected for this prompt. A document's
// identity, rather than its display name, separates conversations.
import {phoneFormReferenceCandidates} from './phone-form-contract.mjs';
import {labeledNarrativeField} from './narrative-values.mjs';

const documents = 'X_NETWORK_DOCUMENTS';
const items = 'X_NETWORK_ITEMS';
const chatKinds = new Map([
 ['dm', '私聊'], ['私聊', '私聊'], ['group', '群聊'], ['群聊', '群聊'],
 ['bubble', '泡泡'], ['泡泡', '泡泡']
]);

export function indexChatTranscripts(state, rows) {
 const chats = new Map();
 const parents = new Map();
 for (const row of rows) {
  if (row.table_id !== documents) continue;
  const kind = chatKinds.get(row.values.kind) ||
   (!row.values.kind && row.values.participant_accounts?.length ? '会话' : null);
  if (kind) chats.set(row.record_id, {kind, context: row.values, messages: []});
 }
 if (!chats.size) return {chats, parents};
 for (const row of rows) {
  if (row.table_id !== items) continue;
  const stored = state.tables[items][row.record_id];
  let parent = row.values.thread_ref;
  if (!parent && !stored.states?.thread_ref && stored.values.collection_field === 'items' &&
      ['known', 'derived'].includes(stored.states?.parent_ref)) parent = stored.values.parent_ref;
  if (!parent) continue;
  const candidates = phoneFormReferenceCandidates(state, {
   tableId: items, recordId: row.record_id, field: 'thread_ref', target: documents, value: parent
  });
  if (candidates?.length === 1 && chats.has(candidates[0])) parents.set(row.record_id, candidates[0]);
 }
 return {chats, parents};
}

const clockPattern = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d(?::\d\d(?:\.\d+)?)?)(Z|[+-]\d\d:\d\d)?$/u;
function parsedClock(value) {
 const match = typeof value === 'string' && value.match(clockPattern);
 if (!match) return null;
 const stamp = Date.parse(match[1] + 'T' + match[2] + (match[3] || 'Z'));
 return Number.isFinite(stamp) ? {stamp, date: match[1], time: match[2] + (match[3] || '')} : null;
}

export function transcriptMessage(fields, ordinal) {
 const data = new Map(fields.map(field => [field.key, field.text]));
 const sender = data.get('by') || data.get('author');
 const body = data.get('text');
 const time = data.get('at');
 const extras = fields.filter(f => !['by','author','text','at','thread_ref'].includes(f.key)).map(labeledNarrativeField);
 const speech = [sender && sender + '：', body].filter(Boolean).join('');
 return {time, clock: parsedClock(time), ordinal, content: [speech, ...extras].filter(Boolean).join('\n  ')};
}

export function renderChatTranscript(chat) {
 const {header, messages} = chat;
 const timed = messages.every(message => message.clock);
 const ordered = messages.toSorted((a, b) =>
  (timed ? a.clock.stamp - b.clock.stamp : 0) || a.ordinal - b.ordinal);
 const lines = [header];
 let date;
 for (const message of ordered) {
  if (message.clock && message.clock.date !== date) lines.push(message.clock.date);
  date = message.clock?.date;
  const line = [message.clock?.time ?? message.time, message.content].filter(Boolean).join(' ');
  if (line) lines.push(line);
 }
 return lines.join('\n');
}
