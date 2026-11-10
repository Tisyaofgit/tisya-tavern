// Presentation labels are derived; they never fill missing story facts.
export function displayText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function accountDisplayName(account) {
  return displayText(account?.name, displayText(account?.handle) ? '@' + account.handle : '未填网名');
}

export function accountMention(account) {
  const value = displayText(account?.name, displayText(account?.handle));
  return value ? '@' + value.replace(/^@+/, '') : '未填网名';
}
