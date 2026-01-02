// src/searchPrefetch.js
// Lightweight content script for Booking.com search results pages.
// Only handles prefetch context extraction - no UI, no sessionStorage writes.
(() => {
    const log = (...args) => console.log("bookDirect:", ...args);

    function isBookingHost() {
        return /(^|\.)booking\.com$/i.test(location.hostname);
    }

    // Keep this inclusive. Manifest already scopes us, but this is a safety belt.
    function isSearchResultsPage() {
        return isBookingHost() && /^\/searchresults/i.test(location.pathname);
    }

    function pad2(n) {
        return String(n).padStart(2, "0");
    }

    function ymd(y, m, d) {
        if (!y || !m || !d) return "";
        return `${y}-${pad2(m)}-${pad2(d)}`;
    }

    function guessGlFromHotelLinks() {
        const a = document.querySelector('a[href*="/hotel/"]');
        if (!a) return "";
        const href = a.getAttribute("href") || "";
        const m = href.match(/\/hotel\/([a-z]{2})\//i);
        return m ? m[1].toLowerCase() : "";
    }

    function extractPrefetchParamsFromUrl() {
        const u = new URL(location.href);
        const sp = u.searchParams;

        const q =
            (sp.get("ss") || "").trim() ||
            (sp.get("ssne_untouched") || "").trim() ||
            (sp.get("ssne") || "").trim();

        let checkIn = sp.get("checkin") || "";
        let checkOut = sp.get("checkout") || "";

        if (!checkIn) checkIn = ymd(sp.get("checkin_year"), sp.get("checkin_month"), sp.get("checkin_monthday"));
        if (!checkOut) checkOut = ymd(sp.get("checkout_year"), sp.get("checkout_month"), sp.get("checkout_monthday"));

        const adultsRaw = sp.get("group_adults") || sp.get("adults") || "2";
        const adults = Math.max(1, Math.min(10, parseInt(adultsRaw, 10) || 2));

        const currency = (sp.get("selected_currency") || sp.get("currency") || "").trim().toUpperCase();
        const hl = (sp.get("lang") || document.documentElement.lang || navigator.language || "").trim();

        // Prefer extracting gl from actual hotel links so it matches hotel-page expectations
        const gl = (guessGlFromHotelLinks() || sp.get("gl") || "").trim().toLowerCase() || "us";

        if (!q || !checkIn || !checkOut) return null;
        return { q, checkIn, checkOut, adults, currency, gl, hl };
    }

    function sendPrefetchMessage(payload) {
        // Use shared contracts and messaging helpers
        const C = globalThis.BookDirect?.Contracts;
        const M = globalThis.BookDirect?.Messaging;

        if (!C || !M) {
            log("PREFETCH_CTX: BookDirect globals not loaded");
            return;
        }

        if (!M.isAvailable()) {
            log("PREFETCH_CTX: extension context not available");
            return;
        }

        M.sendMessageAsync({ type: C.MSG_PREFETCH_CTX, payload }).then(resp => {
            if (resp?.error) {
                log("PREFETCH_CTX send failed:", resp.error);
                return;
            }
            log("PREFETCH_CTX response:", resp);
            // IMPORTANT:
            // Do NOT store ctxId in sessionStorage.
            // Background already stores ctxId in chrome.storage.session keyed by itinerary+tab.
        });
    }

    if (!isSearchResultsPage()) return;

    let timer = null;
    let lastKey = "";

    function schedulePrefetch(reason) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            const params = extractPrefetchParamsFromUrl();
            log("Search results detected:", { reason, href: location.href, params });

            if (!params) {
                log("Prefetch skipped (missing q/checkIn/checkOut)");
                return;
            }

            const key = JSON.stringify(params);
            if (key === lastKey) return;
            lastKey = key;

            sendPrefetchMessage(params);
        }, 500);
    }

    log("Search results page detected - initiating prefetch flow");
    schedulePrefetch("initial");

    // Handle SPA-ish URL changes
    const _push = history.pushState;
    const _replace = history.replaceState;

    history.pushState = function (...args) {
        _push.apply(this, args);
        schedulePrefetch("pushState");
    };

    history.replaceState = function (...args) {
        _replace.apply(this, args);
        schedulePrefetch("replaceState");
    };

    window.addEventListener("popstate", () => schedulePrefetch("popstate"));

    // Re-run after DOM likely has hotel links (for gl extraction)
    setTimeout(() => schedulePrefetch("delayed-1s"), 1000);
    setTimeout(() => schedulePrefetch("delayed-3s"), 3000);
})();
