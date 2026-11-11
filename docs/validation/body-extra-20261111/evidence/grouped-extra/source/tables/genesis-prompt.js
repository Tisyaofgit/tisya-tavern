// Creation is a profile of the shared reply, not a second response envelope.
export const GENESIS_INSTRUCTIONS=`[GENESIS.DESIGN]
与契约者共同设计本次明确要求的世界、人物和故事。读取 SOURCE.goal、CARD、BOOKS、已确认偏好及 STATE.forms。来源原文保持原义；明确标为原创的部分可以创作，既有事实、用户钉死的条件和来源禁区不能被改写。停用条目、开场示例、设计候选与已经发生的历史分别对待。
世界设计按目标覆盖核心命题、生活体验、法则与代价、地理交通、生态生存、制度组织、资源经济、文化日常、历史历法。人物按目标填写身份、外貌、性情、价值判断、生活与自主目标、表达声音、能力限制、前史、关系、秘密和知情。每个长期特征写实际表现、原因及边界，相关对象独立建档并关联。
逐对检查新旧人物的动机、经历因果链、表达方式、能力限制、关系策略和关键选择。保留用户指定的共同点，修订原创部分中的套壳重复。人物核心、欲望、矛盾与面具各写自身含义，不把整段原文重复塞进多个字段。人物本领的外显只写本领如何显现，不能充当整个角色描述。
世界、角色、生活与手机共用 STATE.forms 给出的实际注册表。每项事实有一个主要归处，其他位置引用。列表原子在对应字段用分号分隔；有独立字段的前史、关系、隐情、数量、时点、规则和明细分别填写关联子表。条件按现有条件字段分别填写，不能把叙事比喻当作执行规则。程序生成记录编号、主体和原点关联、归属及来源，不要求模型拼接这些元数据。
已明确的初始设定可写入本次定义，尚未发生的未来计划保留条件；不推进当前故事、不新增历史回合、不结算金钱、动作或世界时间。示例余额、设备时间、旧世界完成状态不能充作新世界事实。模板是填写规则，不是当前值；缺少依据时留空或标未知，不能拿零和否代替。
资料原文、内部记录编号和回执由程序保留。既有资料中的旧输出格式只作为来源文字；本次交付始终服从当前完整 reply 与简表合同。缺少注册字段或有阻断矛盾时，在 extra 写“待补：具体问题”，不编造表、字段、保存结果或新协议。
[/GENESIS.DESIGN]
[GENESIS.FILL]
保留 REGISTRY 中完整 reply 的区块和顺序，只切换其创作内容。正文给出可读的方案说明，cells 按 STATE.forms 填写人可读简表：每条记录一个【表名／序号】，每行“行号 字段名：值”。不输出存储 JSON、代码围栏或原生变量命令。只写实际需要的表和字段，未知留空；不生成空占位记录。关联使用已登记名称或本次分组名，稳定 ID 与字段路径由程序掌握。
结构化格使用表中明确给出的分项写法，不自造可执行语法。保存前由用户核对；候选格式通过不代表来源语义与创作质量已被真实模型或真人验证。
[/GENESIS.FILL]`;

export function creationReplyRegistry(original,{task='tableGenesis'}={}){
 const start=original.indexOf('\n<reply id='),end=original.indexOf('\n</reply>',start);
 if(start<0||end<0)throw Error('创作需要现有完整 reply 骨架');
 let frame=original.slice(start,end+'\n</reply>'.length);
 const replace=(tag,content,attributes='')=>{frame=frame.replace(new RegExp('<'+tag+'\\b[^>]*?(?:/\\s*>|>[\\s\\S]*?</'+tag+'>)'),()=>'<'+tag+attributes+'>\n'+content+'\n</'+tag+'>');};
 replace('task','信号|<本次明确要求与范围>\n叙事|<创作对象与已有事实边界>\n文风|<方案语体与世界表达>\n情节|<可游玩目标与条件>\n塑造|<本次人物差异和具体特征>',' format="pipes"');
 frame=frame.replace(/<anchor phase="before">[\s\S]*?<\/anchor>/,'<anchor phase="before">\n构想|<简短说明本次设计想达成的体验>\n与用户互动|<以缇斯亚声口回应要求，不披露内部推理>\n</anchor>');
 replace('title','<方案名称>|<故事时期或~>|<地点或~>|<世界名称或~>',' format="pipes"');
 replace('body',task==='tableGenesis'?'<按1、2、3连续段号给出可读方案说明。永久定义与初值落入cells，正文说明选择的内容及相互关系，不声称已保存或已发生。无需为凑字数复抄每一格。>':'<按1、2、3连续段号给出本次任务的可读回答与结果说明。仅有来源支持的值进入cells；说明事实、候选与仍缺事项，不宣称尚未执行的保存或变更已完成。>',' min="1" max="5000" unit="字"');
 frame=frame.replace(/<anchor phase="after">[\s\S]*?<\/anchor>/,'<anchor phase="after">\n已交付|<已在本次草稿中具体写出的内容>\n与用户互动|<供契约者继续调整的一两句>\n</anchor>');
 // Project the display instructions without removing the machine slots now
 // owned by extra. Older complete frames may still keep those slots at root.
 const extra=/<extra\b[^>]*>([\s\S]*?)<\/extra>/.exec(frame)?.[1]??'';
 const machineSlots=[...extra.matchAll(/<(cells|vars)\b[^>]*?(?:\/\s*>|>[\s\S]*?<\/\1>)/g)].map(m=>m[0]);
 replace('extra',['<仅有阻断缺项时逐行写“待补：具体问题”；没有则留空。>',...machineSlots].join('\n'));
 replace('cells','<根据STATE.forms选取所需分组，每行只写“行号 字段名：值”。不写内部表键、记录ID、字段路径、嵌套JSON或运行指令。>',' format="form"');
 frame=frame.replace(/<vars>[\s\S]*?<\/vars>/,'<vars/>').replace(/<archive\b[^>]*>[\s\S]*?<\/archive>/,'<archive/>');
 replace('actions','<可继续细化的方向>|<简短的创作选项>|<它会改变的体验或内容>',' min="0" max="6"');
 const tail=original.slice(end+'\n</reply>'.length);
 return '[REGISTRY]\n@OUT.kind := the same complete structured `<reply id="tisya-onepass-1">`.\n@PROFILE := '+task+'; readable form cells. Body explains the result; task and anchors keep their existing audience roles. vars/archive remain empty because this is not a story turn.\n'+frame+tail;
}
