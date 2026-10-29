import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseOnePassReply,inspectOnePass} from '../onepass/reply.mjs';
import {countBody} from '../reader-core.js';
const [input,output]=process.argv.slice(2);
if(!input)throw Error('Usage: node tools/check-model-reply.mjs INPUT [OUTPUT]');
const source=await readFile(input,'utf8'),result={input,sha256:createHash('sha256').update(source).digest('hex'),characters:source.length,syntaxPassed:false,persistenceTested:false};
try{
 const parsed=parseOnePassReply(source);
 result.syntaxPassed=true;result.blocks=Object.keys(parsed.blocks);result.beforeRows=parsed.publicReply.before.length;result.afterRows=parsed.publicReply.after.length;result.paragraphs=parsed.publicReply.paragraphs.length;
 result.rootId=parsed.rootId;result.wireCompatibility=parsed.wireCompatibility??null;
 result.titleCharacters=[...parsed.publicReply.title.text].length;result.titleWithinDefaultLimit=result.titleCharacters<=8;
 result.beforeChoicesComplete=['用户偏好','文风用词','情节取向','角色锚点','篇幅重点'].every(kind=>parsed.publicReply.before.some(row=>row.kind===kind));
 result.afterOutcomesComplete=['本轮变化','角色主动','世界动向','关系位移','人物厚度','语言亮点','下一步张力'].every(kind=>parsed.publicReply.after.some(row=>row.kind===kind||row.kind==='留白'&&row.cells[0]===kind));
 result.bodyCharacters=countBody(parsed.publicReply.paragraphs.map(p=>p.raw).join('\n\n'),parsed.attrs.body.unit);
 result.bodyRange={min:Number(parsed.attrs.body.min),max:Number(parsed.attrs.body.max)};
 result.bodyWithinRange=result.bodyCharacters>=result.bodyRange.min&&result.bodyCharacters<=result.bodyRange.max;
 result.commentPresence=Object.fromEntries(['before','after'].map(phase=>[phase,['输入评价','回应用户评价','剧情吐槽'].filter(kind=>parsed.publicReply[phase].some(row=>row.kind===kind))]));
 result.defaultCommentsComplete=Object.values(result.commentPresence).every(kinds=>kinds.length===3);
 result.defaultRangeAttributesPreserved=parsed.attrs.body.min==='2000'&&parsed.attrs.body.max==='5000'&&parsed.attrs.body.unit==='字'&&parsed.attrs.actions.min==='4'&&parsed.attrs.actions.max==='6';
 result.normalizations=parsed.publicReply.after.filter(row=>row.wireVariant).map(row=>({kind:row.kind,variant:row.wireVariant}));
 result.recordRows=Object.fromEntries(Object.entries(parsed.records).map(([key,value])=>[key,value.rows?.length??null]));
 result.standalonePrimaryRecordsAbsent=['status','vars','memory'].every(key=>parsed.records[key].rows?.length===0);
 result.standaloneMachineBlocksEmpty=['status','vars','memory'].every(key=>!parsed.blocks[key].trim());
}catch(error){result.code=error.code??error.name;result.message=error.detail??error.message;}
const inspected=inspectOnePass(source);result.summaryDiagnostics=inspected.details.value?.diagnostics??[];
if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
