// Function to match Python's deterministic LCG Shuffle using BigInt to prevent JS precision loss
function parseKey(rawKey) {
    let cleanKey = rawKey.replace("KEY:", "").trim();
    const [ dim, seedStr ] = cleanKey.split("|");
    const [ cols, rows ] = dim.split("x").map(Number);
    const totalBlocks = cols * rows;
    // 1. Python hash_str equivalent
    let h = 5381n;
    for (let i = 0; i < seedStr.length; i++) {
        h = h * 33n + BigInt(seedStr.charCodeAt(i)) & 0xffffffffn;
    }
    // 2. Python seeded_shuffle equivalent
    let indices = new Array(totalBlocks);
    for (let i = 0; i < totalBlocks; i++) indices[i] = i;
    let rng_state = h;
    for (let i = totalBlocks - 1; i > 0; i--) {
        rng_state = rng_state * 1103515245n + 12345n & 0xffffffffn;
        let r = Number(rng_state % BigInt(i + 1));
        // Swap
        let temp = indices[i];
        indices[i] = indices[r];
        indices[r] = temp;
    }
    // 3. Build reverse index map for unscrambling
    let rev = new Array(totalBlocks);
    for (let i = 0; i < totalBlocks; i++) {
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