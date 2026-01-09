/**
 * Ensures page context is available before compare requests.
 * Implements a recovery flow: memory → storage → tab resend handshake.
 * 
 * @module background/ensurePageContext
 */

import { MSG_RESEND_PAGE_CONTEXT } from '../shared/contracts.js';

/** Timeout for resend handshake (ms) */
const RESEND_TIMEOUT_MS = 3000;

/**
 * Create the ensurePageContext helper.
 * 
 * @param {Object} deps - Dependencies
 * @param {Object} deps.tabContextStore - Tab context store with getAsync/isStale
 * @param {Function} deps.log - Logger function
 * @returns {Object} { ensurePageContext, handlePageContextResponse }
 */
export function createEnsurePageContext({ tabContextStore, log }) {
    // Pending handshake requests: requestId → { resolve, reject, timer }
    const pendingRequests = new Map();
    let requestIdCounter = 0;

    /**
     * Ensure page context is available for a tab.
     * 
     * Flow:
     * 1. Try memory cache
     * 2. Try chrome.storage.session
     * 3. Request from tab via MSG_RESEND_PAGE_CONTEXT with requestId, await response
     * 4. Validate URL freshness
     * 
     * @param {number} tabId - Tab ID to get context for
     * @param {string} [bookingUrl] - Current booking URL (for staleness check)
     * @returns {Promise<Object|null>} Context object or null if unavailable
     */
    async function ensurePageContext(tabId, bookingUrl) {
        if (!tabId) {
            log('ensurePageContext: No tabId provided');
            return null;
        }

        // 1. Try async get (memory → storage fallback)
        let context = await tabContextStore.getAsync(tabId);

        // 2. Check staleness
        if (context && bookingUrl && tabContextStore.isStale(context, bookingUrl)) {
            log('ensurePageContext: Stored context is stale, requesting resend', {
                storedUrl: context._bookingUrl,
                currentUrl: bookingUrl
            });
            context = null; // Force resend
        }

        // 3. If we have fresh context, return it
        if (context) {
            log('ensurePageContext: Using stored context for tab', tabId);
            return context;
        }

        // 4. Request from tab
        log('ensurePageContext: No context found, requesting resend from tab', tabId);
        try {
            context = await requestContextFromTab(tabId);
            if (context) {
                log('ensurePageContext: Got context from tab resend');
                return context;
            }
        } catch (err) {
            log('ensurePageContext: Resend request failed:', err.message);
        }

        return null;
    }

    /**
     * Request page context from a tab via message and await the response.
     * 
     * @param {number} tabId - Tab ID to request from
     * @returns {Promise<Object|null>}
     */
    function requestContextFromTab(tabId) {
        return new Promise((resolve, reject) => {
            const requestId = `req_${++requestIdCounter}_${Date.now()}`;

            // Set up timeout
            const timer = setTimeout(() => {
                pendingRequests.delete(requestId);
                reject(new Error('Resend timeout'));
            }, RESEND_TIMEOUT_MS);

            // Store pending request
            pendingRequests.set(requestId, { resolve, reject, timer, tabId });

            // Send resend request to tab
            chrome.tabs.sendMessage(tabId, {
                type: MSG_RESEND_PAGE_CONTEXT,
                requestId
            }).catch(err => {
                // Tab might not have content script loaded
                clearTimeout(timer);
                pendingRequests.delete(requestId);
                reject(new Error(`Tab message failed: ${err.message}`));
            });
        });
    }

    /**
     * Handle incoming page context response (called from message router).
     * Resolves pending handshake if requestId matches.
     * 
     * @param {number} tabId - Tab the context came from
     * @param {Object} payload - Page context payload
     * @param {string} [requestId] - Optional requestId from handshake
     * @returns {boolean} True if a pending request was resolved
     */
    function handlePageContextResponse(tabId, payload, requestId) {
        if (!requestId) {
            return false; // Not part of a handshake
        }

        const pending = pendingRequests.get(requestId);
        if (!pending) {
            log('handlePageContextResponse: No pending request for', requestId);
            return false;
        }

        // Verify tabId matches (security check)
        if (pending.tabId !== tabId) {
            log('handlePageContextResponse: TabId mismatch', { expected: pending.tabId, got: tabId });
            return false;
        }

        // Clear timeout and resolve
        clearTimeout(pending.timer);
        pendingRequests.delete(requestId);
        pending.resolve(payload);

        return true;
    }

    return {
        ensurePageContext,
        handlePageContextResponse
    };
}
