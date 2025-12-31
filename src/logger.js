// Shared Logger Utility
// Supports log levels, one-time logs, throttling, and DEBUG gating.
// Works in both Window (content script) and ServiceWorkerGlobalScope (background) contexts.

(function (globalScope) {
    const LOG_PREFIX = '[bookDirect]';

    const LEVELS = {
        NONE: 0,
        ERROR: 1,
        WARN: 2,
        INFO: 3,
        DEBUG: 4,
        TRACE: 5
    };

    // Default configuration (safe for production)
    let currentLevel = LEVELS.WARN;
    let isDebug = false;

    // Cache for log.once and log.throttle
    const onceKeys = new Set();
    const throttleTimers = new Map();

    const logger = {
        LEVELS,

        init(debugMode) {
            isDebug = !!debugMode;
            currentLevel = isDebug ? LEVELS.DEBUG : LEVELS.WARN;
            if (isDebug) {
                console.log(`${LOG_PREFIX} Logger initialized. Debug mode: ON`);
            }
        },

        setLevel(level) {
            currentLevel = level;
        },

        error(...args) {
            if (currentLevel >= LEVELS.ERROR) {
                console.error(LOG_PREFIX, ...args);
            }
        },

        warn(...args) {
            if (currentLevel >= LEVELS.WARN) {
                console.warn(LOG_PREFIX, ...args);
            }
        },

        info(...args) {
            if (currentLevel >= LEVELS.INFO) {
                console.info(LOG_PREFIX, ...args);
            }
        },

        debug(...args) {
            if (currentLevel >= LEVELS.DEBUG) {
                // Use console.debug if available, else console.log (some browsers hide debug by default)
                (console.debug || console.log)(LOG_PREFIX, ...args);
            }
        },

        trace(...args) {
            if (currentLevel >= LEVELS.TRACE) {
                (console.trace || console.debug || console.log)(LOG_PREFIX, ...args);
            }
        },

        // Log only once per unique key
        once(key, level, ...args) {
            if (onceKeys.has(key)) return;
            onceKeys.add(key);

            if (typeof this[level] === 'function') {
                this[level](`[ONCE:${key}]`, ...args);
            }
        },

        // Log at most once every `ms` milliseconds per unique key
        throttle(key, ms, level, ...args) {
            const now = Date.now();
            const last = throttleTimers.get(key) || 0;

            if (now - last > ms) {
                throttleTimers.set(key, now);
                if (typeof this[level] === 'function') {
                    this[level](`[THROTTLED:${key}]`, ...args);
                }
            }
        }
    };

    // Expose globally
    globalScope.Logger = logger;

})(typeof self !== 'undefined' ? self : window);
