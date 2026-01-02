/**
 * Message type contracts for BookDirect extension.
 * These define the shape of all chrome.runtime messages.
 * 
 * @fileoverview Type definitions and message type constants for extension messaging
 */

// --- MESSAGE TYPES ---
// These strings are the "type" field in chrome.runtime.sendMessage calls.
// NEVER change these values without updating ALL senders and handlers.

/** Screenshot capture request (UI -> Background) */
export const MSG_CAPTURE_VISIBLE_TAB = 'ACTION_CAPTURE_VISIBLE_TAB';

/** Page context from hotel page (Content -> Background) */
export const MSG_PAGE_CONTEXT = 'BOOKDIRECT_PAGE_CONTEXT';

/** Request content script to resend page context (Background -> Content) */
export const MSG_RESEND_PAGE_CONTEXT = 'RESEND_PAGE_CONTEXT';

/** Prefetch search context (SearchPrefetch -> Background) */
export const MSG_PREFETCH_CTX = 'PREFETCH_CTX';

/** Set official URL from contact lookup (UI -> Background) */
export const MSG_SET_OFFICIAL_URL = 'SET_OFFICIAL_URL';

/** Get hotel contact details (UI -> Background) */
export const MSG_GET_HOTEL_DETAILS = 'GET_HOTEL_DETAILS';

/** Get compare data (UI -> Background) */
export const MSG_GET_COMPARE_DATA = 'GET_COMPARE_DATA';

/** Force refresh compare data (UI -> Background) */
export const MSG_REFRESH_COMPARE = 'REFRESH_COMPARE';

/** Get current page context (UI -> Background) */
export const MSG_GET_PAGE_CONTEXT = 'GET_PAGE_CONTEXT';

// --- RESPONSE SHAPES (JSDoc Types) ---

/**
 * @typedef {Object} PageContextPayload
 * @property {string} hotelName - Hotel name from page
 * @property {string} checkIn - Check-in date (YYYY-MM-DD)
 * @property {string} checkOut - Check-out date (YYYY-MM-DD)
 * @property {number} adults - Number of adults
 * @property {string} currency - Currency ISO code
 * @property {string} gl - Geo-location code
 * @property {string} hl - Host language
 * @property {string} [bookingUrl] - Current Booking.com URL
 * @property {boolean} [smart] - Smart search mode flag
 */

/**
 * @typedef {Object} PrefetchPayload
 * @property {string} q - Search query
 * @property {string} checkIn - Check-in date
 * @property {string} checkOut - Check-out date
 * @property {number} adults - Number of adults
 * @property {string} currency - Currency code
 * @property {string} gl - Geo-location
 * @property {string} hl - Host language
 */

/**
 * @typedef {Object} PrefetchResponse
 * @property {boolean} ok - Success flag
 * @property {string} [ctxId] - Context ID if successful
 * @property {number} [count] - Number of hotels prefetched
 * @property {string} [cache] - Cache status
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} CompareOffer
 * @property {string} source - Provider name
 * @property {number} total - Total price
 * @property {string} [link] - Booking link
 * @property {boolean} [isOfficial] - Is this the official hotel site
 * @property {string[]} [badges] - Price condition badges (Member, Login, Mobile)
 * @property {Object[]} [rooms] - Room-level pricing
 */

/**
 * @typedef {Object} CompareMatch
 * @property {string} matchedHotelName - Name of matched property
 * @property {number} confidence - Match confidence (0-1)
 * @property {boolean} [matchUncertain] - Flag if match quality is uncertain
 */

/**
 * @typedef {Object} CompareResponse
 * @property {string} [error] - Error message if failed
 * @property {boolean} [needsDates] - True if dates are missing
 * @property {number} offersCount - Number of offers found
 * @property {CompareOffer} [cheapestOverall] - Cheapest offer across all providers
 * @property {CompareOffer} [cheapestOfficial] - Cheapest from official site
 * @property {CompareOffer} [bookingOffer] - Booking.com's offer
 * @property {CompareOffer} [currentOtaOffer] - Current OTA's offer
 * @property {CompareOffer[]} [offers] - All offers with room-level detail
 * @property {CompareMatch} [match] - Match information
 * @property {Object} [property] - Property metadata
 * @property {Object} [query] - Query parameters used
 * @property {string} [cache] - Cache status (hit/miss)
 * @property {string} [fetchedAt] - ISO timestamp
 * @property {boolean} [throttled] - If refresh was throttled
 * @property {number} [retryAfterMs] - Retry delay if throttled
 */

/**
 * @typedef {Object} HotelDetailsResponse
 * @property {string} [website] - Official website URL
 * @property {string} [phone] - Hotel phone number
 * @property {string} [email] - Hotel email address
 * @property {string} [error] - Error message if failed
 */

// --- REFRESH REASON CONSTANTS ---
/** System refresh when officialUrl arrives late */
export const REFRESH_REASON_OFFICIAL_URL_LATE = 'officialUrl_late';

// --- STRUCTURED ERROR CODES ---
/** Error codes returned by Worker and passed through background */
export const ERR_NO_DATES = 'NO_DATES';
export const ERR_NO_PAGE_CONTEXT = 'NO_PAGE_CONTEXT';
export const ERR_NO_PROPERTY_FOUND = 'NO_PROPERTY_FOUND';
export const ERR_SEARCH_FAILED = 'SEARCH_FAILED';
export const ERR_RATE_LIMIT = 'RATE_LIMIT';
export const ERR_INVALID_PARAMS = 'INVALID_PARAMS';
export const ERR_NETWORK = 'NETWORK_ERROR';
