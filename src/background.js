console.log('bookDirect background service worker loaded.');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ACTION_CAPTURE_VISIBLE_TAB') {
        chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, (dataUrl) => {
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
