importScripts('logger.js');

// --- CONFIGURATION ---
const WORKER_BASE_URL = 'https://hotelfinder.gsindrih.workers.dev';
const COMPARE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OFFICIAL_URL_WAIT_MS = 3500; // Wait for officialUrl before fallback
const CTX_PREFIX = "bd_ctx_v1:";

// DEV flag: set to true to enable debug mode in /compare calls
const DEV_DEBUG = false;

// Initialize shared logger
if (typeof Logger !== 'undefined') {
    Logger.init(DEV_DEBUG);
    Logger.info('background service worker loaded.');
} else {
    console.error('bookDirect: Logger not loaded!');
}

// --- FORCE REFRESH THROTTLE ---
const forceRefreshCooldowns = new Map(); // key -> cooldownUntil timestamp
const FORCE_REFRESH_COOLDOWN_MS = 60000; // 60s

// --- CTX STORAGE HELPERS ---
// Normalize currency to 3-letter ISO code (default USD)
function normCurrency(c) {
    const s = (c || "").trim().toUpperCase();
    return /^[A-Z]{3}$/.test(s) ? s : "USD";
}

function normGl(gl) {
    return (gl || "us").trim().toLowerCase();
}

function normHl(hl) {
    return (hl || "").trim().toLowerCase();
}

// Build a consistent key for ctx storage based on travel params
// Note: doesn't include 'q' since hotel pages don't have search term
function ctxKey({ checkIn, checkOut, adults, currency, gl, hl }) {
    return `${CTX_PREFIX}${checkIn}:${checkOut}:${adults || 2}:${normCurrency(currency)}:${normGl(gl)}:${normHl(hl)}`;
}

// Store ctxId in chrome.storage.session
// Store by BOTH tabId (primary) and itinerary key (fallback for new-tab)
async function storeCtxId(params, ctxId, tabId) {
    const itineraryKey = ctxKey(params);
    const tabKey = tabId ? `${CTX_PREFIX}tab:${tabId}` : null;

    const toStore = { ctxId, ts: Date.now(), checkIn: params.checkIn, checkOut: params.checkOut };

    // Store by itinerary (fallback for new-tab opens)
    await chrome.storage.session.set({ [itineraryKey]: toStore });
    Logger.debug("Stored ctxId by itinerary", itineraryKey, ctxId);

    // Store by tabId (primary for same-tab navigation)
    if (tabKey) {
        await chrome.storage.session.set({ [tabKey]: toStore });
        // Also store in in-memory map for fast opener propagation
        tabCtxIds.set(tabId, toStore);
        Logger.debug("Stored ctxId by tabId", tabKey, ctxId);
    }
}

// Load ctxId from chrome.storage.session
// Try tabId first (same-tab navigation), then fall back to itinerary key
async function loadCtxId(params, tabId) {
    // 1) Try tabId first (most reliable for same-tab navigation)
    if (tabId) {
        const tabKey = `${CTX_PREFIX}tab:${tabId}`;
        const tabObj = await chrome.storage.session.get(tabKey);
        if (tabObj?.[tabKey]?.ctxId) {
            // Verify dates match (in case tab navigated to different itinerary)
            const stored = tabObj[tabKey];
            if (stored.checkIn === params.checkIn && stored.checkOut === params.checkOut) {
                Logger.debug("Loaded ctxId from tabId", tabKey, stored.ctxId);
                return stored.ctxId;
            }
        }
    }

    // 2) Fallback to itinerary key (for new-tab opens)
    const itineraryKey = ctxKey(params);
    const obj = await chrome.storage.session.get(itineraryKey);
    const ctxId = obj?.[itineraryKey]?.ctxId || null;
    if (ctxId) {
        Logger.debug("Loaded ctxId from itinerary", itineraryKey, ctxId);
    }
    return ctxId;
}

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
// In-memory map of tabId -> ctxId (for fast opener propagation, no async storage needed)
const tabCtxIds = new Map();

// --- OPENER TAB PROPAGATION ---
// When a new tab is opened from a search results tab (openerTabId), copy the ctxId to the new tab
// This prevents context collisions when users open hotels from different searches with identical dates
async function copyCtxIdFromOpener(newTabId, openerTabId) {
    if (!openerTabId || !newTabId) return;

    // First check in-memory map (fastest)
    if (tabCtxIds.has(openerTabId)) {
        const ctxData = tabCtxIds.get(openerTabId);
        tabCtxIds.set(newTabId, ctxData);

        // Also persist to session storage
        const tabKey = `${CTX_PREFIX}tab:${newTabId}`;
        await chrome.storage.session.set({ [tabKey]: ctxData });
        Logger.debug('Propagated ctxId from opener tab', openerTabId, 'to new tab', newTabId, ctxData.ctxId);
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

        Logger.debug('Propagated ctxId from opener tab (session storage)', openerTabId, 'to new tab', newTabId, ctxData.ctxId);
    }
}

// Listen for new tabs and propagate ctxId from opener
chrome.tabs.onCreated.addListener((tab) => {
    if (tab.openerTabId && tab.id) {
        // Async propagation - don't block tab creation
        copyCtxIdFromOpener(tab.id, tab.openerTabId).catch(err => {
            Logger.warn('Failed to propagate ctxId from opener:', err);
        });
    }
});

// --- COMPARE KEY ---
// Helper to extract normalized hostname (no www prefix)
function getHostNoWww(urlString) {
    if (!urlString) return '';
    try {
        return new URL(urlString).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
}

// Include officialUrl domain to prevent cache collisions between "with hint" vs "without hint" requests
function getCompareKey(tabId, params) {
    const officialDomain = getHostNoWww(params.officialUrl);
    return `${tabId}|${params.hotelName}|${params.checkIn}|${params.checkOut}|${params.adults}|${params.currency || ''}|${params.gl || ''}|${params.hl || ''}|${officialDomain}|${params.smart ? '1' : '0'}`;
}

// --- COMPARE API CLIENT ---
async function fetchCompare(params, forceRefresh = false, tabId = null) {
    const url = new URL(`${WORKER_BASE_URL}/compare`);

    // Look up ctxId from session storage BEFORE building URL
    // Pass tabId for same-tab lookup, falls back to itinerary key
    const ctxId = await loadCtxId(params, tabId);
    if (ctxId) {
        Logger.debug("Using ctxId for /compare:", ctxId);
    } else {
        Logger.debug("No ctxId found for this itinerary");
    }

    // Build query params
    const paramMap = {
        hotelName: params.hotelName,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        adults: params.adults,
        currency: normCurrency(params.currency), // Normalize to ensure ctx key matching
        gl: normGl(params.gl),
        hl: params.hl,
        officialUrl: params.officialUrl,
        currentHost: params.currentHost,
        ctx: ctxId, // Use looked-up ctx, not params.ctx
        bookingUrl: params.bookingUrl,  // For smart slug extraction in Worker
        smart: params.smart ? '1' : undefined  // Smart multi-pass search mode
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

    // Always request room-level pricing for room-aware savings
    url.searchParams.set('includeRooms', '1');

    Logger.debug('Fetching /compare', url.toString());

    try {
        const response = await fetch(url.toString());

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            Logger.error('Compare API error response:', response.status, JSON.stringify(errorData));
            return {
                error: errorData.error || `API error: ${response.status}`,
                status: response.status,
                details: errorData
            };
        }

        const data = await response.json();
        Logger.debug('Compare success:', {
            cache: data.cache,
            offers: data.offersCount,
            token: data.match?.cacheDetail?.token || '(no token info)',
            ctxUsed: ctxId ? 'yes' : 'no'
        });
        return data;
    } catch (err) {
        Logger.error('Compare fetch failed', err);
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
        Logger.debug('Returning in-flight request for', key);
        return inFlightRequests.get(key);
    }

    // Create new request promise
    const requestPromise = (async () => {
        try {
            // Pass tabId for same-tab ctx lookup
            const data = await fetchCompare(params, forceRefresh, tabId);

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
    Logger.debug('Will retry with officialUrl (previous had 0 offers)');
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
    Logger.debug('onMessage', message?.type || message?.action, 'from tab', tabId, message);

    // Screenshot capture (existing)
    if (message.type === 'ACTION_CAPTURE_VISIBLE_TAB') {
        const targetWindowId = sender.tab ? sender.tab.windowId : null;
        chrome.tabs.captureVisibleTab(targetWindowId, { format: 'jpeg', quality: 80 }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                Logger.error(chrome.runtime.lastError.message);
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
            Logger.debug('Stored page context for tab', tabId);
        }
        sendResponse({ success: true });
        return false;
    }

    // Prefetch search context (from search results page)
    // NOTE: content.js sends { type: "PREFETCH_CTX", payload: { q, checkIn, ... } }
    if (message.type === 'PREFETCH_CTX') {
        const payload = message.payload || {};
        Logger.debug('PREFETCH_CTX payload:', payload);

        const prefetchUrl = new URL(`${WORKER_BASE_URL}/prefetchCtx`);
        prefetchUrl.searchParams.set('q', payload.q || '');
        prefetchUrl.searchParams.set('checkIn', payload.checkIn || '');
        prefetchUrl.searchParams.set('checkOut', payload.checkOut || '');
        prefetchUrl.searchParams.set('adults', String(payload.adults || 2));
        prefetchUrl.searchParams.set('currency', normCurrency(payload.currency));
        prefetchUrl.searchParams.set('gl', normGl(payload.gl));
        prefetchUrl.searchParams.set('hl', payload.hl || 'en-US');

        Logger.debug('Calling /prefetchCtx', prefetchUrl.toString());

        fetch(prefetchUrl.toString())
            .then(res => res.json())
            .then(async (data) => {
                Logger.debug('Prefetch result:', data);
                if (data.ok && data.ctxId) {
                    // Store ctxId by both tabId (primary) and itinerary key (fallback)
                    await storeCtxId(payload, data.ctxId, tabId);
                    sendResponse({ ok: true, ctxId: data.ctxId, count: data.count, cache: data.cache });
                } else {
                    sendResponse({ ok: false, error: data.error || 'Prefetch failed' });
                }
            })
            .catch(err => {
                Logger.error('Prefetch error', err);
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
                Logger.debug('Set officialUrl for tab', tabId, message.officialUrl);

                // Check if we should trigger a retry
                if (message.officialUrl && !oldUrl) {
                    const params = { ...context };
                    if (shouldRetryWithOfficialUrl(tabId, params, message.officialUrl)) {
                        markRetriedWithOfficialUrl(tabId, params);

                        // Trigger retry with officialUrl (but keep caches/ctx enabled)
                        // NOTE: forceRefresh=false preserves ctx lookup, refresh=1 is for manual user action only
                        Logger.debug('Auto-retrying compare with officialUrl (keeping caches)');
                        fetchCompareDeduped(tabId, params, false).then(data => {
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

    // Get hotel details from worker (CORS-safe from background)
    if (message.type === 'GET_HOTEL_DETAILS') {
        const query = (message.query || '').trim();
        if (!query) {
            sendResponse({ error: 'Missing query' });
            return false;
        }

        const u = new URL(`${WORKER_BASE_URL}/`);
        u.searchParams.set('query', query);

        // Transient error codes that should be retried
        const TRANSIENT_CODES = [502, 503, 429];

        const fetchWithRetry = async (url, retries = 1) => {
            const response = await fetch(url);
            if (!response.ok) {
                // Check if it's a transient error worth retrying
                if (TRANSIENT_CODES.includes(response.status) && retries > 0) {
                    // Jittered backoff: 500-800ms
                    const delay = 500 + Math.random() * 300;
                    Logger.warn(`Hotel details HTTP ${response.status}, retrying in ${Math.round(delay)}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    return fetchWithRetry(url, retries - 1);
                }
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        };

        fetchWithRetry(u.toString())
            .then(data => sendResponse(data))
            .catch(err => {
                // Use console.warn for transient errors, console.error for real failures
                const isTransient = err.message && /HTTP (502|503|429)/.test(err.message);
                if (isTransient) {
                    Logger.warn('Hotel details fetch failed (transient):', err.message);
                } else {
                    Logger.error('Hotel details fetch failed:', err);
                }
                sendResponse({ error: err.message || 'Fetch failed' });
            });

        return true; // Keep channel open for async
    }

    // Get compare data (called from UI)
    if (message.type === 'GET_COMPARE_DATA') {
        const context = tabId ? tabContexts.get(tabId) : null;

        if (!context) {
            // Request content script to resend page context (it may have been lost on extension reload)
            if (tabId) {
                Logger.debug('No page context, requesting resend from tab', tabId);
                chrome.tabs.sendMessage(tabId, { type: 'RESEND_PAGE_CONTEXT' }).catch(() => { });
            }
            sendResponse({ error: 'No page context available' });
            return false;
        }

        // Merge officialUrl, hotelName, bookingUrl from message if provided (prefer message over context)
        const params = {
            ...context,
            officialUrl: message.officialUrl || context.officialUrl,
            hotelName: message.hotelName || context.hotelName,
            bookingUrl: message.bookingUrl || context.bookingUrl
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
                Logger.debug('Returning cached compare data');
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

    // Refresh compare (force fresh fetch - user clicked Refresh or Retry match)
    if (message.type === 'REFRESH_COMPARE') {
        const context = tabId ? tabContexts.get(tabId) : null;

        if (!context) {
            sendResponse({ error: 'No page context available' });
            return false;
        }

        const params = {
            ...context,
            officialUrl: message.officialUrl || context.officialUrl,
            hotelName: message.hotelName || context.hotelName,
            bookingUrl: message.bookingUrl || context.bookingUrl
        };

        // Throttle key uses bookingUrl (most unique) or falls back to params
        const throttleKey = params.bookingUrl
            || `${params.gl || ''}|${params.hotelName}|${params.checkIn}|${params.checkOut}|${params.adults || ''}|${params.currency || ''}`;

        const now = Date.now();
        const cooldownUntil = forceRefreshCooldowns.get(throttleKey) || 0;
        const isSystemRefresh = message.reason === 'officialUrl_late';

        // Throttle user-initiated refreshes, but bypass for system refresh (officialUrl late arrival)
        if (!isSystemRefresh && now < cooldownUntil) {
            const cached = getCachedCompare(tabId, params);
            if (cached) {
                Logger.debug('Force refresh throttled, returning cached');
                sendResponse({ ...cached, throttled: true, retryAfterMs: cooldownUntil - now });
                return false;
            }
        }

        // Set cooldown only for user-initiated refreshes
        if (!isSystemRefresh) {
            forceRefreshCooldowns.set(throttleKey, now + FORCE_REFRESH_COOLDOWN_MS);
        }

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
    tabCtxIds.delete(tabId); // Clean up in-memory ctxId map

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
