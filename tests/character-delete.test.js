import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deleteCharacterScoped} from '../character-delete.js';
function fixture({active=1,group=null}={}){
 const characters=[{avatar:'old.png'},{avatar:'playing.png'}],chat=[{mes:'未保存的正文'}],meta={note:'保留'},c={characters,characterId:active,groupId:group,chatId:group?'group-chat':active===undefined?'temporary':'playing',chat,chatMetadata:meta,eventTypes:{CHARACTER_DELETED:'deleted',CHAT_DELETED:'chat-deleted'},eventSource:{emit:async(...args)=>events.push(args)}};
 const events=[],calls=[];let disk=structuredClone(characters),native=0,fail='';
 const options={getContext:()=>c,host:{deleteCharacter:async()=>{native++;return false},setCharacterId:i=>c.characterId=i,printCharacters:async()=>calls.push('render')},request:async(path,body)=>{calls.push([path,body]);if(path===fail)throw Error('HTTP 500');if(path.endsWith('/chats'))return [{file_name:'old-chat.jsonl'}];if(path.endsWith('/delete')){disk=disk.filter(x=>x.avatar!==body.avatar_url);return '';}if(path.endsWith('/all'))return structuredClone(disk);throw Error('unknown request');},cleanup:async id=>calls.push(['cleanup',id])};
 return {c,chat,meta,calls,events,options,native:()=>native,fail:path=>fail=path};
}
test('deleting an unrelated card keeps active messages, metadata and avatar after reindexing',async()=>{
 const f=fixture(),active=f.c.characters[1];assert.equal(await deleteCharacterScoped('old.png',f.options),true);
 assert.equal(f.native(),0);assert.equal(f.c.characterId,0);assert.equal(f.c.characters[0],active);assert.equal(f.c.chat,f.chat);assert.equal(f.c.chatMetadata,f.meta);assert.equal(f.c.chatId,'playing');assert.equal(f.calls.find(x=>x[0]==='/api/characters/delete')[1].delete_chats,false);assert.equal(f.events.length,1);
});
test('temporary chat is retained while another card and its explicitly selected chats are deleted',async()=>{
 const f=fixture({active:undefined}); // default arguments intentionally corrected below for a true temporary chat
 f.c.characterId=undefined;f.c.chatId='temporary';
 await deleteCharacterScoped('old.png',{...f.options,deleteChats:true});assert.equal(f.native(),0);assert.equal(f.c.characterId,undefined);assert.equal(f.c.chat,f.chat);assert.equal(f.c.chatId,'temporary');assert.deepEqual(f.events[0],['chat-deleted','old-chat']);
});
test('deleting a group member does not select a character or leave the group',async()=>{
 const f=fixture({active:0,group:'g'});await deleteCharacterScoped('old.png',f.options);assert.equal(f.native(),0);assert.equal(f.c.groupId,'g');assert.equal(f.c.chatId,'group-chat');assert.equal(f.c.chat,f.chat);assert.equal(f.c.characterId,undefined);
});
test('active-card deletion uses the native close/save flow and respects cancellation',async()=>{
 const f=fixture({active:0});assert.equal(await deleteCharacterScoped('old.png',f.options),false);assert.equal(f.native(),1);assert.equal(f.calls.length,0);assert.equal(f.c.characters.length,2);
});
test('failed deletion leaves the chat and local list intact; unconfirmed readback is reported',async()=>{
 const f=fixture();f.fail('/api/characters/delete');await assert.rejects(deleteCharacterScoped('old.png',f.options),/HTTP 500/);assert.equal(f.c.characters.length,2);assert.equal(f.c.chat,f.chat);assert.equal(f.events.length,0);
 const g=fixture();g.fail('/api/characters/all');await assert.rejects(deleteCharacterScoped('old.png',g.options),/已提交.*刷新未完成/);assert.equal(g.c.characters.length,2);assert.equal(g.events.length,0);
});
