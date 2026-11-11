import test from 'node:test';
import assert from 'node:assert/strict';
import {describeChatMetadataFailure} from '../chat-persistence-error.js';

test('a native integrity rejection has an actionable message and preserves its exact cause',()=>{
 const raw={BadRequest:'integrity'},native=Object.assign(new Error('integrity',{cause:raw}),{code:'integrity'});
 const described=describeChatMetadataFailure(native,{group:true,hasIntegrity:true});
 assert.equal(described.code,'TISYA_CHAT_SAVE_INTEGRITY');assert.equal(described.cause,native);assert.equal(described.cause.cause,raw);
 assert.match(described.message,/聊天保存冲突.*integrity/);assert.match(described.message,/本次保存未完成/);assert.match(described.message,/保留未发送的草稿/);assert.match(described.message,/重新打开/);
 assert.deepEqual(described.tisyaChatSave,{stage:'metadata',hostCode:'integrity',chatType:'group',hasIntegrity:true});
 assert.equal(native.message,'integrity');assert.deepEqual(raw,{BadRequest:'integrity'});
});

test('unrelated save failures retain their original identity and are not diagnosed as integrity',()=>{
 for(const original of [Error('network unavailable'),Object.assign(Error('failed integrity audit elsewhere'),{code:'OTHER'}),'integrity',{BadRequest:'disk full'}])assert.equal(describeChatMetadataFailure(original),original);
});
