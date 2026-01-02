/**
 * Shared normalization helpers for BookDirect extension.
 * These ensure consistent formatting across extension components.
 * 
 * @fileoverview Normalization utilities for currency, locale, and URLs
 */

/**
 * Normalize currency to 3-letter ISO code.
 * @param {string} c - Raw currency string
 * @returns {string} Normalized currency code (default: USD)
 */
export function normCurrency(c) {
    const s = (c || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(s) ? s : 'USD';
}

/**
 * Normalize geo-location to lowercase 2-letter code.
 * @param {string} gl - Raw geo-location string
 * @returns {string} Normalized gl code (default: us)
 */
export function normGl(gl) {
    return (gl || 'us').trim().toLowerCase();
}

/**
 * Normalize host language to lowercase.
 * @param {string} hl - Raw host language string
 * @returns {string} Normalized hl string
 */
export function normHl(hl) {
    return (hl || '').trim().toLowerCase();
}

/**
 * Extract hostname without www prefix for domain comparison.
 * @param {string} urlString - URL to extract hostname from
 * @returns {string} Lowercase hostname without www prefix, or empty string on error
 */
export function getHostNoWww(urlString) {
    if (!urlString) return '';
    try {
        return new URL(urlString).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
}

/**
 * Pad number to 2 digits with leading zero.
 * @param {number|string} n - Number to pad
 * @returns {string} Zero-padded string
 */
export function pad2(n) {
    return String(n).padStart(2, '0');
}

/**
 * Format year, month, day as YYYY-MM-DD.
 * @param {string|number} y - Year
 * @param {string|number} m - Month
 * @param {string|number} d - Day
 * @returns {string} Formatted date or empty string if invalid
 */
export function ymd(y, m, d) {
    if (!y || !m || !d) return '';
    return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Check if URL is a valid HTTP/HTTPS URL.
 * @param {string} u - URL to check
 * @returns {boolean}
 */
export function isHttpUrl(u) {
    try {
        const url = new URL(u);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Check if URL is a Google tracking/redirect URL.
 * @param {string} u - URL to check
 * @returns {boolean}
 */
export function isGoogleTrackingUrl(u) {
    try {
        const h = new URL(u).hostname.toLowerCase();
        return h.includes('google.com') ||
            h.includes('googleadservices.com') ||
            h.includes('googlesyndication.com');
    } catch {
        return false;
    }
}

/**
 * Check if URL is a known OTA (Online Travel Agency).
 * @param {string} u - URL to check
 * @returns {boolean}
 */
export function isKnownOtaUrl(u) {
    const OTA_DOMAINS = [
        'booking.com', 'expedia.com', 'hotels.com',
        'agoda.com', 'trip.com', 'priceline.com'
    ];

    try {
        const h = new URL(u).hostname.replace(/^www\./, '');
        return OTA_DOMAINS.some(d => h === d || h.endsWith('.' + d));
    } catch {
        return false;
    }
}

/**
 * Check if URL is a valid direct hotel link (not OTA, not Google).
 * @param {string} u - URL to check
 * @returns {boolean}
 */
export function isValidDirectLink(u) {
    return isHttpUrl(u) && !isGoogleTrackingUrl(u) && !isKnownOtaUrl(u);
}

/**
 * Normalize name for comparison (lowercase, remove punctuation, remove hotel words).
 * @param {string} s - Name to normalize
 * @returns {string} Normalized name
 */
export function normalizeNameForComparison(s) {
    return String(s || '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(hotel|resort|inn|suites?|apartments?)\b/gi, '')
        .trim();
}
