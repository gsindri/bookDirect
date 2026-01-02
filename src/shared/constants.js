/**
 * Shared constants for BookDirect extension.
 * These values are used across background, content scripts, and UI.
 * NEVER change these values without updating all consumers.
 * 
 * @fileoverview Centralized configuration constants to prevent drift
 */

// --- WORKER CONFIGURATION ---
export const WORKER_BASE_URL = 'https://hotelfinder.gsindrih.workers.dev';

// --- TIMING CONSTANTS ---
/** Wait time for officialUrl before falling back (shared by UI + background) */
export const OFFICIAL_URL_WAIT_MS = 3500;

/** Compare cache TTL (background only, but defined here for visibility) */
export const COMPARE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** User-initiated force refresh cooldown */
export const FORCE_REFRESH_COOLDOWN_MS = 60000; // 60 seconds

/** UI debounce for room/price rerender */
export const COMPARE_RERENDER_DEBOUNCE_MS = 180;

/** UI debounce wait before first compare call */
export const COMPARE_INITIAL_WAIT_MS = 3500;

// --- STORAGE KEY PREFIXES ---
/** Session storage key prefix for context IDs */
export const CTX_PREFIX = 'bd_ctx_v1:';

// --- RETRY CONFIGURATION ---
/** Confidence threshold below which we consider match "low confidence" */
export const LOW_CONFIDENCE_THRESHOLD = 0.4;

/** Confidence threshold for background auto-retry with officialUrl */
export const RETRY_CONFIDENCE_THRESHOLD = 0.65;

/** Transient HTTP error codes that warrant retry */
export const TRANSIENT_ERROR_CODES = [502, 503, 429];

// --- UI CONSTANTS ---
/** Toast display duration */
export const TOAST_DISPLAY_MS = 8000;

/** Error tooltip display duration */
export const ERROR_TOOLTIP_DISPLAY_MS = 4000;

/** Highlight bubble display duration */
export const HIGHLIGHT_BUBBLE_DISPLAY_MS = 4000;
