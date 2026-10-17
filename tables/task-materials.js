import {archivalText,historyEvidence} from './ledger.js';
// Capability intake declarations. The raw conversation remains in the host;
// selected projections alone reach a model. These are not model instructions.
export const TASK_MATERIALS=Object.freeze({
 ruleReview:{},
 nativeFill:{archive:true,user:true},
 assetAdapt:{},
 templateInit:{definitions:true,history:'body',user:true},
 tableAssistant:{},
 tableArchive:{archive:true,history:'body',user:true},
 objectArchive:{definitions:true,archive:true,history:'body',user:true},
 preferenceAnalysis:{history:'user'},
 plotAdvance:{style:true},
 historyImport:{archive:true,history:'body',import:true,user:true},
 tableGenesis:{definitions:true,history:'body',user:true},
});
export function selectTaskMaterials(policy,input){
 if(!policy)throw Error('任务没有登记输入区块');
 const out=structuredClone(input);
 // Prose bans are not permissions to rewrite quotations or factual fields.
 if(!policy.style)delete out.styleRules;
 if(!policy.definitions)for(const key of ['sourceCard','sourceCardRaw','sourceBooks'])delete out[key];
 if(!policy.user)delete out.userSource;
 if(!policy.archive)delete out.archiveSource;
 else if(out.archiveSource?.text!==undefined)out.archiveSource.text=archivalText(out.archiveSource.text);
 if(!policy.history)delete out.sourceHistory;
 else if(Array.isArray(out.sourceHistory))out.sourceHistory=out.sourceHistory.filter(r=>policy.history!=='user'||r.role==='user').map(r=>({...r,text:r.role==='assistant'?archivalText(r.text):r.text}));
 else if(out.sourceHistory?.text!==undefined)out.sourceHistory=policy.import?{...out.sourceHistory,text:historyEvidence(out.sourceHistory.text)}:undefined;
 if(!policy.import)delete out.historyText;
 else if(typeof out.historyText==='string')out.historyText=historyEvidence(out.historyText);
 if(out.latestTemporary?.text!==undefined)out.latestTemporary={...out.latestTemporary,text:archivalText(out.latestTemporary.text)};
 return out;
}
