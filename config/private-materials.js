// Exact markers written by v3/books and the original/ledger adapters.
// Ordinary disabled entries remain selectable through explicit user choice.
export const PRIVATE_TISYA_MARKERS=Object.freeze(['tisyaBook','tisyaNamespace','tisyaOriginal','tisyaTableLedger','tisyaBindingIntent','tisyaDraft','tisyaConfiguration']);
export const isPrivateTisyaEntry=entry=>PRIVATE_TISYA_MARKERS.some(key=>Object.hasOwn(entry?.extensions??{},key));
