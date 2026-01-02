/**
 * Compare result tracking for retry logic.
 * Records outcomes to drive smart retry when officialUrl arrives late.
 * 
 * @module background/compareTracker
 */

import { RETRY_CONFIDENCE_THRESHOLD } from '../shared/constants.js';

/**
 * Create a compare result tracker for retry logic.
 * 
 * @returns {Object} Tracker with record/check/mark methods
 */
export function createCompareTracker() {
    const tracker = new Map();

    return {
        /**
         * Record the result of a compare call for retry logic.
         * 
         * @param {string} key - Compare cache key
         * @param {Object} result
         * @param {number} result.offersCount
         * @param {boolean} result.hadOfficialUrl
         * @param {boolean} result.matchUncertain
         * @param {number|null} result.confidence
         */
        recordResult(key, { offersCount, hadOfficialUrl, matchUncertain, confidence }) {
            const existing = tracker.get(key) || {};
            tracker.set(key, {
                offersCount: offersCount ?? 0,
                hadOfficialUrl,
                retriedWithOfficialUrl: existing.retriedWithOfficialUrl || false,
                matchUncertain: !!matchUncertain,
                confidence: confidence ?? null
            });
        },

        /**
         * Check if we should retry with officialUrl.
         * Returns true if prior result was uncertain/low confidence/0 offers
         * AND we haven't already retried.
         * 
         * @param {string} key
         * @param {string} officialUrl
         * @param {Function} log - Logger function
         * @returns {boolean}
         */
        shouldRetryWithOfficialUrl(key, officialUrl, log) {
            if (!officialUrl) return false;

            const entry = tracker.get(key);
            if (!entry) return false; // No previous call
            if (entry.hadOfficialUrl) return false; // Already had officialUrl
            if (entry.retriedWithOfficialUrl) return false; // Already retried once

            // RETRY CONDITIONS:
            // 1. Match was explicitly marked uncertain
            if (entry.matchUncertain) {
                log('Will retry with officialUrl (previous match was uncertain)');
                return true;
            }
            // 2. Low confidence (< 0.65)
            if (entry.confidence != null && entry.confidence < RETRY_CONFIDENCE_THRESHOLD) {
                log(`Will retry with officialUrl (low confidence: ${entry.confidence})`);
                return true;
            }
            // 3. Zero offers found
            if (entry.offersCount === 0) {
                log('Will retry with officialUrl (previous had 0 offers)');
                return true;
            }

            return false;
        },

        /**
         * Mark that we retried with officialUrl.
         * @param {string} key
         */
        markRetried(key) {
            const entry = tracker.get(key);
            if (entry) {
                entry.retriedWithOfficialUrl = true;
                tracker.set(key, entry);
            }
        },

        /**
         * Delete all tracker entries for a tab.
         * @param {number} tabId
         */
        deleteByTabId(tabId) {
            const prefix = `${tabId}|`;
            for (const key of tracker.keys()) {
                if (key.startsWith(prefix)) {
                    tracker.delete(key);
                }
            }
        },

        /**
         * Get tracker entry for a key.
         * @param {string} key
         * @returns {Object|undefined}
         */
        get(key) {
            return tracker.get(key);
        }
    };
}
