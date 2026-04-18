chrome.commands.onCommand.addListener(async command => {
    if (command !== "toggle-decrypt") return;
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });
    if (!tab || !tab.url || !tab.url.includes("youtube.com")) return;
    chrome.tabs.sendMessage(tab.id, {
        command: "toggle"
    }, _response => {
        if (chrome.runtime.lastError) {}
    });
});