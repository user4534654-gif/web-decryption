function parseKey(rawKey) {
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
}

function showStatus(text, color) {
    const el = document.getElementById("statusMsg");
    el.style.color = color || "#ffc107";
    el.innerText = text;
}

document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get([ "savedKey" ], result => {
        if (result.savedKey) document.getElementById("keyInput").value = result.savedKey;
    });
});

document.getElementById("startBtn").addEventListener("click", async () => {
    const rawKey = document.getElementById("keyInput").value.trim();
    if (!rawKey) {
        showStatus("Please enter a key!", "#dc3545");
        return;
    }
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });
    if (!tab?.url?.includes("youtube.com")) {
        showStatus("Only works on YouTube.", "#dc3545");
        return;
    }
    chrome.storage.local.set({
        savedKey: rawKey
    });
    let config;
    try {
        config = parseKey(rawKey);
    } catch {
        showStatus("Invalid key format!", "#dc3545");
        return;
    }
    chrome.tabs.sendMessage(tab.id, {
        command: "start",
        config: config
    }, response => {
        if (chrome.runtime.lastError || !response?.success) {
            showStatus("No video found. Play a video first.", "#ffc107");
        } else {
            const parts = [];
            if (config.hasVideo) parts.push("Video");
            if (config.hasAudio) parts.push("Audio");
            showStatus((parts.join(" + ") || "Decryption") + " running!  (Alt+D to toggle)", "#28a745");
        }
    });
});

document.getElementById("stopBtn").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });
    if (tab) chrome.tabs.sendMessage(tab.id, {
        command: "stop"
    });
    showStatus("Stopped.", "#ffc107");
});