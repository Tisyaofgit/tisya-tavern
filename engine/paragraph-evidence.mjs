// Only a complete, trailing evidence expression is syntax; prose stays intact.
const atom='P\\d+(?:\\.\\.P?\\d+)?';
const single=new RegExp('\\s*\\|\\s*('+atom+')\\s*$','i');
const multiple=new RegExp('\\s*\\|\\s*('+atom+'(?:\\s*[;；,，、]\\s*'+atom+')*)\\s*$','i');
export function paragraphEvidence(line,allowMultiple=true){return (allowMultiple?multiple:single).exec(line);}
export function stripParagraphEvidence(line,allowMultiple=true){const m=paragraphEvidence(line,allowMultiple);return m?line.slice(0,m.index).trimEnd():line;}
