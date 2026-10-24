import test from 'node:test';
import assert from 'node:assert/strict';
import {characterWorldbookNames,createNativeBookHost} from '../../../v3/book-host.mjs';
import {createInitializationSourceProvider} from '../../../v3/initialization-sources.mjs';
import {hostFixture} from './native-host-fixture.mjs';

test('native character bindings match primary plus per-avatar auxiliary books without global/persona/chat leakage',()=>{
 const context={characters:[{avatar:'渡口.v2.png',data:{extensions:{world:'主书'}}}],characterId:0,chatMetadata:{world_info:'聊天书'},powerUserSettings:{persona_description_lorebook:'人设书'}};
 const settings={globalSelect:['全局书'],charLore:[{name:'渡口.v2',extraBooks:['副书','主书','副书']},{name:'另一卡',extraBooks:['别人的书']}]};
 assert.deepEqual(characterWorldbookNames(context,settings,'渡口.v2.png'),['主书','副书']);
 assert.throws(()=>characterWorldbookNames(context,settings,'别卡.png'),/角色卡已变化/);
 assert.throws(()=>characterWorldbookNames(context,undefined,'渡口.v2.png'),/不可读取/);
});

test('actual native book manager source reads use saved worldbooks and never write or initialize chat metadata',async()=>{
 const f=hostFixture(),context=f.getContext();
 context.characters[0].data={name:'渡口',description:'摆渡人看守旧桥。',extensions:{world:'主书'}};
 f.native.worldInfo.world_info={charLore:[{name:'char',extraBooks:['副书']}]};
 f.worlds.set('主书',{entries:{0:{uid:0,content:'桥在镇东。',comment:'地理'},1:{uid:1,content:'停用内容',disable:true}}});
 f.worlds.set('副书',{entries:{0:{uid:0,content:'渡船每晚停航。',comment:'规则'}}});
 const h=await createNativeBookHost({target:f.target,native:f.native,getContext:f.getContext,getPlayerId:f.getPlayerId,getHost:()=>({assertIdle(){},configurationChanged(){}})});
 const provider=createInitializationSourceProvider({getContext:f.getContext,getLinkedWorldbookNames:h.manager.getLinkedWorldbookNames,readWorldbook:h.manager.readWorldbook});
 const before=structuredClone(context.chatMetadata),snapshot=await provider.read();
 assert.deepEqual(snapshot.summary.books.map(b=>b.name),['主书','副书']);
 assert.match(snapshot.sourceCard,/摆渡人看守旧桥/);assert.match(snapshot.sourceCard,/渡船每晚停航/);assert.doesNotMatch(snapshot.sourceCard,/停用内容/);
 assert.deepEqual(context.chatMetadata,before);assert.ok(f.calls.every(call=>call[0]==='fetch'));
 f.worlds.get('副书').entries[0].content='渡船已失踪。';await assert.rejects(()=>provider.assertFresh(snapshot),/世界书已改变/);
 f.worlds.delete('副书');await assert.rejects(()=>provider.read(),/世界书不存在/);
 h.dispose();
});
