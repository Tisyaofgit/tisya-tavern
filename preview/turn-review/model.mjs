// Isolated prototype state. No production database or host API is imported.
const clone = value => structuredClone(value);
const ref = (table, record, key) => `${table}|${record}|${key}`;
const known = value => ({ state: 'known', value });
const unknown = () => ({ state: 'unknown', value: null });
const SCENE = 'T_DYN_SCENE_SPACE', GAUGE = 'T_DYN_ENTITY_GAUGES', REL = 'T_DYN_RELATIONS_PACTS', PERSON = 'T_CHAR_DOSSIER', EVENT = 'T_DYN_EVENTS';
function row(id, name, values) { return { id, name, values: Object.fromEntries(Object.entries(values).map(([k,v]) => [k,known(v)])) }; }
function getRecord(values, table, record) { return (values[table] ?? []).find(r => r.id === record); }
function fields(catalog, world, table) { return [...(catalog.find(t => t.id === table)?.fields ?? []), ...world.custom.filter(f => f.table === table)]; }
function valueOf(values, table, record, key) { return getRecord(values, table, record)?.values[key] ?? unknown(); }
function display(value) { return value?.state === 'known' ? (typeof value.value === 'object' ? JSON.stringify(value.value) : typeof value.value === 'boolean' ? value.value ? '是' : '否' : String(value.value)) : value?.state === 'none' ? '明确无' : '未记录'; }
function active(state) { return state.history.find(x => x.id === state.active); }
function makePending(state, floor) {
 const base = active(state), values = clone(base.values);
 const energy = getRecord(values,GAUGE,'energy');
 energy.values.value = known(floor === 42 ? 72 : Math.max(0, Number(energy.values.value.value) - 3));
 getRecord(values,SCENE,'scene').values.place_ref = known('渡口茶棚');
 getRecord(values,REL,'relation').values.attitude_tag = known('暂时同行');
 const title = floor === 42 ? '渡口交信' : '等候渡船';
 const memory = floor === 42 ? '你在渡口茶棚将信交给沈青。她尚未拆信，答应陪你去询问船夫。能否渡河仍未确定。' : '你与沈青仍在渡口茶棚等候渡船。渡河尚未发生，其他未涉及的资料继续保留。';
 values[EVENT] = [...(values[EVENT]??[]), row('event-'+floor,title,{title,full_process:memory,result:'仍未渡河',time_original_text:'当夜',unfinished_followup:'询问船夫是否愿意开船'})];
 return { floor, base: base.id, values, world:clone(state.world), answers:{}, title, memory, revision:1 };
}
function seed() {
 const values = {
  [SCENE]:[row('scene','当前场景',{name:'渡口夜行',place_ref:'渡口外',weather:'夜雨初歇'})],
  [GAUGE]:[row('energy','你的体力',{name:'体力',value:78,maximum:100,minimum:0})],
  [REL]:[row('relation','你 → 沈青',{name:'你与沈青',subject_ref:'你',target_ref:'沈青',attitude_tag:'初见'})],
  [PERSON]:[row('you','你',{name:'你'}),row('shen','沈青',{name:'沈青',gender:'女性'})],
  [EVENT]:[]
 };
 const older=clone(values);getRecord(older,GAUGE,'energy').values.value=known(86);getRecord(older,SCENE,'scene').values.place_ref=known('城门');
 const state={version:2,world:{id:'world-demo-dukou',name:'渡口夜行',custom:[],labels:{},policy:{}},history:[{id:'save-40-1',floor:40,title:'离开城门',values:older,memory:'你离开城门，前往渡口。'},{id:'save-41-1',floor:41,title:'抵达渡口',values,memory:'你抵达渡口外，与沈青初见。'}],active:'save-41-1',pending:null};
 state.pending=makePending(state,42);return state;
}
function parse(value, field) {
 if(value.state!=='known')return {state:value.state,value:null};
 let v=value.value;
 if(v===null||v===undefined||typeof v==='string'&&!v.trim())throw Error(`${field.label}：填写内容，或明确选择“未知／无”。`);
 if(['NUMBER','INTEGER'].includes(field.type)) { v=Number(v);if(!Number.isFinite(v)||field.type==='INTEGER'&&!Number.isInteger(v))throw Error(`${field.label}：需要有效${field.type==='INTEGER'?'整数':'数字'}。`);if(field.min!==undefined&&v<field.min||field.max!==undefined&&v>field.max)throw Error(`${field.label}：超出设定范围。`); }
 if(field.type==='BOOLEAN') { if(![true,false,'true','false','是','否'].includes(v))throw Error(`${field.label}：请选择是或否。`);v=v===true||v==='true'||v==='是'; }
 if(field.type==='ENUM'&&Array.isArray(field.enum)&&!field.enum.includes(v))throw Error(`${field.label}：需要选择已有选项。`);
 if(['JSON','OBJECT','ARRAY','BAG'].includes(field.type)&&typeof v==='string') {try{v=JSON.parse(v);}catch{throw Error(`${field.label}：需要合法的结构化内容。`);}if(field.type==='ARRAY'&&!Array.isArray(v))throw Error(`${field.label}：需要列表。`);if(field.type==='OBJECT'&&(!v||typeof v!=='object'||Array.isArray(v)))throw Error(`${field.label}：需要对象。`);}
 return known(v);
}
function setValue(pending, table, record, key, value, catalog) {
 const f=fields(catalog,pending.world,table).find(f=>f.key===key);
 if(!f||f.readonly)throw Error('此字段由程序维护，不能手工写入。');
 const target=getRecord(pending.values,table,record);if(!target)throw Error('记录已不存在。');target.values[key]=clone(value);
}
function policy(world, table, channel, key, enabled) {
 world.policy[table]??={cells:[],archive:[]};const keys=new Set(world.policy[table][channel]);if(enabled)keys.add(key);else keys.delete(key);world.policy[table][channel]=[...keys];
}
function requirements(state,catalog) {
 const p=state.pending;if(!p)return [];
 const out=[];
 for(const [table,channels]of Object.entries(p.world.policy)) for(const channel of ['cells','archive']) for(const key of channels[channel]) {
  const f=fields(catalog,p.world,table).find(f=>f.key===key);if(!f||f.readonly)continue;
  const rows=p.values[table]?.length?p.values[table]:[{id:'*',name:'本表尚无记录'}];
  for(const r of rows){const id=`${channel}|${ref(table,r.id,key)}`,v=valueOf(p.values,table,r.id,key),b=valueOf(active(state).values,table,r.id,key);const changed=r.id!=='*'&&JSON.stringify(v)!==JSON.stringify(b);
   out.push({id,table,record:r.id,recordName:r.name,key,label:f.label,channel,value:v,done:changed||!!p.answers[id],response:changed?'本轮已填写':p.answers[id]??'待回应'});
  }
 }
 return out;
}
function respondRemaining(state,catalog) {const next=clone(state);for(const r of requirements(next,catalog).filter(x=>!x.done))next.pending.answers[r.id]=r.record==='*'?'本轮未涉及':r.value.state==='known'?'沿用已确认值':r.value.state==='none'?'仍明确无':'本轮仍未知';return next;}
function addField(pending,catalog,spec) {
 const table=catalog.find(t=>t.id===spec.table);if(!table||table.program)throw Error('请选择可编辑业务表。');
 const key=String(spec.key??'').trim();if(!key||key.length>40||/[|<>\u0000-\u001f]/.test(key)||['__proto__','constructor','prototype'].includes(key))throw Error('请使用 1–40 字的有效键名。');
 if(fields(catalog,pending.world,spec.table).some(f=>f.key===key||f.label===key))throw Error('同一表内已存在这个键名或字段名称。');
 const field={key,label:key,table:spec.table,type:spec.type,description:spec.description??'',custom:true,readonly:false};
 if(spec.min!==''&&spec.min!=null)field.min=Number(spec.min);if(spec.max!==''&&spec.max!=null)field.max=Number(spec.max);
 if(field.min!==undefined&&!Number.isFinite(field.min)||field.max!==undefined&&!Number.isFinite(field.max)||field.min!==undefined&&field.max!==undefined&&field.min>field.max)throw Error('数值范围无效。');
 if(spec.type==='ENUM'){field.enum=String(spec.options??'').split(/[\n,，]/).map(s=>s.trim()).filter(Boolean);if(!field.enum.length)throw Error('选项字段至少需要一个选项。');}
 if(!['TEXT','LONG_TEXT','NUMBER','BOOLEAN','ENUM','ARRAY','OBJECT'].includes(field.type))throw Error('字段类型无效。');
 const initial=parse(spec.initial??unknown(),field);
 pending.world.custom.push(field);
 // Initial value applies only to the selected record, never to every character.
 if(spec.record&&getRecord(pending.values,spec.table,spec.record))getRecord(pending.values,spec.table,spec.record).values[key]=initial;
 for(const channel of ['cells','archive'])if(spec[channel])policy(pending.world,spec.table,channel,key,true);
 return field;
}
function validate(pending,catalog) {
 for(const [table,records] of Object.entries(pending.values))for(const record of records)for(const [key,value]of Object.entries(record.values)) {
  const f=fields(catalog,pending.world,table).find(f=>f.key===key);if(!f)throw Error('未登记字段：'+table+'/'+key);if(f.readonly)continue;record.values[key]=parse(value,f);
 }
}
function confirm(state,catalog) {
 if(!state.pending)throw Error('本轮已经确认。');if(state.pending.base!==state.active)throw Error('候选来源已过期，请重新核对。');
 const next=clone(state);validate(next.pending,catalog);
 const missing=requirements(next,catalog).filter(x=>!x.done);if(missing.length)throw Error(`还有 ${missing.length} 项每轮必填内容未回应。`);
 const p=next.pending;next.world=clone(p.world);const id=`save-${p.floor}-${next.history.filter(x=>x.floor===p.floor).length+1}`;
 const review=requirements(next,catalog).map(r=>({table:r.table,record:r.record,key:r.key,channel:r.channel,value:clone(r.value),response:r.response}));
 next.history.push({id,floor:p.floor,title:p.title,memory:p.memory,values:clone(p.values),required:clone(p.world.policy),answers:clone(p.answers),review});next.active=id;next.pending=null;return next;
}
function nextTurn(state) {if(state.pending)throw Error('请先确认当前轮次。');const next=clone(state);next.pending=makePending(next,active(next).floor+1);return next;}
function restore(state,id) {if(!state.history.some(x=>x.id===id))throw Error('存档不存在。');const next=clone(state);next.active=id;next.pending=null;return next;}
function changes(state,catalog) {if(!state.pending)return [];const out=[];for(const [table,rows]of Object.entries(state.pending.values))for(const r of rows)for(const [key,value]of Object.entries(r.values)){const before=valueOf(active(state).values,table,r.id,key),field=fields(catalog,state.pending.world,table).find(f=>f.key===key);if(field&&!field.readonly&&JSON.stringify(value)!==JSON.stringify(before))out.push({table,record:r.id,recordName:r.name,key,label:state.pending.world.labels[table+'|'+key]??field.label,before,value,custom:!!field.custom});}return out;}
export const Model={seed,clone,fields,active,valueOf,display,parse,setValue,policy,requirements,respondRemaining,addField,validate,confirm,nextTurn,restore,changes,ref,known,unknown,SCENE,GAUGE,REL,PERSON,EVENT};
