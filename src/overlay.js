window.__unscrambler = window.__unscrambler || {};

(function(ns) {
    "use strict";
    let _canvas = null;
    ns.isDetached = false;
    function getMount() {
        return document.fullscreenElement && document.fullscreenElement !== _canvas ? document.fullscreenElement : document.body;
    }
    function getRenderedVideoRect(video) {
        const elW = video.clientWidth;
        const elH = video.clientHeight;
        const vW = video.videoWidth || elW;
        const vH = video.videoHeight || elH;
        const elRatio = elW / elH;
        const vidRatio = vW / vH;
        let rW, rH;
        if (vidRatio > elRatio) {
            rW = elW;
            rH = elW / vidRatio;
        } else {
            rH = elH;
            rW = elH * vidRatio;
        }
        return {
            x: (elW - rW) / 2,
            y: (elH - rH) / 2,
            w: rW,
            h: rH
        };
    }
    ns.createOverlay = function() {
        if (_canvas) ns.removeOverlay();
        ns.isDetached = false;
        _canvas = document.createElement("canvas");
        _canvas.id = "live-unscramble-overlay";
        _canvas.style.pointerEvents = "auto";
        _canvas.style.cursor = "grab";
        _canvas.style.margin = "0";
        _canvas.style.padding = "0";
        _canvas.style.border = "none";
        _canvas.style.background = "transparent";
        let isDragging = false;
        let hasMoved = false;
        let startX, startY, startLeft, startTop;
        const onDragStart = e => {
            if (e.type === "mousedown" && e.button !== 0) return;
            isDragging = true;
            hasMoved = false;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            startX = clientX;
            startY = clientY;
            startLeft = parseFloat(_canvas.style.left) || 0;
            startTop = parseFloat(_canvas.style.top) || 0;
            _canvas.style.cursor = "grabbing";
        };
        const onDragMove = e => {
            if (!isDragging) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const dx = clientX - startX;
            const dy = clientY - startY;
            if (!hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
                ns.isDetached = true;
                hasMoved = true;
            }
            if (hasMoved && document.fullscreenElement !== _canvas) {
                if (e.cancelable) e.preventDefault();
                _canvas.style.left = startLeft + dx + "px";
                _canvas.style.top = startTop + dy + "px";
            }
        };
        const onDragEnd = e => {
            if (isDragging) {
                isDragging = false;
                _canvas.style.cursor = "grab";
                if (!hasMoved) {
                    const video = document.querySelector("video");
                    if (video) {
                        if (video.paused) video.play(); else video.pause();
                    }
                }
            }
        };
        _canvas.addEventListener("mousedown", onDragStart);
        window.addEventListener("mousemove", onDragMove, {
            passive: false
        });
        window.addEventListener("mouseup", onDragEnd);
        _canvas.addEventListener("touchstart", onDragStart, {
            passive: true
        });
        window.addEventListener("touchmove", onDragMove, {
            passive: false
        });
        window.addEventListener("touchend", onDragEnd);
        _canvas.addEventListener("dblclick", () => {
            if (document.fullscreenElement === _canvas) {
                document.exitFullscreen();
            } else {
                _canvas.requestFullscreen().catch(err => console.error("Fullscreen error:", err));
            }
        });
        _canvas._dragListeners = {
            move: onDragMove,
            up: onDragEnd
        };
        getMount().appendChild(_canvas);
        document.addEventListener("fullscreenchange", ns.onFullscreenChange);
        return _canvas;
    };
    ns.getCanvas = function() {
        return _canvas;
    };
    ns.removeOverlay = function() {
        document.removeEventListener("fullscreenchange", ns.onFullscreenChange);
        if (_canvas) {
            if (_canvas._dragListeners) {
                window.removeEventListener("mousemove", _canvas._dragListeners.move);
                window.removeEventListener("mouseup", _canvas._dragListeners.up);
                window.removeEventListener("touchmove", _canvas._dragListeners.move);
                window.removeEventListener("touchend", _canvas._dragListeners.up);
            }
            if (_canvas.parentNode) _canvas.parentNode.removeChild(_canvas);
        }
        _canvas = null;
        ns.isDetached = false;
    };
    ns.onFullscreenChange = function() {
        if (!_canvas) return;
        if (document.fullscreenElement === _canvas) return;
        const mount = getMount();
        if (_canvas.parentNode !== mount) mount.appendChild(_canvas);
    };
    ns.positionOverlay = function(video) {
        if (!_canvas) return;
        if (document.fullscreenElement === _canvas) {
            _canvas.style.width = "100%";
            _canvas.style.height = "100%";
            _canvas.style.left = "0px";
            _canvas.style.top = "0px";
            _canvas.style.objectFit = "contain";
            if (_canvas.width !== video.videoWidth) _canvas.width = video.videoWidth;
            if (_canvas.height !== video.videoHeight) _canvas.height = video.videoHeight;
            return;
        }
        const vRect = video.getBoundingClientRect();
        const rr = getRenderedVideoRect(video);
        const mount = getMount();
        _canvas.style.position = mount === document.body ? "fixed" : "absolute";
        if (!ns.isDetached) {
            _canvas.style.left = vRect.left + rr.x + "px";
            _canvas.style.top = vRect.top + rr.y + "px";
        }
        _canvas.style.width = rr.w + "px";
        _canvas.style.height = rr.h + "px";
        _canvas.style.objectFit = "fill";
        _canvas.style.zIndex = ns.isDetached ? "9999" : "40";
        if (_canvas.width !== video.videoWidth) _canvas.width = video.videoWidth;
        if (_canvas.height !== video.videoHeight) _canvas.height = video.videoHeight;
    };
})(window.__unscrambler);