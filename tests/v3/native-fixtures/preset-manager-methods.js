// Extracted unchanged methods from TauriTavern 2.4.0 preset-manager.js, commit fff9af0333be97697be2313981699ab0ce35c236. GPL-3.0; original host license in native-fixtures/extracted/LICENSE.
class NativePresetManager {
    getAllPresets() {
        return $(this.select).find('option').map((_, el) => el.text).toArray();
    }
    findPreset(name) {
        return $(this.select).find('option').filter(function () {
            return $(this).text() === name;
        }).val();
    }
    getSelectedPresetName() {
        return $(this.select).find('option:selected').text();
    }
    async selectPreset(value) {
        const option = $(this.select).filter(function () {
            return $(this).val() === value;
        });
        option.prop('selected', true);
        $(this.select).val(value).trigger('change');
        if (this.apiId === 'openai') {
            await getPresetApplicationPromise();
        }
    }
    async savePreset(name, settings, { skipUpdate = false } = {}) {
        if (this.apiId === 'instruct' && settings) {
            await checkForSystemPromptInInstructTemplate(name, settings);
        }

        if (this.apiId === 'novel' && settings) {
            settings = convertNovelPreset(settings);
        }

        const preset = settings ?? this.getPresetSettings(name);

        const response = await fetch('/api/presets/save', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ preset, name, apiId: this.apiId }),
        });

        if (!response.ok) {
            toastr.error(t`Check the server connection and reload the page to prevent data loss.`, t`Preset could not be saved`);
            console.error('Preset could not be saved', response);
            throw new Error('Preset could not be saved');
        }

        const data = await response.json();
        name = data.name;

        if (skipUpdate) {
            console.debug(`Preset ${name} saved, but not updating the list`);
            return;
        }

        this.updateList(name, preset);
    }
    getCompletionPresetByName(name) {
        // Retrieve a completion preset by name. Return undefined if not found.
        let { presets, preset_names } = this.getPresetList();
        let preset;

        // Some APIs use an array of names, others use an object of {name: index}
        if (Array.isArray(preset_names)) {  // array of names
            if (preset_names.includes(name)) {
                preset = presets[preset_names.indexOf(name)];
            }
        } else {  // object of {names: index}
            if (preset_names[name] !== undefined) {
                preset = presets[preset_names[name]];
            }
        }

        if (preset === undefined) {
            console.error(`Preset ${name} not found`);
        }

        // if the preset isn't found, returns undefined
        return preset;
    }
    updateList(name, preset) {
        const { presets, preset_names } = this.getPresetList();
        const presetExists = this.isKeyedApi() ? preset_names.includes(name) : Object.keys(preset_names).includes(name);

        if (presetExists) {
            if (this.isKeyedApi()) {
                presets[preset_names.indexOf(name)] = preset;
                $(this.select).find(`option[value="${name}"]`).prop('selected', true);
                $(this.select).val(name).trigger('change');
            }
            else {
                const value = preset_names[name];
                presets[value] = preset;
                $(this.select).find(`option[value="${value}"]`).prop('selected', true);
                $(this.select).val(value).trigger('change');
            }
        }
        else {
            presets.push(preset);
            const value = presets.length - 1;

            if (this.isKeyedApi()) {
                preset_names[value] = name;
                const option = $('<option></option>', { value: name, text: name, selected: true });
                $(this.select).append(option);
                $(this.select).val(name).trigger('change');
            } else {
                preset_names[name] = value;
                const option = $('<option></option>', { value: value, text: name, selected: true });
                $(this.select).append(option);
                $(this.select).val(value).trigger('change');
            }
        }
    }
    isKeyedApi() {
        return this.apiId == 'textgenerationwebui' || this.isAdvancedFormatting();
    }
    isAdvancedFormatting() {
        return ['context', 'instruct', 'sysprompt', 'reasoning'].includes(this.apiId);
    }
}
this.NativePresetManager=NativePresetManager;
