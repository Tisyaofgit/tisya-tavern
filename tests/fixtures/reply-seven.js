const audits=['身份与授权','资料与知情','人物与关系','行动与因果','数值与机制','文风与表现','成稿与交付'];
export function sevenFixture({extra='<card><p>渡口公开面板</p></card>',vars='',actions=true,hearts=true}={}){
 const opening=hearts?'心声：有内容|输入评价|好奇|门前的选择倒是利落。\n心声：有内容|回应用户评价|促狭|这句评语，我记下了。\n心声：有内容|剧情吐槽|困倦|守卫总算抬头了。':'';
 const closing=hearts?'心声：有内容|输入评价|开心|这一步已经落稳。\n心声：有内容|回应用户评价|小得意|这回可有话说了。\n心声：有内容|剧情吐槽|憋笑|灯照着门，谁也省不了事。':'';
 return `<reply>
<task format="pipes" text="escaped">
任务：PRIVATE_INPUT|描写抵达渡口后的可见现场|PRIVATE_STOP
解锁：PRIVATE_SECRET_NAME|已获准的片段|PRIVATE_DISCLOSURE_BASIS
${['文风','世界观','环境','玩法','世界书','人物','历史','工具'].map(kind=>'资料：'+kind+'|PRIVATE_'+kind).join('\n')}
待定：PRIVATE_BINDING_GAP
人物：待确认|PRIVATE_ACTOR|~|PRIVATE_CHARACTER_BASIS
${opening}
</task>
<title format="pipes" text="escaped">
场景：渡灯|入夜|渡口\\、北岸、门前|镜海
</title>
<body min="1" max="1000" unit="字">
1
渡口的灯亮着，守卫从门边抬起头。

2
你停在灯光里，听见船铃响了两声。
</body>
<next format="pipes" text="escaped" audit_count="7">
${audits.map(kind=>'审计：'+(kind==='成稿与交付'?'待确认':'符合')+'|'+kind+'|'+(kind==='成稿与交付'?'正文长度尚未实测':'按已知现场核对')).join('\n')}
待办：剧情待处理任务|可开始|回应守卫的问候
待办：系统任务|收到保存回执后|确认本次归档结果
待办：下轮基础任务|用户决定去向后|继续当前场景
${closing}
已交付：门前现场
候选：PRIVATE_UNADOPTED
</next>
<extra>${extra}</extra>
<vars>${vars}</vars>
${actions?`<actions format="pipes" text="escaped" actions_min="4" actions_max="6">
行动：交流|向守卫询问渡船|守卫在门前
行动：调查|观察岸边灯火|当前可见的灯火
行动：移动|走向候船亭|亭子就在岸边
行动：休整|暂留原地等候|附近有空位
</actions>`:'<actions/>'}
</reply>`;
}
