/**
 * Message router for chrome.runtime.onMessage.
 * Routes messages by type to appropriate handlers.
 * 
 * @module background/messageRouter
 */

import {
    MSG_CAPTURE_VISIBLE_TAB,
    MSG_PAGE_CONTEXT,
    MSG_RESEND_PAGE_CONTEXT,
    MSG_PREFETCH_CTX,
    MSG_SET_OFFICIAL_URL,
    MSG_GET_HOTEL_DETAILS,
    MSG_GET_COMPARE_DATA,
    MSG_REFRESH_COMPARE,
    MSG_GET_PAGE_CONTEXT,
    ERR_NO_PAGE_CONTEXT,
    ERR_NO_DATES,
    ERR_INVALID_PARAMS,
    ERR_NETWORK
} from '../shared/contracts.js';

import { getCompareKey } from './compareCache.js';

/**
 * Create a message router handler.
 * 
 * @param {Object} deps - Dependencies
 * @param {Object} deps.log - Logger
 * @param {Object} deps.tabContextStore - Tab context store
 * @param {Map} deps.tabCtxIds - In-memory ctxId map
 * @param {Object} deps.compareCache - Compare cache
 * @param {Object} deps.compareTracker - Compare tracker
 * @param {Object} deps.refreshThrottle - Refresh throttle
 * @param {Object} deps.workerClient - Worker API client
 * @param {Function} deps.storeCtxId - Context ID storage function
 * @param {Function} deps.fetchCompareDeduped - Deduplicated fetch function
 * @returns {Function} Message handler (message, sender, sendResponse) => boolean
 */
export function createMessageRouter({
    log,
    tabContextStore,
    tabCtxIds,
    compareCache,
    compareTracker,
    refreshThrottle,
    workerClient,
    storeCtxId,
    fetchCompareDeduped
}) {
    // Helper to ensure consistent error responses with error_code
    function sendError(sendResponseFn, error_code, error, extra = {}) {
        sendResponseFn({ error, error_code, ...extra });
    }

    return (message, sender, sendResponse) => {
        const tabId = sender.tab?.id;

        // Log all incoming messages for debugging
        log('onMessage', message?.type || message?.action, 'from tab', tabId, message);

        // --- Screenshot capture ---
        if (message.type === MSG_CAPTURE_VISIBLE_TAB) {
            const targetWindowId = sender.tab ? sender.tab.windowId : null;
            chrome.tabs.captureVisibleTab(targetWindowId, { format: 'jpeg', quality: 80 }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    log('Screenshot error:', chrome.runtime.lastError.message);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ success: true, dataUrl: dataUrl });
                }
            });
            return true; // Keep channel open for async
        }

        // --- Store page context from content script ---
        if (message.type === MSG_PAGE_CONTEXT) {
            if (tabId) {
                tabContextStore.set(tabId, message.payload);
                log('Stored page context for tab', tabId);
            }
            sendResponse({ success: true });
            return false;
        }

        // --- Prefetch search context ---
        if (message.type === MSG_PREFETCH_CTX) {
            const payload = message.payload || {};
            log('PREFETCH_CTX payload:', payload);

            workerClient.prefetchCtx(payload)
                .then(async (data) => {
                    if (data.ok && data.ctxId) {
                        // Store ctxId by both tabId (primary) and itinerary key (fallback)
                        await storeCtxId(payload, data.ctxId, tabId, tabCtxIds, log);
                        sendResponse({ ok: true, ctxId: data.ctxId, count: data.count, cache: data.cache });
                    } else {
                        sendResponse({ ok: false, error: data.error || 'Prefetch failed', error_code: data.error_code || ERR_NETWORK });
                    }
                })
                .catch(err => {
                    log('Prefetch error', err);
                    sendResponse({ ok: false, error: err.message, error_code: ERR_NETWORK });
                });

            return true; // Keep channel open for async
        }

        // --- Set officialUrl (from contact lookup result) ---
        if (message.type === MSG_SET_OFFICIAL_URL) {
            if (tabId) {
                const context = tabContextStore.get(tabId);
                if (context) {
                    const oldUrl = context.officialUrl;
                    context.officialUrl = message.officialUrl;
                    tabContextStore.set(tabId, context);
                    log('Set officialUrl for tab', tabId, message.officialUrl);

                    // Check if we should trigger a retry
                    // IMPORTANT: We must use the OLD context (without officialUrl) to find the original tracker entry
                    // The tracker key includes officialUrl, so if we use the new URL we won't find the history
                    if (message.officialUrl && !oldUrl) {
                        const oldParams = { ...context, officialUrl: '' }; // Force empty officialUrl to match original key
                        const oldKey = getCompareKey(tabId, oldParams);

                        if (compareTracker.shouldRetryWithOfficialUrl(oldKey, message.officialUrl, log)) {
                            compareTracker.markRetried(oldKey);

                            // Trigger retry with new officialUrl
                            log('Auto-retrying compare with officialUrl (keeping caches)');
                            const newParams = { ...context, officialUrl: message.officialUrl };

                            fetchCompareDeduped(tabId, newParams, false).then(data => {
                                if (!data.error) {
                                    const newKey = getCompareKey(tabId, newParams);
                                    compareCache.set(newKey, data);
                                }
                            });
                        }
                    }
                }
            }
            sendResponse({ success: true });
            return false;
        }

        // --- Get hotel details ---
        if (message.type === MSG_GET_HOTEL_DETAILS) {
            const query = (message.query || '').trim();
            if (!query) {
                sendError(sendResponse, ERR_INVALID_PARAMS, 'Missing query');
                return false;
            }

            workerClient.fetchHotelDetails(query)
                .then(data => sendResponse(data))
                .catch(err => {
                    sendError(sendResponse, ERR_NETWORK, err.message || 'Fetch failed');
                });

            return true; // Keep channel open for async
        }

        // --- Get compare data ---
        if (message.type === MSG_GET_COMPARE_DATA) {
            const context = tabId ? tabContextStore.get(tabId) : null;

            if (!context) {
                // Request content script to resend page context (it may have been lost on extension reload)
                if (tabId) {
                    log('No page context, requesting resend from tab', tabId);
                    chrome.tabs.sendMessage(tabId, { type: MSG_RESEND_PAGE_CONTEXT }).catch(() => { });
                }
                sendError(sendResponse, ERR_NO_PAGE_CONTEXT, 'No page context available', { needsPageContext: true });
                return false;
            }

            // Merge officialUrl, hotelName, bookingUrl, smart from message if provided
            const params = {
                ...context,
                officialUrl: message.officialUrl || context.officialUrl,
                hotelName: message.hotelName || context.hotelName,
                bookingUrl: message.bookingUrl || context.bookingUrl,
                smart: message.smart !== undefined ? message.smart : context.smart // FIX: Forward smart flag
            };

            // Check if we have required params
            if (!params.checkIn || !params.checkOut) {
                sendError(sendResponse, ERR_NO_DATES, 'Missing dates', { needsDates: true });
                return false;
            }

            // Check cache first (unless forcing refresh)
            if (!message.forceRefresh) {
                const key = getCompareKey(tabId, params);
                const cached = compareCache.get(key);
                if (cached) {
                    log('Returning cached compare data');
                    sendResponse({ ...cached, cache: 'hit' });
                    return false;
                }
            }

            // Fetch with dedupe
            fetchCompareDeduped(tabId, params, message.forceRefresh).then(data => {
                if (!data.error) {
                    const key = getCompareKey(tabId, params);
                    compareCache.set(key, data);
                }
                sendResponse(data);
            }).catch(err => {
                sendError(sendResponse, ERR_NETWORK, err.message || 'Network error');
            });

            return true; // Keep channel open for async
        }

        // --- Refresh compare (force fresh fetch) ---
        if (message.type === MSG_REFRESH_COMPARE) {
            const context = tabId ? tabContextStore.get(tabId) : null;

            if (!context) {
                sendError(sendResponse, ERR_NO_PAGE_CONTEXT, 'No page context available', { needsPageContext: true });
                return false;
            }

            const params = {
                ...context,
                officialUrl: message.officialUrl || context.officialUrl,
                hotelName: message.hotelName || context.hotelName,
                bookingUrl: message.bookingUrl || context.bookingUrl,
                smart: message.smart !== undefined ? message.smart : context.smart // FIX: Forward smart flag
            };

            // Throttle key uses bookingUrl (most unique) or falls back to params
            const throttleKey = params.bookingUrl
                || `${params.gl || ''}|${params.hotelName}|${params.checkIn}|${params.checkOut}|${params.adults || ''}|${params.currency || ''}`;

            const now = Date.now();
            const reason = message.reason;

            // Throttle user-initiated refreshes, but bypass for system refresh
            if (refreshThrottle.shouldThrottle(throttleKey, now, reason)) {
                const key = getCompareKey(tabId, params);
                const cached = compareCache.get(key);
                if (cached) {
                    log('Force refresh throttled, returning cached');
                    sendResponse({
                        ...cached,
                        throttled: true,
                        retryAfterMs: refreshThrottle.getRetryAfterMs(throttleKey, now)
                    });
                    return false;
                }
            }

            // Set cooldown
            refreshThrottle.setCooldown(throttleKey, now, reason);

            // Force refresh bypasses cache (but still dedupes in-flight)
            fetchCompareDeduped(tabId, params, true).then(data => {
                if (!data.error) {
                    const key = getCompareKey(tabId, params);
                    compareCache.set(key, data);
                }
                sendResponse(data);
            }).catch(err => {
                sendError(sendResponse, ERR_NETWORK, err.message || 'Network error');
            });

            return true;
        }

        // --- Get current page context ---
        if (message.type === MSG_GET_PAGE_CONTEXT) {
            const context = tabId ? tabContextStore.get(tabId) : null;
            sendResponse(context || null);
            return false;
        }

        // Unknown message type - don't respond
        return false;
    };
}
