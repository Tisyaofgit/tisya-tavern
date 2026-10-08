'use strict';
const {AUDIT}=require('../../vendor/foundation/rows-wire.cjs');
const PUBLIC=['A',['叙事组织','记录整理','玩家'],['读者','玩家'],['玩家']];
const SECRET=['E',['叙事组织','记录整理'],[],[]];
const P=JSON.stringify(PUBLIC),S=JSON.stringify(SECRET);

function fixture({memory='',status='',extra='',body='1\n门开了。\n\n2\n灯仍亮着。',
  title='场景：入夜|~|庭院、门口|旧城',id='journey-r4-fixture',taskExtra='',nextExtra=''}={}){
  return `<reply id="${id}">
<task format="pipes">
任务：推门|交代现场|门口
${taskExtra}
心声：关闭
</task>
<title format="pipes">
${title}
</title>
<body min="1" max="1000" unit="字">
${body}
</body>
<next format="pipes" audit_count="7">
${AUDIT.map(k=>'审计：符合|'+k+'|第1段').join('\n')}
${nextExtra}
心声：关闭
</next>
<status format="pipes">
${status}
</status>
<extra>${extra}</extra>
<vars/>
<archive/>
<memory format="pipes">
${memory}
</memory>
<actions format="pipes" actions_min="4" actions_max="6">
${['察看门锁','询问守卫','查看灯火','退到街边'].map(x=>'行动：调查|'+x+'|现场').join('\n')}
</actions>
</reply>`;
}

function richFixture(options={}){
  return fixture({
    title:'场景：抵达渡口|秋月初七 酉时|白鹭渡口|镜海',
    body:'1\n你与林舟抵达白鹭渡口，船票仍收在行囊里。\n\n2\n林舟低声说：“我有些担心。”他攥紧了衣角。\n\n3\n渡船靠岸，灯光落在水面。',
    status:`叙事状态：玩家|${P}|精神|~|"平静"\n知情：玩家|K3|亲历\n叙事状态：林舟|${P}|所在|~|"白鹭渡口"\n叙事状态：林舟|${S}|秘密|~|"SECRET_SENTINEL"`,
    memory:[
      `关联：白鹭渡口、船票|${P}`,
      `未完：待处理|SECRET_SENTINEL_未完|林舟|夜半|幕后计划|${P}`,
      `倒计时：轮|2|林舟|白鹭渡口|SECRET_SENTINEL_倒计时|${P}`,
      `条件：林舟|秘密|"SECRET_SENTINEL_条件"|${P}`,
      `失效：林舟|秘密|"SECRET_SENTINEL_失效"|${P}`,
      `事件：玩家、林舟|${P}|你与林舟抵达白鹭渡口，船票仍收在行囊里。`,
      '原文：段落1、2、3',
      '场景：抵达渡口|["秋月初七 酉时",null]|白鹭渡口|镜海',
      '结果：渡船已靠岸',
      '影响：两人可在渡口稍作休息',
      `认知：林舟|对外|听闻|${P}|渡船会在酉时抵达|船夫先前的告知`,
      `认知：玩家|自我|确认|${P}|船票仍在|亲自查看行囊`,
      `心理：林舟|${P}|我有些担心。|他攥紧了衣角。`,
      `心理：林舟|${P}|我有些担心。SECRET_SENTINEL_未来计划|他攥紧了衣角。`,
      `心理：林舟|${S}|SECRET_SENTINEL_私密心理|他攥紧了衣角。`,
      '伏笔：埋下|林舟|SECRET_SENTINEL_伏笔|衣角的暗号',
      `变动：渡船|靠岸|false|true|${P}`,
      '变因：渡船抵达渡口',
      '标签：白鹭渡口、林舟、船票、误信、SECRET_SENTINEL_真相',
      `事件：陌生人|${S}|SECRET_SENTINEL_私密事件`,
      '场景：SECRET_SENTINEL_标题|["明日",null]|SECRET_SENTINEL_地点|SECRET_SENTINEL_世界'
    ].join('\n'),
    ...options
  });
}

module.exports={fixture,richFixture,PUBLIC,SECRET};
