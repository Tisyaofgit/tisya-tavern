// Standalone preview document store. No storage, clock, network, or DOM side effects.
// seed + accepted envelopes are replayable; accounts/documents are their current projection.
import { createState, applyBatch } from './social-core.mjs';

export const DOCUMENT_KINDS = Object.freeze([
  'forum','weibo','artist','notice','news','trends','fanclub','live','video',
  'music','schedule','ticket','group','bubble','dm','inbox','timeline'
]);
const STREAM_KINDS = new Set(['forum','group','bubble','dm']);
const DEFAULT_PLATFORM = {forum:'douban',group:'wechat',bubble:'bubble',dm:'dm'};
const FORMAT = 'tisya.social-suite.preview.v1';
const ARCHIVE = 'tisya.social-suite.archive.v1';
const UNSAFE = new Set(['__proto__','prototype','constructor']);
const own = (o,k) => Object.hasOwn(o,k);
const clone = value => structuredClone(value);

export class SuiteError extends Error {
  constructor(code,path,message,details) {
    super(message); this.name='SuiteError'; this.code=code; this.path=path;
    if (details !== undefined) this.details=details;
  }
}
const fail = (code,path,message,details) => { throw new SuiteError(code,path,message,details); };
const obj = (value,path) => {
  if (!value || typeof value!=='object' || Array.isArray(value)) fail('OBJECT_REQUIRED',path,`${path} 必须是对象`);
  return value;
};
const ident = (value,path) => {
  if (typeof value!=='string' || !value.trim() || UNSAFE.has(value)) fail('INVALID_ID',path,`${path} 需要有效的非空标识`);
  return value;
};
const text = (value,path) => {
  if (typeof value!=='string') fail('TEXT_REQUIRED',path,`${path} 必须是文字`);
  return value;
};
const allowed = (value,fields,path) => {
  for (const key of Object.keys(value)) if (!fields.includes(key)) fail('UNKNOWN_FIELD',`${path}.${key}`,`未识别字段 ${key}`);
};

function json(value,path='$',seen=new Set()) {
  if (value===null || typeof value==='string' || typeof value==='boolean') return value;
  if (typeof value==='number' && Number.isFinite(value)) return value;
  if (!value || typeof value!=='object') fail('JSON_REQUIRED',path,`${path} 需要合法 JSON 数据`);
  if (seen.has(value)) fail('JSON_CYCLE',path,'数据不能循环引用');
  seen.add(value);
  let result;
  if (Array.isArray(value)) result=value.map((v,i)=>json(v,`${path}[${i}]`,seen));
  else {
    if (![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail('JSON_REQUIRED',path,'需要普通 JSON 对象');
    result=Object.create(null);
    for (const key of Object.keys(value).sort()) {
      if (UNSAFE.has(key)) fail('UNSAFE_KEY',`${path}.${key}`,`不接受字段 ${key}`);
      if (value[key]!==undefined) result[key]=json(value[key],`${path}.${key}`,seen);
    }
  }
  seen.delete(value);
  return result;
}
const canonical = value => JSON.stringify(json(value));
const equal = (a,b) => canonical(a)===canonical(b);

function timestamp(value,path) {
  if (typeof value!=='string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    fail('INVALID_TIME',path,`${path} 需要带时区的故事时间`);
  }
  return value;
}

function registerAccounts(projection, additions, path) {
  obj(additions,path);
  for (const [id,record] of Object.entries(additions)) {
    ident(id,`${path}.${id}`); obj(record,`${path}.${id}`);
    if (typeof record.name!=='string' || !record.name.trim()) fail('ACCOUNT_NAME',`${path}.${id}.name`,'账号需要昵称');
    if (own(record,'id') && record.id!==id) fail('ACCOUNT_ID',`${path}.${id}.id`,'账号资料 id 应与映射键相同');
    if (own(record,'platform')) ident(record.platform,`${path}.${id}.platform`);
    if (own(projection.accounts,id) && !equal(projection.accounts[id],record)) fail('ACCOUNT_CONFLICT',`${path}.${id}`,`账号 ${id} 已登记且资料不同`);
    if (!own(projection.accounts,id)) projection.accounts[id]=clone(record);
  }
}

function checkAuthor(accounts,id,path) {
  ident(id,path);
  if (!own(accounts,id)) fail('ACCOUNT_NOT_FOUND',path,`账号 ${id} 尚未登记`);
}

function coreAccounts(accounts,platform) {
  const result={};
  for (const [id,record] of Object.entries(accounts)) {
    if (record.platform && record.platform!==platform) continue;
    const value={name:record.name,platform};
    for (const key of ['avatar','role','personId']) if (typeof record[key]==='string') value[key]=record[key];
    result[id]=value;
  }
  return result;
}

function checkStreamAuthors(accounts,platform,items,path) {
  items.forEach((item,index)=>{
    if (!item || typeof item!=='object') return;
    const ids=own(item,'by') ? [item.by] : Array.isArray(item.repeat?.ids) ? item.repeat.ids : [];
    ids.forEach(id=>{
      checkAuthor(accounts,id,`${path}[${index}].by`);
      if (accounts[id].platform && accounts[id].platform!==platform) {
        fail('ACCOUNT_PLATFORM',`${path}[${index}].by`,`账号 ${id} 与 ${platform} 话题不属于同一平台`);
      }
    });
  });
}

function storeCore(doc,core) {
  doc.items=Object.values(core.messages).sort((a,b)=>a.floor-b.floor).map(clone);
  doc.meta={...(doc.meta??{}),coreThread:{...clone(core.thread),gaps:clone(core.gaps),receipts:clone(core.receipts)}};
}

function loadCore(doc,accounts) {
  const saved=doc.meta.coreThread;
  const core=createState({id:doc.id,platform:saved.platform,baseTime:saved.baseTime,stepSeconds:saved.stepSeconds,accounts:coreAccounts(accounts,saved.platform)});
  core.thread=Object.fromEntries(['id','platform','title','baseTime','stepSeconds','nextFloor','lastTime'].map(k=>[k,saved[k]]));
  core.messages=Object.fromEntries(doc.items.map(message=>[String(message.floor),clone(message)]));
  core.gaps=clone(saved.gaps); core.receipts=clone(saved.receipts);
  return core;
}

function normalizeDocument(raw,projection,path) {
  obj(raw,path);
  const doc=clone(raw);
  ident(doc.id,`${path}.id`);
  if (!DOCUMENT_KINDS.includes(doc.kind)) fail('DOCUMENT_KIND',`${path}.kind`,`不支持的页面种类 ${doc.kind}`);
  if (typeof doc.title!=='string' || !doc.title.trim()) fail('DOCUMENT_TITLE',`${path}.title`,'页面需要标题');
  if (!['public','private','subscriber'].includes(doc.visibility)) fail('VISIBILITY',`${path}.visibility`,'页面需要 public / private / subscriber 可见性');
  if (own(doc,'at') && doc.at!==null) timestamp(doc.at,`${path}.at`);
  if (!own(doc,'at')) doc.at=null;
  if (own(doc,'author')) checkAuthor(projection.accounts,doc.author,`${path}.author`);
  if (own(doc,'text')) text(doc.text,`${path}.text`);
  if (own(doc,'audience')) {
    if (!Array.isArray(doc.audience)) fail('AUDIENCE',`${path}.audience`,'audience 必须是身份列表');
    doc.audience.forEach((id,i)=>ident(id,`${path}.audience[${i}]`));
  }
  if (own(doc,'meta')) obj(doc.meta,`${path}.meta`);
  if (own(doc,'items') && !Array.isArray(doc.items)) fail('ITEMS_REQUIRED',`${path}.items`,'items 必须是数组');
  if (STREAM_KINDS.has(doc.kind)) {
    const config=doc.meta?.coreThread??{}; obj(config,`${path}.meta.coreThread`);
    allowed(config,['platform','baseTime','stepSeconds','nextFloor'],`${path}.meta.coreThread`);
    const platform=config.platform??DEFAULT_PLATFORM[doc.kind];
    const items=doc.items??[];
    checkStreamAuthors(projection.accounts,platform,items,`${path}.items`);
    let core=createState({id:doc.id,title:doc.title,platform,baseTime:config.baseTime??doc.at,
      stepSeconds:config.stepSeconds??30,nextFloor:config.nextFloor??1,accounts:coreAccounts(projection.accounts,platform)});
    if (items.length) core=applyBatch(core,{id:`seed:${doc.id}`,items});
    storeCore(doc,core);
  } else if (!['text','body','meta','items'].some(key=>own(doc,key))) {
    fail('DOCUMENT_BODY',path,`${doc.kind} 页面需要 text / body / meta / items 至少一种内容容器`);
  }
  return doc;
}

function registerDocuments(projection,documents,path) {
  if (!Array.isArray(documents)) fail('DOCUMENTS_REQUIRED',path,'documents 必须是数组');
  documents.forEach((raw,index)=>{
    const doc=normalizeDocument(raw,projection,`${path}[${index}]`);
    if (own(projection.documents,doc.id)) fail('DOCUMENT_EXISTS',`${path}[${index}].id`,`页面 ${doc.id} 已登记`);
    projection.documents[doc.id]=doc;
  });
}

function checkRefs(projection,refs,path) {
  if (!Array.isArray(refs)) fail('REFS_REQUIRED',path,'refs 必须是页面 ID 数组');
  refs.forEach((id,index)=>{
    ident(id,`${path}[${index}]`);
    if (!own(projection.documents,id)) fail('REFERENCE_NOT_FOUND',`${path}[${index}]`,`引用页面 ${id} 不存在`);
  });
}

function validateDocuments(projection) {
  for (const doc of Object.values(projection.documents)) {
    const path=`documents.${doc.id}`;
    if (own(doc,'author')) checkAuthor(projection.accounts,doc.author,`${path}.author`);
    if (own(doc,'refs')) checkRefs(projection,doc.refs,`${path}.refs`);
    if (own(doc,'metrics')) {
      obj(doc.metrics,`${path}.metrics`);
      for (const [key,value] of Object.entries(doc.metrics)) if (typeof value!=='number' || !Number.isFinite(value) || value<0) fail('METRIC_VALUE',`${path}.metrics.${key}`,'指标需要非负有限数值');
    }
    const ids=new Set();
    for (const [i,item] of (doc.items??[]).entries()) {
      if (!item || typeof item!=='object' || Array.isArray(item)) continue;
      if (own(item,'by')) checkAuthor(projection.accounts,item.by,`${path}.items[${i}].by`);
      if (own(item,'author')) checkAuthor(projection.accounts,item.author,`${path}.items[${i}].author`);
      if (own(item,'refs')) checkRefs(projection,item.refs,`${path}.items[${i}].refs`);
      if (own(item,'id')) {
        ident(item.id,`${path}.items[${i}].id`);
        if (ids.has(item.id)) fail('ITEM_ID_CONFLICT',`${path}.items[${i}].id`,'同页条目 ID 不应重复');
        ids.add(item.id);
      }
    }
  }
}

function updateMetrics(doc,changes,path) {
  obj(changes,path); doc.metrics??={};
  for (const [key,operation] of Object.entries(changes)) {
    obj(operation,`${path}.${key}`);
    const keys=Object.keys(operation);
    if (keys.length!==1 || !['set','add'].includes(keys[0])) fail('METRIC_OPERATION',`${path}.${key}`,'指标只接受一个 set 或 add');
    const amount=operation[keys[0]];
    if (typeof amount!=='number' || !Number.isFinite(amount)) fail('METRIC_VALUE',`${path}.${key}`,'指标操作需要有限数值');
    if (keys[0]==='add' && !own(doc.metrics,key)) fail('METRIC_BASE_UNKNOWN',`${path}.${key}`,'未知指标请先 set 基值');
    const value=keys[0]==='set'?amount:doc.metrics[key]+amount;
    if (!Number.isFinite(value) || value<0) fail('METRIC_RANGE',`${path}.${key}`,'指标结果不可为负或溢出');
    doc.metrics[key]=value;
  }
}

function envelopeInput(input) {
  const envelope=json(input,'envelope'); obj(envelope,'envelope');
  allowed(envelope,['id','accounts','documents','blocks','source'],'envelope');
  ident(envelope.id,'envelope.id');
  if (!Array.isArray(envelope.blocks)) fail('BLOCKS_REQUIRED','envelope.blocks','blocks 必须是数组');
  return envelope;
}

function applyProjection(projection,envelope) {
  const signature=canonical(envelope);
  if (own(projection.receipts,envelope.id)) {
    if (projection.receipts[envelope.id]!==signature) fail('ENVELOPE_CONFLICT','envelope.id','同一提交 ID 已用于不同内容');
    return false;
  }
  if (own(envelope,'accounts')) registerAccounts(projection,envelope.accounts,'envelope.accounts');
  if (own(envelope,'documents')) registerDocuments(projection,envelope.documents,'envelope.documents');
  envelope.blocks.forEach((block,index)=>{
    const path=`envelope.blocks[${index}]`; obj(block,path);
    allowed(block,['type','thread','items','body','meta','text','title','at','refs','metrics','author','visibility','audience'],path);
    ident(block.thread,`${path}.thread`);
    const doc=own(projection.documents,block.thread)?projection.documents[block.thread]:null;
    if (!doc) fail('DOCUMENT_NOT_FOUND',`${path}.thread`,`页面 ${block.thread} 不存在`);
    if (block.type!==doc.kind) fail('DOCUMENT_KIND',`${path}.type`,'type 应与已登记页面 kind 一致');
    for (const key of ['body','text','title','at','refs','author','visibility','audience']) if (own(block,key)) doc[key]=clone(block[key]);
    if (own(block,'text')) text(doc.text,`${path}.text`);
    if (own(block,'title') && (typeof doc.title!=='string' || !doc.title.trim())) fail('DOCUMENT_TITLE',`${path}.title`,'页面需要标题');
    if (own(block,'at') && doc.at!==null) timestamp(doc.at,`${path}.at`);
    if (own(block,'visibility') && !['public','private','subscriber'].includes(doc.visibility)) fail('VISIBILITY',`${path}.visibility`,'无效可见性');
    if (own(block,'audience')) {
      if (!Array.isArray(doc.audience)) fail('AUDIENCE',`${path}.audience`,'audience 必须是数组');
      doc.audience.forEach((id,i)=>ident(id,`${path}.audience[${i}]`));
    }
    if (own(block,'meta')) {
      obj(block.meta,`${path}.meta`);
      if (STREAM_KINDS.has(doc.kind) && own(block.meta,'coreThread')) fail('CORE_CONFIG_LOCKED',`${path}.meta.coreThread`,'已建立流的顺序与时间由消息操作维护');
      doc.meta={...(doc.meta??{}),...clone(block.meta)};
    }
    if (own(block,'metrics')) updateMetrics(doc,block.metrics,`${path}.metrics`);
    if (own(block,'items')) {
      if (!Array.isArray(block.items)) fail('ITEMS_REQUIRED',`${path}.items`,'items 必须是数组');
      if (STREAM_KINDS.has(doc.kind)) {
        const core=loadCore(doc,projection.accounts);
        checkStreamAuthors(projection.accounts,core.thread.platform,block.items,`${path}.items`);
        storeCore(doc,applyBatch(core,{id:`${envelope.id}:${index}`,items:block.items}));
      } else {
        doc.items??=[];
        block.items.forEach((raw,i)=>{
          const item=clone(raw);
          if (item && typeof item==='object' && !Array.isArray(item) && !own(item,'id')) {
            item.id=[doc.id,envelope.id,index,i].map(v=>encodeURIComponent(String(v))).join('/');
          }
          doc.items.push(item);
        });
      }
    }
  });
  validateDocuments(projection);
  projection.receipts[envelope.id]=signature;
  return true;
}

function baseProjection(seed) {
  const projection={accounts:{},documents:{},receipts:{}};
  registerAccounts(projection,seed.accounts??{},'seed.accounts');
  registerDocuments(projection,seed.documents??[],'seed.documents');
  validateDocuments(projection);
  return projection;
}

function seedInput(input) {
  const seed=json(input,'seed'); obj(seed,'seed');
  allowed(seed,['accounts','documents'],'seed');
  return seed;
}

function rebuild(seed,branches,activeBranch) {
  const branch=own(branches,activeBranch)?branches[activeBranch]:null;
  if (!branch) fail('BRANCH_NOT_FOUND','activeBranch',`分支 ${activeBranch} 不存在`);
  const projection=baseProjection(seed);
  for (const input of branch.envelopes) applyProjection(projection,envelopeInput(input));
  return {format:FORMAT,seed:clone(seed),branches:clone(branches),activeBranch,...projection};
}

function assertSuite(state) {
  if (state?.format!==FORMAT) fail('SUITE_FORMAT','state','不是本预览的网络资料状态');
  obj(state.documents,'state.documents'); obj(state.accounts,'state.accounts');
  if (!state.branches || !own(state.branches,state.activeBranch)) fail('BRANCH_NOT_FOUND','state.activeBranch','当前分支不存在');
}

export function createSuite(seed) {
  return rebuild(seedInput(seed),{main:{parent:null,envelopes:[]}},'main');
}

export function applyEnvelope(state,input) {
  assertSuite(state);
  const envelope=envelopeInput(input),next=clone(state);
  if (!applyProjection(next,envelope)) return state;
  next.branches[next.activeBranch].envelopes.push(clone(envelope));
  return next;
}

function visible(doc,audience) {
  return audience==='owner' || doc.visibility==='public' || (audience!=='public' && (doc.audience??[]).includes(audience));
}

function readDocument(doc,audience) {
  const result=clone(doc);
  if (audience==='public' && result.meta) delete result.meta.readerState;
  if (STREAM_KINDS.has(result.kind)) {
    delete result.meta.coreThread.receipts;
    result.items=result.items.map(item=>item.deleted?{...item,text:''}:item);
  }
  return result;
}

export function getDoc(state,id,audience='owner') {
  assertSuite(state);
  const doc=own(state.documents,id)?state.documents[id]:null;
  return doc && visible(doc,audience)?readDocument(doc,audience):null;
}

export function getVisibleDocuments(state,audience='public') {
  assertSuite(state);
  return Object.values(state.documents).filter(doc=>visible(doc,audience)).map(doc=>readDocument(doc,audience));
}

export function getAccounts(state) { assertSuite(state); return clone(state.accounts); }

export function forkSuite(state,branchId) {
  assertSuite(state); ident(branchId,'branchId');
  if (own(state.branches,branchId)) fail('BRANCH_EXISTS','branchId','分支名称已存在');
  const next=clone(state);
  next.branches[branchId]={parent:state.activeBranch,envelopes:clone(state.branches[state.activeBranch].envelopes)};
  next.activeBranch=branchId;
  return next;
}

export function switchBranch(state,branchId) {
  assertSuite(state); ident(branchId,'branchId');
  if (branchId===state.activeBranch) return state;
  return rebuild(state.seed,state.branches,branchId);
}

// Read a historical projection without mutating the current branch or copying
// message bodies into a second editable store. Used by frozen phone markers.
export function projectSuiteAt(state,branchId,eventCount) {
  assertSuite(state);
  if (!own(state.branches,branchId)) fail('BRANCH_NOT_FOUND','branchId','历史分支不存在');
  const events=state.branches[branchId].envelopes;
  if (!Number.isInteger(eventCount)||eventCount<0||eventCount>events.length) fail('HISTORY_RANGE','eventCount','历史事件边界无效');
  const branches=clone(state.branches);
  branches[branchId].envelopes=clone(events.slice(0,eventCount));
  return rebuild(state.seed,branches,branchId);
}

export function forkSuiteAt(state,branchId,sourceBranch,eventCount) {
  assertSuite(state); ident(branchId,'branchId');
  if (own(state.branches,branchId)) fail('BRANCH_EXISTS','branchId','目标分支已存在');
  const historical=projectSuiteAt(state,sourceBranch,eventCount);
  const branches=clone(state.branches);
  branches[branchId]={parent:sourceBranch,envelopes:clone(historical.branches[sourceBranch].envelopes)};
  return rebuild(state.seed,branches,branchId);
}

export function undoEnvelope(state) {
  assertSuite(state);
  const branches=clone(state.branches),events=branches[state.activeBranch].envelopes;
  if (!events.length) fail('NOTHING_TO_UNDO','activeBranch','当前分支没有可撤回的增量批次');
  events.pop();
  return rebuild(state.seed,branches,state.activeBranch);
}

function checksum(value) {
  let hash=0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonical(value))) hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);
  return hash.toString(16).padStart(16,'0');
}

function archivePayload(state) {
  return {format:ARCHIVE,seed:state.seed,branches:state.branches,activeBranch:state.activeBranch};
}

export function exportSuite(state) {
  assertSuite(state);
  const rebuilt=rebuild(state.seed,state.branches,state.activeBranch);
  if (!equal([state.accounts,state.documents,state.receipts],[rebuilt.accounts,rebuilt.documents,rebuilt.receipts])) {
    fail('PROJECTION_DIVERGED','state','当前页面状态被直接改写，无法作为已接纳增量导出');
  }
  const payload=json(archivePayload(state));
  return JSON.stringify({payload,integrity:{algorithm:'fnv1a64-utf8',value:checksum(payload)}},null,2);
}

export function importSuite(input) {
  try {
    const archive=json(typeof input==='string'?JSON.parse(input):input,'archive'); obj(archive,'archive');
    allowed(archive,['payload','integrity'],'archive');
    const payload=obj(archive.payload,'archive.payload');
    allowed(payload,['format','seed','branches','activeBranch'],'archive.payload');
    if (payload.format!==ARCHIVE) fail('ARCHIVE_FORMAT','archive.payload.format','不支持的网络资料档案格式');
    if (archive.integrity?.algorithm!=='fnv1a64-utf8' || archive.integrity.value!==checksum(payload)) fail('ARCHIVE_INTEGRITY','archive.integrity','档案校验不一致');
    const seed=seedInput(payload.seed),branches=obj(payload.branches,'archive.payload.branches');
    if (!Object.keys(branches).length) fail('ARCHIVE_BRANCHES','archive.payload.branches','档案没有分支');
    ident(payload.activeBranch,'archive.payload.activeBranch');
    for (const [branchId,branch] of Object.entries(branches)) {
      ident(branchId,'branchId'); obj(branch,`branches.${branchId}`);
      allowed(branch,['parent','envelopes'],`branches.${branchId}`);
      if (branch.parent!==null && !own(branches,branch.parent)) fail('BRANCH_PARENT',`branches.${branchId}.parent`,'来源分支不存在');
      if (!Array.isArray(branch.envelopes)) fail('ARCHIVE_BRANCHES',`branches.${branchId}.envelopes`,'分支增量应为数组');
      rebuild(seed,branches,branchId);
    }
    return rebuild(seed,branches,payload.activeBranch);
  } catch (error) {
    if (error instanceof SuiteError && error.code==='ARCHIVE_CORRUPT') throw error;
    fail('ARCHIVE_CORRUPT','archive','无法读取网络资料档案；原始数据未被覆盖',{causeCode:error.code??error.name,causeMessage:error.message});
  }
}

export function createStorageAdapter(storage,key='tisya-social-suite-preview') {
  if (!storage || typeof storage.getItem!=='function' || typeof storage.setItem!=='function') fail('STORAGE_ADAPTER','storage','需要 getItem / setItem 存储接口');
  ident(key,'storageKey');
  return {
    save(state) {
      const raw=exportSuite(state);
      try { storage.setItem(key,raw); }
      catch (error) { fail('STORAGE_WRITE','storage','存档失败；没有执行清空或重置',{causeMessage:error.message}); }
      return {key,characters:raw.length};
    },
    load() {
      let raw;
      try { raw=storage.getItem(key); }
      catch (error) { fail('STORAGE_READ','storage','无法读取本地存档',{causeMessage:error.message}); }
      if (raw===null || raw===undefined) return null;
      try { return importSuite(raw); }
      catch (error) { fail('STORAGE_CORRUPT','storage','本地存档无法读取；原内容已保留，请导出原始值检查',{causeCode:error.code,causeMessage:error.message,raw}); }
    }
  };
}
