/**
 * Per-tab page context storage with session persistence.
 * Stores context sent from content script.
 * 
 * Uses both in-memory Map (fast) and chrome.storage.session (persists across SW restarts).
 * 
 * @module background/tabContextStore
 */

const STORAGE_PREFIX = 'bd:pageCtx:';

/**
 * Create a tab context store with session persistence.
 * 
 * @returns {Object} Store with get/set/delete methods
 */
export function createTabContextStore() {
    // In-memory cache for speed
    const contexts = new Map();

    return {
        /**
         * Store page context for a tab (sync to memory + async to storage).
         * @param {number} tabId
         * @param {Object} payload - Page context payload
         */
        set(tabId, payload) {
            // Enhance payload with timestamp and URL for staleness checks
            const enhanced = {
                ...payload,
                _ts: Date.now(),
                _bookingUrl: payload.bookingUrl || null
            };

            // Memory (immediate)
            contexts.set(tabId, enhanced);

            // Session storage (async, fire-and-forget)
            const key = `${STORAGE_PREFIX}${tabId}`;
            chrome.storage.session.set({ [key]: enhanced }).catch(err => {
                console.warn('bookDirect: Failed to persist context to session:', err);
            });
        },

        /**
         * Get page context for a tab (memory first).
         * @param {number} tabId
         * @returns {Object|undefined}
         */
        get(tabId) {
            return contexts.get(tabId);
        },

        /**
         * Get page context for a tab (async, falls back to storage if memory miss).
         * @param {number} tabId
         * @returns {Promise<Object|undefined>}
         */
        async getAsync(tabId) {
            // Try memory first
            const memoryCtx = contexts.get(tabId);
            if (memoryCtx) {
                return memoryCtx;
            }

            // Fall back to session storage
            const key = `${STORAGE_PREFIX}${tabId}`;
            try {
                const result = await chrome.storage.session.get(key);
                const stored = result[key];
                if (stored) {
                    // Rehydrate to memory cache
                    contexts.set(tabId, stored);
                    return stored;
                }
            } catch (err) {
                console.warn('bookDirect: Failed to read context from session:', err);
            }

            return undefined;
        },

        /**
         * Delete page context for a tab (both memory and storage).
         * @param {number} tabId
         */
        delete(tabId) {
            contexts.delete(tabId);

            const key = `${STORAGE_PREFIX}${tabId}`;
            chrome.storage.session.remove(key).catch(() => { });
        },

        /**
         * Check if context exists for a tab (memory only, fast).
         * @param {number} tabId
         * @returns {boolean}
         */
        has(tabId) {
            return contexts.has(tabId);
        },

        /**
         * Check if stored context is stale (URL mismatch).
         * @param {Object} stored - Stored context
         * @param {string} currentUrl - Current page URL
         * @returns {boolean}
         */
        isStale(stored, currentUrl) {
            if (!stored || !stored._bookingUrl || !currentUrl) {
                return false; // Can't determine staleness, assume fresh
            }

            // Extract hotel slug from URLs for comparison
            // e.g., /hotel/is/odinsve.html → odinsve
            const getSlug = (url) => {
                const match = url.match(/\/hotel\/[a-z]{2}\/([^/?#]+)/i);
                return match ? match[1].replace(/\.html$/, '').toLowerCase() : null;
            };

            const storedSlug = getSlug(stored._bookingUrl);
            const currentSlug = getSlug(currentUrl);

            if (storedSlug && currentSlug && storedSlug !== currentSlug) {
                return true; // Different hotel = stale
            }

            return false;
        }
    };
}
