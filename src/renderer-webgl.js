window.__unscrambler = window.__unscrambler || {};

(function(ns) {
    "use strict";
    const VS = `\n        attribute vec2 a_position;\n        attribute vec2 a_texCoord;\n        varying   vec2 v_texCoord;\n        void main() {\n            gl_Position = vec4(a_position, 0.0, 1.0);\n            v_texCoord  = a_texCoord;\n        }\n    `;
    const FS = `\n        precision highp float;\n        varying   vec2 v_texCoord;\n        uniform sampler2D u_video;\n        uniform sampler2D u_indexMap;\n        uniform vec2      u_grid;\n\n        void main() {\n            vec2 gridPos    = v_texCoord * u_grid;\n            vec2 tileCoord  = floor(gridPos);\n            vec2 tileOffset = fract(gridPos);\n\n            vec2 mapCoord = (tileCoord + 0.5) / u_grid;\n            vec4 mapColor = texture2D(u_indexMap, mapCoord);\n\n            // Decode 24-bit index stored in RGB channels\n            float r     = floor(mapColor.r * 255.0 + 0.5);\n            float g     = floor(mapColor.g * 255.0 + 0.5);\n            float b     = floor(mapColor.b * 255.0 + 0.5);\n            float index = r + g * 256.0 + b * 65536.0;\n\n            float srcCol = mod(index, u_grid.x);\n            float srcRow = floor(index / u_grid.x);\n\n            vec2 finalUV = (vec2(srcCol, srcRow) + tileOffset) / u_grid;\n            gl_FragColor = texture2D(u_video, finalUV);\n        }\n    `;
    function makeShader(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    }
    function makeProgram(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        return p;
    }
    ns.WebGLUnscrambler = class {
        constructor(canvas, video, cols, rows, revIndices) {
            this.video = video;
            const gl = canvas.getContext("webgl", {
                premultipliedAlpha: false
            }) || canvas.getContext("experimental-webgl", {
                premultipliedAlpha: false
            });
            if (!gl) throw new Error("WebGL unavailable");
            this.gl = gl;
            this.program = makeProgram(gl, makeShader(gl, gl.VERTEX_SHADER, VS), makeShader(gl, gl.FRAGMENT_SHADER, FS));
            gl.useProgram(this.program);
            const posBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ -1, 1, 1, 1, -1, -1, 1, -1 ]), gl.STATIC_DRAW);
            const posLoc = gl.getAttribLocation(this.program, "a_position");
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
            const tcBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, tcBuf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ 0, 0, 1, 0, 0, 1, 1, 1 ]), gl.STATIC_DRAW);
            const tcLoc = gl.getAttribLocation(this.program, "a_texCoord");
            gl.enableVertexAttribArray(tcLoc);
            gl.vertexAttribPointer(tcLoc, 2, gl.FLOAT, false, 0, 0);
            this.videoTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
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
            this.indexTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.indexTex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, indexData);
            gl.uniform2f(gl.getUniformLocation(this.program, "u_grid"), cols, rows);
            gl.uniform1i(gl.getUniformLocation(this.program, "u_video"), 0);
            gl.uniform1i(gl.getUniformLocation(this.program, "u_indexMap"), 1);
        }
        render() {
            const gl = this.gl;
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.indexTex);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    };
})(window.__unscrambler);