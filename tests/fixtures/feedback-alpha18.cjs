const {compactReplyFixture}=require('./compact-permissions.cjs');
// User's regenerated 35-paragraph structure: no vars payload, but one stale
// status JSON Pointer and an independent extra sidecar. Prose stays neutral.
function feedbackReplyFixture(){return compactReplyFixture()
 .replace('待办：剧情待处理任务|可开始|前往候场区','待办：剧情待处理任务|可开始|前往候场区\n待办：剧情待处理任务|可开始|核对后续行程\n已交付：舞台演出收尾')
 .replace(/<vars format="json">[\s\S]*?<\/vars>/,'<vars/>')
 .replace(/^权限：vars[^\n]*\n/gm,'')
 .replace('原文：段落3、8、11、15、20、24、26、28、30、34','原文：段落5、8、10、12、15、18、21、22、28、31、33');}
module.exports={feedbackReplyFixture};
