window.__unscrambler = window.__unscrambler || {};

(function(ns) {
    "use strict";
    let audioCtx = null;
    let audioSource = null;
    ns.startAudioDecryption = function(video) {
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext);
            }
            if (audioCtx.state === "suspended") audioCtx.resume();
            if (!audioSource) {
                audioSource = audioCtx.createMediaElementSource(video);
            }
            const ringMod = audioCtx.createGain();
            ringMod.gain.value = 0;
            const carrier = audioCtx.createOscillator();
            carrier.type = "sine";
            carrier.frequency.value = 8e3;
            carrier.start();
            carrier.connect(ringMod.gain);
            const lpf = audioCtx.createBiquadFilter();
            lpf.type = "lowpass";
            lpf.frequency.value = 7500;
            lpf.Q.value = 1;
            const outGain = audioCtx.createGain();
            outGain.gain.value = 2;
            audioSource.disconnect();
            audioSource.connect(ringMod);
            ringMod.connect(lpf);
            lpf.connect(outGain);
            outGain.connect(audioCtx.destination);
        } catch (e) {
            console.warn("Live Unscrambler [audio]:", e);
        }
    };
    ns.stopAudioDecryption = function() {
        try {
            if (audioSource && audioCtx) {
                audioSource.disconnect();
                audioSource.connect(audioCtx.destination);
            }
        } catch (_) {}
    };
})(window.__unscrambler);