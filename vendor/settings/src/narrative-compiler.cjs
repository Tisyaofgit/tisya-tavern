const {jsonClone}=require("./json-serialization.cjs");
const {PROTOCOL:Protocol}=require('./narrative-protocol.cjs');
const {buildIndependentContext}=require('./independent-context.cjs');
// Pure compiler. No platform writes, network, model calls or default initialization.
const {recursiveCanonical:stable}=require('./json-serialization.cjs');
function requireThat(ok, code) { if (!ok) throw new Error(code); }
const text = v => typeof v === 'string' && v.trim().length > 0;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const identifier = v => text(v) || (Number.isSafeInteger(v) && v >= 0);
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
function reference(v) {
  return object(v) && text(v.来源类型) && identifier(v.来源编号) &&
    text(v.角色路径) && identifier(v.实体编号) && identifier(v.修订);
}
function material(v, key, empty = true) {
  requireThat(object(v) && v.status === 'ok' && typeof v.text === 'string', 'MATERIAL_FAILED:'+key);
  requireThat(empty || text(v.text), 'MATERIAL_EMPTY:'+key);
  requireThat(Array.isArray(v.sources), 'MATERIAL_SOURCES:'+key);
  requireThat(v.text === '' || v.sources.length > 0, 'MATERIAL_UNSOURCED:'+key);
  for (const s of v.sources) requireThat(object(s) && identifier(s.id) && identifier(s.revision), 'SOURCE_REVISION:'+key);
  return v.text;
}
function resolve(ref, data, key) {
  requireThat(reference(ref), 'REFERENCE_SHAPE:'+key);
  requireThat(object(data) && stable(data.ref) === stable(ref), 'REFERENCE_MISMATCH:'+key);
  return material(data,key,false);
}
function createCompiler(contract, tasks, modules = {}) {
  const rows=contract.configurations;
  requireThat(rows.length===34, 'CONFIG_REGISTRY');
  return function compile(snapshot) {
    // JSON values from the owning service; untrusted getters/foreign objects must be decoded at that boundary.
    const {request, context, settings, task, materials, binding} = snapshot;
    requireThat(typeof request==='string' && /^[0-9a-f]{32}$/.test(request), 'REQUEST_ID');
    requireThat(object(context), 'CONTEXT');
    for (const k of ['chat','branch','epoch','historyRevision','configRevision','sourceRevision','personaId'])
      requireThat(identifier(context[k]), 'CONTEXT:'+k);
    requireThat(object(settings) && object(task) && own(tasks,task.name), 'TASK_UNKNOWN');
    requireThat(settings['缇斯亚当前任务']===task.name && text(task.goal) && text(task.output), 'TASK_SHAPE');
    requireThat(object(binding) && binding.用户身份编号===context.personaId && identifier(binding.绑定修订), 'BINDING');
    requireThat(stable(binding)===stable(settings['缇斯亚玩家绑定记录']), 'BINDING_SNAPSHOT');
    const mode=settings['缇斯亚玩家绑定方式'], switching=settings['缇斯亚玩家换角方式'];
    requireThat(['平台身份','关联档案'].includes(mode), 'BINDING_MODE');
    requireThat(['界面选择','明确指令'].includes(switching), 'SWITCH_MODE');
    requireThat(object(materials), 'MATERIALS');
    const archiveRef=settings['缇斯亚玩家档案引用'];
    requireThat(stable(binding.档案引用)===stable(archiveRef), 'BINDING_REFERENCE');
    const playerArchive=mode==='关联档案'
      ? resolve(archiveRef,materials.playerArchive,'playerArchive')
      : material(materials.playerArchive,'playerArchive');
    if(mode==='平台身份') requireThat(archiveRef===null && playerArchive==='', 'PLATFORM_ARCHIVE_CONFLICT');
    // Selection/switching is resolved by the controller; emit only the effective binding.
    const lines=[mode==='平台身份'?'BIND(玩家 := @player_binding);':'BIND(玩家 := @player_binding); READ(@player_archive);'];
    const extensionLines=[],extensions={};
    const values={},ruleValues={};
    if(task.name==='叙事') {
      for(const row of rows) {
        requireThat(own(settings,row.variable), 'CONFIG_MISSING:'+row.id);
        const value=settings[row.variable]; values[row.id]=value;
        if(row.id==='E01'){require('./action-range.cjs').resolveActionRange(value);continue;}
        if(row.id.startsWith('E')) {
          if(value===null) continue;
          requireThat(row.type==='array'?Array.isArray(value):row.type==='object'?object(value):text(value), 'CONFIG_TYPE:'+row.id);
          if(Array.isArray(value) && value.length===0) continue;
          if(row.id==='E03' && value==='自然叙事') continue;
          requireThat(own(modules,row.id) && typeof modules[row.id].compile==='function' && typeof modules[row.id].validate==='function', 'MODULE_UNAVAILABLE:'+row.id);
          requireThat(modules[row.id].validate(value,snapshot)===true, 'MODULE_CONFIG:'+row.id);
          const rule=modules[row.id].compile(value,snapshot);
          requireThat(text(rule), 'MODULE_EMPTY:'+row.id);
          extensions[row.id]=rule;extensionLines.push(row.id+' '+rule); continue;
        }
        let rule;
        if(row.type==='string') {
          requireThat(typeof value==='string' && own(row.rules,value), 'CONFIG_ENUM:'+row.id);
          rule=row.rules[value];
          if(row.id==='B02' && value==='指定 NPC')
            rule='镜头跟随人物 := '+resolve(settings['缇斯亚叙事视角人物'],materials.viewpoint,'viewpoint');
          if(row.id==='C01' && value==='选文风卡')
            rule='文风 := '+resolve(settings['缇斯亚叙事文风引用'],materials.style,'style');
          if(row.id==='C08' && ['指定单语','双语对白'].includes(value)) {
            const langs=settings['缇斯亚叙事语言配置'];
            requireThat(Array.isArray(langs)&&langs.every(text)&&new Set(langs).size===langs.length&&langs.length===(value==='指定单语'?1:2),'LANGUAGES');
            rule=value==='指定单语'?'使用'+langs[0]+'。':'对白使用'+langs.join('与')+'，逐句对应。';
          }
        } else if(row.id==='C06') {
          requireThat(Array.isArray(value) && value.every(v=>row.allowed.includes(v)) && new Set(value).size===value.length, 'CONFIG_ARRAY:C06');
          if(value.length===0) continue;
          rule=value.map(v=>Protocol.P.focus_rules[v]).join('');
        } else if(row.id==='C07') {
          requireThat(object(value) && Object.keys(value).length===3 &&
            Number.isSafeInteger(value.下限) && value.下限>0 && Number.isSafeInteger(value.上限) &&
            value.上限>=value.下限 && ['字','词'].includes(value.单位), 'CONFIG_RANGE:C07');
          rule='正文目标篇幅 := '+value.下限+'..'+value.上限+value.单位+'；统计范围服从 @output。';
        } else throw new Error('CONFIG_SCHEMA:'+row.id);
        ruleValues[row.id]=rule; lines.push(row.id+' '+rule);
      }
      requireThat(values.A02!=='允许代演'||values.A01==='完整代演','CONFLICT:A01/A02');
      requireThat(values.B03!=='外部观察'||values.B04==='行为外化','CONFLICT:B03/B04');
      if(values.B03==='限知'&&values.B04==='分段多人物内心')lines.push('内心插段标明人物；各段信息限于该人物可知范围；段落结束回到主镜头；玩家心理服从 A04。');
      if(values.B05!=='关闭'&&values.B02!=='多人物轮换')lines.push('旁线独立标明人物与场景；旁线结束回到主镜头；知情与秘密边界服从 B03、B06。');
    }
    // All optional materials still have explicit successful-empty receipts.
    const cardflow=material(materials.cardflow,'cardflow');
    const memory=material(materials.memory,'memory');
    if(materials.reserved!==undefined){requireThat(object(materials.reserved),'RESERVED_MATERIAL');for(const [key,value]of Object.entries(materials.reserved))material(value,'reserved.'+key);}
    const entry=tasks[task.name];
    const prose=task.name==='叙事'&&['互动叙事','大纲扩写'].includes(values.A06);
    const outputEnabled=snapshot.outputEnabled===undefined?true:snapshot.outputEnabled;
    requireThat(typeof outputEnabled==='boolean','OUTPUT_SWITCH');
    const execution=buildIndependentContext({request,settings,values,ruleValues,task:{...task,steps:entry.steps},prose,outputEnabled,outputOptions:snapshot.outputOptions,activeEntries:snapshot.activeEntries,extensions});
    const effectiveOutput=outputEnabled?execution.plainOutput:'';
    const writes={
      '缇斯亚本轮配置协议':'',
      '缇斯亚本轮任务单':'TASK := '+task.name+'; GOAL := '+task.goal+';',
      '缇斯亚本轮任务协议':execution.utility,
      '缇斯亚本轮执行参数':execution,
      '缇斯亚本轮角色流程':cardflow,
      '缇斯亚本轮输出协议':effectiveOutput,
      '缇斯亚本轮玩家档案':playerArchive,
      '缇斯亚本轮相关记忆':memory,
      '缇斯亚本轮扩展协议':extensionLines.join('\n')
    };
    // Fresh in-memory copies: later UI mutations cannot alter a compiled packet.
    return jsonClone({request,context,writes,manifest:{
      请求:request,聊天:context.chat,分支:context.branch,任务:task.name,协议修订:entry.version,装配版本:'0.6.12',独立条目版本:1,
      来源修订:context.sourceRevision,配置修订:context.configRevision,
      字段:Object.keys(writes),来源:[...Object.entries(materials).filter(([slot])=>slot!=='reserved'),...Object.entries(materials.reserved||{}).map(([slot,m])=>['reserved.'+slot,m])].flatMap(([slot,m])=>
        Array.isArray(m?.sources)?m.sources.map(s=>({槽:slot,编号:s.id,修订:s.revision})):[])
    }});
  };
}

module.exports={createCompiler,stable};
