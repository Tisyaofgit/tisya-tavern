import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFixture} from './native-host-fixture.mjs';
import {createNativeBookHost} from '../../../v3/book-host.mjs';
import {createConfigurationBook} from '../../../v3/configuration-book.mjs';
import {createStore,emptyConfig,defaultWorld,worldKey,KEY} from '../../../config/core.js';
import {validateTagTemplateBank} from '../../../v3/tags.mjs';
const copy=v=>structuredClone(v);

test('production native callback adapter saves configuration and cold reload reads it through the native worldbook API boundary',async()=>{
 const {f,h,core}=await prepareFixture();let ui={联系人分组:{},动态效果:false};const c=f.getContext();c.extensionSettings={};const config=emptyConfig(),key=worldKey(c);config.worlds[key]=defaultWorld();config.worlds[key].modes.narrative.缇斯亚聊天模式='with-story';c.extensionSettings[KEY]=config;
 const make=books=>{const store=createStore({getContext:f.getContext,persist:async()=>{throw Error('separate settings persistence is forbidden');}}),service=createConfigurationBook({books,store,getContext:f.getContext,getPlayerId:f.getPlayerId,readInterface:()=>ui,applyInterface:value=>{ui=copy(value);},validateInterface:value=>{assert.equal(typeof value.联系人分组,'object');},domainValidators:{tagTemplates:validateTagTemplateBank}});return {store,service};};
 const first=make(h.manager);await first.service.hydrate({initializeIfMissing:true});const tags={format:'tisya.tag-templates/1',templates:[{id:'custom:guarded-warmth',label:'含蓄关心',aliases:[],type:'character',description:'把在意藏在实际行动里。',usage:{expression:'用一个帮忙的举动替代直接表白。'},sourceIds:[]}]};await first.service.saveDomain('tagTemplates',tags,first.service.read());
 assert.ok(f.calls.some(row=>row[0]==='saveWorldInfo'&&row[1]===core.physicalName));const wire=Object.values(f.worlds.get(core.physicalName).entries).find(e=>e.extensions?.tisyaConfiguration);assert.ok(wire.disable);h.dispose();
 c.extensionSettings={};ui={联系人分组:{}};const freshHost=await createNativeBookHost({target:f.target,native:f.native,getContext:f.getContext,getPlayerId:f.getPlayerId,getHost:()=>({assertIdle(){},configurationChanged(){}})}),fresh=make(freshHost.manager);await fresh.service.hydrate();assert.equal(fresh.store.read().world.modes.narrative.缇斯亚聊天模式,'with-story');assert.deepEqual(fresh.service.read().domains.tagTemplates,tags);assert.equal(ui.动态效果,false);
 assert.ok(f.calls.filter(row=>row[0]==='fetch'&&row[1]==='/api/worldinfo/get').length>=2);assert.equal(f.calls.filter(row=>row[0]==='saveSettings').length,1,'only the native global-core locator is saved; configuration remains in its book');
});
