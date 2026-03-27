window.addEventListener("load", (event) => {
    console.log("Hello Gemini Realtime Demo!");

    setAvailableCamerasOptions();
    setAvailableMicrophoneOptions();
    toggleAvatarMode();
});

const isHttps = window.location.protocol === "https:";
const wsProtocol = isHttps ? "wss:" : "ws:";
const host = window.location.host;

const PROXY_URL = `${wsProtocol}//${host}/ws`;
const CONTROL_URL = `/api/control`;
const FR_SERVICE_URL = `/api/post_endpoint`;

const systemInstructionsInput = document.getElementById("systemInstructions");
const locationInput = document.getElementById("location");

CookieJar.init("systemInstructions");
CookieJar.init("location");

const disconnected = document.getElementById("disconnected");
const connecting = document.getElementById("connecting");
const connected = document.getElementById("connected");
const speaking = document.getElementById("speaking");

const micBtn = document.getElementById("micBtn");
const micOffBtn = document.getElementById("micOffBtn");
const cameraBtn = document.getElementById("cameraBtn");
const cameraOffBtn = document.getElementById("cameraOffBtn");
const screenBtn = document.getElementById("screenBtn");

const cameraSelect = document.getElementById("cameraSource");
const micSelect = document.getElementById("audioSource");

const envApiHost = document.getElementById("envApiHost");
const liveApiModel = document.getElementById("liveApiModel");
const inputTranscript = document.getElementById("inputTranscript");
const outputTranscript = document.getElementById("outputTranscript");
const enableResumption = document.getElementById("resumption");
const resumptionHandle = document.getElementById("handle");
const voiceName = document.getElementById("voiceName");
const voiceLocale = document.getElementById("voiceLocale");
const disableInterruption = document.getElementById("disableInterruption");
const disableDetection = document.getElementById("disableDetection");
const startSensitivity = document.getElementById("startSensitivity");
const endSensitivity = document.getElementById("endSensitivity");

const audioFileInput = document.getElementById("audioFileInput");
const fileNameDisplay = document.getElementById("fileName");

const fcFileInput = document.getElementById("fcFileInput");
const fcFileNameDisplay = document.getElementById("fcFileName");

const proactiveVideo = document.getElementById("proactiveVideo");
const audioInterval = document.getElementById("audioInterval");
const videoInterval = document.getElementById("videoInterval");
const enableS2STInput = document.getElementById("enableS2ST");
const s2stTargetLanguageInput = document.getElementById("s2stTargetLanguage");

const geminiLiveApi = new GeminiLiveAPI(PROXY_URL, CONTROL_URL, FR_SERVICE_URL);

geminiLiveApi.onErrorMessage = (message) => {
    showDialogWithMessage(message);
    setAppStatus("disconnected");
    stopAudioInput();
    micBtn.hidden = true;
    micOffBtn.hidden = false;
    micOffBtn.querySelector('md-filled-icon-button').disabled = true;
    cameraBtn.hidden = true;
    cameraOffBtn.hidden = false;
    cameraOffBtn.querySelector('md-filled-icon-button').disabled = true;
    screenBtn.querySelector('md-filled-icon-button').disabled = true;
};

let customVoiceBase64 = "";
audioFileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            console.log(e.target.result);
            // The result includes the data URL header, so we split it.
            // e.g., "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAA..." -> "UklGRiYAAABXQVZFZm10IBAAAA..."
            customVoiceBase64 = e.target.result.split(",")[1];
            fileNameDisplay.textContent = `File: ${file.name}`;
        };
        reader.readAsDataURL(file);
    }
    alert(`New branded voice ${file.name} file has been uploaded`);
});

functionCallDefinition = null;
fcFileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                functionCallDefinition = JSON.parse(e.target.result);
                console.log(
                    "Function call definition loaded:",
                    functionCallDefinition
                );
                fcFileNameDisplay.textContent = `File: ${file.name}`;
            } catch (error) {
                alert(`Error parsing JSON file: ${error.message}`);
            }
        };
        reader.readAsText(file);
    }
    alert(`Function call definition ${file.name} file has been uploaded`);
});

function getSelectedResponseModality() {
    const radioButtons = document.querySelectorAll(
        'md-radio[name="responseModality"]'
    );

    let selectedValue;
    for (const radioButton of radioButtons) {
        if (radioButton.checked) {
            selectedValue = radioButton.value;
            break;
        }
    }
    return selectedValue;
}

function getSystemInstructions() {
    return systemInstructionsInput.value;
}

function connectBtnClick() {
    setAppStatus("connecting");
    console.log("Connecting...");

    geminiLiveApi.responseModalities = [getSelectedResponseModality()];
    if (getSystemInstructions() !== "") {
        geminiLiveApi.systemInstructions = getSystemInstructions();
    }
    geminiLiveApi.setModel(liveApiModel.value);
    geminiLiveApi.setTranscript(
        inputTranscript.checked,
        outputTranscript.checked
    );
    geminiLiveApi.setResumption(
        enableResumption.checked,
        resumptionHandle.value
    );
    geminiLiveApi.setVoice(voiceName.value, voiceLocale.value);
    geminiLiveApi.setVad(
        disableInterruption.checked,
        disableDetection.checked,
        startSensitivity.value,
        endSensitivity.value
    );
    geminiLiveApi.setCustomVoice(customVoiceBase64);
    geminiLiveApi.setFunctionCall(functionCallDefinition);
    geminiLiveApi.setProactiveVideo(proactiveVideo.checked);
    geminiLiveApi.setS2ST(
        enableS2STInput.checked,
        s2stTargetLanguageInput.value
    );
    geminiLiveApi.setLocation(locationInput.value);
    geminiLiveApi.setApiHost(envApiHost.value);
    const avatarModeCheckbox = document.getElementById("enableAvatarMode");
    geminiLiveApi.avatarMode = avatarModeCheckbox.checked;

    geminiLiveApi.connect();

    geminiLiveApi.onConnectionStarted = () => {
        micOffBtn.querySelector('md-filled-icon-button').disabled = false;
        cameraOffBtn.querySelector('md-filled-icon-button').disabled = false;
        screenBtn.querySelector('md-filled-icon-button').disabled = false;
        setAppStatus("connected");

        // startAudioInput();
    };
}

const liveAudioOutputManager = new LiveAudioOutputManager();

geminiLiveApi.onReceiveResponse = (messageResponse) => {
    console.log("Message response received, type: " + messageResponse.type);
    if (messageResponse.type === "AUDIO") {
        liveAudioOutputManager.playAudioChunk(messageResponse.data);
    } else if (messageResponse.type === "VIDEO") {
        const avatarOutput = document.getElementById("avatar-output");
        avatarOutput.src = `data:${messageResponse.mimeType};base64,${messageResponse.data}`;
    } else if (messageResponse.type === "TEXT") {
        console.log("Gemini said: ", messageResponse.data);
        newModelMessage(messageResponse.data);
    } else if (messageResponse.type === "RESUMPTION") {
        console.log("Resumption handle received: ", messageResponse.data);
        newModelMessage("New Resumption Handle ID: " + messageResponse.data);
    } else if (messageResponse.type === "INPUT_TRANSCRIPTION") {
        console.log("Input transcription received: ", messageResponse.data);
        newModelMessage("Input Transcription: " + messageResponse.data);
    } else if (messageResponse.type === "OUTPUT_TRANSCRIPTION") {
        console.log("Output transcription received: ", messageResponse.data);
        newModelMessage("Output Transcription: " + messageResponse.data);
    } else if (messageResponse.type === "END_OF_TURN") {
        console.log("End of turn");
        newModelMessage("End of turn!");
    } else if (messageResponse.type === "INTERRUPT") {
        console.log("Interrupted!");
        newModelMessage("Interrupted!");
    } else if (messageResponse.type === "VAD_SIGNAL") {
        console.log("VAD signal");
        newModelMessage("VAD signal received");
    } else if (messageResponse.type === "FUNCTION_CALL") {
        console.log("Function call requested: ", messageResponse.data);
        const functionCalls = messageResponse.data;
        newModelMessage("Function Call: " + JSON.stringify(functionCalls));

        // Process function calls sequentially using promise chaining without making the parent function async.
        const allResponsesPromise = functionCalls.reduce(
            (promiseChain, funcCall) => {
                return promiseChain.then((allResponses) => {
                    const postData = {
                        objective: "fr_generate",
                        functionName: funcCall.name,
                        functionArgs: funcCall.args,
                    };

                    // sendPostRequest returns a promise. We chain it.
                    return geminiLiveApi
                        .sendPostRequest(geminiLiveApi.frUrl, postData)
                        .then((result) => {
                            // Add the new response to our list of all responses
                            allResponses.push({
                                id: funcCall.id,
                                name: funcCall.name,
                                response: {
                                    result: result,
                                    scheduling: "WHEN_IDLE",
                                },
                            });
                            return allResponses;
                        });
                });
            },
            Promise.resolve([])
        ); // Start with a resolved promise with an empty array.

        // After all post requests have completed sequentially...
        allResponsesPromise
            .then((fcResponseList) => {
                // ...send the collected responses back to Gemini.
                const responseDict = {
                    toolResponse: {
                        functionResponses: fcResponseList,
                    },
                };
                geminiLiveApi.sendMessage(responseDict);
            })
            .catch((error) => {
                console.error("Error processing function calls:", error);
                newModelMessage(
                    "Error processing function calls: " + error.message
                );
            });
    }
};

const liveAudioInputManager = new LiveAudioInputManager();

liveAudioInputManager.onNewAudioRecordingChunk = (audioData) => {
    geminiLiveApi.sendAudioMessage(audioData);
};

function addMessageToChat(message) {
    const textChat = document.getElementById("text-chat");
    const newParagraph = document.createElement("p");
    newParagraph.textContent = message;
    textChat.appendChild(newParagraph);
}

function newModelMessage(message) {
    addMessageToChat(">> " + message);
}

function newUserMessage() {
    const textMessage = document.getElementById("text-message");
    addMessageToChat("User: " + textMessage.value);
    geminiLiveApi.sendTextMessage(textMessage.value);

    textMessage.value = "";
}

function startAudioInput() {
    liveAudioInputManager.updateAudioInterval(audioInterval.value);
    // liveAudioInputManager.connectMicrophone();
}

function stopAudioInput() {
    liveAudioInputManager.disconnectMicrophone();
}

function micBtnClick() {
    console.log("micBtnClick");
    stopAudioInput();
    micBtn.hidden = true;
    micOffBtn.hidden = false;
}

function micOffBtnClick() {
    console.log("micOffBtnClick");
    startAudioInput();

    micBtn.hidden = false;
    micOffBtn.hidden = true;
}

function audioStartButtonClick() {
    console.log("start voice activity...");
    geminiLiveApi.sendVoiceActivityMessage(true);
}

function audioEndButtonClick() {
    console.log("end voice activity...");
    geminiLiveApi.sendVoiceActivityMessage(false);
}

const videoElement = document.getElementById("video");
const canvasElement = document.getElementById("canvas");

const liveVideoManager = new LiveVideoManager(videoElement, canvasElement);

const liveScreenManager = new LiveScreenManager(videoElement, canvasElement);

liveVideoManager.onNewFrame = (b64Image) => {
    geminiLiveApi.sendImageMessage(b64Image);
};

liveScreenManager.onNewFrame = (b64Image) => {
    geminiLiveApi.sendImageMessage(b64Image);
};

function startCameraCapture() {
    liveScreenManager.stopCapture();
    liveVideoManager.updateVideoInterval(videoInterval.value);
    // liveVideoManager.startWebcam();
}

function startScreenCapture() {
    liveVideoManager.stopWebcam();
    liveScreenManager.updateVideoInterval(videoInterval.value);
    // liveScreenManager.startCapture();
}

function cameraBtnClick() {
    liveVideoManager.stopWebcam();
    cameraBtn.hidden = true;
    cameraOffBtn.hidden = false;
    console.log("Camera turned off");
}

function cameraOffBtnClick() {
    startCameraCapture();
    cameraBtn.hidden = false;
    cameraOffBtn.hidden = true;
    console.log("Camera turned on");
}

function screenShareBtnClick() {
    startScreenCapture();
    console.log("screenShareBtnClick");
}

function newCameraSelected() {
    console.log("newCameraSelected ", cameraSelect.value);
    liveVideoManager.updateWebcamDevice(cameraSelect.value);
}

function newMicSelected() {
    console.log("newMicSelected", micSelect.value);
    liveAudioInputManager.updateMicrophoneDevice(micSelect.value);
}

function disconnectBtnClick() {
    geminiLiveApi.disconnect();
    stopAudioInput();
    customVoiceBase64 = "";
    functionCallDefinition = null;
    audioFileInput.value = ""; // Reset file input
    fileNameDisplay.textContent = "";
    fcFileNameDisplay.textContent = "";
    setAppStatus("disconnected");
}

function showDialogWithMessage(messageText) {
    const dialog = document.getElementById("dialog");
    const dialogMessage = document.getElementById("dialogMessage");
    dialogMessage.innerHTML = messageText;
    dialog.show();
}

async function getAvailableDevices(deviceType) {
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const devices = [];
    allDevices.forEach((device) => {
        if (device.kind === deviceType) {
            devices.push({
                id: device.deviceId,
                name: device.label || device.deviceId,
            });
        }
    });
    return devices;
}

async function getAvailableCameras() {
    return await this.getAvailableDevices("videoinput");
}

async function getAvailableAudioInputs() {
    return await this.getAvailableDevices("audioinput");
}

function setMaterialSelect(allOptions, selectElement) {
    allOptions.forEach((optionData) => {
        const option = document.createElement("md-select-option");
        option.value = optionData.id;

        const slotDiv = document.createElement("div");
        slotDiv.slot = "headline";
        slotDiv.innerHTML = optionData.name;
        option.appendChild(slotDiv);

        selectElement.appendChild(option);
    });
}

async function setAvailableCamerasOptions() {
    const cameras = await getAvailableCameras();
    const videoSelect = document.getElementById("cameraSource");
    setMaterialSelect(cameras, videoSelect);
}

async function setAvailableMicrophoneOptions() {
    const mics = await getAvailableAudioInputs();
    const audioSelect = document.getElementById("audioSource");
    setMaterialSelect(mics, audioSelect);
}

const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");

function setAppStatus(status) {
    disconnected.hidden = true;
    connecting.hidden = true;
    connected.hidden = true;
    speaking.hidden = true;

    switch (status) {
        case "disconnected":
            disconnected.hidden = false;
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            break;
        case "connecting":
            connecting.hidden = false;
            connectBtn.disabled = true;
            disconnectBtn.disabled = true;
            break;
        case "connected":
            connected.hidden = false;
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            break;
        case "speaking":
            speaking.hidden = false;
            break;
        default:
    }
}

// --- DOM Element References ---
const createVoiceBtn = document.getElementById("createVoiceBtn");
const modal = document.getElementById("brandedVoiceModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const newVoiceNameInput = document.getElementById("newVoiceName");
const recordButton = document.getElementById("recordButton");
const recordStatus = document.getElementById("recordStatus");
const processingSpinner = document.getElementById("processingSpinner");
const voiceDropdown = document.getElementById("voice-dropdown");

// --- Event Listeners ---
createVoiceBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
window.addEventListener("click", (event) => {
    if (event.target === modal) {
        closeModal();
    }
});
recordButton.addEventListener("click", handleRecordClick);

// --- Functions ---
function closeModal() {
    modal.style.display = "none";
}

// --- State for Recording ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordingStartTime;

function toggleAvatarMode() {
    const avatarModeCheckbox = document.getElementById("enableAvatarMode");
    const videoContainer = document.getElementById("video-preview-container");
    if (!avatarModeCheckbox || !videoContainer) return;
    
    if (avatarModeCheckbox.checked) {
        videoContainer.classList.add("avatar-mode");
    } else {
        videoContainer.classList.remove("avatar-mode");
    }
}

async function handleRecordClick() {
    const voiceName = newVoiceNameInput.value.trim();
    if (voiceName === "") {
        alert("Please enter a name for the reference voice.");
        newVoiceNameInput.focus();
        return;
    }

    if (isRecording) {
        // Stop recording
        const duration = (new Date() - recordingStartTime) / 1000;
        if (duration < 10) {
            alert("A recording of at least 10 seconds is required.");
            // Don't stop, let user continue recording
            return;
        }

        mediaRecorder.stop();
        recordButton.disabled = true;
        recordStatus.textContent = "Processing...";
        processingSpinner.style.display = "block";
        recordButton.innerHTML = "Processing...";
        isRecording = false;
    } else {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            // Try to record as WAV, but fall back to browser default if not supported
            const mimeType = MediaRecorder.isTypeSupported("audio/wav")
                ? "audio/wav"
                : "audio/webm";
            mediaRecorder = new MediaRecorder(stream, { mimeType });

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                console.log("Conversion start");
                // Resample the audio to 24kHz
                const targetSampleRate = 24000;
                const audioContext = new (window.AudioContext ||
                    window.webkitAudioContext)();
                const decodedBuffer = await audioContext.decodeAudioData(
                    await audioBlob.arrayBuffer()
                );
                const offlineContext = new OfflineAudioContext(
                    decodedBuffer.numberOfChannels,
                    decodedBuffer.duration * targetSampleRate,
                    targetSampleRate
                );
                const source = offlineContext.createBufferSource();
                source.buffer = decodedBuffer;
                source.connect(offlineContext.destination);
                source.start();
                const resampledBuffer = await offlineContext.startRendering();

                // Convert the resampled buffer to a WAV blob
                const wavBlob = bufferToWave(resampledBuffer);
                console.log("Conversion done");
                // downloadBlob(wavBlob, 'resampled_audio_16k.wav');
                // console.log("Downloading the audio...")

                const reader = new FileReader();
                reader.readAsDataURL(wavBlob);
                reader.onloadend = () => {
                    const base64String = reader.result.split(",")[1];

                    customVoiceBase64 = base64String;

                    const newOption = document.createElement("option");
                    const optionValue = voiceName
                        .toLowerCase()
                        .replace(/\s/g, "-");
                    newOption.value = optionValue;
                    newOption.textContent = voiceName;
                    newOption.selected = true;
                    voiceDropdown.appendChild(newOption);

                    alert(
                        `New branded voice "${voiceName}" has been created and selected!`
                    );
                    closeModal();
                    audioChunks = [];
                };
            };

            mediaRecorder.start();
            recordingStartTime = new Date();
            isRecording = true;
            recordButton.innerHTML =
                '<span class="material-icons">stop</span> Stop Recording';
            recordStatus.textContent = "Recording... (10s minimum)";
        } catch (error) {
            console.error("Error accessing microphone:", error);
            alert("Could not access microphone. Please check permissions.");
        }
    }
}

function bufferToWave(abuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit (hardcoded in this demo)

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // write interleaved data
    for (i = 0; i < abuffer.numberOfChannels; i++) {
        channels.push(abuffer.getChannelData(i));
    }

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            // interleave channels
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true); // write 16-bit sample
            pos += 2;
        }
        offset++; // next source sample
    }

    return new Blob([view], { type: "audio/wav" });

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}

function openModal() {
    modal.style.display = "flex";
    newVoiceNameInput.value = "";
    recordButton.disabled = false;
    recordButton.innerHTML =
        '<span class="material-icons">mic</span> Record reference voice';
    recordStatus.textContent = "";
    processingSpinner.style.display = "none";
    isRecording = false;
    audioChunks = [];
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

