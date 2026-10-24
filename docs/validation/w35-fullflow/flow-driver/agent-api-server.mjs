/** Loopback-only OpenAI-compatible response queue for the actual native host.
 * Responses are authored after capture by an agent. This is not a provider model. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {formatSimpleSheet} from '../../../../tables/simple-sheet.js';
const [directory,portText='8095',deadlineText='2026-10-24T19:28:00Z']=process.argv.slice(2);
if(!directory)throw Error('Usage: agent-api-server.mjs NEW_OUTPUT_DIR [PORT] [DEADLINE]');
const out=path.resolve(directory),deadline=Date.parse(deadlineText),port=Number(portText);
await fs.mkdir(out,{recursive:false});let sequence=0;
const hash=value=>createHash('sha256').update(value).digest('hex'),write=(name,value)=>fs.writeFile(path.join(out,name),typeof value==='string'?value:JSON.stringify(value,null,2));
const server=http.createServer(async(req,res)=>{
 res.setHeader('access-control-allow-origin','*');res.setHeader('access-control-allow-headers','content-type,authorization');res.setHeader('access-control-allow-methods','POST,GET,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 if(req.method==='GET'&&/\/models\/?$/.test(req.url)){res.setHeader('content-type','application/json');res.end(JSON.stringify({object:'list',data:[{id:'tisya-agent-assisted',object:'model',owned_by:'local-validation'}]}));return;}
 if(req.method!=='POST'||!/\/chat\/completions\/?$/.test(req.url)){res.writeHead(404);res.end('Not found');return;}
 let requestBase='';try{
  const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>16777216)throw Error('Request too large');chunks.push(chunk);}
  const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(payload.messages)||payload.messages.some(m=>!m||typeof m.role!=='string'||typeof m.content!=='string'))throw Error('Text messages required');
  const text=payload.messages.map((m,i)=>'MESSAGE '+i+' '+m.role+'\n'+m.content).join('\n\n'),id=String(++sequence).padStart(3,'0'),kind=text.includes('<TISYA.DATA.SOURCE>')?'A':text.includes('TISYA.DATA.CARD')?'initialization':'B-or-auxiliary';requestBase=id+'-'+kind;
  const request={id,kind,at:new Date().toISOString(),payload,messages:payload.messages},serialized=JSON.stringify(request,null,2),requestSha256=hash(serialized);
  await write(requestBase+'.request.json',serialized);await write(requestBase+'.messages.txt',text);await write(requestBase+'.delivery.json',{requestSha256,messagesSha256:hash(text),characters:text.length,messageCount:payload.messages.length,modelReadVerified:false});
  console.log(JSON.stringify({event:'request-awaiting-response',base:requestBase,characters:text.length,requestSha256}));let response,closed=false;res.on('close',()=>closed=true);
  for(;;){if(closed)throw Error('Native host closed request before response');if(Date.now()>=deadline)throw Error('Window save deadline reached');try{response=JSON.parse(await fs.readFile(path.join(out,requestBase+'.response.json'),'utf8'));break;}catch(error){if(error.code!=='ENOENT')throw error;}await new Promise(resolve=>setTimeout(resolve,200));}
  if(typeof response.producer!=='string'||response.requestSha256!==requestSha256)throw Error('Response producer or captured-request identity invalid');
  const content=typeof response.content==='string'?response.content:response.sheet?formatSimpleSheet(response.sheet):null;if(typeof content!=='string')throw Error('Response needs content or sheet');await write(requestBase+'.used.txt',content);
  if(payload.stream){res.setHeader('content-type','text/event-stream');res.setHeader('cache-control','no-cache');for(let i=0;i<content.length;i+=96)res.write('data: '+JSON.stringify({id:'agent-'+id,object:'chat.completion.chunk',choices:[{index:0,delta:{content:content.slice(i,i+96)},finish_reason:null}]})+'\n\n');res.write('data: '+JSON.stringify({id:'agent-'+id,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');res.end();}
  else{res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'agent-'+id,object:'chat.completion',model:'tisya-agent-assisted',choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}]}));}
  await write(requestBase+'.receipt.json',{at:new Date().toISOString(),responseSha256:hash(content),characters:content.length,producer:response.producer,delivered:true,network:'loopback local API simulation',externalProvider:false});console.log(JSON.stringify({event:'response-delivered',base:requestBase,characters:content.length}));
 }catch(error){if(requestBase)await write(requestBase+'.failure.json',{at:new Date().toISOString(),message:error.message,stack:error.stack});console.error(JSON.stringify({event:'request-failed',base:requestBase,message:error.message}));if(!res.destroyed&&!res.headersSent){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:error.message}}));}else res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'listening',pid:process.pid,url:'http://127.0.0.1:'+port+'/v1',out,deadline:new Date(deadline).toISOString()})));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
