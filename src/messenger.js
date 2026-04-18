window.__unscrambler = window.__unscrambler || {};

(function(ns) {
    "use strict";
    const state = {
        active: false,
        animId: null,
        video: null,
        cols: 0,
        rows: 0,
        rev: null,
        hasAudio: false
    };
    function startVideoLoop(video, cols, rows, rev) {
        const canvas = ns.createOverlay();
        let glRenderer = null;
        try {
            glRenderer = new ns.WebGLUnscrambler(canvas, video, cols, rows, rev);
        } catch (_) {
            glRenderer = null;
        }
        if (glRenderer) {
            (function webGLLoop() {
                if (!state.active) return;
                try {
                    ns.positionOverlay(video);
                    if (video.videoWidth > 0) glRenderer.render();
                } catch (_) {
                    glRenderer = null;
                    ns.start2DLoop(video, canvas, cols, rows, rev, state);
                    return;
                }
                state.animId = requestAnimationFrame(webGLLoop);
            })();
        } else {
            ns.start2DLoop(video, canvas, cols, rows, rev, state);
        }
    }
    function doStart(config) {
        const video = document.querySelector("video");
        if (!video) return false;
        doStop();
        state.video = video;
        state.cols = config.cols;
        state.rows = config.rows;
        state.rev = config.rev;
        state.hasAudio = config.hasAudio;
        state.active = true;
        if (config.hasVideo && config.rev) {
            startVideoLoop(video, config.cols, config.rows, config.rev);
        }
        if (config.hasAudio) {
            ns.startAudioDecryption(video);
        }
        return true;
    }
    function doStop() {
        state.active = false;
        if (state.animId) {
            cancelAnimationFrame(state.animId);
            state.animId = null;
        }
        ns.removeOverlay();
        ns.stopAudioDecryption();
        state.video = null;
    }
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (request.command === "start") {
            const ok = doStart(request.config);
            sendResponse({
                success: ok
            });
            return true;
        }
        if (request.command === "stop") {
            doStop();
            sendResponse({
                success: true
            });
            return true;
        }
        if (request.command === "toggle") {
            if (state.active) {
                doStop();
                sendResponse({
                    success: true,
                    nowActive: false
                });
            } else {
                chrome.storage.local.get([ "savedKey" ], result => {
                    if (!result.savedKey) {
                        sendResponse({
                            success: false,
                            reason: "no key saved"
                        });
                        return;
                    }
                    try {
                        const config = ns.parseKey(result.savedKey);
                        const ok = doStart(config);
                        sendResponse({
                            success: ok,
                            nowActive: ok
                        });
                    } catch (_) {
                        sendResponse({
                            success: false,
                            reason: "bad key"
                        });
                    }
                });
                return true;
            }
            return true;
        }
    });
    ns.parseKey = function(rawKey) {
        let clean = rawKey.replace("KEY:", "").trim();
        if (clean === "|a" || clean === "a") {
            return {
                cols: 0,
                rows: 0,
                rev: null,
                hasVideo: false,
                hasAudio: true
            };
        }
        let hasAudio = false;
        if (clean.endsWith("|a")) {
            hasAudio = true;
            clean = clean.slice(0, -2);
        }
        const parts = clean.split("|");
        if (parts.length < 2) throw new Error("Bad key format");
        const [dim, seedStr] = parts;
        const [cols, rows] = dim.split("x").map(Number);
        if (!cols || !rows || isNaN(cols) || isNaN(rows)) throw new Error("Bad grid");
        const total = cols * rows;
        let h = 5381n;
        for (let i = 0; i < seedStr.length; i++) {
            h = h * 33n + BigInt(seedStr.charCodeAt(i)) & 0xffffffffn;
        }
        const indices = Array.from({
            length: total
        }, (_, i) => i);
        let rng = h;
        for (let i = total - 1; i > 0; i--) {
            rng = rng * 1103515245n + 12345n & 0xffffffffn;
            const r = Number(rng % BigInt(i + 1));
            [indices[i], indices[r]] = [ indices[r], indices[i] ];
        }
        const rev = new Array(total);
        for (let i = 0; i < total; i++) rev[indices[i]] = i;
        return {
            cols: cols,
            rows: rows,
            rev: rev,
            hasVideo: true,
            hasAudio: hasAudio
        };
    };
})(window.__unscrambler);