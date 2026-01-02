/**
 * Tab cleanup on close.
 * Removes cached data and context for closed tabs.
 * 
 * @module background/cleanup
 */

/**
 * Register the tabs.onRemoved listener for cleanup.
 * 
 * @param {Object} options
 * @param {Object} options.tabContextStore - Tab context store
 * @param {Map} options.tabCtxIds - In-memory ctxId map
 * @param {Object} options.compareCache - Compare cache
 * @param {Object} options.compareTracker - Compare tracker
 * @param {Map} options.inFlightRequests - In-flight request map
 */
export function registerTabCleanup({
    tabContextStore,
    tabCtxIds,
    compareCache,
    compareTracker,
    inFlightRequests
}) {
    chrome.tabs.onRemoved.addListener((tabId) => {
        // Clean up context stores
        tabContextStore.delete(tabId);
        tabCtxIds.delete(tabId);

        // Clean up cached/tracked data for this tab
        compareCache.deleteByTabId(tabId);
        compareTracker.deleteByTabId(tabId);

        // Clean up in-flight requests
        const prefix = `${tabId}|`;
        for (const key of inFlightRequests.keys()) {
            if (key.startsWith(prefix)) {
                inFlightRequests.delete(key);
            }
        }
    });
}
