'use strict';
// Neutral reproduction of the submitted nine-block reply. No user story text.
const AUDIT=['身份与授权','资料与知情','人物与关系','行动与因果','数值与机制','文风与表现','成稿与交付'];
function legacyFixture(){return `<reply>
<task format="yaml" audit_count="7">
tasks:
  - input: |-
      PRIVATE_INPUT
    plan: |-
      PRIVATE_PLAN
    stop: |-
      PRIVATE_STOP
refs:
  style:
    - |-
      PRIVATE_STYLE
  cast:
    - |-
      PRIVATE_CAST
pending: []
heart:
  status: 有内容
  items:
    - type: 输入评价
      mood: null
      text: 门外响起了敲门声。
    - type: 剧情吐槽
      mood: null
      text: 先把通知听完。
audit:
${AUDIT.map(kind=>`  - kind: ${kind}\n    status: 符合\n    evidence: |-\n      已核对当前场景。`).join('\n')}
characters:
  - actor: |-
      PRIVATE_ACTOR
    intent: PRIVATE_INTENT
    status: 符合
    evidence: |-
      PRIVATE_EVIDENCE
</task>
<title format="yaml">
text: |-
  门口的通知
time: 2001-10-12 08:30
place: 宿舍
world: 测试世界
</title>
<body min="2000" max="5000" unit="字">
门外响起了敲门声。
队友递来行程表，两人约定二十分钟后下楼。
</body>
<status format="json">
{}
</status>
<extra>
<schedule_app>
[Overview|270000^1350]
[LiveStatus|否^0^0]
</schedule_app>
</extra>
<vars format="json">
{"protocol":"mvu-json-patch","operations":[{"op":"delta","path":"/测试/计数","value":0},{"op":"replace","path":"/测试/开启","value":false}]}
</vars>
<archive/>
<memory format="json">
{"关联":[],"事件":[{"场景":{"引用":"title"},"参与者":["甲","乙"],"梗概":"PRIVATE_MEMORY","结果":[],"影响":null,"原文":null,"伏笔":[],"认知":[],"角色心理":[],"公开范围":"后台","知情者":["甲"],"设定变动":[],"设定原因":null,"标签":[]}],"未完事项":[],"倒计时":[]}
</memory>
<next format="yaml" actions_min="4" actions_max="6">
tasks:
  - type: 剧情待处理任务
    trigger: PRIVATE_TRIGGER
    text: PRIVATE_NEXT
actions:
  - type: 交流
    text: 询问集合时间
    source: 队友的通知
  - type: 操作
    text: 查看行程表
    source: 桌面的文件
  - type: 交流
    text: 确认准备事项
    source: 眼前的安排
  - type: 休整
    text: 整理衣物后下楼
    source: 二十分钟后出发
heart:
  status: 有内容
  items:
    - type: 输入评价
      mood: null
      text: 时间已经确认。
    - type: 剧情吐槽
      mood: null
      text: 别忘记行程表。
delivered:
  - 已交代集合时间。
candidates: []
</next>
</reply>`;}
module.exports={legacyFixture};
