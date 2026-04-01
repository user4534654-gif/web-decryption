const CHARSET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function fromBase62(str) {
    let num = 0;
    for (let i = 0; i < str.length; i++) {
        num = num * 62 + CHARSET.indexOf(str[i]);
    }
    return num;
}

function parseKey(rawKey) {
    let cleanKey = rawKey.replace("KEY:", "").trim();
    const [ dim, data ] = cleanKey.split("|");
    const [ cols, rows ] = dim.split("x").map(Number);
    let indices = [];
    for (let i = 0; i < data.length; i += 2) {
        indices.push(fromBase62(data.substr(i, 2)));
    }
    let rev = new Array(indices.length);
    for (let i = 0; i < indices.length; i++) {
        rev[indices[i]] = i;
    }
    return {
        cols: cols,
        rows: rows,
        rev: rev
    };
}

document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get([ "savedKey" ], result => {
        if (result.savedKey) {
            document.getElementById("keyInput").value = result.savedKey;
        }
    });
});

document.getElementById("startBtn").addEventListener("click", async () => {
    const key = document.getElementById("keyInput").value;
    if (!key) return showStatus("Please enter a key!", "#dc3545");
    chrome.storage.local.set({
        savedKey: key
    });
    try {
        const config = parseKey(key);
        let [ tab ] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });
        await chrome.scripting.executeScript({
            target: {
                tabId: tab.id
            },
            files: [ "content.js" ]
        });
        chrome.tabs.sendMessage(tab.id, {
            command: "start",
            config: config
        }, response => {
            if (chrome.runtime.lastError || !response || !response.success) {
                showStatus("No video found. Start playing a video first!", "#ffc107");
            } else {
                showStatus("Decryption running!", "#28a745");
            }
        });
    } catch (e) {
        showStatus("Invalid Key Format!", "#dc3545");
    }
});

document.getElementById("stopBtn").addEventListener("click", async () => {
    let [ tab ] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });
    chrome.tabs.sendMessage(tab.id, {
        command: "stop"
    });
    showStatus("Decryption stopped.", "#ffc107");
});

function showStatus(text, color = "#ffc107") {
    const msg = document.getElementById("statusMsg");
    msg.style.color = color;
    msg.innerText = text;
}