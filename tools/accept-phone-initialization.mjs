// Isolated acceptance harness. Uses the production creator, form parser,
// Matrix host, IndexedDB adapter and phone storage; never user live storage.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import catalog from '../engine/catalog.json' with {type:'json'};
import {baseline} from '../engine/config.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {createMatrixCreator} from '../engine/creation.mjs';
import {bundledNativeBuiltinBook} from '../engine/builtin-books.mjs';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {defaultWorld} from '../config/core.js';
import {createPhoneService} from '../phone-core.mjs';
import {createPhoneDatabaseStorage,readPhoneDatabaseProfile} from '../engine/phone-database.mjs';

const brief=`这是隔离的虚构功能验收，不是用户真实存档。创建“晴港测试城”及本人沈青、联系人林岚的完整生活手机初态。只填下面明确给出的内容，其他未知留空；不输出任何JSON。
世界历法为固定公历式分月：每年12月、每月30天、每天24小时、每小时60分钟；当前第2030年1月1日09:00。全部八个生活应用启用，显示名使用通常中文名。货币名元、符号¥、小数位2。商城和外卖配送费均明确为0。交通步行速度1地图单位/故事分钟，其他方式未设。
本人沈青的公开身份为书店店员；林岚的公开身份为邻居。沈青网络账号“青的日常”，账号标识qing，本人，是沈青所有；林岚网络账号“岚”，账号标识lan，非本人，是林岚所有。沈青关注岚。联系人林岚关联林岚人物和岚账号。相册原件、歌单、账户、日程均归沈青，世界归晴港测试城。
沈青的零钱余额明确为500元，只有这一现金账户，也是默认付款和收支账户。已有信用卡“晴卡”额度为1000元，账单日5、还款日25、溢缴款0，明确没有未结消费，当前负债0元。世界贷款产品年利率1200基点，可选2期，每期30天、每年12期，最低本金100元、最高1000元；本次人物没有已有贷款。世界理财产品“晴存”年利率300基点、最低申购10元、最高500元、期限60故事分钟、不允许提前赎回；人物没有已有持仓。
地点“家”坐标0,0；“书店”坐标3,0，二者均本人已知，人物当前在家。商品“纸笔记本”是实物，价格12.50元、库存5；商品“饭团”是食品，价格8元、库存6，均可配送到家。纸笔记本规格“红封面”附加价1元。不要把商品库存变成人物已经持有。
相簿“日常”属于沈青；相片“晨光便签”是私密插画，插画标记sun，媒体格式image/svg+xml，放在日常相簿中；没有文件原件，不生成假的文件定位。歌曲“测试旋律”的作者为沈青、专辑为练习、已知时长120秒、私密；目前没有真实音源。歌单“练习单”只包含测试旋律。手机主题为世界主题，无背景图片，铺满，遮罩20%。不编造播放记录。
一条由青的日常发布的公开微博“今天开始记生活账。”，明确初始点赞数0，不附媒体。个人日程“整理书架”在当前故事起点后60分钟、时长30分钟、地点书店、提前10分钟提醒、私密，无受邀参与者，不重复。没有其他已发生事件、订单、权益、通知或转账。
输出完整reply，正文简要说明设计及音源缺失；cells用本次注册的中文分组、行号和字段名。关联只填写已有名称或本次分组标题。需要程序编号的格省略。archive与vars为空，尚无必须补齐才能保存的问题就extra为空。`;
const goal='完整初始化虚拟手机：世界、人物、资金、社交、商城外卖、相册音乐、地图和日历';

export async function fixture(){
 const macros=new Map(),books={'缇斯亚模板书':bundledNativeBuiltinBook('templates')};
 const ctx={chatId:'phone-form-isolated',characterId:0,characters:[{name:'测试载体',avatar:'phone-form-test.png',data:{extensions:{}}}],extensionSettings:{},chatMetadata:{},chat:[],saveChat:async()=>true,saveSettingsDebounced(){},registerMacro:(name,handler)=>macros.set(name,handler),getWorldInfoNames:async()=>Object.keys(books),loadWorldInfo:async name=>structuredClone(books[name])};
 const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)},storage=indexedStorage(new IDBFactory()),options={getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand:text=>text.replace(/\{\{([^{}]+)\}\}/g,(raw,key)=>macros.get(key)?.()??raw)};
 const host=createMatrixHost(options);host.register();await host.initialize();
 const database={read:()=>host.readDatabase(),commit:input=>host.commitDatabase(input)};return {host,ctx,database,options,books};
}
function creatorFor(f,request){return createMatrixCreator({database:f.database,getContext:()=>f.ctx,getHelper:()=>null,request});}
export async function prepare(){
 const f=await fixture();let input;try{await creatorFor(f,async(_task,raw)=>{input=JSON.parse(raw);throw Error('CAPTURE_ONLY');}).draft(goal,{kind:'world',mode:'extend',source:{kind:'isolated-fictional-brief',text:brief}});}catch(error){if(error.message!=='CAPTURE_ONLY')throw error;}
 assert(input);const preset=pairedPreset({task:'tableGenesis',configuration:{world:defaultWorld()},formContract:input.formContract}),messages=taskMessages({preset,task:'tableGenesis',input});
 return {input,messages,brief,goal,scope:'independent model generation; isolated production services; no remote host/API claim'};
}
export async function accept(raw){
 const f=await fixture(),creator=creatorFor(f,async()=>raw),draft=await creator.draft(goal,{kind:'world',mode:'extend',source:{kind:'isolated-fictional-brief',text:brief}});
 const before=await f.database.read();assert.equal(Object.keys(before.state.tables.T_STATIC_WORLDS).length,0);await creator.save(draft);await creator.save(draft);
 let snapshot=await f.database.read();const worldId=draft.proposal.matrix.binding.worldId,entityId=Object.entries(snapshot.state.tables.T_SYS_ENTITIES).find(([,r])=>r.values.name==='沈青')?.[0];assert(entityId,'本人实体须已由同一表单自动关联');
 const profile=readPhoneDatabaseProfile(snapshot.state,{worldId,entityId});assert(profile);assert.equal(profile.character.wallet.accounts[0].balance,50000);assert.equal(profile.character.playlists.length,1);assert.equal(profile.character.calendar.length,1);assert.equal(profile.character.mediaExtras.albums.length,1);assert.equal(profile.world.catalog.length,2);
 const seed={accounts:{me:{name:'我',role:'self'}},documents:[]},key=snapshot.contextKey;let sequence=0;
 const service=createPhoneService({seed,contextKey:key,storage:createPhoneDatabaseStorage({database:f.database,contextKey:key}),idFactory:()=>`generated-acceptance-${++sequence}`});await service.init();await service.initLife(profile);
 const initial=service.readLife();assert.equal(initial.state.wallet.accounts[0].balance,50000);assert.equal(initial.state.media.playlists[0].songIds[0],initial.state.media.songs[0].id);assert.equal(initial.state.media.songs[0].audioId,null);assert.equal(initial.state.calendar.events[0].at,60);assert.equal(initial.state.inventory.length,0);assert.equal(initial.state.social.posts[0].likesBase,0);
 const product=initial.state.commerce.products.find(p=>p.name==='纸笔记本'),home=initial.state.map.places.find(p=>p.name==='家');assert(product?.options?.length===1);
 const dispatch=(type,data={})=>service.dispatchLife({id:`acceptance-action-${++sequence}`,type,...data},{expectedRevision:service.getState().revision});
 await dispatch('cart.add',{productId:product.id,optionIds:[product.options[0].id]});
 const quote=await dispatch('order.quote',{kind:'shop',payment:'balance',placeId:home.id});assert.equal(service.readLife().state.wallet.accounts[0].balance,50000);
 const quoteId=quote.result?.quoteId??service.readLife().state.commerce.quotes.at(-1).id;await dispatch('order.checkout',{kind:'shop',payment:'balance',placeId:home.id,quoteId});assert.equal(service.readLife().state.wallet.accounts[0].balance,48650);
 const coldHost=createMatrixHost(f.options),coldDb={read:()=>coldHost.readDatabase(),commit:x=>coldHost.commitDatabase(x)};await coldHost.sync();
 const cold=createPhoneService({seed,contextKey:key,storage:createPhoneDatabaseStorage({database:coldDb,contextKey:key})});await cold.init();assert.equal(cold.readLife().state.wallet.accounts[0].balance,48650);assert.equal(cold.readLife().state.commerce.orders.length,1);
 snapshot=await coldDb.read();const rows=draft.proposal.matrix.changes.map(c=>({tableId:c.tableId,recordId:c.recordId,values:c.values}));
 return {scope:'isolated real Matrix host plus fake-indexeddb; actual production creator/parser/commit/phone reopen',records:rows.length,tables:[...new Set(rows.map(r=>r.tableId))],initialApps:initial.world.apps,balanceBefore:50000,balanceAfter:48650,orders:1,rawAudioUnavailable:true,sourceRows:rows,savedState:snapshot.state};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 const [mode,output,response]=process.argv.slice(2);await fs.mkdir(output,{recursive:true});
 try{if(mode==='prepare'){const result=await prepare();await fs.writeFile(path.join(output,'request.json'),JSON.stringify(result,null,2));await fs.writeFile(path.join(output,'model-request.txt'),result.messages.map(m=>`[${m.role}]\n${m.content}`).join('\n\n'));console.log(JSON.stringify({messages:result.messages.length,characters:result.messages.reduce((n,m)=>n+m.content.length,0),formsCharacters:result.input.forms.length,output}));}
 else if(mode==='accept'){const result=await accept(await fs.readFile(response,'utf8'));await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(result,null,2));const {savedState,sourceRows,...summary}=result;console.log(JSON.stringify(summary));}else throw Error('Use prepare OUT or accept OUT RESPONSE');}
 catch(error){await fs.writeFile(path.join(output,'failure-'+Date.now()+'.txt'),error.stack+'\n'+JSON.stringify({message:error.message,code:error.code,details:error.details,rawResponse:error.rawResponse??null},null,2));throw error;}
}
