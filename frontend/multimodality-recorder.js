class Compositor {
    constructor(width = 1280, height = 720) {
        this.width = width;
        this.height = height;

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d');

        this.sourceElement = null; // This can be a <video> or <canvas> element
        this.animationFrameId = null;

        // The output stream that the MediaRecorder will consume
        this.stream = this.canvas.captureStream();

        console.log("Compositor initialized.");
    }

    /**
     * The main drawing loop.
     */
    draw() {
        if (this.sourceElement && !this.sourceElement.paused && !this.sourceElement.ended) {
            // Respect the source's aspect ratio, letterboxing if necessary
            const videoWidth = this.sourceElement.videoWidth || this.sourceElement.width;
            const videoHeight = this.sourceElement.videoHeight || this.sourceElement.height;
            const canvasAspect = this.width / this.height;
            const videoAspect = videoWidth / videoHeight;

            let drawWidth, drawHeight, x, y;

            if (canvasAspect > videoAspect) {
                // Canvas is wider than video
                drawHeight = this.height;
                drawWidth = drawHeight * videoAspect;
                x = (this.width - drawWidth) / 2;
                y = 0;
            } else {
                // Canvas is taller than or same aspect as video
                drawWidth = this.width;
                drawHeight = drawWidth / videoAspect;
                x = 0;
                y = (this.height - drawHeight) / 2;
            }

            // Clear canvas with black for letterboxing
            this.ctx.fillStyle = 'black';
            this.ctx.fillRect(0, 0, this.width, this.height);
            
            this.ctx.drawImage(this.sourceElement, x, y, drawWidth, drawHeight);

        } else {
            // If no source, draw black
            this.ctx.fillStyle = 'black';
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        this.animationFrameId = requestAnimationFrame(() => this.draw());
    }

    /**
     * Sets the video source to be drawn on the canvas.
     * @param {HTMLVideoElement | HTMLCanvasElement | null} element 
     */
    setSource(element) {
        this.sourceElement = element;
        console.log("Compositor source set:", element);
    }

    /**
     * Starts the drawing loop.
     */
    start() {
        if (!this.animationFrameId) {
            this.draw();
            console.log("Compositor drawing loop started.");
        }
    }

    /**
     * Stops the drawing loop.
     */
    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            console.log("Compositor drawing loop stopped.");
        }
        // Also stop the tracks of the output stream
        this.stream.getTracks().forEach(track => track.stop());
    }

    /**
     * Returns the canvas's output stream.
     * @returns {MediaStream}
     */
    getStream() {
        return this.stream;
    }
}


class MultimodalityRecorder {
    constructor() {
        // 1. Create the audio processor for stereo audio.
        this.audioProcessor = new StereoAudioRecorder();
        const audioTrack = this.audioProcessor.destination.stream.getAudioTracks()[0];

        // 2. Create the video compositor for stable video.
        this.compositor = new Compositor();
        const videoTrack = this.compositor.getStream().getVideoTracks()[0];

        // 3. Create the combined stream for the MediaRecorder.
        // This stream's tracks will never be added or removed.
        this.combinedStream = new MediaStream([audioTrack, videoTrack]);

        // 4. Instantiate the MediaRecorder.
        this.mediaRecorder = new MediaRecorder(this.combinedStream, {
            mimeType: 'video/webm; codecs="vp8, opus"'
        });

        // 5. Set up data handling and cleanup.
        this.recordedChunks = [];
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            console.log(`Recording stopped. Number of chunks: ${this.recordedChunks.length}`);
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            console.log(`Total blob size: ${blob.size} bytes.`);

            if (blob.size === 0) {
                console.warn("Blob size is 0. No data was recorded. Download will not be triggered.");
                this.recordedChunks = [];
                return;
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            document.body.appendChild(a);
            a.style = 'display: none';
            a.href = url;
            a.download = 'live_recording.webm';
            a.click();
            window.URL.revokeObjectURL(url);
            this.recordedChunks = [];
        };

        console.log("MultimodalityRecorder initialized with Compositor.");
    }

    // --- Public API Methods ---

    /**
     * Starts the recording process and the video compositor's drawing loop.
     */
    start() {
        if (this.mediaRecorder && this.mediaRecorder.state !== "recording") {
            this.compositor.start();
            this.mediaRecorder.start();
            console.log("Multimodality recording and compositor started.");
        }
    }

    /**
     * Stops the recording, the compositor, and the audio processor.
     * @returns {Promise<void>} A promise that resolves when the onstop handler has completed.
     */
    stop() {
        return new Promise((resolve) => {
            // Re-define the onstop handler to also stop the compositor and resolve the promise.
            this.mediaRecorder.onstop = () => {
                console.log(`Recording stopped. Number of chunks: ${this.recordedChunks.length}`);
                
                if (this.compositor) {
                    this.compositor.stop();
                }

                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                console.log(`Total blob size: ${blob.size} bytes.`);
    
                if (blob.size === 0) {
                    console.warn("Blob size is 0. No data was recorded. Download will not be triggered.");
                    this.recordedChunks = [];
                    if (this.audioProcessor) {
                        this.audioProcessor.stop();
                    }
                    resolve();
                    return;
                }
    
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                document.body.appendChild(a);
                a.style = 'display: none';
                a.href = url;
                a.download = 'live_recording.webm';
                a.click();
                window.URL.revokeObjectURL(url);
                this.recordedChunks = [];

                if (this.audioProcessor) {
                    this.audioProcessor.stop();
                }
                resolve();
            };

            if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
                this.mediaRecorder.stop();
            } else {
                if (this.compositor) this.compositor.stop();
                if (this.audioProcessor) this.audioProcessor.stop();
                resolve();
            }
            console.log("Multimodality recording stop initiated.");
        });
    }

    /**
     * Sets the video source for the compositor to draw.
     * @param {HTMLVideoElement | HTMLCanvasElement | null} element 
     */
    setVideoSource(element) {
        if (this.compositor) {
            this.compositor.setSource(element);
        }
    }

    /**
     * Forwards the client's microphone stream to the audio processor.
     * @param {MediaStream} clientStream 
     */
    processClientAudio(clientStream) {
        if (this.audioProcessor) {
            this.audioProcessor.setClientStream(clientStream);
        }
    }

    /**
     * Forwards server audio data to the audio processor.
     * @param {Float32Array} pcmData 
     */
    processServerAudio(pcmData) {
        if (this.audioProcessor) {
            this.audioProcessor.processServerAudioChunk(pcmData);
        }
    }
}
