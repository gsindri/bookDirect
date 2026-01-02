/**
 * Messaging helper for content scripts.
 * Provides consistent chrome.runtime.sendMessage handling with error management.
 * Must be loaded AFTER contracts.global.js.
 */
(() => {
    globalThis.BookDirect = globalThis.BookDirect || {};

    /**
     * Check if extension runtime is available.
     * @returns {boolean}
     */
    function runtimeAvailable() {
        return typeof chrome !== 'undefined' &&
            chrome.runtime &&
            chrome.runtime.id;
    }

    /**
     * Send a message to background and return a promise.
     * Handles chrome.runtime.lastError automatically.
     * 
     * @param {Object} message - Message with type and optional payload
     * @returns {Promise<Object>} Response or error object
     */
    function sendMessageAsync(message) {
        return new Promise((resolve) => {
            if (!runtimeAvailable()) {
                console.log('bookDirect: Extension context unavailable');
                return resolve({ error: 'Extension context unavailable' });
            }

            try {
                chrome.runtime.sendMessage(message, (resp) => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        console.log('bookDirect: sendMessage error:', err.message);
                        return resolve({ error: err.message });
                    }
                    resolve(resp);
                });
            } catch (e) {
                console.log('bookDirect: sendMessage exception:', e.message);
                resolve({ error: e.message });
            }
        });
    }

    /**
     * Check if runtime is available (for guards).
     * @returns {boolean}
     */
    function isAvailable() {
        return runtimeAvailable();
    }

    globalThis.BookDirect.Messaging = Object.freeze({
        sendMessageAsync,
        isAvailable
    });
})();
