/**
 * Context ID opener propagation.
 * Copies ctxId from opener tab to new tab when opened.
 * 
 * @module background/ctxPropagation
 */

import { CTX_PREFIX } from '../shared/constants.js';

/**
 * Copy ctxId from opener tab to new tab when a tab is opened from search results.
 * This prevents context collisions when users open hotels from different searches with identical dates.
 * 
 * @param {number} newTabId - New tab ID
 * @param {number} openerTabId - Opener tab ID
 * @param {Map} tabCtxIds - In-memory map for fast lookup
 * @param {Function} log - Logger function
 */
export async function copyCtxIdFromOpener(newTabId, openerTabId, tabCtxIds, log) {
    if (!openerTabId || !newTabId) return;

    // First check in-memory map (fastest)
    if (tabCtxIds.has(openerTabId)) {
        const ctxData = tabCtxIds.get(openerTabId);
        tabCtxIds.set(newTabId, ctxData);

        // Also persist to session storage
        const tabKey = `${CTX_PREFIX}tab:${newTabId}`;
        await chrome.storage.session.set({ [tabKey]: ctxData });
        log('Propagated ctxId from opener tab', openerTabId, 'to new tab', newTabId, ctxData.ctxId);
        return;
    }

    // Fallback: check session storage for opener tab
    const openerKey = `${CTX_PREFIX}tab:${openerTabId}`;
    const openerObj = await chrome.storage.session.get(openerKey);
    if (openerObj?.[openerKey]?.ctxId) {
        const ctxData = openerObj[openerKey];

        // Store for new tab
        const newTabKey = `${CTX_PREFIX}tab:${newTabId}`;
        await chrome.storage.session.set({ [newTabKey]: ctxData });
        tabCtxIds.set(newTabId, ctxData);

        log('Propagated ctxId from opener tab (session storage)', openerTabId, 'to new tab', newTabId, ctxData.ctxId);
    }
}

/**
 * Register the tabs.onCreated listener for ctxId propagation.
 * 
 * @param {Map} tabCtxIds - In-memory map for fast lookup
 * @param {Function} log - Logger function
 */
export function registerCtxOpenerPropagation(tabCtxIds, log) {
    chrome.tabs.onCreated.addListener((tab) => {
        if (tab.openerTabId && tab.id) {
            // Async propagation - don't block tab creation
            copyCtxIdFromOpener(tab.id, tab.openerTabId, tabCtxIds, log).catch(err => {
                log('Failed to propagate ctxId from opener:', err);
            });
        }
    });
}
