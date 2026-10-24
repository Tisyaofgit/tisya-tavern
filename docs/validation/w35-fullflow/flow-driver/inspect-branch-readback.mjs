import fs from 'node:fs/promises';
import {createInstallerHarness} from '../../../../tests/v3/host-tests/installer-harness.mjs';
import {sameJsonValue} from '../../../../v3/runtime-source/host/json-value.mjs';
const h=await createInstallerHarness({mvu:false});h.ctx.chat[2].mes='</think><body>旧会话中的告别。</body>';
const captures=[];try{await h.api.getSession();await h.api.branch({floor:2});const s=await h.api.getSession(),read=s.storage.read,write=s.storage.compareAndWrite;let pending=null;
s.storage.compareAndWrite=async(rev,next)=>{pending=structuredClone(next);return write(rev,next);};
s.storage.read=async()=>{const actual=await read();if(pending){captures.push({semanticSame:sameJsonValue(actual,pending),serializedSame:JSON.stringify(actual)===JSON.stringify(pending),actualKeys:Object.keys(actual),expectedKeys:Object.keys(pending),differingTopLevel:Object.keys({...actual,...pending}).filter(k=>!sameJsonValue(actual[k],pending[k])).map(k=>({key:k,actual:actual[k],expected:pending[k]}))});pending=null;}return actual;};
h.ctx.chat.push({is_user:true,mes:'从这里接着。'});await h.intercept('normal');await fs.writeFile(new URL('branch-readback-diagnostic.json',import.meta.url),JSON.stringify({captures,requests:h.requests.length,errors:h.errors.map(e=>({message:e.message,code:e.code,stack:e.stack}))},null,2));
}finally{h.api.dispose();}
