if (typeof window.unscramblerActive === "undefined") {
    window.unscramblerActive = false;
    window.unscramblerAnimId = null;
    window.unscrambleCanvas = null;
    window.targetVideo = null;
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
            renderFrame(canvas, video, cols, rows, rev);
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
    function renderFrame(canvas, video, cols, rows, revIndices) {
        if (!window.unscramblerActive) return;
        try {
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
        } catch (error) {
            console.error("Unscrambler Loop Error:", error);
        }
        window.unscramblerAnimId = requestAnimationFrame(() => renderFrame(canvas, video, cols, rows, revIndices));
    }
    function stopDecryption() {
        window.unscramblerActive = false;
        if (window.unscramblerAnimId) {
            cancelAnimationFrame(window.unscramblerAnimId);
        }
        if (window.unscrambleCanvas && window.unscrambleCanvas.parentNode) {
            window.unscrambleCanvas.parentNode.removeChild(window.unscrambleCanvas);
            window.unscrambleCanvas = null;
        }
        window.targetVideo = null;
    }
}