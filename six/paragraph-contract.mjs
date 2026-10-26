export const PARAGRAPH_CONTRACT='Preserve complete dialogue and consecutively numbered paragraphs. Start each paragraph with a consecutive positive integer and one ASCII space, then its text: 1 正文. Start at 1 and separate paragraphs with blank lines. Do not add a period, Chinese enumeration punctuation, parentheses, or Markdown list markers to the paragraph number.';
export function updateParagraphContract(text){
 if(typeof text!=='string'||text.includes(PARAGRAPH_CONTRACT))return text;
 return text.replace('Preserve complete dialogue and consecutively numbered paragraphs.',PARAGRAPH_CONTRACT).replace('{complete natural paragraphs numbered from 1, separated by blank lines}','{complete natural paragraphs in the exact form "1 text", "2 text", and so on, separated by blank lines; no punctuation after the number}');
}
