if (typeof window.unscramblerActive === "undefined") {
    window.unscramblerActive = false;
    window.unscramblerAnimId = null;
    window.unscrambleCanvas = null;
    window.targetVideo = null;
    window.glRenderer = null;
    window.lastRenderTime = 0; // Used for CPU framerate throttling
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.command === "start") {
            const video = document.querySelector("video");
            if (!video) {
                sendResponse({
                    success: false
                });
                return;
            }
            stopDecryption();
            window.targetVideo = video;
            window.unscramblerActive = true;
            window.lastRenderTime = 0;
            const canvas = document.createElement("canvas");
            canvas.id = "live-unscramble-overlay";
            canvas.style.position = "absolute";
            canvas.style.zIndex = "9999";
            canvas.style.pointerEvents = "none";
            video.parentNode.appendChild(canvas);
            window.unscrambleCanvas = canvas;
            const {
                cols,
                rows,
                rev
            } = request.config;
            try {
                window.glRenderer = new WebGLUnscrambler(canvas, video, cols, rows, rev);
                renderFrameWebGL(cols, rows, rev);
            } catch (e) {
                window.glRenderer = null;
                renderFrame2D(cols, rows, rev);
            }
            sendResponse({
                success: true
            });
        } else if (request.command === "stop") {
            stopDecryption();
            sendResponse({
                success: true
            });
        }
    });
    // ====================================================================
    // HIGH-PERFORMANCE WEBGL RENDERER (GPU ACCELERATED)
    // ====================================================================
    class WebGLUnscrambler {
        constructor(canvas, video, cols, rows, revIndices) {
            this.canvas = canvas;
            this.video = video;
            const gl = canvas.getContext("webgl", {
                premultipliedAlpha: false
            }) || canvas.getContext("experimental-webgl", {
                premultipliedAlpha: false
            });
            if (!gl) throw new Error("WebGL not supported");
            this.gl = gl;
            const vsSource = `
                attribute vec2 a_position;
                attribute vec2 a_texCoord;
                varying vec2 v_texCoord;
                void main() {
                    gl_Position = vec4(a_position, 0.0, 1.0);
                    v_texCoord = a_texCoord;
                }
            `;
            const fsSource = `
                precision highp float;
                varying vec2 v_texCoord;
                uniform sampler2D u_video;
                uniform sampler2D u_indexMap;
                uniform vec2 u_grid;
                
                void main() {
                    vec2 gridPos = v_texCoord * u_grid;
                    vec2 tileCoord = floor(gridPos);
                    vec2 tileOffset = fract(gridPos);

                    vec2 mapCoord = (tileCoord + 0.5) / u_grid;
                    vec4 mapColor = texture2D(u_indexMap, mapCoord);

                    float r = floor(mapColor.r * 255.0 + 0.5);
                    float g = floor(mapColor.g * 255.0 + 0.5);
                    float b = floor(mapColor.b * 255.0 + 0.5);
                    float index = r + (g * 256.0) + (b * 65536.0);

                    float srcCol = mod(index, u_grid.x);
                    float srcRow = floor(index / u_grid.x);

                    vec2 finalUV = (vec2(srcCol, srcRow) + tileOffset) / u_grid;
                    gl_FragColor = texture2D(u_video, finalUV);
                }
            `;
            const vertexShader = this.createShader(gl.VERTEX_SHADER, vsSource);
            const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fsSource);
            this.program = this.createProgram(vertexShader, fragmentShader);
            gl.useProgram(this.program);
            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ -1, 1, 1, 1, -1, -1, 1, -1 ]), gl.STATIC_DRAW);
            const positionLocation = gl.getAttribLocation(this.program, "a_position");
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
            const texCoordBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ 0, 0, 1, 0, 0, 1, 1, 1 ]), gl.STATIC_DRAW);
            const texCoordLocation = gl.getAttribLocation(this.program, "a_texCoord");
            gl.enableVertexAttribArray(texCoordLocation);
            gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
            this.videoTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            const indexData = new Uint8Array(cols * rows * 4);
            for (let i = 0; i < revIndices.length; i++) {
                const idx = revIndices[i];
                indexData[i * 4 + 0] = idx % 256;
                indexData[i * 4 + 1] = Math.floor(idx / 256) % 256;
                indexData[i * 4 + 2] = Math.floor(idx / 65536) % 256;
                indexData[i * 4 + 3] = 255;
            }
            this.indexTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.indexTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, indexData);
            gl.uniform2f(gl.getUniformLocation(this.program, "u_grid"), cols, rows);
            gl.uniform1i(gl.getUniformLocation(this.program, "u_video"), 0);
            gl.uniform1i(gl.getUniformLocation(this.program, "u_indexMap"), 1);
        }
        createShader(type, source) {
            const shader = this.gl.createShader(type);
            this.gl.shaderSource(shader, source);
            this.gl.compileShader(shader);
            if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
                throw new Error(this.gl.getShaderInfoLog(shader));
            }
            return shader;
        }
        createProgram(vs, fs) {
            const prog = this.gl.createProgram();
            this.gl.attachShader(prog, vs);
            this.gl.attachShader(prog, fs);
            this.gl.linkProgram(prog);
            return prog;
        }
        render() {
            const gl = this.gl;
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
            // This line throws the CORS Security Error on YouTube
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.indexTexture);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    }
    function renderFrameWebGL(cols, rows, revIndices) {
        if (!window.unscramblerActive || !window.glRenderer) return;
        try {
            const video = window.targetVideo;
            const canvas = window.unscrambleCanvas;
            const computed = window.getComputedStyle(video);
            canvas.style.width = computed.width;
            canvas.style.height = computed.height;
            canvas.style.left = computed.left;
            canvas.style.top = computed.top;
            canvas.style.transform = computed.transform;
            canvas.style.objectFit = computed.objectFit;
            canvas.style.objectPosition = computed.objectPosition;
            canvas.style.margin = computed.margin;
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
            if (video.videoWidth > 0 && video.videoHeight > 0) {
                window.glRenderer.render();
            }
        } catch (error) {
            // FIX: If WebGL throws CORS error, silently failover to 2D CPU renderer immediately
            console.warn("Unscrambler: WebGL blocked by browser CORS security. Automatically swapping to 2D CPU Decoder.");
            window.glRenderer = null;
            window.unscramblerAnimId = requestAnimationFrame(t => renderFrame2D(cols, rows, revIndices, t));
            return; // Kill the WebGL loop permanently
        }
        window.unscramblerAnimId = requestAnimationFrame(() => renderFrameWebGL(cols, rows, revIndices));
    }
    // ====================================================================
    // CPU 2D FALLBACK RENDERER (With Auto-Throttle)
    // ====================================================================
    function getTileCoords(index, cols, rows, w, h) {
        const tw = Math.floor(w / cols);
        const th = Math.floor(h / rows);
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
            x: col * tw,
            y: row * th,
            w: tw,
            h: th
        };
    }
    function renderFrame2D(cols, rows, revIndices, time) {
        if (!window.unscramblerActive) return;
        time = time || performance.now();
        // OPTIMIZATION: If grid is massive, throttle to 30 FPS to stop browser freezing
        const fpsCap = cols * rows >= 1e3 ? 30 : 60;
        const minDelay = 1e3 / fpsCap;
        if (time - window.lastRenderTime >= minDelay) {
            window.lastRenderTime = time;
            try {
                const video = window.targetVideo;
                const canvas = window.unscrambleCanvas;
                const computed = window.getComputedStyle(video);
                canvas.style.width = computed.width;
                canvas.style.height = computed.height;
                canvas.style.left = computed.left;
                canvas.style.top = computed.top;
                canvas.style.transform = computed.transform;
                canvas.style.objectFit = computed.objectFit;
                canvas.style.objectPosition = computed.objectPosition;
                canvas.style.margin = computed.margin;
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    const ctx = canvas.getContext("2d");
                    ctx.imageSmoothingEnabled = false;
                    const w = canvas.width;
                    const h = canvas.height;
                    ctx.fillStyle = "black";
                    ctx.fillRect(0, 0, w, h);
                    for (let i = 0; i < revIndices.length; i++) {
                        const dest = getTileCoords(i, cols, rows, w, h);
                        const src = getTileCoords(revIndices[i], cols, rows, w, h);
                        ctx.drawImage(video, src.x, src.y, src.w, src.h, dest.x, dest.y, dest.w + .5, dest.h + .5);
                    }
                }
            } catch (error) {}
        }
        window.unscramblerAnimId = requestAnimationFrame(t => renderFrame2D(cols, rows, revIndices, t));
    }
    function stopDecryption() {
        window.unscramblerActive = false;
        if (window.unscramblerAnimId) cancelAnimationFrame(window.unscramblerAnimId);
        if (window.unscrambleCanvas && window.unscrambleCanvas.parentNode) {
            window.unscrambleCanvas.parentNode.removeChild(window.unscrambleCanvas);
            window.unscrambleCanvas = null;
        }
        window.targetVideo = null;
        window.glRenderer = null;
    }
}