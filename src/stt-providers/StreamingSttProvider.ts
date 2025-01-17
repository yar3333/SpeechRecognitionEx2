import { getApiUrl, doExtrasFetch, modules } from '../externals/sillytavern-extensions';
import type { ISttProvider } from './ISttProvider';

const DEBUG_PREFIX = '<Speech Recognition module (streaming)> ';

export interface StreamingSttProviderSettings {
    triggerCharMin: number;
    triggerWordsText: string;
    triggerWords: string[];
    triggerWordsEnabled: boolean;
    triggerWordsIncluded: boolean;
    debug: boolean;
    language: string;
}

export class StreamingSttProvider implements ISttProvider {

    public settings: StreamingSttProviderSettings = null;

    defaultSettings: StreamingSttProviderSettings = {
        triggerCharMin: 0,
        triggerWordsText: '',
        triggerWords: [],
        triggerWordsEnabled: false,
        triggerWordsIncluded: false,
        debug: false,
        language: '',
    };

    get settingsHtml() {
        let html = '\
        <div id="speech_recognition_streaming_trigger_words_div">\
        <span>Minimum spoken characters to trigger</span><br>\
        <input max="99" min="0" class="text_pole" id="speech_recognition_streaming_trigger_min_chars" type="number"><br>\
        <span>Trigger words</span>\
        <textarea id="speech_recognition_streaming_trigger_words" class="text_pole textarea_compact" type="text" rows="4" placeholder="Enter comma separated words that triggers new message, example:\nhey, hey aqua, record, listen"></textarea>\
        <label class="checkbox_label" for="speech_recognition_streaming_trigger_words_enabled">\
            <input type="checkbox" id="speech_recognition_streaming_trigger_words_enabled" name="speech_recognition_trigger_words_enabled">\
            <small>Enable trigger words</small>\
        </label>\
        <label class="checkbox_label" for="speech_recognition_trigger_words_included">\
            <input type="checkbox" id="speech_recognition_trigger_words_included" name="speech_recognition_trigger_words_included">\
            <small>Include trigger words in message</small>\
        </label>\
        <label class="checkbox_label" for="speech_recognition_streaming_debug">\
            <input type="checkbox" id="speech_recognition_streaming_debug" name="speech_recognition_streaming_debug">\
            <small>Enable debug pop ups</small>\
        </label>\
        </div>\
        ';
        return html;
    }

    onSettingsChange() {
        this.settings.triggerCharMin = Number.parseInt(<string>$('#speech_recognition_streaming_trigger_min_chars').val());
        this.settings.triggerWordsText = <string>$('#speech_recognition_streaming_trigger_words').val();
        let array = (<string>$('#speech_recognition_streaming_trigger_words').val()).split(',');
        array = array.map(element => { return element.trim().toLowerCase(); });
        array = array.filter((str) => str !== '');
        this.settings.triggerWords = array;
        this.settings.triggerWordsEnabled = $('#speech_recognition_streaming_trigger_words_enabled').is(':checked');
        this.settings.triggerWordsIncluded = $('#speech_recognition_trigger_words_included').is(':checked');
        this.settings.debug = $('#speech_recognition_streaming_debug').is(':checked');
        console.debug(DEBUG_PREFIX + ' Updated settings: ', this.settings);
        this.loadSettings(this.settings);
    }

    loadSettings(settings: any) {
        // Populate Provider UI given input settings
        if (Object.keys(settings).length == 0) {
            console.debug(DEBUG_PREFIX + 'Using default Whisper STT extension settings');
        }

        // Only accept keys defined in defaultSettings
        this.settings = this.defaultSettings;

        for (const key in settings) {
            if (key in this.settings) {
                (<any>this.settings)[key] = settings[key];
            } else {
                throw `Invalid setting passed to STT extension: ${key}`;
            }
        }

        $('#speech_recognition_streaming_trigger_min_chars').val(this.settings.triggerCharMin);
        $('#speech_recognition_streaming_trigger_words').val(this.settings.triggerWordsText);
        $('#speech_recognition_streaming_trigger_words_enabled').prop('checked', this.settings.triggerWordsEnabled);
        $('#speech_recognition_trigger_words_included').prop('checked', this.settings.triggerWordsIncluded);
        $('#speech_recognition_streaming_debug').prop('checked', this.settings.debug);

        console.debug(DEBUG_PREFIX + 'streaming STT settings loaded');
    }

    async getUserMessage() {
        // Return if module is not loaded
        if (!modules.includes('streaming-stt')) {
            console.debug(DEBUG_PREFIX + 'Module streaming-stt must be activated in Sillytavern Extras for streaming user voice.');
            return '';
        }

        const url = new URL(getApiUrl());
        url.pathname = '/api/speech-recognition/streaming/record-and-transcript';

        const apiResult = await doExtrasFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Bypass-Tunnel-Reminder': 'bypass',
            },
            body: JSON.stringify({
                text: '',
                language: this.settings.language,
            }),
        });

        if (!apiResult.ok) {
            window.toastr.error(apiResult.statusText, DEBUG_PREFIX + 'STT Generation Failed  (streaming)', { timeOut: 10000, extendedTimeOut: 20000, preventDuplicates: true });
            throw new Error(`HTTP ${apiResult.status}: ${await apiResult.text()}`);
        }

        const data = await apiResult.json();
        //Return the transcript if it exceeds the minimum character number.
        if (data.transcript.length > this.settings.triggerCharMin) {
            return data.transcript;
        }
    }

    processAudio(wavBlob: Blob): Promise<string> { throw new Error("`processAudio` is unsupported by StreamingSttProvider.") }
}
