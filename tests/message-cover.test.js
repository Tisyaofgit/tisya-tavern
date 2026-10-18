import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messageCardCover} from '../message-cover.js';
const thumb=avatar=>'/thumbnail?file='+encodeURIComponent(avatar);
const characters=[{name:'同名',avatar:'first.png'},{name:'同名',avatar:'second.png'}];
test('portrait follows the active card, including index zero, without mutating context',()=>{
 const context={characters,characterId:0},before=JSON.stringify(context);
 assert.equal(messageCardCover(context,{},thumb),thumb('first.png'));
 assert.equal(JSON.stringify(context),before);
 context.characterId=1;assert.equal(messageCardCover(context,{},thumb),thumb('second.png'));
 context.characterId=8;assert.equal(messageCardCover(context,{},thumb),null);
 assert.equal(messageCardCover({characters:[{avatar:'none'}],characterId:0},{},thumb),null);
});
test('group portraits require exact message card identity and never guess from names or active card',()=>{
 const context={characters,characterId:0,groupId:'group'};
 assert.equal(messageCardCover(context,{original_avatar:'second.png'},thumb),thumb('second.png'));
 for(const message of [{name:'同名'},{original_avatar:'removed.png'},{is_user:true,original_avatar:'first.png'}])assert.equal(messageCardCover(context,message,thumb),null);
});
