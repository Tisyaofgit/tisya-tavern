'use strict';
const {fixture,SECRET}=require('./journey-r4.cjs');
function recordErrorFixture(){
 return fixture({
  status:`叙事状态：玩家|${JSON.stringify(SECRET)}|计划|~|PRIVATE_STATUS_CANARY`,
  memory:'事件：玩家|null|PRIVATE_MEMORY_CANARY',
  taskExtra:'资料：人物|PRIVATE_SOURCE_CANARY',
  nextExtra:'已交付：门口通知已送达'
 }).replace('任务：推门|','任务：PRIVATE_TASK_CANARY|')
   .replaceAll('心声：关闭','心声：有内容|剧情吐槽|null|门口还有人等着。');
}
module.exports={recordErrorFixture};
