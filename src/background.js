console.log('bookDirect background service worker loaded.');

// --- CONFIGURATION ---
const WORKER_BASE_URL = 'https://hotelfinder.gsindrih.workers.dev';
const COMPARE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OFFICIAL_URL_WAIT_MS = 3500; // Wait for officialUrl before fallback

// DEV flag: set to true to enable debug mode in /compare calls
const DEV_DEBUG = false;

// --- STATE ---
// Store page context per tab
const tabContexts = new Map();
// Store compare results with cache TTL
const compareCache = new Map();
// In-flight requests (for dedupe) - key -> Promise
const inFlightRequests = new Map();
// Track compare results per key (for retry logic)
// key -> { offersCount, hadOfficialUrl, retriedWithOfficialUrl }
const compareResultTracker = new Map();

// --- COMPARE KEY ---
function getCompareKey(tabId, params) {
    return `${tabId}|${params.hotelName}|${params.checkIn}|${params.checkOut}|${params.adults}|${params.currency || ''}|${params.gl || ''}`;
}

// --- COMPARE API CLIENT ---
async function fetchCompare(params, forceRefresh = false) {
    const url = new URL(`${WORKER_BASE_URL}/compare`);

    // Build query params
    const paramMap = {
        hotelName: params.hotelName,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        adults: params.adults,
        currency: params.currency,
        gl: params.gl,
        hl: params.hl,
        officialUrl: params.officialUrl,
        currentHost: params.currentHost,
        ctx: params.ctx  // Search context ID (from prefetch)
    };

    Object.entries(paramMap).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    // Add refresh flag if forcing
    if (forceRefresh) {
        url.searchParams.set('refresh', '1');
    }

    // Only add debug flag in DEV mode
    if (DEV_DEBUG) {
        url.searchParams.set('debug', '1');
    }

    console.log('bookDirect: Fetching /compare', url.toString());

    try {
        const response = await fetch(url.toString());

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('bookDirect: Compare API error response:', response.status, errorData);
            return {
                error: errorData.error || `API error: ${response.status}`,
                status: response.status,
                details: errorData
            };
        }

        const data = await response.json();
        console.log('bookDirect: Compare success:', data.cache, data.offersCount, 'offers');
        return data;
    } catch (err) {
        console.error('bookDirect: Compare fetch failed', err);
        return {
            error: err.message || 'Network error',
            status: 0
        };
    }
}

// --- IN-FLIGHT DEDUPE ---
// If a request for the same key is in-flight, return the same promise instead of starting another
async function fetchCompareDeduped(tabId, params, forceRefresh = false) {
    const key = getCompareKey(tabId, params);

    // If already in-flight and not forcing refresh, return the existing promise
    if (!forceRefresh && inFlightRequests.has(key)) {
        console.log('bookDirect: Returning in-flight request for', key);
        return inFlightRequests.get(key);
    }

    // Create new request promise
    const requestPromise = (async () => {
        try {
            const data = await fetchCompare(params, forceRefresh);

            // Track the result for retry logic
            const hadOfficialUrl = !!(params.officialUrl);
            const existing = compareResultTracker.get(key) || {};
            compareResultTracker.set(key, {
                offersCount: data.offersCount ?? 0,
                hadOfficialUrl,
                retriedWithOfficialUrl: existing.retriedWithOfficialUrl || false
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

// --- CACHE HELPERS ---
function getCachedCompare(tabId, params) {
    const key = getCompareKey(tabId, params);
    const cached = compareCache.get(key);

    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > COMPARE_CACHE_TTL_MS) {
        compareCache.delete(key);
        return null;
    }

    return cached.data;
}

function setCachedCompare(tabId, params, data) {
    const key = getCompareKey(tabId, params);
    compareCache.set(key, {
        data,
        timestamp: Date.now()
    });
}

// --- RETRY LOGIC ---
// Check if we should retry with officialUrl
function shouldRetryWithOfficialUrl(tabId, params, officialUrl) {
    if (!officialUrl) return false;

    const key = getCompareKey(tabId, params);
    const tracker = compareResultTracker.get(key);

    if (!tracker) return false; // No previous call
    if (tracker.hadOfficialUrl) return false; // Already had officialUrl
    if (tracker.retriedWithOfficialUrl) return false; // Already retried once
    if (tracker.offersCount > 0) return false; // Had offers, no need to retry

    // Previous call had 0 offers and no officialUrl - should retry
    console.log('bookDirect: Will retry with officialUrl (previous had 0 offers)');
    return true;
}

// Mark that we retried with officialUrl
function markRetriedWithOfficialUrl(tabId, params) {
    const key = getCompareKey(tabId, params);
    const tracker = compareResultTracker.get(key);
    if (tracker) {
        tracker.retriedWithOfficialUrl = true;
        compareResultTracker.set(key, tracker);
    }
}

// --- MESSAGE HANDLERS ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    // Log all incoming messages for debugging
    console.log('bookDirect: onMessage', message?.type || message?.action, 'from tab', tabId, message);

    // Screenshot capture (existing)
    if (message.type === 'ACTION_CAPTURE_VISIBLE_TAB') {
        const targetWindowId = sender.tab ? sender.tab.windowId : null;
        chrome.tabs.captureVisibleTab(targetWindowId, { format: 'jpeg', quality: 80 }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, dataUrl: dataUrl });
            }
        });
        return true;
    }

    // Store page context from content script
    if (message.type === 'BOOKDIRECT_PAGE_CONTEXT') {
        if (tabId) {
            tabContexts.set(tabId, message.payload);
            console.log('bookDirect: Stored page context for tab', tabId);
        }
        sendResponse({ success: true });
        return false;
    }

    // Prefetch search context (from search results page)
    // NOTE: content.js sends { type: "PREFETCH_CTX", payload: { q, checkIn, ... } }
    if (message.type === 'PREFETCH_CTX') {
        const payload = message.payload || {};
        console.log('bookDirect: PREFETCH_CTX payload:', payload);

        const prefetchUrl = new URL(`${WORKER_BASE_URL}/prefetchCtx`);
        prefetchUrl.searchParams.set('q', payload.q || '');
        prefetchUrl.searchParams.set('checkIn', payload.checkIn || '');
        prefetchUrl.searchParams.set('checkOut', payload.checkOut || '');
        prefetchUrl.searchParams.set('adults', String(payload.adults || 2));
        prefetchUrl.searchParams.set('currency', payload.currency || 'USD');
        prefetchUrl.searchParams.set('gl', payload.gl || 'us');
        prefetchUrl.searchParams.set('hl', payload.hl || 'en-US');

        console.log('bookDirect: Calling /prefetchCtx', prefetchUrl.toString());

        fetch(prefetchUrl.toString())
            .then(res => res.json())
            .then(data => {
                console.log('bookDirect: Prefetch result:', data);
                if (data.ok && data.ctxId) {
                    // Store ctxId in session storage (accessible by content scripts)
                    // Also store in tabContexts for this tab
                    if (tabId) {
                        const context = tabContexts.get(tabId) || {};
                        context.ctxId = data.ctxId;
                        context.signatureKey = message.signatureKey;
                        tabContexts.set(tabId, context);
                    }
                    sendResponse({ ok: true, ctxId: data.ctxId, count: data.count, cache: data.cache });
                } else {
                    sendResponse({ ok: false, error: data.error || 'Prefetch failed' });
                }
            })
            .catch(err => {
                console.error('bookDirect: Prefetch error', err);
                sendResponse({ ok: false, error: err.message });
            });

        return true; // Keep channel open for async
    }

    // Set officialUrl (from contact lookup result)
    if (message.type === 'SET_OFFICIAL_URL') {
        if (tabId) {
            const context = tabContexts.get(tabId);
            if (context) {
                const oldUrl = context.officialUrl;
                context.officialUrl = message.officialUrl;
                tabContexts.set(tabId, context);
                console.log('bookDirect: Set officialUrl for tab', tabId, message.officialUrl);

                // Check if we should trigger a retry
                if (message.officialUrl && !oldUrl) {
                    const params = { ...context };
                    if (shouldRetryWithOfficialUrl(tabId, params, message.officialUrl)) {
                        markRetriedWithOfficialUrl(tabId, params);

                        // Trigger retry with officialUrl and refresh=1
                        console.log('bookDirect: Auto-retrying compare with officialUrl');
                        fetchCompareDeduped(tabId, params, true).then(data => {
                            if (!data.error) {
                                setCachedCompare(tabId, params, data);
                            }
                            // Note: We can't easily notify the UI here
                            // The UI will get the updated cache on next request
                        });
                    }
                }
            }
        }
        sendResponse({ success: true });
        return false;
    }

    // Get compare data (called from UI)
    if (message.type === 'GET_COMPARE_DATA') {
        const context = tabId ? tabContexts.get(tabId) : null;

        if (!context) {
            sendResponse({ error: 'No page context available' });
            return false;
        }

        // Merge officialUrl from message if provided
        const params = {
            ...context,
            officialUrl: message.officialUrl || context.officialUrl
        };

        // Check if we have required params
        if (!params.checkIn || !params.checkOut) {
            sendResponse({ error: 'Missing dates', needsDates: true });
            return false;
        }

        // Check cache first (unless forcing refresh)
        if (!message.forceRefresh) {
            const cached = getCachedCompare(tabId, params);
            if (cached) {
                console.log('bookDirect: Returning cached compare data');
                sendResponse({ ...cached, cache: 'hit' });
                return false;
            }
        }

        // Fetch with dedupe
        fetchCompareDeduped(tabId, params, message.forceRefresh).then(data => {
            if (!data.error) {
                setCachedCompare(tabId, params, data);
            }
            sendResponse(data);
        }).catch(err => {
            sendResponse({ error: err.message });
        });

        return true; // Keep channel open for async
    }

    // Refresh compare (force fresh fetch - user clicked Refresh)
    if (message.type === 'REFRESH_COMPARE') {
        const context = tabId ? tabContexts.get(tabId) : null;

        if (!context) {
            sendResponse({ error: 'No page context available' });
            return false;
        }

        const params = {
            ...context,
            officialUrl: message.officialUrl || context.officialUrl
        };

        // Force refresh bypasses cache (but still dedupes in-flight)
        fetchCompareDeduped(tabId, params, true).then(data => {
            if (!data.error) {
                setCachedCompare(tabId, params, data);
            }
            sendResponse(data);
        }).catch(err => {
            sendResponse({ error: err.message });
        });

        return true;
    }

    // Get current page context (for UI to check state)
    if (message.type === 'GET_PAGE_CONTEXT') {
        const context = tabId ? tabContexts.get(tabId) : null;
        sendResponse(context || null);
        return false;
    }
});

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
    tabContexts.delete(tabId);

    // Clean up any cached/tracked data for this tab
    for (const key of compareCache.keys()) {
        if (key.startsWith(`${tabId}|`)) {
            compareCache.delete(key);
        }
    }
    for (const key of compareResultTracker.keys()) {
        if (key.startsWith(`${tabId}|`)) {
            compareResultTracker.delete(key);
        }
    }
    for (const key of inFlightRequests.keys()) {
        if (key.startsWith(`${tabId}|`)) {
            inFlightRequests.delete(key);
        }
    }
});
