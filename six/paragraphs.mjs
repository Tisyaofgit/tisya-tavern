const fail=(code,message,details={})=>{throw Object.assign(Error(message),{code:'TISYA_V3_REPLY_'+code,details});};
const assert=(ok,...args)=>{if(!ok)fail(...args);};
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

