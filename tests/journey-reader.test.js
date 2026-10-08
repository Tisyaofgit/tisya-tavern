import test from 'node:test';
import assert from 'node:assert/strict';
import {projectJourney} from '../reader-core.js';
import {fixture,richFixture,PUBLIC,SECRET} from './fixtures/journey-r4.cjs';
import {readFileSync} from 'node:fs';
const P=JSON.stringify(PUBLIC),S=JSON.stringify(SECRET);
const permission=(fields={},base=PUBLIC)=>JSON.stringify({默认:base,字段:fields});
const event=(permission=P,lines=[],participants='玩家、林舟',summary='公开梗概')=>
  [`事件：${participants}|${permission}|${summary}`,...lines].join('\n');
const project=memory=>projectJourney(fixture({memory}));

test('rich reader view contains only public memory and exact NPC identities',()=>{
  const source=richFixture();
  const view=projectJourney(source,{playerName:'玩家',showPsychology:true});
  assert.deepEqual(Object.keys(view),['scene','associations','memories','characters','changes']);
  assert.equal(view.scene.title,'抵达渡口');
  assert.deepEqual(view.scene.time,{start:'秋月初七 酉时',end:null});
  assert.equal(view.memories.length,1);
  assert.deepEqual(view.memories[0].tags,['白鹭渡口','林舟','船票']);
  assert.deepEqual(view.characters.map(x=>x.name),['林舟']);
  assert.deepEqual(view.characters[0].cognition,[{
    kind:'对外',content:'渡船会在酉时抵达',source:'船夫先前的告知',certainty:'听闻'
  }]);
  assert.deepEqual(view.characters[0].psychology,[{content:'我有些担心。',evidence:'他攥紧了衣角。'}]);
  const serialized=JSON.stringify(view);
  for(const hidden of ['SECRET_SENTINEL','未完事项','倒计时','权限','知情','K3','误信','伏笔'])
    assert.equal(serialized.includes(hidden),false,hidden);
  assert.equal(source,richFixture(),'projection never rewrites the source');
  view.memories[0].participants.push('客户端修改');
  assert.equal(projectJourney(source).memories[0].participants.includes('客户端修改'),false);
});

test('reader emit is mandatory; read, knowledge, grade and null never grant visibility',()=>{
  for(const p of [
    ['A',['读者'],[],['读者']],
    ['A',['读者'],null,['读者']],
    [null,['读者'],null,['读者']],
    ['E',['叙事组织'],['别的读者'],['读者']]
  ]){
    const view=project(event(JSON.stringify(p)));
    assert.deepEqual(view,{scene:null,associations:[],memories:[],characters:[],changes:[]});
  }
  assert.equal(project(event(JSON.stringify(['E',null,['读者'],null]))).memories.length,1,
    'emit is authoritative even when grade/read/knowers differ');
});

test('parent and child cognition permissions are independent and truth grades never leave the reader',()=>{
  const rows=[
    `认知：林舟|对外|听闻|${P}|父级受限|公开来源`,
    `认知：林舟|对外|推测|${permission({'/5':SECRET})}|子级来源受限|秘密来源`,
    `认知：林舟|对外|误信|${P}|门已经开了|亲眼所见`,
    `认知：林舟|对外|确认|${P}|灯仍亮着|亲眼所见`,
    `认知：林舟|自我|推测|${permission({'/2':SECRET})}|我可能认错了|先前交谈`
  ];
  const view=project(event(permission({'/认知/0/4':SECRET}),rows));
  const cognition=view.characters.find(x=>x.name==='林舟').cognition;
  assert.deepEqual(cognition.map(x=>x.content),['门已经开了','灯仍亮着','我可能认错了']);
  assert.ok(cognition.every(x=>!Object.hasOwn(x,'certainty')));
  assert.equal(JSON.stringify(view).includes('秘密来源'),false);
  const childPublic=event(permission({},SECRET),[`认知：林舟|对外|听闻|${P}|不应显示|不应显示`]);
  assert.deepEqual(project(childPublic).characters,[]);
});

test('restricted scene and participants never fall back to the raw title or emit tag hints',()=>{
  const policy=permission({'/场景':SECRET,'/0':SECRET});
  const view=project(event(policy,['标签：庭院、门口、旧城、玩家、林舟、误信']));
  assert.deepEqual(view.scene,{title:null,time:null,places:null,world:null});
  assert.deepEqual(view.memories[0].participants,[]);
  assert.deepEqual(view.memories[0].tags,[]);
  assert.deepEqual(view.characters,[]);
});

test('no title, tag, participant, foreshadow, todo or timer shells/counts are returned',()=>{
  const metadataOnly=permission({'/场景':PUBLIC,'/0':PUBLIC,'/标签':PUBLIC,'/伏笔':PUBLIC},SECRET);
  const memory=[
    `未完：待处理|秘密未完|林舟|秘密触发|秘密依据|${P}`,
    `倒计时：轮|2|林舟|庭院|秘密计时|${P}`,
    `条件：林舟|秘密条件|true|${P}`,
    `失效：林舟|秘密失效|true|${P}`,
    event(metadataOnly,['标签：林舟','伏笔：埋下|林舟|秘密伏笔|秘密线索'])
  ].join('\n');
  assert.deepEqual(project(memory),{scene:null,associations:[],memories:[],characters:[],changes:[]});
  const onlyUnderstanding=permission({'/认知':PUBLIC},SECRET);
  const result=project(event(onlyUnderstanding,[`认知：林舟|对外|听闻|${P}|门开了|守卫说过`]));
  assert.deepEqual(result.memories,[]);
  assert.equal(result.scene,null);
  assert.deepEqual(result.characters.map(x=>x.name),['林舟']);
});

test('psychology is off by default and requires a complete authorized body echo plus evidence',()=>{
  const source=richFixture();
  assert.ok(projectJourney(source).characters.every(c=>c.psychology.length===0));
  assert.ok(projectJourney(source,{showPsychology:'true'}).characters.every(c=>c.psychology.length===0));
  const allowed=projectJourney(source,{showPsychology:true});
  assert.equal(allowed.characters.find(c=>c.name==='林舟').psychology.length,1);

  const body='1\n我有些担心。他攥紧了衣角。';
  const rows=[`心理：林舟|${P}|我有些担心。|他攥紧了衣角。`];
  for(const parent of [permission({'/心理/0/0':SECRET}),permission({'/心理/0/2':SECRET}),permission({'/心理/0/3':SECRET})]){
    const v=projectJourney(fixture({body,memory:event(parent,rows)}),{showPsychology:true});
    assert.ok(v.characters.every(c=>!c.psychology.length));
  }
  for(const column of [0,2,3]){
    const child=permission({['/'+column]:SECRET});
    const v=projectJourney(fixture({body,memory:event(P,[`心理：林舟|${child}|我有些担心。|他攥紧了衣角。`])}),{showPsychology:true});
    assert.ok(v.characters.every(c=>!c.psychology.length));
  }
  const mixed=projectJourney(fixture({body,memory:event(P,[`心理：林舟|${P}|我有些担心。明日实施秘密计划。|他攥紧了衣角。`])}),{showPsychology:true});
  assert.ok(mixed.characters.every(c=>!c.psychology.length),'mixed record is omitted whole, never clipped');
  const absentEvidence=projectJourney(fixture({body,memory:event(P,[`心理：林舟|${P}|我有些担心。|未公开证据`])}),{showPsychology:true});
  assert.ok(absentEvidence.characters.every(c=>!c.psychology.length));
});

test('psychology does not use HTML attributes, hidden elements, comments or Markdown metadata as public evidence',()=>{
  const rows=[`心理：林舟|${P}|秘密心理|可见依据`];
  const bodies=[
    '1\n<span title="秘密心理">可见依据</span>',
    '1\n<!--秘密心理-->可见依据',
    '1\n<span hidden="hidden">秘密心理</span>可见依据',
    '1\n<span style="display:none">秘密心理</span>可见依据',
    '1\n<span class="css-hidden">秘密心理</span>可见依据',
    '1\n[可见依据](https://example.test/秘密心理)',
    '1\n![秘密心理](https://example.test/a.png)可见依据'
  ];
  for(const body of bodies){
    const view=projectJourney(fixture({body,memory:event(P,rows)}),{showPsychology:true});
    assert.ok(view.characters.every(c=>!c.psychology.length),body);
  }
  const markdown=projectJourney(fixture({body:'1\n**秘密心理**，可见依据',memory:event(P,rows)}),{showPsychology:true});
  assert.deepEqual(markdown.characters.find(c=>c.name==='林舟').psychology,[{content:'秘密心理',evidence:'可见依据'}]);
});

test('quotes preserve complete referenced paragraphs and line endings; no excerpt from an unauthorized quote',()=>{
  const body='\r\n1\r\n\r\n第一段。\r\n仍属第一段。\r\n\r\n2\r\n第二段。\r\n';
  const source=fixture({body,memory:event(P,['原文：段落1、2'])});
  assert.deepEqual(projectJourney(source).memories[0].quote,{
    reference:'段落1、2',text:'第一段。\r\n仍属第一段。\n\n第二段。'
  });
  const denied=fixture({body,memory:event(permission({'/原文':SECRET}),['原文：段落1、2'])});
  assert.equal(projectJourney(denied).memories[0].quote,null);
  assert.equal(JSON.stringify(projectJourney(denied)).includes('段落1'),false);
  for(const reference of ['段落2、1','段落1、3'])assert.throws(()=>projectJourney(source.replace('原文：段落1、2','原文：'+reference)),e=>/^TISYA_PARAGRAPH_/.test(e.code));
});

test('setting changes preserve unknown old, null, false, zero and deletion without reviving hidden updates',()=>{
  const rows=[
    `变动：门|未知旧值|~|null|${P}`,
    `变动：门|删除|0|~|${P}`,
    `变动：门|假值|false|0|${P}`,
    `变动：门|隐藏旧值|"SECRET_OLD"|false|${permission({'/2':SECRET})}`,
    `变动：门|隐藏新值|"PUBLIC_OLD"|"SECRET_NEW"|${permission({'/3':SECRET})}`,
    `变动：门|父级隐藏新值|"PUBLIC_OLD_2"|"SECRET_NEW_2"|${P}`,
    `变动：门|父级隐藏对象|0|1|${P}`,
    `变动：门|隐藏删除|"PUBLIC_OLD_3"|~|${permission({'/3':SECRET})}`,
    '变因：门闩变化'
  ];
  const view=project(event(permission({'/变动/5/3':SECRET,'/变动/6/0':SECRET,'/变因':SECRET}),rows));
  assert.deepEqual(view.changes,[
    {kind:'setting',object:'门',field:'未知旧值',hasOldValue:false,hasNewValue:true,newValue:null,deleted:false},
    {kind:'setting',object:'门',field:'删除',hasOldValue:true,oldValue:0,hasNewValue:false,deleted:true},
    {kind:'setting',object:'门',field:'假值',hasOldValue:true,oldValue:false,hasNewValue:true,newValue:0,deleted:false},
    {kind:'setting',object:'门',field:'隐藏旧值',hasOldValue:false,hasNewValue:true,newValue:false,deleted:false}
  ]);
  for(const text of ['SECRET_','PUBLIC_OLD','门闩变化'])assert.equal(JSON.stringify(view).includes(text),false,text);
});

test('narrative status new values require their own emit and preserve JSON business values',()=>{
  const nested={权限:'业务字段，不是ACL',知情:['业务列表'],amount:0,enabled:false,items:[],value:null};
  const status=[
    `叙事状态：玩家|${P}|物件|~|${JSON.stringify(nested)}`,
    '知情：玩家|K3|内部知情依据',
    `叙事状态：玩家|${P}|删除|null|~`,
    `叙事状态：玩家|${permission({'/3':SECRET})}|隐藏旧值|"HIDDEN_OLD"|null`,
    `叙事状态：玩家|${permission({'/4':SECRET})}|隐藏新值|"VISIBLE_OLD"|0`,
    `叙事状态：玩家|${permission({'/0':SECRET})}|隐藏对象|1|2`,
    `叙事状态：玩家|${permission({'/2':SECRET})}|隐藏字段|1|2`,
    `叙事状态：玩家|${permission({'/4':SECRET})}|隐藏删除|"VISIBLE_OLD_2"|~`
  ].join('\n');
  const result=projectJourney(fixture({status})).changes;
  assert.equal(result.length,3);
  assert.deepEqual(result[0].newValue,nested);
  assert.deepEqual(result[1],{kind:'status',object:'玩家',field:'删除',hasOldValue:true,oldValue:null,hasNewValue:false,deleted:true});
  assert.deepEqual(result[2],{kind:'status',object:'玩家',field:'隐藏旧值',hasOldValue:false,hasNewValue:true,newValue:null,deleted:false});
  assert.equal(JSON.stringify(result).includes('内部知情依据'),false);
  assert.equal(JSON.stringify(result).includes('VISIBLE_OLD'),false);
});

test('native status requires a precise public sidecar, including all nested policy overrides',()=>{
  const status='原生状态：角色|玩家|数值|0\n原生状态：角色|林舟|物件|{"权限":"business","visible":true,"private":"SECRET_NATIVE"}';
  const memory=[
    `权限：status|["角色","玩家","数值"]|${P}`,
    `权限：status|["角色","林舟","物件"]|${permission({'/private':SECRET})}`
  ].join('\n');
  const view=projectJourney(fixture({status,memory}));
  assert.deepEqual(view.changes,[{kind:'status',type:'角色',object:'玩家',field:'数值',hasOldValue:false,hasNewValue:true,newValue:0,deleted:false}]);
  assert.throws(()=>projectJourney(fixture({status})),e=>e.code==='TISYA_MEMORY5_STATUS_PERMISSION_MISSING');
  assert.throws(()=>projectJourney(fixture({status,memory:memory.replace('["角色","玩家","数值"]','["角色","玩家","不存在"]')})),e=>e.code==='TISYA_MEMORY5_ACL_UNRESOLVED');
});

test('association and neutral tag permissions are independent, no arbitrary truth labels are accepted',()=>{
  const make=associationPermission=>[
    `关联：船票|${associationPermission}`,
    event(P,[
      `变动：门|开启|false|true|${P}`,
      '变因：门开了',
      '标签：林舟、庭院、旧城、船票、门、误信、确认、真相、支线、标题名称'
    ])
  ].join('\n');
  assert.deepEqual(project(make(P)).memories[0].tags,['林舟','庭院','旧城','船票','门']);
  const denied=project(make(permission({'/0':SECRET})));
  assert.deepEqual(denied.associations,[]);
  assert.deepEqual(denied.memories[0].tags,['林舟','庭院','旧城','门']);
});

test('player separation uses the bound exact name only and does not invent an alias or current state',()=>{
  const source=fixture({memory:event(P,[], '玩家、user、林舟')});
  assert.deepEqual(projectJourney(source,{playerName:'玩家'}).characters.map(c=>c.name),['user','林舟']);
  assert.deepEqual(projectJourney(source).characters.map(c=>c.name),['玩家','user','林舟']);
  assert.deepEqual(projectJourney(source,{playerName:'玩家 '}).characters.map(c=>c.name),['玩家','user','林舟']);
  assert.ok(projectJourney(source).characters.every(c=>!Object.hasOwn(c,'status')));
});

test('setting and status history stay distinct; identical public setting changes deduplicate',()=>{
  const row=`变动：门|开启|false|true|${P}`;
  const memory=[event(P,[row,'变因：推门']),event(P,[row,'变因：推门'])].join('\n');
  const status=`叙事状态：门|${P}|开启|false|true`;
  const view=projectJourney(fixture({memory,status}));
  assert.equal(view.memories.length,2);
  assert.deepEqual(view.changes.map(x=>x.kind),['setting','status']);
});

test('legacy or malformed transport reports an explicit failure instead of fabricated memory permissions',()=>{
  const legacy=readFileSync(new URL('./fixtures/legacy-reply.txt',import.meta.url),'utf8');
  assert.throws(()=>projectJourney(legacy),e=>e.code==='TISYA_JOURNEY_MEMORY_UNSUPPORTED');
  assert.throws(()=>projectJourney('<reply>broken</reply>'),e=>typeof e.code==='string');
  assert.throws(()=>projectJourney(fixture({memory:event('null')})),e=>/^TISYA_PERMISSION_/.test(e.code));
});
