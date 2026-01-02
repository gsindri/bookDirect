/**
 * Shared contracts for content scripts (globals-based).
 * Must be loaded BEFORE any script that uses these constants.
 * 
 * This file attaches a frozen object to globalThis.BookDirect.Contracts
 * to provide a single source of truth for message types and constants.
 */
(() => {
    const Contracts = {
        // --- MESSAGE TYPES ---
        // These must match the handlers in background/messageRouter.js
        MSG_PREFETCH_CTX: 'PREFETCH_CTX',
        MSG_BOOKDIRECT_PAGE_CONTEXT: 'BOOKDIRECT_PAGE_CONTEXT',
        MSG_RESEND_PAGE_CONTEXT: 'RESEND_PAGE_CONTEXT',
        MSG_GET_HOTEL_DETAILS: 'GET_HOTEL_DETAILS',
        MSG_SET_OFFICIAL_URL: 'SET_OFFICIAL_URL',
        MSG_GET_COMPARE_DATA: 'GET_COMPARE_DATA',
        MSG_REFRESH_COMPARE: 'REFRESH_COMPARE',
        MSG_GET_PAGE_CONTEXT: 'GET_PAGE_CONTEXT',
        MSG_ACTION_CAPTURE_VISIBLE_TAB: 'ACTION_CAPTURE_VISIBLE_TAB',

        // --- TIMING CONSTANTS ---
        OFFICIAL_URL_WAIT_MS: 3500,
        COMPARE_RERENDER_DEBOUNCE_MS: 180,

        // --- REFRESH REASONS ---
        REFRESH_REASON_OFFICIAL_URL_LATE: 'officialUrl_late',

        // --- STRUCTURED ERROR CODES ---
        ERR_NO_DATES: 'NO_DATES',
        ERR_NO_PAGE_CONTEXT: 'NO_PAGE_CONTEXT',
        ERR_NO_PROPERTY_FOUND: 'NO_PROPERTY_FOUND',
        ERR_SEARCH_FAILED: 'SEARCH_FAILED',
        ERR_RATE_LIMIT: 'RATE_LIMIT',
        ERR_INVALID_PARAMS: 'INVALID_PARAMS',
        ERR_NETWORK: 'NETWORK_ERROR',
    };

    // Namespace to avoid global pollution
    globalThis.BookDirect = globalThis.BookDirect || {};
    globalThis.BookDirect.Contracts = Object.freeze(Contracts);
})();
