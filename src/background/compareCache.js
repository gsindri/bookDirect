/**
 * Compare result caching with TTL.
 * 
 * @module background/compareCache
 */

import { COMPARE_CACHE_TTL_MS } from '../shared/constants.js';
import { getHostNoWww } from '../shared/normalize.js';

/**
 * Build a cache key for compare results.
 * Includes officialUrl domain + smart flag to avoid cache collisions.
 * 
 * @param {number} tabId
 * @param {Object} params
 * @returns {string}
 */
export function getCompareKey(tabId, params) {
    const officialDomain = getHostNoWww(params.officialUrl);
    return `${tabId}|${params.hotelName}|${params.checkIn}|${params.checkOut}|${params.adults}|${params.currency || ''}|${params.gl || ''}|${params.hl || ''}|${officialDomain}|${params.smart ? '1' : '0'}`;
}

/**
 * Create a compare cache manager.
 * 
 * @returns {Object} Cache manager with get/set/delete methods
 */
export function createCompareCache() {
    const cache = new Map();

    return {
        /**
         * Get cached compare result if not expired.
         * @param {string} key
         * @returns {Object|null}
         */
        get(key) {
            const cached = cache.get(key);
            if (!cached) return null;

            // Check if expired
            if (Date.now() - cached.timestamp > COMPARE_CACHE_TTL_MS) {
                cache.delete(key);
                return null;
            }

            return cached.data;
        },

        /**
         * Store compare result in cache.
         * @param {string} key
         * @param {Object} data
         */
        set(key, data) {
            cache.set(key, {
                data,
                timestamp: Date.now()
            });
        },

        /**
         * Delete all cache entries for a tab.
         * @param {number} tabId
         */
        deleteByTabId(tabId) {
            const prefix = `${tabId}|`;
            for (const key of cache.keys()) {
                if (key.startsWith(prefix)) {
                    cache.delete(key);
                }
            }
        },

        /**
         * Check if an entry is expired.
         * @param {Object} entry
         * @returns {boolean}
         */
        isExpired(entry) {
            return Date.now() - entry.timestamp > COMPARE_CACHE_TTL_MS;
        }
    };
}
