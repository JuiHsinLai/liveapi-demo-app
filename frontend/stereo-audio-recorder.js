class StereoAudioRecorder {
    constructor() {
        // Create a central audio context. Sample rate should match your server's output.
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        this.nextChunkTime = 0;
        this.clientSourceNode = null; // To hold the client's audio source node

        // Create a merger node to combine two channels.
        this.merger = this.audioContext.createChannelMerger(2);

        // Create a destination node that represents a MediaStream.
        this.destination = this.audioContext.createMediaStreamDestination();

        // Connect the merger to the destination. This creates our stereo stream.
        this.merger.connect(this.destination);

        console.log("StereoAudioProcessor initialized.");
    }

    /**
     * Connects the client's microphone stream to the first channel (left).
     * If the stream is invalid, a silent stream will be used as a placeholder.
     * @param {MediaStream | null} clientStream - The stream from the user's microphone.
     */
    setClientStream(clientStream) {
        // Disconnect the previous client audio source if it exists.
        if (this.clientSourceNode) {
            this.clientSourceNode.disconnect();
            this.clientSourceNode = null;
            console.log("Disconnected previous client audio source.");
        }

        let streamToUse = clientStream;
        if (!streamToUse || streamToUse.getAudioTracks().length === 0) {
            console.warn("No valid client stream provided. Using silence for channel 1.");
            // Create a silent track on the fly using the existing audio context.
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            const silentDestination = this.audioContext.createMediaStreamDestination();
            oscillator.connect(gainNode);
            gainNode.connect(silentDestination);
            oscillator.start();
            streamToUse = silentDestination.stream;
        }
        
        // Create a source node from the stream (either real or silent).
        this.clientSourceNode = this.audioContext.createMediaStreamSource(streamToUse);
        // Connect it to the first input of the merger (Channel 1).
        this.clientSourceNode.connect(this.merger, 0, 0);
        console.log("New client audio source connected to Channel 1.");
    }

    /**
     * Processes a chunk of audio from the server, plays it, and routes it to the second channel (right).
     * @param {Float32Array} pcmData - The raw PCM audio data from the server.
     */
    processServerAudioChunk(pcmData) {
        if (this.audioContext.state === "suspended") {
            this.audioContext.resume();
        }

        // Create an AudioBuffer to hold the server's audio data.
        const serverAudioBuffer = this.audioContext.createBuffer(
            1, // 1 channel (mono)
            pcmData.length,
            this.audioContext.sampleRate
        );

        // Copy the PCM data into the buffer.
        serverAudioBuffer.copyToChannel(pcmData, 0);

        // Create a source node to play the buffer.
        const serverSource = this.audioContext.createBufferSource();
        serverSource.buffer = serverAudioBuffer;

        // --- Audio Routing ---
        // 1. Play the audio so the user can hear it.
        serverSource.connect(this.audioContext.destination);
        // 2. Route the audio to the second input of the merger (Channel 2).
        serverSource.connect(this.merger, 0, 1);
        
        // --- Scheduling Logic ---
        const currentTime = this.audioContext.currentTime;
        let startTime = this.nextChunkTime;

        // If the next scheduled time is in the past, start from now.
        // This handles gaps or delays in the audio stream.
        if (startTime < currentTime) {
            startTime = currentTime;
        }

        serverSource.start(startTime);
        
        // Schedule the next chunk to start right after this one ends.
        this.nextChunkTime = startTime + serverAudioBuffer.duration;
    }

    stop() {
        if (this.audioContext.state !== "closed") {
            this.audioContext.close();
        }
    }
}
