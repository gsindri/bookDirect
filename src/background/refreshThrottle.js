/**
 * Force refresh throttle management.
 * Implements 60s cooldown for user-initiated refreshes.
 * 
 * @module background/refreshThrottle
 */

import { FORCE_REFRESH_COOLDOWN_MS } from '../shared/constants.js';
import { REFRESH_REASON_OFFICIAL_URL_LATE } from '../shared/contracts.js';

/**
 * Create a refresh throttle manager.
 * 
 * @returns {Object} Throttle manager with check/set/getRetry methods
 */
export function createRefreshThrottle() {
    const cooldowns = new Map(); // key -> cooldownUntil timestamp

    return {
        /**
         * Check if refresh should be throttled.
         * Bypasses throttle for system refreshes (officialUrl late arrival).
         * 
         * @param {string} throttleKey
         * @param {number} now - Current timestamp
         * @param {string} [reason] - Refresh reason
         * @returns {boolean} True if should throttle
         */
        shouldThrottle(throttleKey, now, reason) {
            // Bypass throttle for system refresh (officialUrl late arrival)
            if (reason === REFRESH_REASON_OFFICIAL_URL_LATE) {
                return false;
            }

            const cooldownUntil = cooldowns.get(throttleKey) || 0;
            return now < cooldownUntil;
        },

        /**
         * Set cooldown for a key.
         * Only sets cooldown for user-initiated refreshes.
         * 
         * @param {string} throttleKey
         * @param {number} now - Current timestamp
         * @param {string} [reason] - Refresh reason
         */
        setCooldown(throttleKey, now, reason) {
            // Only set cooldown for user-initiated refreshes
            if (reason !== REFRESH_REASON_OFFICIAL_URL_LATE) {
                cooldowns.set(throttleKey, now + FORCE_REFRESH_COOLDOWN_MS);
            }
        },

        /**
         * Get remaining time until retry is allowed.
         * 
         * @param {string} throttleKey
         * @param {number} now - Current timestamp
         * @returns {number} Milliseconds until retry allowed
         */
        getRetryAfterMs(throttleKey, now) {
            const cooldownUntil = cooldowns.get(throttleKey) || 0;
            return Math.max(0, cooldownUntil - now);
        }
    };
}
