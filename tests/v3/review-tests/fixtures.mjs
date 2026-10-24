import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createReviewService} from '../../../v3/review.mjs';
import {createProgressService} from '../../../v3/progress.mjs';
import {createAssistantService} from '../../../v3/assistant.mjs';
import {createCapabilities,CAPABILITIES,CAPABILITY_GROUPS} from '../../../v3/capabilities.mjs';
import {createArchiveService,ARCHIVE_ROUTES} from '../../../v3/archive-service.mjs';
import {tableRegistry,createInitialState,projectRetained,preferenceGroup} from '../../../v3/host-runtime.mjs';
import {createInitialPreferenceBank,createSharedPreferenceService,createPreferenceOverlayStorage} from '../../../v3/runtime-source/preferences/shared-store.mjs';
import {prepareCommit} from '../../../tables/ledger.js';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../../../config/core.js';
const copy=structuredClone;
function memory(initial){let state=copy(initial),writes=0;return {read:async()=>copy(state),compareAndWrite:async(expected,next)=>{assert.equal(state.revision,expected);state=copy(next);writes++;},get:()=>copy(state),set:value=>state=copy(value),writes:()=>writes};}
export function fixture(){
 let owner={chatId:'chat',branchId:'branch',bindingId:'archive',activeSourceKeys:['user:1','body:1','user:2'],currentSourceKey:'user:2'};
 const row={id:'person',table:'objects',rev:1,values:{名称:'温榆',类型:'character',描述:'旧描述'},access:{readers:['读者'],knowers:[]},source:'body:1',lockedFields:[]};
 const b=memory(createInitialState({registry:tableRegistry,rows:[row]})),p=memory(createInitialPreferenceBank({registry:tableRegistry})),storage=createPreferenceOverlayStorage({sessionStorage:b,preferenceStorage:p});
 const preferences=createSharedPreferenceService({sessionStorage:b,preferenceStorage:p,getSessionOwner:()=>({chatId:owner.chatId,branchId:owner.branchId}),getProjectionOptions:()=>({context:{chatId:owner.chatId},activeSourceKeys:owner.activeSourceKeys})});
 const review=createReviewService({storage,getScope:()=>owner,projectRetained,preferenceService:preferences});
 return {b,p,storage,preferences,review,owner:()=>owner,switch:()=>owner={...owner,chatId:'other'}};
}
export function seedPreferences(f){const s=f.b.get(),changes=[],contributions=[];for(const [n,tag]of ['拉扯','反差'].entries()){
 const values={名称:tag,内容:'用户持续偏好',核心标签:tag,偏好维度:'情节走向',角色指向:'person',性质:'明确要求',强度:'偏好',赋分:n+2,证据:'喜欢拉扯和反差',作用域:{会话:['chat']},启用:true};
 const prepared=prepareCommit({registry:tableRegistry,rows:[],last:null},{changes:[{id:'new:'+n,table:'preferences',expected:0,values,access:{readers:['读者'],knowers:[]},evidence:values.证据}]},{source:'user:1',kind:'preferences',evidence:values.证据,allowedTables:['preferences'],allowSchemaExtensions:false,inferSchemaFields:false});
 const change=prepared.commit.changes[0];Object.assign(change.after,{preferenceSource:'user:1',preferenceOrigin:{chatId:'chat'},preferenceConfirmed:false});changes.push(change);const group=preferenceGroup(values);contributions.push({source:'user:1',origin:{chatId:'chat'},key:'user:1\0'+group,group});}
 s.preferenceDrafts.push({id:'draft',requestKey:'request',status:'pending',contextSource:'user:2',changes,contributions});f.b.set(s);return changes;
}

