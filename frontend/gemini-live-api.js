class GeminiLiveResponseMessage {
    constructor(data) {
        this.data = "";
        this.type = "";

        const serverContent = data?.serverContent || data?.server_content;
        this.endOfTurn = serverContent?.turnComplete || serverContent?.turn_complete;
        this.interrupt = serverContent?.interrupted;

        const modelTurn = serverContent?.modelTurn || serverContent?.model_turn;
        const parts = modelTurn?.parts;
        const tool_calls = data?.toolCall?.functionCalls || data?.tool_call?.function_calls;

        if (data?.setupComplete || data?.setup_complete) {
            this.type = "SETUP COMPLETE";
        } else if (tool_calls) {
            this.data = tool_calls;
            this.type = "FUNCTION_CALL";
        } else if (data?.voiceActivityDetectionSignal || data?.voice_activity_detection_signal) {
            this.type = "VAD_SIGNAL";
        } else if (parts?.length && parts[0].text) {
            this.data = parts[0].text;
            this.type = "TEXT";
        } else if (parts?.length && (parts[0].inlineData || parts[0].inline_data)) {
            const inlineData = parts[0].inlineData || parts[0].inline_data;
            this.data = inlineData.data;
            const mimeType = inlineData.mimeType || inlineData.mime_type;
            if (
                mimeType &&
                (mimeType.startsWith("video/") || mimeType.startsWith("image/"))
            ) {
                this.type = "VIDEO";
                this.mimeType = mimeType;
            } else {
                this.type = "AUDIO";
            }
        } else if (data?.sessionResumptionUpdate || data?.session_resumption_update) {
            this.type = "RESUMPTION";
            const sessionResumptionUpdate = data?.sessionResumptionUpdate || data?.session_resumption_update;
            this.data = sessionResumptionUpdate?.newHandle || sessionResumptionUpdate?.new_handle;
        } else if (serverContent?.inputTranscription || serverContent?.input_transcription) {
            this.type = "INPUT_TRANSCRIPTION";
            const inputTranscription = serverContent?.inputTranscription || serverContent?.input_transcription;
            if (inputTranscription?.text) {
                this.data = inputTranscription?.text;
            } else if (inputTranscription?.finished) {
                this.data = inputTranscription?.finished;
            }
        } else if (serverContent?.outputTranscription || serverContent?.output_transcription) {
            this.type = "OUTPUT_TRANSCRIPTION";
            const outputTranscription = serverContent?.outputTranscription || serverContent?.output_transcription;
            if (outputTranscription?.text) {
                this.data = outputTranscription?.text;
            } else if (outputTranscription?.finished) {
                this.data = "Finished: " + outputTranscription?.finished;
            }
        } else if (this.endOfTurn) {
            this.data = "END OF TURN";
            this.type = "END_OF_TURN";
        } else if (this.interrupt) {
            this.data = "INTERRUPT";
            this.type = "INTERRUPT";
        }
    }
}
const DUMMY_AVATAR_16_9 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAABnTYUvAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAMSURBVBhXYwQDAAACAAHnSm8jAAAAAElFTkSuQmCC";

class GeminiLiveAPI {
    constructor(proxyUrl, controlUrl, frUrl) {
        this.proxyUrl = proxyUrl;
        this.controlUrl = controlUrl;
        this.frUrl = frUrl;

        this.sessionId = crypto.randomUUID();
        this.projectId = null;
        this.model = null;

        this.environment = "prod";

        this.responseModalities = ["VIDEO"];
        this.systemInstructions = "";

        this.endPoint = null;

        this.onReceiveResponse = (message) => {
            console.log("Default message received callback", message);
        };

        this.onConnectionStarted = () => {
            console.log("Default onConnectionStarted");
        };

        this.onErrorMessage = (message) => {
            alert(message);
        };

        this.websocket = null;
        this.location = null;
        this.avatarMode = false;

        this.enableInputTranscript = false;
        this.enableOutputTranscript = false;
        this.voiceName = "";
        this.voiceLocale = "";
        this.enableSessionResumption = false;
        this.customVoiceSample = "";
        this.resumptionHandle = "";
        this.disableDetection = false;
        this.disableInterruption = false;
        this.startSensitivity = "";
        this.endSensitivity = "";
        this.enableProactiveVideo = false;
        this.enableS2ST = false;
        this.s2stTargetLanguage = "";
        this.functionCallDefinition = null;
        this.customizedAvatarData = CUSTOM_AVATAR_DATA;
        this.customizedAvatarMimeType = "image/png";

        console.log("Created Gemini Live API object: ", this);
    }

    setLocation(location) {
        this.location = location;
        this.setApiHost(this.environment);
    }
    setProjectId(projectId) {
        this.projectId = projectId;
    }
    setModel(model) {
        this.model = model;
    }

    setApiHost(environment) {
        this.environment = environment;
        if (this.environment === "autopush") {
            this.endPoint = `autopush-aiplatform.sandbox.googleapis.com`;
        } else if (this.environment === "staging") {
            this.endPoint = `staging-aiplatform.sandbox.googleapis.com`;
        } else if (this.environment === "prod") {
            this.endPoint = `aiplatform.googleapis.com`;
        } else {
            console.error(
                `Unknown environment: ${this.environment}. Using production API host.`
            );
            this.endPoint = `aiplatform.googleapis.com`; // Default to production
        }
    }

    setTranscript(input, output) {
        console.log("input transcript: ", input, "output transcript: ", output);
        this.enableInputTranscript = input;
        this.enableOutputTranscript = output;
    }

    setVoice(name, locale) {
        this.voiceName = name;
        this.voiceLocale = locale;
    }

    setFunctionCall(fcDefinition) {
        this.functionCallDefinition = fcDefinition;
    }

    setCustomVoice(base64Wav) {
        this.customVoiceSample = base64Wav;
    }

    setResumption(enable, handle) {
        this.enableSessionResumption = enable;
        this.resumptionHandle = handle;
    }

    setVad(disableInterruption, disableDetection, startSen, endSen) {
        this.disableDetection = disableDetection;
        this.disableInterruption = disableInterruption;
        this.startSensitivity = startSen;
        this.endSensitivity = endSen;
    }

    setProactiveVideo(enable) {
        this.enableProactiveVideo = enable;
    }

    setS2ST(enable, language) {
        console.log(`Setting S2ST to: ${enable}, Target Language: ${language}`);
        this.enableS2ST = enable;
        this.s2stTargetLanguage = language;
    }

    setCustomizedAvatar(imageData, mimeType = "image/png") {
        this.customizedAvatarData = imageData;
        this.customizedAvatarMimeType = mimeType;
    }

    connect() {
        console.log("connect(): Triggering initBackendService...");
        this.initBackendService()
            .then(() => {
                console.log(
                    "connect(): initBackendService successful. Triggering setupFuncDeclarationToService..."
                );
                return this.setupFuncDeclarationToService();
            })
            .then(() => {
                console.log(
                    "connect(): setupFuncDeclarationToService successful. Triggering setupWebSocketToService."
                );
                this.setupWebSocketToService();
            })
            .catch((error) =>
                console.error("connect(): Promise chain failed.", error)
            );
    }

    initBackendService() {
        const postRequestBody = {
            command: "connect",
            session_id: this.sessionId,
            endpoint: this.endPoint,
            location: this.location,
        };
        return this.sendPostRequest(this.controlUrl, postRequestBody)
            .then((response) => {
                if (response) {
                    if (response.project_id) {
                        this.setProjectId(response.project_id);
                    }
                }
            })
            .catch((error) => {
                console.error("Error in initBackendService:", error);
                this.onErrorMessage("Error initializing backend service.");
                throw error; // Re-throw the error to stop the promise chain
            });
    }

    setupFuncDeclarationToService() {
        if (this.functionCallDefinition) {
            const funcDeclarationMessage = {
                objective: "fc_definition",
                session_id: this.sessionId,
                functionDefinition: this.functionCallDefinition,
            };
            return this.sendPostRequest(
                this.frUrl,
                funcDeclarationMessage
            ).catch((error) => {
                console.error("Error in setupFuncDeclarationToService:", error);
                this.onErrorMessage("Error setting up function declaration.");
                // Re-throw the error to stop the promise chain
                throw error;
            });
        }
        // If there's no function definition, return a resolved promise so .then() can still be used.
        return Promise.resolve();
    }

    disconnect() {
        this.webSocket.close();
    }

    sendMessage(message) {
        this.webSocket.send(JSON.stringify(message));
    }

    onReceiveMessage(messageEvent) {
        console.log("Message received: ", messageEvent);
        const messageData = JSON.parse(messageEvent.data);
        const message = new GeminiLiveResponseMessage(messageData);
        console.log("onReceiveMessageCallBack this ", this);
        this.onReceiveResponse(message);
    }

    setupWebSocketToService() {
        console.log("connecting: ", this.proxyUrl);

        const wsUrl = new URL(this.proxyUrl);
        wsUrl.searchParams.append("session_id", this.sessionId);
        this.webSocket = new WebSocket(wsUrl);

        this.webSocket.onclose = (event) => {
            console.log("websocket closed: ", event);
            this.onErrorMessage("Connection closed");
        };

        this.webSocket.onerror = (event) => {
            console.log("websocket error: ", event);
            this.onErrorMessage("Connection error");
        };

        this.webSocket.onopen = (event) => {
            console.log("websocket open: ", event);
            this.sendInitialSetupMessages();
            this.onConnectionStarted();
        };

        this.webSocket.onmessage = this.onReceiveMessage.bind(this);
    }

    sendInitialSetupMessages() {
        console.log("start setting up");
        console.log("Setting up voice sample:" + this.customVoiceSample);

        const modelUri = `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}`;
        const sessionSetupMessage = {
            setup: {
                model: modelUri,
                generation_config: {
                    response_modalities: this.responseModalities,
                    speech_config: {
                        voice_config: this.customVoiceSample
                            ? {
                                replicated_voice_config: {
                                    voice_sample_audio:
                                          this.customVoiceSample,
                                    mime_type: "audio/pcm;rate=24000",
                                  },
                              }
                            : {
                                prebuilt_voice_config: {
                                    voice_name: this.voiceName,
                                  },
                              },
                        language_code: this.voiceLocale,
                    },
                },
                avatar_config: {
                    customized_avatar: {
                        image_mime_type: this.customizedAvatarMimeType,
                        image_data: this.customizedAvatarData,
                    },
                },
            },
        };

        if (this.functionCallDefinition) {
            sessionSetupMessage.setup.tools = [
                { function_declarations: this.functionCallDefinition },
            ];
        }

        console.log(sessionSetupMessage);

        if (this.systemInstructions && this.systemInstructions.trim()) {
            sessionSetupMessage.setup.system_instruction = {
                parts: [{ text: this.systemInstructions }],
            };
        }

        if (this.enableSessionResumption) {
            sessionSetupMessage.setup.session_resumption = {
                handle: this.resumptionHandle,
            };
        }

        if (this.disableDetection || this.disableInterruption || this.startSensitivity !== "" || this.endSensitivity !== "") {
            sessionSetupMessage.setup.realtime_input_config = {
                automatic_activity_detection: {}
            };
            if (this.disableDetection) {
                sessionSetupMessage.setup.realtime_input_config.automatic_activity_detection.disabled = true;
            }
            if (this.disableInterruption) {
                sessionSetupMessage.setup.realtime_input_config.activity_handling = 2;
            }
        }

        if (this.startSensitivity === "") {
            sessionSetupMessage.setup.realtime_input_config.automatic_activity_detection.start_of_speech_sensitivity = "START_SENSITIVITY_UNSPECIFIED";
        } else if (this.startSensitivity === "low") {
            sessionSetupMessage.setup.realtime_input_config.automatic_activity_detection.start_of_speech_sensitivity = "START_SENSITIVITY_LOW";
        } else if (this.startSensitivity === "high") {
            sessionSetupMessage.setup.realtime_input_config.automatic_activity_detection.start_of_speech_sensitivity = "START_SENSITIVITY_HIGH";
        }

        if (this.endSensitivity === "") {
            sessionSetupMessage.setup.realtime_input_config.automatic_activity_detection.end_of_speech_sensitivity = "END_SENSITIVITY_UNSPECIFIED";
        } else if (this.endSensitivity === "low") {
            sessionSetupMessage.setup.realtime_input_config.automatic_activity_detection.end_of_speech_sensitivity = "END_SENSITIVITY_LOW";
        } else if (this.endSensitivity === "high") {
            sessionSetupMessage.setup.realtime_input_config.automatic_activity_detection.end_of_speech_sensitivity = "START_SENSITIVITY_HIGH";
        }

        if (this.enableProactiveVideo) {
            sessionSetupMessage.setup.proactivity = {
                proactive_video: true,
            };
        }

        if (this.enableS2ST) {
            sessionSetupMessage.setup.enable_speech_to_speech_translation = true;
            sessionSetupMessage.setup.generation_config.speech_config.language_code =
                this.s2stTargetLanguage;
        }

        console.log("setup message: " + sessionSetupMessage);
        this.sendMessage(sessionSetupMessage);
    }

    sendTextMessage(text) {
        const textMessage = {
            client_content: {
                turns: [
                    {
                        role: "user",
                        parts: [{ text: text }],
                    },
                ],
                turn_complete: true,
            },
        };
        this.sendMessage(textMessage);
    }

    sendVoiceActivityMessage(start) {
        if (start) {
            const startMessage = {
                realtime_input: {
                    activity_start: {},
                },
            };
            this.sendMessage(startMessage);
        } else {
            const endMessage = {
                realtime_input: {
                    activity_end: {},
                },
            };
            this.sendMessage(endMessage);
        }
    }

    sendRealtimeInputMessage(data, mimeType) {
        const message = {
            realtime_input: {
                media_chunks: [
                    {
                        mime_type: mimeType,
                        data: data,
                    },
                ],
            },
        };
        this.sendMessage(message);
    }

    sendAudioMessage(base64PCM) {
        this.sendRealtimeInputMessage(base64PCM, "audio/pcm;rate=16000");
    }

    sendImageMessage(base64Image, mime_type = "image/jpeg") {
        const message = {
            realtime_input: {
                video: {
                    mime_type: mime_type,
                    data: base64Image,
                },
            },
        };
        this.sendMessage(message);
    }

    async sendPostRequest(url, data) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const received_data = await response.json();
            console.log("Received data:", received_data);
            return received_data;
        } catch (error) {
            console.error("Error sending POST request:", error);
            this.onErrorMessage(`Error sending POST request: ${error.message}`);
            throw error; // Re-throw the error to reject the promise
        }
    }
}

console.log("loaded gemini-live-api.js");
