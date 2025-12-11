console.log('bookDirect background service worker loaded.');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ACTION_CAPTURE_VISIBLE_TAB') {
        const targetWindowId = sender.tab ? sender.tab.windowId : null;
        chrome.tabs.captureVisibleTab(targetWindowId, { format: 'jpeg', quality: 80 }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, dataUrl: dataUrl });
            }
        });
        return true; // Keep message channel open for async response
    }
});
