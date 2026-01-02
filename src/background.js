/**
 * BookDirect Background Service Worker
 * 
 * Thin entrypoint that wires together focused modules.
 * Each module handles a single responsibility.
 * 
 * @module background
 */

// --- Side-effect import: Logger attaches to globalThis ---
import './logger.js';

// --- Module imports ---
import { storeCtxId, loadCtxId } from './background/ctxStore.js';
import { registerCtxOpenerPropagation } from './background/ctxPropagation.js';
import { createCompareCache, getCompareKey } from './background/compareCache.js';
import { createCompareTracker } from './background/compareTracker.js';
import { createRefreshThrottle } from './background/refreshThrottle.js';
import { createTabContextStore } from './background/tabContextStore.js';
import { createWorkerClient } from './background/workerClient.js';
import { createMessageRouter } from './background/messageRouter.js';
import { registerTabCleanup } from './background/cleanup.js';

// --- CONFIGURATION ---
const DEV_DEBUG = false;

// Initialize shared logger (attached by logger.js side-effect import)
if (typeof Logger !== 'undefined') {
    Logger.init(DEV_DEBUG);
    Logger.info('background service worker loaded (ES modules).');
} else {
    console.error('bookDirect: Logger not loaded!');
}

// Logging facade (for passing to modules)
const log = (...args) => {
    if (typeof Logger !== 'undefined') {
        Logger.debug(...args);
    } else {
        console.log('bookDirect:', ...args);
    }
};

const logWarn = (...args) => {
    if (typeof Logger !== 'undefined') {
        Logger.warn(...args);
    } else {
        console.warn('bookDirect:', ...args);
    }
};

const logError = (...args) => {
    if (typeof Logger !== 'undefined') {
        Logger.error(...args);
    } else {
        console.error('bookDirect:', ...args);
    }
};

// --- STATE ---
// In-memory map of tabId -> ctxId (for fast opener propagation)
const tabCtxIds = new Map();

// In-flight requests (for dedupe) - key -> Promise
const inFlightRequests = new Map();

// --- CREATE SERVICES ---
const tabContextStore = createTabContextStore();
const compareCache = createCompareCache();
const compareTracker = createCompareTracker();
const refreshThrottle = createRefreshThrottle();

// Worker client needs loadCtxId bound with logger
const workerClient = createWorkerClient({
    devDebug: DEV_DEBUG,
    loadCtxId: (params, tabId) => loadCtxId(params, tabId, log),
    log
});

// --- IN-FLIGHT DEDUPE ---
// If a request for the same key is in-flight, return the same promise instead of starting another
async function fetchCompareDeduped(tabId, params, forceRefresh = false) {
    const key = getCompareKey(tabId, params);

    // If already in-flight and not forcing refresh, return the existing promise
    if (!forceRefresh && inFlightRequests.has(key)) {
        log('Returning in-flight request for', key);
        return inFlightRequests.get(key);
    }

    // Create new request promise
    const requestPromise = (async () => {
        try {
            const data = await workerClient.fetchCompare(params, forceRefresh, tabId);

            // Track the result for retry logic
            const hadOfficialUrl = !!(params.officialUrl);

            // Store enhanced metrics for smarter retries
            compareTracker.recordResult(key, {
                offersCount: data.offersCount ?? 0,
                hadOfficialUrl,
                matchUncertain: !!data.match?.matchUncertain,
                confidence: data.match?.confidence ?? null
            });

            return data;
        } finally {
            // Clean up in-flight tracker when done
            inFlightRequests.delete(key);
        }
    })();

    inFlightRequests.set(key, requestPromise);
    return requestPromise;
}

// --- CREATE MESSAGE ROUTER ---
const messageHandler = createMessageRouter({
    log,
    tabContextStore,
    tabCtxIds,
    compareCache,
    compareTracker,
    refreshThrottle,
    workerClient,
    storeCtxId: (params, ctxId, tabId, ctxMap, logger) => storeCtxId(params, ctxId, tabId, ctxMap, logger),
    fetchCompareDeduped
});

// --- REGISTER LISTENERS ---
chrome.runtime.onMessage.addListener(messageHandler);

// Register opener tab propagation
registerCtxOpenerPropagation(tabCtxIds, log);

// Register tab cleanup
registerTabCleanup({
    tabContextStore,
    tabCtxIds,
    compareCache,
    compareTracker,
    inFlightRequests
});

log('Background service worker initialized with modular architecture.');
