window.__unscrambler = window.__unscrambler || {};

(function(ns) {
    "use strict";
    function tileCoords(index, cols, rows, W, H) {
        const colIdx = index % cols;
        const rowIdx = Math.floor(index / cols);
        const tw = Math.floor(W / cols);
        const th = Math.floor(H / rows);
        const actualW = colIdx === cols - 1 ? W - tw * (cols - 1) : tw;
        const actualH = rowIdx === rows - 1 ? H - th * (rows - 1) : th;
        return {
            x: colIdx * tw,
            y: rowIdx * th,
            w: actualW,
            h: actualH
        };
    }
    ns.render2DFrame = function(video, canvas, cols, rows, rev) {
        ns.positionOverlay(video);
        if (video.videoWidth === 0 || video.videoHeight === 0) return;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < rev.length; i++) {
            const dest = tileCoords(i, cols, rows, W, H);
            const src = tileCoords(rev[i], cols, rows, W, H);
            ctx.drawImage(video, src.x, src.y, src.w, src.h, dest.x, dest.y, dest.w, dest.h);
        }
    };
    ns.start2DLoop = function(video, canvas, cols, rows, rev, stateRef) {
        let lastTime = 0;
        const fpsCap = cols * rows >= 1e3 ? 30 : 60;
        const minDelay = 1e3 / fpsCap;
        function loop(time) {
            if (!stateRef.active) return;
            if (time - lastTime >= minDelay) {
                lastTime = time;
                try {
                    ns.render2DFrame(video, canvas, cols, rows, rev);
                } catch (_) {}
            }
            stateRef.animId = requestAnimationFrame(loop);
        }
        stateRef.animId = requestAnimationFrame(loop);
    };
})(window.__unscrambler);