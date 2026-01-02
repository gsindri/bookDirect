/**
 * Per-tab page context storage.
 * Stores context sent from content script.
 * 
 * @module background/tabContextStore
 */

/**
 * Create a tab context store.
 * 
 * @returns {Object} Store with get/set/delete methods
 */
export function createTabContextStore() {
    const contexts = new Map();

    return {
        /**
         * Store page context for a tab.
         * @param {number} tabId
         * @param {Object} payload - Page context payload
         */
        set(tabId, payload) {
            contexts.set(tabId, payload);
        },

        /**
         * Get page context for a tab.
         * @param {number} tabId
         * @returns {Object|undefined}
         */
        get(tabId) {
            return contexts.get(tabId);
        },

        /**
         * Delete page context for a tab.
         * @param {number} tabId
         */
        delete(tabId) {
            contexts.delete(tabId);
        },

        /**
         * Check if context exists for a tab.
         * @param {number} tabId
         * @returns {boolean}
         */
        has(tabId) {
            return contexts.has(tabId);
        }
    };
}
