// Native presets contain connection/model fields as well as prompt parameters.
// Use the host's own unbound mode so it also skips clearing model option lists.
export function keepPresetConnection(change){
 if(!change?.preset)return;
 for(const [key,definition]of Object.entries(change.settingsToUpdate??{}))if(definition[3])delete change.preset[key];
 delete change.preset.bind_preset_to_connection;
 if(change.settings)change.settings.bind_preset_to_connection=false;
}
export function initializePresetConnection(context,document){
 const key='tisyaPresetConnectionSeparation';
 if(context.extensionSettings[key]===1||!context.chatCompletionSettings)return false;
 context.chatCompletionSettings.bind_preset_to_connection=false;
 const input=document?.getElementById('bind_preset_to_connection');if(input)input.checked=false;
 context.extensionSettings[key]=1;
 context.saveSettingsDebounced?.();
 return true;
}
