"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioNodeVAD = exports.MicVAD = exports.defaultRealTimeVADOptions = exports.ort = void 0;
const ortInstance = __importStar(require("onnxruntime-web"));
const asset_path_1 = require("./asset-path");
const default_model_fetcher_1 = require("./default-model-fetcher");
const frame_processor_1 = require("./frame-processor");
const logging_1 = require("./logging");
const messages_1 = require("./messages");
const models_1 = require("./models");
exports.ort = ortInstance;
exports.defaultRealTimeVADOptions = {
    ...frame_processor_1.defaultFrameProcessorOptions,
    onFrameProcessed: (probabilities) => { },
    onVADMisfire: () => {
        logging_1.log.debug("VAD misfire");
    },
    onSpeechStart: () => {
        logging_1.log.debug("Detected speech start");
    },
    onSpeechEnd: () => {
        logging_1.log.debug("Detected speech end");
    },
    workletURL: (0, asset_path_1.assetPath)("vad.worklet.bundle.min.js"),
    modelURL: (0, asset_path_1.assetPath)("silero_vad.onnx"),
    modelFetcher: default_model_fetcher_1.defaultModelFetcher,
    stream: undefined,
    ortConfig: undefined,
    workletOptions: {
        processorOptions: {
            frameSamples: frame_processor_1.defaultFrameProcessorOptions.frameSamples,
        },
    },
};
class MicVAD {
    static async new(options = {}) {
        const fullOptions = {
            ...exports.defaultRealTimeVADOptions,
            ...options,
        };
        (0, frame_processor_1.validateOptions)(fullOptions);
        let stream;
        if (fullOptions.stream === undefined)
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    ...fullOptions.additionalAudioConstraints,
                    channelCount: 1,
                    echoCancellation: true,
                    autoGainControl: true,
                    noiseSuppression: true,
                },
            });
        else
            stream = fullOptions.stream;
        const audioContext = new AudioContext();
        const sourceNode = new MediaStreamAudioSourceNode(audioContext, {
            mediaStream: stream,
        });
        const audioNodeVAD = await AudioNodeVAD.new(audioContext, fullOptions);
        audioNodeVAD.receive(sourceNode);
        return new MicVAD(fullOptions, audioContext, stream, audioNodeVAD, sourceNode);
    }
    constructor(options, audioContext, stream, audioNodeVAD, sourceNode, listening = false) {
        this.options = options;
        this.audioContext = audioContext;
        this.stream = stream;
        this.audioNodeVAD = audioNodeVAD;
        this.sourceNode = sourceNode;
        this.listening = listening;
        this.pause = () => {
            this.audioNodeVAD.pause();
            this.listening = false;
        };
        this.start = () => {
            this.audioNodeVAD.start();
            this.listening = true;
        };
        this.destroy = () => {
            if (this.listening) {
                this.pause();
            }
            if (this.options.stream === undefined) {
                this.stream.getTracks().forEach((track) => track.stop());
            }
            this.sourceNode.disconnect();
            this.audioNodeVAD.destroy();
            this.audioContext.close();
        };
    }
}
exports.MicVAD = MicVAD;
class AudioNodeVAD {
    static async new(ctx, options = {}) {
        const fullOptions = {
            ...exports.defaultRealTimeVADOptions,
            ...options,
        };
        (0, frame_processor_1.validateOptions)(fullOptions);
        if (fullOptions.ortConfig !== undefined) {
            fullOptions.ortConfig(exports.ort);
        }
        try {
            await ctx.audioWorklet.addModule(fullOptions.workletURL);
        }
        catch (e) {
            console.error(`Encountered an error while loading worklet. Please make sure the worklet vad.bundle.min.js included with @ricky0123/vad-web is available at the specified path:
        ${fullOptions.workletURL}
        If need be, you can customize the worklet file location using the \`workletURL\` option.`);
            throw e;
        }
        const vadNode = new AudioWorkletNode(ctx, "vad-helper-worklet", fullOptions.workletOptions);
        let model;
        try {
            model = await models_1.Silero.new(exports.ort, () => fullOptions.modelFetcher(fullOptions.modelURL));
        }
        catch (e) {
            console.error(`Encountered an error while loading model file. Please make sure silero_vad.onnx, included with @ricky0123/vad-web, is available at the specified path:
      ${fullOptions.modelURL}
      If need be, you can customize the model file location using the \`modelURL\` option.`);
            throw e;
        }
        const frameProcessor = new frame_processor_1.FrameProcessor(model.process, model.reset_state, {
            frameSamples: fullOptions.frameSamples,
            positiveSpeechThreshold: fullOptions.positiveSpeechThreshold,
            negativeSpeechThreshold: fullOptions.negativeSpeechThreshold,
            redemptionFrames: fullOptions.redemptionFrames,
            preSpeechPadFrames: fullOptions.preSpeechPadFrames,
            minSpeechFrames: fullOptions.minSpeechFrames,
            submitUserSpeechOnPause: fullOptions.submitUserSpeechOnPause,
        });
        const audioNodeVAD = new AudioNodeVAD(ctx, fullOptions, frameProcessor, vadNode);
        vadNode.port.onmessage = async (ev) => {
            switch (ev.data?.message) {
                case messages_1.Message.AudioFrame:
                    let buffer = ev.data.data;
                    if (!(buffer instanceof ArrayBuffer)) {
                        buffer = new ArrayBuffer(ev.data.data.byteLength);
                        new Uint8Array(buffer).set(new Uint8Array(ev.data.data));
                    }
                    const frame = new Float32Array(buffer);
                    await audioNodeVAD.processFrame(frame);
                    break;
                default:
                    break;
            }
        };
        return audioNodeVAD;
    }
    constructor(ctx, options, frameProcessor, entryNode) {
        this.ctx = ctx;
        this.options = options;
        this.frameProcessor = frameProcessor;
        this.entryNode = entryNode;
        this.pause = () => {
            const ev = this.frameProcessor.pause();
            this.handleFrameProcessorEvent(ev);
        };
        this.start = () => {
            this.frameProcessor.resume();
        };
        this.receive = (node) => {
            node.connect(this.entryNode);
        };
        this.processFrame = async (frame) => {
            const ev = await this.frameProcessor.process(frame);
            this.handleFrameProcessorEvent(ev);
        };
        this.handleFrameProcessorEvent = (ev) => {
            if (ev.probs !== undefined) {
                this.options.onFrameProcessed(ev.probs, ev.frame);
            }
            switch (ev.msg) {
                case messages_1.Message.SpeechStart:
                    this.options.onSpeechStart();
                    break;
                case messages_1.Message.VADMisfire:
                    this.options.onVADMisfire();
                    break;
                case messages_1.Message.SpeechEnd:
                    this.options.onSpeechEnd(ev.audio);
                    break;
                default:
                    break;
            }
        };
        this.destroy = () => {
            this.entryNode.port.postMessage({
                message: messages_1.Message.SpeechStop,
            });
            this.entryNode.disconnect();
        };
    }
}
exports.AudioNodeVAD = AudioNodeVAD;
//# sourceMappingURL=real-time-vad.js.map