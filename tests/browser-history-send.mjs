import {historySendFixture,oldGreeting} from './fixtures/history-send.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {sha256} from '../engine/common.mjs';
import build from '../package.json' with {type:'json'};

// Isolated synthetic context; the final production payload is captured here,
// never sent to a model. Source text is displayed with textContent only.
const variant=new URLSearchParams(location.search).get('variant')??'after',prefix='tisya-history-send-hs1-'+variant+'-';
const saved=JSON.parse(localStorage.getItem(prefix+'context')??'null'),ctx=saved??{chatId:prefix+'chat',characterId:0,extensionSettings:{},chatMetadata:{},chat:[]};
const persist=async()=>{localStorage.setItem(prefix+'context',JSON.stringify(ctx));return true;};
const f=await historySendFixture({context:ctx,persist,storage:indexedStorage({open:(name,version)=>indexedDB.open(prefix+name,version)})});
const el=id=>document.getElementById(id),initial=ctx.chat.map(m=>m.mes);let preparations=0;
function showSource(){el('source').textContent=ctx.chat[0].mes;el('input').value=ctx.chat.at(-1)?.is_user?ctx.chat.at(-1).mes:'';}
el('version').textContent='HS-1 · '+(variant==='before'?'archive.7 原始历史读取器':build.version)+' · '+variant;
el('send').onclick=async()=>{el('send').disabled=true;el('error').textContent='';el('result').textContent='正在检查发送路径…';try{
 const text=el('input').value;ctx.chat.at(-1).mes=text;const before=ctx.chat.map(m=>m.mes),r=await f.send();preparations++;
 const full=r.payload.messages.map(m=>m.content).join('\n');
 const report={status:r.accepted?'请求已组装，未调用外部模型':'未接受',preparations,version:build.version,variant,historyCopies:full.split(ctx.chat[0].mes).length-1,currentInputCopies:full.split(text).length-1,chatUnchanged:JSON.stringify(before)===JSON.stringify(ctx.chat.map(m=>m.mes)),historyFormats:r.history.recentBodies.map(m=>m.format),payloadSha256:sha256(JSON.stringify(r.payload)),historyFloors:r.history.audit.filter(m=>m.layer==='recent_body').map(m=>m.floor)};
 el('result').textContent=JSON.stringify(report,null,2);el('payload').textContent=full;await persist();
 }catch(e){el('result').textContent='准备失败；没有模型请求';el('error').textContent=e.code+' · '+e.message;}finally{el('send').disabled=false;showSource();}};
el('broken').onclick=async()=>{ctx.chat[0].mes='<reply><body>1 未闭合的合成历史';await persist();showSource();el('result').textContent='已放入损坏的隔离历史，请检查发送。';};
el('restore').onclick=async()=>{ctx.chat[0].mes=oldGreeting;await persist();showSource();el('result').textContent='已恢复普通HTML旧历史。';};
el('reload').onclick=()=>location.reload();showSource();el('result').textContent='测试就绪；旧历史共 '+initial.length+' 条，最近AI回复已确认。';
