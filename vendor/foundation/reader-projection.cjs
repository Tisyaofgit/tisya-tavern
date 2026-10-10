'use strict';
const ACL=require('./permission-wire.cjs');
const opts={mode:'emit',audience:'读者'};
const publicPolicy=p=>Array.isArray(p)?ACL.allows(p,opts):ACL.allows(p.默认,opts)&&Object.values(p.字段).every(x=>ACL.allows(x,opts));
function stripMetadata(v){if(Array.isArray(v))return v.map(stripMetadata);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>k!=='权限'&&k!=='关联权限').map(([k,x])=>[k,['新值','旧值','等于'].includes(k)?x:stripMetadata(x)]));return v;}
function extraAllowed(memory){return !memory?.权限?.some(x=>x.区块==='extra'&&!publicPolicy(x.权限));}
function nativePanel(panel,memory){
 const q=structuredClone(panel);
 for(const row of memory?.权限??[])if(row.区块==='status'&&!publicPolicy(row.权限)){const [t,o,f]=row.定位;if(q[t]?.[o]){delete q[t][o][f];if(!Object.keys(q[t][o]).length)delete q[t][o];if(!Object.keys(q[t]).length)delete q[t];}}
 return q;
}
function apply(b){
 if(!b.envelope.wire)return b;
 const q=JSON.parse(b.memory),M=require('./memory-permissions.cjs');
 b.task.tasks=b.task.tasks.filter(t=>t.plan).map(t=>({...t,input:'',source:'',stop:''}));
 b.task.refs={style:[],cast:[]};b.task.pending=[];b.task.characters=[];
 b.next.tasks=[];b.next.candidates=[];b.next.branches=[];
 b.body=require('./numbered-paragraphs.cjs').text(b.body);
 if(!extraAllowed(q))b.extra='';
 const status=nativePanel(JSON.parse(b.status),q);
 if(status.叙事状态){for(const [name,fields]of Object.entries(status.叙事状态))for(const [field,v]of Object.entries(fields)){
  if(!M.all(v.权限,['/0','/2','/4'],opts)){delete fields[field];continue;}
  delete v.旧值;v.知情=v.知情.filter((x,i)=>M.all(v.权限,[0,1,2].map(c=>'/知情/'+i+'/'+c),opts));delete v.权限;
 }for(const [name,fields]of Object.entries(status.叙事状态))if(!Object.keys(fields).length)delete status.叙事状态[name];if(!Object.keys(status.叙事状态).length)delete status.叙事状态;}
 b.status=JSON.stringify(status);b.vars='';
 b.memory=JSON.stringify(stripMetadata({事件:q.事件.map(e=>M.projectEvent(e,opts)).filter(Boolean),未完事项:q.未完事项.filter(t=>M.visibleTask(t,opts)),倒计时:q.倒计时.filter(t=>M.visibleTimer(t,opts))}));
 delete b.envelope.wire.unlocks;
 return b;
}
module.exports={apply,extraAllowed,nativePanel};
