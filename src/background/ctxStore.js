/**
 * Context ID storage and retrieval.
 * Handles keying and storing/loading ctxId in chrome.storage.session.
 * 
 * @module background/ctxStore
 */

import { CTX_PREFIX } from '../shared/constants.js';
import { normCurrency, normGl, normHl } from '../shared/normalize.js';

/**
 * Build a consistent key for ctx storage based on travel params.
 * Note: doesn't include 'q' since hotel pages don't have search term.
 * 
 * @param {Object} params
 * @param {string} params.checkIn
 * @param {string} params.checkOut
 * @param {number} [params.adults]
 * @param {string} [params.currency]
 * @param {string} [params.gl]
 * @param {string} [params.hl]
 * @returns {string}
 */
export function ctxKey({ checkIn, checkOut, adults, currency, gl, hl }) {
    return `${CTX_PREFIX}${checkIn}:${checkOut}:${adults || 2}:${normCurrency(currency)}:${normGl(gl)}:${normHl(hl)}`;
}

/**
 * Store ctxId in chrome.storage.session.
 * Stores by BOTH tabId (primary) and itinerary key (fallback for new-tab).
 * 
 * @param {Object} params - Travel parameters
 * @param {string} ctxId - Context ID to store
 * @param {number|null} tabId - Tab ID (null if not available)
 * @param {Map} tabCtxIds - In-memory map for fast opener propagation
 * @param {Function} log - Logger function
 */
export async function storeCtxId(params, ctxId, tabId, tabCtxIds, log) {
    const itineraryKey = ctxKey(params);
    const tabKey = tabId ? `${CTX_PREFIX}tab:${tabId}` : null;

    const toStore = { ctxId, ts: Date.now(), checkIn: params.checkIn, checkOut: params.checkOut };

    // Store by itinerary (fallback for new-tab opens)
    await chrome.storage.session.set({ [itineraryKey]: toStore });
    log('Stored ctxId by itinerary', itineraryKey, ctxId);

    // Store by tabId (primary for same-tab navigation)
    if (tabKey) {
        await chrome.storage.session.set({ [tabKey]: toStore });
        // Also store in in-memory map for fast opener propagation
        tabCtxIds.set(tabId, toStore);
        log('Stored ctxId by tabId', tabKey, ctxId);
    }
}

/**
 * Load ctxId from chrome.storage.session.
 * Try tabId first (same-tab navigation), then fall back to itinerary key.
 * 
 * @param {Object} params - Travel parameters
 * @param {number|null} tabId - Tab ID
 * @param {Function} log - Logger function
 * @returns {Promise<string|null>}
 */
export async function loadCtxId(params, tabId, log) {
    // 1) Try tabId first (most reliable for same-tab navigation)
    if (tabId) {
        const tabKey = `${CTX_PREFIX}tab:${tabId}`;
        const tabObj = await chrome.storage.session.get(tabKey);
        if (tabObj?.[tabKey]?.ctxId) {
            // Verify dates match (in case tab navigated to different itinerary)
            const stored = tabObj[tabKey];
            if (stored.checkIn === params.checkIn && stored.checkOut === params.checkOut) {
                log('Loaded ctxId from tabId', tabKey, stored.ctxId);
                return stored.ctxId;
            }
        }
    }

    // 2) Fallback to itinerary key (for new-tab opens)
    const itineraryKey = ctxKey(params);
    const obj = await chrome.storage.session.get(itineraryKey);
    const ctxId = obj?.[itineraryKey]?.ctxId || null;
    if (ctxId) {
        log('Loaded ctxId from itinerary', itineraryKey, ctxId);
    }
    return ctxId;
}
