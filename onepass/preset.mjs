import {applyCreativeRevision} from './creative.mjs';
import {PIPE_ROWS} from './pipes.mjs';
import {sixEntries,SIX_KEYS} from '../six/preset.mjs';
export const ONEPASS_ID='tisya-onepass-1';
export const ONEPASS_KEYS=SIX_KEYS;
export const isOnePassPreset=source=>source?.protocol===ONEPASS_ID||source?.prompts?.some(p=>p.content?.includes('{{tisya_live_onepass_')||p.identifier==='tisya_registry'&&p.content?.includes('[ONEPASS.CONTRACT]')&&p.content.includes('<reply id="'+ONEPASS_ID+'">'));
export function onePassEntries(configuration,moods,options={}){
 const out=sixEntries(configuration,moods,options);
 if(options.structured===false)return out;
 out.tisya_registry=out.tisya_registry
  .replace('Preserve all six blocks and their order, including empty extra and actions. Public think blocks contain brief creative conclusions, never private reasoning.','Preserve all eleven blocks in order: task/think-before/title/body/think-after/status/extra/vars/archive/memory/actions. task and both think blocks contain public conclusions only, never private reasoning. Historical reply layouts are source material, not this turn’s output contract.')
  .replace('<reply>','<reply id="'+ONEPASS_ID+'">\n<task format="pipes">\n偏好：明确要求|{effective scope}|{exact user feedback or confirmed preference source}|{this turn application}\n偏好：候选|{this turn only}|{actual feedback evidence}|{reversible interpretation, not confirmed}\n</task>')
  .replace('<title>','<title format="pipes">')
  .replace('<extra>',machineSkeleton('status')+'\n<extra>')
  .replace('</extra>','</extra>\n'+['vars','archive','memory'].map(machineSkeleton).join('\n'));
 out.tisya_registry=out.tisya_registry.replace('[/REGISTRY]',ONEPASS_CONTRACT+'\n[/REGISTRY]');
 out.tisya_task_start=out.tisya_task_start.replace('No independent form or archival execution is implied.','ONEPASS_STATE supplies the actual registry, rows, revisions, focus and elapsed-world window. Classify these facts before creation; produce their updates once in this reply.');
 out.tisya_delivery_warning+='\nUse the complete eleven-block ONEPASS contract. Preserve every outer block, both public think digests and their configured comments. Follow the fixed-column pipes contract for state and archival proposals. Never copy historical layouts or claim persistence without a host receipt.';
 applyCreativeRevision(out,configuration);
 return out;
}
const standards={
 编号:'既有编号；新增用 +E1、+F1 等不同编号',所属事实:'本次事实发现行编号',快照:'逐字填写 ONEPASS_STATE.basis',提交编号:'本次所有实际提交的主记录编号列表；无变化用 []',关联编号:'相关记录编号或 ~',缺项:'精确缺项',解除条件:'继续所需的实际条件',
 证据:'本条完整正文段号列表 P1、P2；无证据的记录列入待定',原文段号:'本条正文段号列表 P1、P2；= 继承证据',读者:'获准读者或对象编号列表；无人用 []',知情者:'有实际获知依据的对象编号列表；无人用 []',
 对象:'对象编号列表；= 继承本组共用对象',主体:'单一对象编号；= 仅继承单个共用对象',参与者:'对象编号列表；= 继承共用对象',事实:'事实编号列表',相关对象:'对象编号列表',锚点事件:'已发生事件编号列表',
 确认程度:'K0/K1/K2/K3；确定程度与认识真假分别保存',登记字段路径:'快照登记的 table.字段；不填脚本或原生变量路径',原值:'快照中该字段的实际值',新值:'有依据的新数值或 true/false',变化后文本:'实际变更后的叙事描述',
 地点:'地点编号列表',故事时间:'已确定故事时间；未知用 ~',生效时间:'已确定生效时间；= 继承共用故事时间',到期轮次:'绝对已保留 AI 回复数，不是延后轮数',
 公开范围:'读者或对象编号列表；不得推定获得知识',阶段:'埋设/推进/回收/作废',类别:'喜好/厌恶/习惯/回忆/安心方式/边界',默契层次:'共同经历/明确约定/单方联想/待确认',确定性:'明确自述/反复表现/单次观察/暂定',有效性:'描述：有效/失效/待确认；习惯：有效/已改变/待确认',状态:'等待/到期/完成/取消',领域:'方向/法则/空间/生态/社会/生活/文化/时间'
};
const idLists=new Set(['替代事实','任务','事件','关联事件','前置事件','后续事件','涉及对象','地点引用','参与者引用','关联对象']);
const textLists=new Set(['动作','神态','语言','触发线索','标签','可观察线索']);
function machineSkeleton(block){
 const lines=Object.entries(PIPE_ROWS[block]).map(([kind,fields])=>kind+'：'+fields.map(key=>'<'+(standards[key]??(idLists.has(key)?'有效编号列表':textLists.has(key)?'有依据的文本列表':'实际'+key+'；未知用 ~'))+'（按本列语义填写；不复述别列）>').join('|'));
 return '<'+block+' format="pipes">\n'+lines.join('\n')+'\n</'+block+'>';
}
export const ONEPASS_CONTRACT=String.raw`
[ONEPASS.CONTRACT]
本轮一次原生生成，完成创作、正文、固定列归档提案；不另调表单、记忆或偏好模型。宿主按同一快照校验后保存，输出本身不是成功回执。
十一块及顺序固定：task/think-before/title/body/think-after/status/extra/vars/archive/memory/actions。旧回复仅为历史，不改变本轮格式。task 只填写实际偏好反馈；开启摘要时，before 五个创作选择按顺序；after 七个独立成果，缺项用 留白|原类别|具体原因。保留已启用的短评与情绪配置。
公开摘要列数固定：普通 before 行 2 列，设计和解锁各 4 列，三类短评各 3 列；普通 after 成果 2 列，留白与任务行 3 列。只更换每列文本，不把问句里的分句拆成新列；文字中的竖线必须转义。所有 think 只输出简短、可公开的创作结论，不输出内部推导。
数据职责：memory 存已发生事件、事实发现、伏笔和倒计时及事实子表；status 存叙事描述、认知、习惯锚点；vars 只更新已有业务记录的数值或布尔值；archive 核对本批编号并列待定。这里不结算额外场外事件；后续可能不冒充已发生。extra 保留原卡显示组件，不放写入命令。
固定列共用约束：类别后用全角冒号，列用 |；同类或不同类记录可分行，或用 & 连接。列表用 、。先对单元格内的反斜线、竖线、&、顿号、换行、回车、TAB 转义为 \\, \|, \&, \、, \n, \r, \t，再将 & 和 < XML 转义一次。作为分隔符的 & 也可写 &amp;。列序不可改变，不能加列；只省略末尾连续 ~，中间缺值须保留 ~ 或空列。占位问句、括号填写说明不输出。
~ 表示未提供，更新时保留原值；= 只能继承本块最近一条共用行中语义和类型相同的值；! 只清除可清除的可选字段；[] 是实际空列表；null 只用于登记可空类型；0、false 必须原样保留。字面 ~、=、! 可转义为 \~、\=、\!。布尔只用 true/false；枚举从本列或快照字段定义选取，禁止混用中文是/否。
共用行作用至本块下一条共用行，不跨块继承。新记录必须明确证据、读者、知情者；无人范围用 []，未知权限不能伪填空范围。旧记录未填权限时保留原权限，不从亲近、同场或资料可见推断知情。
编号引用优先用 ONEPASS_STATE.aliases 的数字别名，也接受实际已有 ID；新记录使用 +E1、+F1、+C1 等唯一编号，同批可互引。名称不另填，由宿主保存编号作为新记录内部标识。不得把未建档角色名称猜作已有编号。归档行逐字回填 basis，第二列列出本批所有主记录编号，事实子表不重复计数；无变更填 []。存储版本由对应快照行绑定，不由模型猜写。
证据只能引用这条回复已完成正文的 P1、P2 等段号，宿主保留完整原段。只来自旧资料且本轮无可定位证据的项先列待定，不伪造正文或虚构已发生事件。事件原文段号省略时使用共用证据；事实子表必须跟随本批所属事实发现行，同一事实同类子表最多一项。后台秘密仍遵守已有披露权限，输出表格不扩大公开范围。
仅填写新增或实质变化的记录，未变化的不重写。开启摘要时各关注对象单独考虑其已知信息、事务、愿望、触发与可行行动；缺位置或档案则保留精确缺项，不强行出场或围绕玩家运转。空 status/vars/memory 可保留空标签或自闭合；archive 保留本轮真实基线。记录缺必要字段或未登记引用时不造值，在 archive 待定行注明缺项与解除条件。
描述行更新已有编号的已登记文本字段；编号须与 table.字段 所属表一致。变量行更新已有业务记录的直接数值/布尔字段，原值必须匹配快照且归属对象匹配共用对象。复杂状态字段缺登记路径时列待定，不生成 JSON。preferences 与 native_cells 由独立所有者处理；绑定原生引用的数值也不得在此重复写入。习惯/认知使用各自专行；本轮一个萌点不自动固化为长期性格或偏好。
伏笔仅记录本轮已出现内容及当前作用；新埋、推进、回收分别对应真实正文，不补造过去。短距离呼应可只留在事件，具备跨轮延续价值才建伏笔。不把 before 计划或 after 总结再建一份重复事件。
[/ONEPASS.CONTRACT]`;
