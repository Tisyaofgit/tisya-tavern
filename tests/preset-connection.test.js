import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializePresetConnection,keepPresetConnection} from '../preset-connection.js';
test('upgrade separates presets once without changing any connection or model value',()=>{
 let saved=0;const settings={bind_preset_to_connection:true,custom_model:'mine',chat_completion_source:'custom',custom_api_format:'gemini_generate_content',custom_url:'https://example.invalid',custom_models_by_source:{custom:['mine']},temperature:0},context={extensionSettings:{},chatCompletionSettings:settings,saveSettingsDebounced:()=>saved++},input={checked:true};
 assert.equal(initializePresetConnection(context,{getElementById:()=>input}),true);assert.equal(settings.bind_preset_to_connection,false);assert.equal(input.checked,false);assert.equal(settings.custom_model,'mine');assert.deepEqual(settings.custom_models_by_source,{custom:['mine']});assert.equal(settings.temperature,0);assert.equal(saved,1);
 settings.bind_preset_to_connection=true;assert.equal(initializePresetConnection(context),false);assert.equal(settings.bind_preset_to_connection,true);assert.equal(saved,1);
});
test('task preset switches skip native connection resets while applying prompt parameters',()=>{
 const settings={bind_preset_to_connection:true,custom_model:'mine',custom_models_by_source:{custom:['mine']},temp_openai:0.5},original={custom_model:'wrong',custom_models_by_source:{custom:[]},temperature:0,prompts:[{content:'new'}]},preset=structuredClone(original),mapping={custom_model:['','custom_model',false,true],custom_models_by_source:['','custom_models_by_source',false,true],temperature:['','temp_openai',false,false]},change={preset,settings,settingsToUpdate:mapping};
 keepPresetConnection(change);
 let emptied=false;if(settings.bind_preset_to_connection)emptied=true;
 for(const [key,[,setting,,connection]]of Object.entries(mapping)){if(connection&&!settings.bind_preset_to_connection)continue;if(preset[key]!==undefined)settings[setting]=preset[key];}
 assert.equal(emptied,false);assert.equal(settings.custom_model,'mine');assert.deepEqual(settings.custom_models_by_source,{custom:['mine']});assert.equal(settings.temp_openai,0);assert.equal(preset.prompts[0].content,'new');assert.equal(original.custom_model,'wrong');
});
