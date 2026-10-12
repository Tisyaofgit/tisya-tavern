'use strict';
const {fixture}=require('./journey-r4.cjs');

// Same technical layout as the supplied 35-paragraph reply; neutral prose.
// Preserve its orphan status locator instead of silently repairing its target.
function compactReplyFixture(){
 return fixture({
  body:Array.from({length:35},(_,i)=>`${i+1}\n排练室内的灯亮着，工作人员核对第${i+1}项安排。`).join('\n\n'),
  taskExtra:'心声：有内容|输入评价|null|先把安排看明白。',
  nextExtra:'待办：剧情待处理任务|可开始|前往候场区\n心声：有内容|剧情吐槽|null|还有时间核对行程。',
  status:[
   '叙事状态：队员甲|E|服装|正在整理|PRIVATE_STATUS',
   '叙事状态：队员乙|E|行动|递来水杯|PRIVATE_ACTION',
   '叙事状态：工作人员|E|行动|敲门|通知候场',
   '知情：全员|K3|听到门外通知'
  ].join('\n'),
  extra:'<accomplishment_report>\n[BrandDeals|无]\n[MagCovers|无]\n[VarietyShows|无]\n[FilmProjects|无]\n[Concerts|无]\n</accomplishment_report>\n<starchat_app>\n[Overview|270000^1350]\n[ChatRoom|观众^期待演出]\n[LiveStatus|否^0^0]\n[Danmu|无]\n[Gifts|无]\n</starchat_app>',
  memory:[
   '关联：[队员甲,队员乙,工作人员]|E',
   '权限：status|[/世界状态/当前时间]|A',
   '权限：vars|/世界状态/当前时间|A',
   '权限：vars|/玩家角色/好感度/队友/队员乙/好感度|A',
   '权限：extra|[starchat_app,ChatRoom]|A',
   '未完：待处理|前往候场区|[队员甲,队员乙,全员]|门外通知|行程安排|E',
   '倒计时：轮|1|[队员甲,全员]|演播厅|候场通知到期|E',
   '事件：[队员甲,队员乙,工作人员]|E|PRIVATE_EVENT',
   '原文：段落3、8、11、15、20、24、26、28、30、34',
   '场景：排练结束|[2001-10-12 10:22,2001-10-12 10:25]|[排练室]|演出活动',
   '结果：工作人员通知候场',
   '影响：即将离开排练室',
   '伏笔：推进|[队员甲,队员乙]|正式演出|门外通知',
   '认知：队员乙|对外|确认|E|PRIVATE_COGNITION|现场观察',
   '认知：队员甲|自我|确认|E|PRIVATE_SELF|亲身经历',
   '心理：队员甲|E|PRIVATE_PSYCHOLOGY|等待出发',
   '心理：队员乙|E|PRIVATE_PLAN|核对安排',
   '标签：[排练,候场,通知]'
  ].join('\n')
 }).replaceAll('心声：关闭\n','').replace('<vars/>','<vars format="json">'+JSON.stringify({protocol:'mvu-json-patch',operations:[
  {op:'replace',path:'/世界状态/当前时间',value:'2001-10-12 10:25'},
  {op:'delta',path:'/玩家角色/疲劳值',value:-5},
  {op:'delta',path:'/玩家角色/身体/疲劳值',value:-5},
  {op:'delta',path:'/玩家角色/身体/体能状态',value:5},
  {op:'delta',path:'/玩家角色/身体/心理状态',value:5},
  {op:'delta',path:'/玩家角色/好感度/队友/队员乙/好感度',value:3}
 ]})+'</vars>');
}
module.exports={compactReplyFixture};
