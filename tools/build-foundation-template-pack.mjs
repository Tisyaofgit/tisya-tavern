import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {stringify} from 'yaml';
import {foundationCatalog,foundationTemplatePlan,foundationSessionTemplates} from '../tables/foundation-templates.js';

const output=resolve(process.argv[2]??resolve(dirname(fileURLToPath(import.meta.url)),'../docs/foundation-templates'));
await mkdir(output,{recursive:true});
const catalog=foundationCatalog(),plans=Object.fromEntries(Object.keys(catalog.originViews).map(k=>[k,foundationTemplatePlan(k)])),sessions=foundationSessionTemplates();
const names={character:'人物',item:'物品',place:'地点',organization:'组织',rule:'规则',world:'世界定义'};
const fileHashes={};
async function save(name,text){await writeFile(resolve(output,name),text);fileHashes[name]=createHash('sha256').update(text).digest('hex');}
const json=value=>JSON.stringify(value,null,2)+'\n';
await save('catalog.json',json(catalog));
for(const [kind,plan]of Object.entries(plans)){
 await save(kind+'.plan.json',json(plan));
 await save(kind+'.draft.json',json(plan.draft));
 await save(kind+'.expression.json',json(plan.expressionTemplate));
 await save(kind+'.fields.yaml',stringify({用途:'定义骨架，非可保存实例；路径从实际schema派生；不填默认值',对象:names[kind],字段:plan.fieldIndex.map(f=>({分组:f.groupLabel,表:f.table,路径:f.path,类型:f.definition.type,说明:f.definition.description??'',继承:f.inheritance}))}));
}
await save('session-templates.json',json(sessions));
const guide=`# 基点、原点与会话基础模板 · FT21

状态：单一新版候选。人物提炼已有作者入口、可恢复草稿、逐格诊断与一次入档；状态登记、数字等级、创世数值公式、成长与已确认事件结算复用同一账本。未安装到正式扩展，Android未验。

人物先写性格核心标签、欲望双螺旋、核心矛盾与面具呈现/作用/裂隙；多股欲望之间可冲突、依赖和牵制。材料不足就留空，不强造第二欲望、创伤、动机或伪装。精简提炼只使用当前一套表面，字段来自tables/foundation/catalog.js，不保留旧提炼布局或旧枚举等级模式。

前史保留经过、当时理解、延续影响及明确涉及对象；关系对象不限人物，但须有持续联系依据。子表数量由材料提炼，不预设。对象汇总仅来自明确引用，不扫描文字推导知情。原始材料、模型首次回答与各次修订分别留存；机械结构通过不等于已经证明语义无损。

## 一处定义，多种阅读方式

唯一模板定义为源码tables/foundation-definitions.js，foundation-templates.js只读编译现行schema。此目录的JSON/YAML/HTML均为派生产物，手改阅读稿不会改运行定义。

定义模板规定类型、路径、引用、缺失和责任；实例草稿只带待填结构与“未讨论”，不伪造值；表达槽由字段说明约束有依据的叙事。人物各组是创作视图，基点/原点/会话是来源与时间层次，两者交叉，同一事实只存一个主要归处。未接机制详见foundation-framework.md。

## 基点

复用origin.coreAssets及既有traits/growth、资产组members/links。每项保留稳定ID、名字、意义/值、连续来源证据；来源对象、版本、被选成长及关联闭包沿现有容器保存。核心意义、价值取舍、形成因果、能力用途与代价、辨识锚点分项表达。无来源不补作者意图；非核心外形允许世界化。只有明确选择的成长和关联进入提取；旧世界人名、装备持有、知情与任务完成状态不直接迁移。

## 原点与人物分组

目标卡/世界中的具体版本写origin.bases，以ID@rev选用；coreAdaptations保留基点项→实际字段表达的映射。卡内直接定义的对象可以没有基点，但仍走同样的字段与来源检查。只给对象类别适用的字段，不把人物字段套给地点、组织或设备。

身份复用名称/别名；形貌、性情、生活、表达、本领、核心与面具各有单独含义。字段只按本版定义生成；不存在旧文本迁移表或新旧两份权威档案。

经历（前史）、关系底稿和隐情以facts独立记录，人物页通过对象引用组合显示。一个前史事实、一条有方向的关系、一项独立秘密各有记录与权限；事实命题只存一次。秘密的可观察线索与事实、人物认知、实际揭示分开。正文中同场、目录可见、读者可读均不授予人物知识；同一记录不能混装不同知情范围的秘密。

## 会话继承和推进

原点只提供固定版本的底档；首次明确开局设计才建立scene/state/relations/holdings/cognition等初值。人物出身地不复制成当前位置，惯常衣着不复制成当前装备，原点关系不自动绑定新U，原点秘密不自动成为开局知识。后续剧情按真实来源写增量，原点底档保持；当前画像可引用经历与成长组成，但这种完整画像合成尚未接入。

复制/导入旧会话不重新继承；从锚点分支只能用那个时点成立的状态，不能拿最新原点或未来知情补齐。完整新U映射及因果分歧仍未实现。会话成长回流基点必须重新显式选择，不自动升级所有世界的原点。

## 缺失、数值和扩展

未提供保持未提供；0、false、明确空列表各有意义，不能当缺失。草稿里的“未讨论”是工作流状态，不写成角色的性格、背景或秘密。人物可以无秘密、无创伤、无超凡能力，各组不要求都有已知内容。

设备固定数值和世界机械属性由已确认定义另加可选number字段，字段描述写单位、语义和边界；不预设光度计或任何具体世界数值，不用大段文本替代可检索的数值。当前资源统一进state账本；外部所有者须显式注册其接口，不能建立第二份可写余额。新字段同批显式提案并校验；拒绝冲突不代表禁止合法扩展。

## 行元数据与责任

- id/rev：应用分配稳定身份和修订，显示名可改，同名不得误合。
- source、逐变更evidence及时间：引用真实来源；剧情时间与记录时间分开。
- access.readers / access.knowers：读者访问与人物接触分别核定；不能由字段表推定知情。
- lockedFields：保护人工值；过期修订、较新来源与锁定冲突留作具体缺项，不绕过或静默丢失。
- 基点由明确资产提取保存；原点由已确认创世保存；会话变更由归档/显式开局/受控运行提交。模板编译器和阅读页面都没有写入责任。

## 下一阶段

下一阶段接档案条件到世界登记字段、持续条件失效、概率机会回执、冷却/次数以及跨对象数值操作。基点与世界适配、模型语义、完整主叙事及Android继续分别验收，不把候选代码通过当作已实装。

设计依据：创世蓝图R6的MOD-G02/G03、MOD-P01—P10、MOD-O01—O06；已恢复历史九组骨架与schema；现有core-assets.js、schema.js、ledger.js、service.js。历史模板仅为结构来源，其旧存储/空值合同未直接移植。
`;
await save('GUIDE.md',guide);
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const table=(head,rows)=>'<div class="scroll"><table><thead><tr>'+head.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const calibration=[['来源','每项取值或表达能回到已确认原文、设计输入或明确选择；未提供保持缺失'],['身份','引用稳定ID和修订；相同名字不自动合并；源成员ID与目标对象ID分开'],['意义','逐核心项对照具体世界表达，保留动机、作用、代价及关联，不只保留标签'],['层次','前史与原点固定版本、开局初值、会话增量分别落位'],['权限','事实、可观察线索、读者可见、人物知情分别核定'],['继承','逐项核对新U关系、背包、当前位置与知识；没有确认不得从旧会话带入'],['结构','同一schema派生请求和表单；扩展先校验，重复提交不重复建字段'],['确认','未讨论、未填写和无此项不同；进入下一项不等于自动定稿']];
const sections=Object.entries(plans).map(([kind,p])=>'<section id="'+kind+'"><h2>'+names[kind]+' · 原点基础表</h2><p>'+p.groups.length+' 个分组，'+p.fieldIndex.length+' 个字段入口。各项按需启用，未填不补默认；秘密和关系底稿为独立记录。</p>'+p.groups.map(g=>'<details><summary>'+esc(g.label)+' <small>'+esc(g.table)+'</small></summary>'+table(['字段路径','类型','含义与填写边界','继承方式'],p.fieldIndex.filter(f=>f.group===g.id).map(f=>[f.path.join('.'),f.definition.type,f.definition.description||'复用现行字段定义；姓名/别名不复制到第二处',f.inheritance]))+'</details>').join('')+'</section>').join('');
const body='<section id="calibration"><h2>表单推进 · 八项校准基准</h2>'+table(['检查项','通过标准'],calibration)+'</section><section><h2>先看继承边界</h2>'+table(['来源','去向','处理规则'],catalog.inheritance.map(p=>[p.from,p.to,p.rule]))+'</section><section id="core"><h2>基点 · 保留什么</h2>'+table(['项目','现有容器','填写方向'],catalog.coreSlots.map(s=>[s.label,s.target,s.prompt]))+'</section><section id="bindings"><h2>档案继承 · 凭据与责任</h2><p>这些路径来自现有保存结构；它们不是要求模型另造的一套档案字段。</p>'+table(['凭据','实际保存路径','结构','写入责任','校准规则'],catalog.bindings.map(b=>[b.label,b.path,b.type,b.owner,b.rule]))+'</section>'+sections+'<section id="session"><h2>会话 · 当前值与变化</h2>'+sessions.map(s=>'<details><summary>'+esc(s.label)+' <small>'+esc(s.table)+'</small></summary><p>'+esc(s.inheritance)+'</p>'+table(['字段路径','类型','含义'],s.fields.map(f=>[f.path.join('.'),f.definition.type,f.definition.description||'按明确来源填写；不由模板继承旧会话值']))+'</details>').join('')+'</section><section id="guide"><h2>完整使用与待办</h2><pre>'+esc(guide)+'</pre></section>';
await save('foundation-review.html','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>缇斯亚 · 基础模板与继承表 R1</title><style>body{margin:0;background:#f3f1ea;color:#243b38;font:16px/1.75 system-ui,sans-serif}header,main{max-width:1040px;margin:auto;padding:24px}h1{font-size:28px;line-height:1.35}h2{font-size:22px;margin-top:0}header p{max-width:780px}nav{display:flex;gap:8px;flex-wrap:wrap}a{color:#285f57}nav a{padding:6px 12px;border:1px solid #b7c7be;border-radius:16px;text-decoration:none}section{margin:0 0 24px;padding:20px;background:#fffdf7;border:1px solid #d9dfd3;border-radius:16px}details{margin:12px 0;border-top:1px solid #d9dfd3;padding-top:12px}summary{cursor:pointer;font-weight:650}small{color:#657b75;font-weight:400}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #e0e6db;min-width:105px;overflow-wrap:anywhere}th{background:#edf2e8}td:first-child{min-width:150px}.scroll{overflow:auto}pre{white-space:pre-wrap;font:inherit}.tag{color:#87642b;background:#f4e7c8;padding:4px 10px;border-radius:8px;display:inline-block}@media(max-width:600px){header,main{padding:16px}section{padding:14px}h1{font-size:25px}th,td{padding:8px}}</style><header><span class="tag">FT21 · 新版候选 · 尚未正式安装</span><h1>基点、原点与会话<br>基础模板与继承表</h1><p>先确定字段属于哪里、怎样继承，再校准表单推进。这里展示完整字段定义，不会修改任何聊天或存档。</p><nav>'+[['calibration','校准标准'],['core','基点'],['bindings','继承凭据'],...Object.entries(names),['session','会话'],['guide','说明与待办']].map(([id,label])=>'<a href="#'+id+'">'+label+'</a>').join('')+'</nav></header><main>'+body+'</main></html>');
const report={format:'tisya.foundation-template-export/1',status:'candidate-not-installed',originGroups:Object.fromEntries(Object.entries(plans).map(([k,p])=>[k,p.groups.length])),originFields:Object.fromEntries(Object.entries(plans).map(([k,p])=>[k,p.fieldIndex.length])),sessionTables:sessions.length,sourceOfTruth:'tables/foundation-definitions.js',generatedFiles:fileHashes};
await writeFile(resolve(output,'export-manifest.json'),json(report));console.log(JSON.stringify({output,...report}));
