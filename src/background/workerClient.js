/**
 * Worker API client.
 * Builds URLs and fetches Worker endpoints with consistent error handling.
 * 
 * @module background/workerClient
 */

import { WORKER_BASE_URL, TRANSIENT_ERROR_CODES } from '../shared/constants.js';
import { normCurrency, normGl } from '../shared/normalize.js';

/**
 * Create a Worker API client.
 * 
 * @param {Object} options
 * @param {boolean} options.devDebug - Whether to include debug flag
 * @param {Function} options.loadCtxId - Function to load ctxId
 * @param {Function} options.log - Logger function
 * @returns {Object} Client with fetch methods
 */
export function createWorkerClient({ devDebug, loadCtxId, log }) {

    /**
     * Fetch compare data from Worker.
     * 
     * @param {Object} params - Compare parameters
     * @param {boolean} forceRefresh - Force fresh fetch
     * @param {number|null} tabId - Tab ID for ctx lookup
     * @returns {Promise<Object>} Compare response
     */
    async function fetchCompare(params, forceRefresh = false, tabId = null) {
        const url = new URL(`${WORKER_BASE_URL}/compare`);

        // Look up ctxId from session storage BEFORE building URL
        // Pass tabId for same-tab lookup, falls back to itinerary key
        const ctxId = await loadCtxId(params, tabId);
        if (ctxId) {
            log('Using ctxId for /compare:', ctxId);
        } else {
            log('No ctxId found for this itinerary');
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
            bookingUrl: params.bookingUrl, // For smart slug extraction in Worker
            smart: params.smart ? '1' : undefined // Smart multi-pass search mode
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
        if (devDebug) {
            url.searchParams.set('debug', '1');
        }

        // Always request room-level pricing for room-aware savings
        url.searchParams.set('includeRooms', '1');

        log('Fetching /compare', url.toString());

        try {
            const response = await fetch(url.toString());

            if (!response.ok) {
                // Capture raw text first (handles HTML error pages from Cloudflare)
                const text = await response.text().catch(() => '');
                log('Compare API error response:', response.status, text.slice(0, 800));

                let parsed = {};
                try { parsed = JSON.parse(text); } catch { }

                return {
                    error: parsed.error || `API error: ${response.status}`,
                    status: response.status,
                    details: parsed,
                    rawBody: text.slice(0, 500) // Include raw for debugging
                };
            }

            const data = await response.json();
            log('Compare success:', {
                cache: data.cache,
                offers: data.offersCount,
                token: data.match?.cacheDetail?.token || '(no token info)',
                ctxUsed: ctxId ? 'yes' : 'no'
            });
            return data;
        } catch (err) {
            log('Compare fetch failed', err);
            return {
                error: err.message || 'Network error',
                status: 0
            };
        }
    }

    /**
     * Prefetch search context from Worker.
     * 
     * @param {Object} payload - Prefetch parameters
     * @returns {Promise<Object>} Prefetch response
     */
    async function prefetchCtx(payload) {
        const url = new URL(`${WORKER_BASE_URL}/prefetchCtx`);
        url.searchParams.set('q', payload.q || '');
        url.searchParams.set('checkIn', payload.checkIn || '');
        url.searchParams.set('checkOut', payload.checkOut || '');
        url.searchParams.set('adults', String(payload.adults || 2));
        url.searchParams.set('currency', normCurrency(payload.currency));
        url.searchParams.set('gl', normGl(payload.gl));
        url.searchParams.set('hl', payload.hl || 'en-US');

        log('Calling /prefetchCtx', url.toString());

        try {
            const response = await fetch(url.toString());
            const data = await response.json();
            log('Prefetch result:', data);
            return data;
        } catch (err) {
            log('Prefetch error', err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Fetch hotel details from Worker with retry logic.
     * 
     * @param {string} query - Hotel name query
     * @returns {Promise<Object>} Hotel details response
     */
    async function fetchHotelDetails(query) {
        const url = new URL(`${WORKER_BASE_URL}/`);
        url.searchParams.set('query', query);

        const fetchWithRetry = async (targetUrl, retries = 1) => {
            const response = await fetch(targetUrl);
            if (!response.ok) {
                // Check if it's a transient error worth retrying
                if (TRANSIENT_ERROR_CODES.includes(response.status) && retries > 0) {
                    // Jittered backoff: 500-800ms
                    const delay = 500 + Math.random() * 300;
                    log(`Hotel details HTTP ${response.status}, retrying in ${Math.round(delay)}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    return fetchWithRetry(targetUrl, retries - 1);
                }
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        };

        try {
            return await fetchWithRetry(url.toString());
        } catch (err) {
            // Use warn for transient errors, error for real failures
            const isTransient = err.message && /HTTP (502|503|429)/.test(err.message);
            if (isTransient) {
                log('Hotel details fetch failed (transient):', err.message);
            } else {
                log('Hotel details fetch failed:', err);
            }
            return { error: err.message || 'Fetch failed' };
        }
    }

    return {
        fetchCompare,
        prefetchCtx,
        fetchHotelDetails
    };
}
