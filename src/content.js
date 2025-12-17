// =============================================
// IMMEDIATE PAGE ROUTER - Must run before anything else
// =============================================
(function immediatePageRouter() {
    const log = (...args) => console.log("bookDirect:", ...args);

    function isBookingHost() {
        return /(^|\.)booking\.com$/i.test(location.hostname);
    }

    function isSearchResultsPage() {
        // Handles: /searchresults.html, /searchresults.en-gb.html, etc.
        return isBookingHost() && /^\/searchresults(\..+)?\.html$/i.test(location.pathname);
    }

    function pad2(n) {
        return String(n).padStart(2, "0");
    }

    function ymd(y, m, d) {
        if (!y || !m || !d) return "";
        return `${y}-${pad2(m)}-${pad2(d)}`;
    }

    function guessGlFromHotelLinks() {
        // On results pages, hotel cards usually contain links like /hotel/dk/....
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

        // Booking uses either full ISO or split params
        let checkIn = sp.get("checkin") || "";
        let checkOut = sp.get("checkout") || "";

        if (!checkIn) checkIn = ymd(sp.get("checkin_year"), sp.get("checkin_month"), sp.get("checkin_monthday"));
        if (!checkOut) checkOut = ymd(sp.get("checkout_year"), sp.get("checkout_month"), sp.get("checkout_monthday"));

        const adultsRaw = sp.get("group_adults") || sp.get("adults") || "2";
        const adults = Math.max(1, Math.min(10, parseInt(adultsRaw, 10) || 2));

        const currency = (sp.get("selected_currency") || sp.get("currency") || "").trim().toUpperCase();

        // Booking commonly uses ?lang=en-us
        const hl = (sp.get("lang") || document.documentElement.lang || navigator.language || "").trim();

        // Prefer extracting from actual hotel links so it matches hotel page logic
        const gl = (guessGlFromHotelLinks() || sp.get("gl") || "").trim().toLowerCase() || "us";

        if (!q || !checkIn || !checkOut) return null;

        return { q, checkIn, checkOut, adults, currency, gl, hl };
    }

    function sendPrefetchMessage(payload) {
        try {
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
                log("PREFETCH_CTX: extension context not available");
                return;
            }
            chrome.runtime.sendMessage({ type: "PREFETCH_CTX", payload }, (resp) => {
                if (chrome.runtime.lastError) {
                    log("PREFETCH_CTX send failed:", chrome.runtime.lastError.message);
                    return;
                }
                log("PREFETCH_CTX response:", resp);
                // Store ctxId in sessionStorage for hotel page lookup
                if (resp?.ok && resp?.ctxId) {
                    const storageKey = `bookDirect_prefetch:${payload.checkIn}:${payload.checkOut}:${payload.adults}:${payload.currency || 'USD'}:${payload.gl}`;
                    try {
                        sessionStorage.setItem(storageKey, resp.ctxId);
                        log("Stored ctxId in sessionStorage:", storageKey, resp.ctxId);
                    } catch (e) {
                        log("Failed to store ctxId:", e);
                    }
                }
            });
        } catch (e) {
            log("PREFETCH_CTX exception:", e);
        }
    }

    // Debounced runner (Booking changes URL via SPA-ish navigation sometimes)
    let timer = null;
    let lastKey = "";

    function schedulePrefetch(reason) {
        if (!isSearchResultsPage()) return;

        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            const params = extractPrefetchParamsFromUrl();
            log("Search results detected:", { reason, href: location.href, params });

            if (!params) {
                log("Prefetch skipped (missing q/checkIn/checkOut)");
                return;
            }

            // Avoid repeated sends for same parameters
            const key = JSON.stringify(params);
            if (key === lastKey) return;
            lastKey = key;

            sendPrefetchMessage(params);
        }, 500);
    }

    // ---- Hook initial load + URL changes ----
    if (isSearchResultsPage()) {
        log("Search results page detected - initiating prefetch flow");
        schedulePrefetch("initial");

        // Patch SPA navigation
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

        // Re-run once results DOM likely exists (so gl extraction can succeed)
        setTimeout(() => schedulePrefetch("delayed-1s"), 1000);
        setTimeout(() => schedulePrefetch("delayed-3s"), 3000);

        // IMPORTANT: Set global flag to stop hotel-page IIFE from running
        // (return only exits this IIFE, not the whole file)
        window.__bookDirect_isSearchPage = true;
        log("Exiting early - search results page does not need hotel UI injection");
        return;
    }

    log("Not a search results page, continuing to hotel page logic...");
})();

// =============================================
// HOTEL PAGE LOGIC - Only runs if not a search results page
// =============================================
(function () {
    // Guard: don't run hotel-page logic on search results pages
    if (window.__bookDirect_isSearchPage) {
        console.log('bookDirect: Skipping hotel page flow (on search results page)');
        return;
    }

    console.log('bookDirect: Content script started (hotel page flow)');

    // Global reference to our UI app
    let app = null;

    const SELECTORS = {
        search: {
            hotelName: [
                'h2.pp-header__title',
                '[data-testid="header-title"]',
                '.hp__hotel-name',
                'h2.d2fee87262'
            ],
            price: [
                '[data-testid="price-and-discounted-price"]',
                '.bui-price-display__value',
                '.prco-valign-middle-helper',
                '.prco-text-nowrap-helper',
                '[class*="price_display"]'
            ]
        },
        details: {
            hotelName: [
                '#hp_hotel_name h2',           // Most specific: h2 inside the name container
                '#hp_hotel_name_header',
                '.pp-header__title',
                '.hp__hotel-name',
                '[data-testid="header-title"]',
                'h2.d2fee87262',
                '#hp_hotel_name'               // Fallback: full container (needs cleaning)
            ],
            // 2. The DYNAMIC Grand Total (Priority)
            totalPrice: [
                '.js-reservation-total-price',
                '.hprt-reservation-total__price',
                '.hprt-price-price',
                '[data-component="hotel/new-rooms-table/reservation-cta"] .bui-price-display__value',
                '.bui-price-display__value',
                '[data-testid="price-and-discounted-price"]',
                '.bui-heading--large',
                'span[class*="total_price"]',
                '.hprt-reservation-total-price' // One more variation
            ],
            // 3. Fallback / "Cheapest" Price
            fallbackPrice: [
                '.prco-valign-middle-helper',
                '.bui-price-display__value',
                '.prco-text-nowrap-helper'
            ]
        }
    };

    function findElement(selectorList, context = document) {
        for (const selector of selectorList) {
            const el = context.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    function isVisible(el) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    // Helper: Clean hotel name by removing badges/certifications
    function cleanHotelName(rawName) {
        if (!rawName) return null;

        let name = rawName.trim();

        // Remove common badge prefixes (Booking.com adds these as sibling text)
        const badgePrefixes = [
            /^sustainability\s+certification\s*/i,
            /^eco-certified\s*/i,
            /^verified\s*/i,
            /^promoted\s*/i,
            /^sponsored\s*/i,
            /^new\s+to\s+booking\.com\s*/i,
            /^genius\s*/i,
            /^\d+\s*star\s*(hotel)?\s*/i,  // "3 star hotel"
            /^★+\s*/,                       // Star symbols
        ];

        for (const pattern of badgePrefixes) {
            name = name.replace(pattern, '');
        }

        // Remove double "Hotel Hotel" if present
        name = name.replace(/Hotel\s+Hotel/i, 'Hotel');

        // Clean up whitespace
        name = name.replace(/\s+/g, ' ').trim();

        return name || null;
    }

    // --- ITINERARY EXTRACTION ---
    // Extracts stay parameters from Booking.com URL and DOM for /compare API
    function extractItinerary() {
        const url = new URL(window.location.href);
        const params = url.searchParams;

        // Helper: Convert various date formats to YYYY-MM-DD
        function normalizeDate(dateStr) {
            if (!dateStr) return null;

            // Already YYYY-MM-DD?
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

            // Try parsing as Date
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }
            return null;
        }

        // Helper: Parse date from DOM text like "Fri, Dec 12, 2024"
        function parseDomDate(text) {
            if (!text) return null;
            const cleaned = text.trim();

            // Try direct parse
            const d = new Date(cleaned);
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }

            // Handle "Mon, Dec 12" format (add current/next year)
            const monthMatch = cleaned.match(/([A-Z][a-z]{2})\s+(\d{1,2})/i);
            if (monthMatch) {
                const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
                const monthIdx = months[monthMatch[1]];
                const day = parseInt(monthMatch[2], 10);

                if (monthIdx !== undefined && day) {
                    const now = new Date();
                    let year = now.getFullYear();

                    // If month is in the past, assume next year
                    if (monthIdx < now.getMonth() || (monthIdx === now.getMonth() && day < now.getDate())) {
                        year++;
                    }

                    const result = new Date(year, monthIdx, day);
                    return result.toISOString().split('T')[0];
                }
            }

            return null;
        }

        // 1. Extract dates from URL params (priority)
        // Check for direct date params first (most common)
        let checkIn = params.get('checkin') || params.get('check_in');
        let checkOut = params.get('checkout') || params.get('check_out');

        // Fallback to component date params (checkin_year, checkin_month, checkin_monthday)
        if (!checkIn && params.get('checkin_year')) {
            checkIn = `${params.get('checkin_year')}-${params.get('checkin_month')}-${params.get('checkin_monthday')}`;
        }
        if (!checkOut && params.get('checkout_year')) {
            checkOut = `${params.get('checkout_year')}-${params.get('checkout_month')}-${params.get('checkout_monthday')}`;
        }

        // Normalize to YYYY-MM-DD
        checkIn = normalizeDate(checkIn);
        checkOut = normalizeDate(checkOut);

        // 2. Fallback: Extract dates from DOM
        if (!checkIn || !checkOut) {
            const dateEl = document.querySelector('[data-testid="searchbox-dates-container"]') ||
                document.querySelector('.sb-date-field__display') ||
                document.querySelector('[data-testid="date-display-field-start"]');

            if (dateEl) {
                const raw = dateEl.innerText.replace(/\n/g, ' ');
                const parts = raw.split(/—|-/);

                if (parts.length >= 2) {
                    if (!checkIn) checkIn = parseDomDate(parts[0]);
                    if (!checkOut) checkOut = parseDomDate(parts[1]);
                }
            }
        }

        // 3. Extract adults from URL (default: 2)
        const adultsRaw = params.get('group_adults') || params.get('adults') || params.get('no_rooms');
        const adults = parseInt(adultsRaw, 10) || 2;

        // 4. Extract currency from URL or price element (MUST be ISO 3-letter code)
        // Symbol to ISO mapping
        const SYMBOL_TO_ISO = {
            '€': 'EUR', '$': 'USD', '£': 'GBP', '¥': 'JPY', '₹': 'INR',
            '₩': 'KRW', '₽': 'RUB', '₪': 'ILS', '฿': 'THB', '₫': 'VND',
            'kr': 'SEK', 'kr.': 'ISK', 'ISK': 'ISK', 'DKK': 'DKK', 'NOK': 'NOK', 'SEK': 'SEK'
        };

        // Helper: Validate/normalize currency to ISO 3-letter
        function normalizeCurrency(raw) {
            if (!raw) return null;
            const s = raw.trim().toUpperCase();

            // Already a valid 3-letter ISO code?
            if (/^[A-Z]{3}$/.test(s)) return s;

            // Try symbol mapping
            const mapped = SYMBOL_TO_ISO[raw.trim()] || SYMBOL_TO_ISO[s];
            if (mapped) return mapped;

            return null; // Not a valid currency
        }

        // Try URL params first (most reliable)
        let currency = normalizeCurrency(
            params.get('selected_currency') ||
            params.get('selected_currency_code') ||
            params.get('currency')
        );

        // Fallback: extract from price display
        if (!currency) {
            const priceEl = findElement(SELECTORS.details.totalPrice) || findElement(SELECTORS.details.fallbackPrice);
            if (priceEl) {
                const priceText = priceEl.innerText.trim();

                // Try to match 3-letter code at start (e.g., "EUR 123")
                const codeMatch = priceText.match(/^([A-Z]{3})\s/i);
                if (codeMatch) {
                    currency = codeMatch[1].toUpperCase();
                } else {
                    // Try to match currency symbol
                    const symbolMatch = priceText.match(/^([€$£¥₹₩₽₪฿₫]|kr\.?)/i);
                    if (symbolMatch) {
                        currency = normalizeCurrency(symbolMatch[1]);
                    }
                }
            }
        }

        // Final fallback: null (let Worker decide default)
        // Don't send invalid currencies like "€" or empty strings

        // 5. Get current OTA price (already displayed in UI)
        let currentOtaPriceTotal = null;
        const totalPriceEl = findElement(SELECTORS.details.totalPrice);
        if (totalPriceEl && isVisible(totalPriceEl)) {
            // Extract just the numeric part
            const priceText = totalPriceEl.innerText.trim();
            const numMatch = priceText.replace(/[^\d.,]/g, '');
            if (numMatch) currentOtaPriceTotal = numMatch;
        }

        // 6. Get hotel name (clean badges/certifications)
        const nameEl = findElement(SELECTORS.details.hotelName);
        const hotelName = cleanHotelName(nameEl ? nameEl.innerText : null);

        // 7. Current host
        const currentHost = window.location.hostname;

        // 8. Geo/language hints
        // gl = country code (2-letter ISO 3166-1), hl = language
        // Try to extract country from URL path: /hotel/is/hotelname -> "is" (Iceland)
        const pathMatch = window.location.pathname.match(/\/hotel\/([a-z]{2})\//i);
        let gl = pathMatch ? pathMatch[1].toLowerCase() : null;

        // Fallback: try URL params
        if (!gl) {
            gl = params.get('dest_cc') || params.get('cc1') || params.get('country');
        }

        // Final fallback: default to 'us'
        gl = gl ? gl.toLowerCase() : 'us';

        // Fix #4: Extract hl same way as prefetch (URL lang param first)
        // This ensures ctx key matching between prefetch and hotel page
        const hl = (
            params.get('lang') ||
            document.documentElement.lang ||
            navigator.language ||
            ''
        ).trim();

        return {
            hotelName,
            checkIn,
            checkOut,
            adults,
            currency: currency || null, // null = let Worker decide default
            currentHost,
            currentOtaPriceTotal,
            gl,
            hl
        };
    }

    // Send page context to background (for /compare calls)
    function sendPageContext() {
        const itinerary = extractItinerary();

        // Only send if we have hotel name
        if (!itinerary.hotelName) return;

        // Note: ctx is now managed by background.js using chrome.storage.session
        // The old sessionStorage lookup was loose and could select wrong ctxId
        // Background.js handles ctx lookup based on tabId + itinerary key

        console.log('bookDirect: Sending page context', itinerary);
        console.log('bookDirect: Dates extracted:', itinerary.checkIn, '->', itinerary.checkOut);

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                type: 'BOOKDIRECT_PAGE_CONTEXT',
                payload: itinerary
            });
        }
    }

    // --- STRATEGY 1: SEARCH PAGE (Floating UI) ---
    function handleSearchPage() {
        if (document.getElementById('hp_hotel_name')) return false;

        const nameEl = findElement(SELECTORS.search.hotelName);
        const priceEl = findElement(SELECTORS.search.price);

        if (nameEl && priceEl) {
            const data = {
                hotelName: nameEl.innerText.trim(),
                price: priceEl.innerText.trim()
            };
            if (!app && window.BookDirect) {
                app = window.BookDirect.createUI(data.hotelName, data.price, false);
                document.body.appendChild(app);
            }
            return true;
        }
        return false;
    }

    // --- STRATEGY 2: DETAILS PAGE (Sidebar Injection) ---
    function handleDetailsPage() {
        // First check: Are we on a hotel detail page?
        // Look for elements that only exist on hotel detail pages (not search results)
        const roomTable = document.querySelector('.hprt-table') ||
            document.querySelector('[data-block-id]') ||
            document.querySelector('.roomstable') ||
            document.querySelector('#hprt-table') ||
            document.getElementById('hp_hotel_name');

        // Also check URL pattern for hotel pages
        const isHotelUrl = window.location.pathname.includes('/hotel/');

        if (!roomTable && !isHotelUrl) return false; // Not a hotel detail page

        // 1. ANCHOR: The "I'll Reserve" Button (specific selectors only, no generic submit)
        const button = document.querySelector('.js-reservation-button') ||
            document.querySelector('button[type="submit"].hprt-reservation-cta__book') ||
            document.querySelector('.hprt-reservation-cta button[type="submit"]') ||
            document.querySelector('button.bui-button--primary[type="submit"]');

        if (!button) return false;

        // Traverse UP to find the main sidebar block
        // We look for a parent that contains the whole right-side reservation block
        // .hprt-reservation-cta is usually the small box. We want the parent .hprt-block or similar.
        let scope = button.closest('.hprt-block') ||
            button.closest('.hprt-reservation-cta') ||
            button.closest('aside') ||
            button.parentNode.parentNode; // Fallback

        if (!scope) {
            console.log('bookDirect: Scope not found, using body');
            scope = document.body;
        }

        // DEBUG: Visualize the Scope
        // scope.style.border = '2px dashed blue'; // REMOVED FOR PRODUCTION

        const nameEl = findElement(SELECTORS.details.hotelName);
        const hotelName = cleanHotelName(nameEl ? nameEl.innerText : null) || 'Hotel';

        function getBestPrice() {
            // Search inside the expanded SCOPE
            let totalEl = findElement(SELECTORS.details.totalPrice, scope);

            // Validation: Must be visible and have numbers
            if (totalEl && isVisible(totalEl) && /\d/.test(totalEl.innerText)) {
                // SUCCESS
                // totalEl.style.border = '3px solid #00FF00'; // REMOVED FOR PRODUCTION

                // Clear fallback
                const fallbackEl = findElement(SELECTORS.details.fallbackPrice);
                if (fallbackEl) fallbackEl.style.outline = '';

                return totalEl.innerText.trim();
            }

            // FALLBACK
            const fallbackEl = findElement(SELECTORS.details.fallbackPrice);
            if (fallbackEl) {
                // fallbackEl.style.outline = '3px solid #FF0000'; // REMOVED FOR PRODUCTION
                if (totalEl) totalEl.style.border = '';
                return fallbackEl.innerText.trim();
            }

            return 'Select Room';
        }

        const initialPrice = getBestPrice();

        if (!app && window.BookDirect) {
            app = window.BookDirect.createUI(hotelName, initialPrice, true);

            // Injection Point: We still want to be near the button
            // If scope is big, find the button wrapper again to inject "above" it
            const injectionTarget = button.parentElement;
            injectionTarget.insertBefore(app, injectionTarget.firstElementChild);
        } else if (app && app.updatePrice) {
            app.updatePrice(initialPrice);
        }

        function getRoomDetails() {
            const selects = document.querySelectorAll('.hprt-nos-select, select');
            let details = [];

            selects.forEach(sel => {
                if (sel.value && parseInt(sel.value) > 0) {
                    const count = sel.value;
                    const row = sel.closest('tr');
                    let roomName = '';

                    if (row) {
                        // HELPER: Find Room Name (handle rowspan)
                        let current = row;
                        while (current) {
                            const nameLink = current.querySelector('.hprt-roomtype-icon-link') ||
                                current.querySelector('.hprt-roomtype-name');
                            if (nameLink) {
                                roomName = nameLink.innerText.trim();
                                break;
                            }
                            // Move up to find the parent row that 'spans' down
                            current = current.previousElementSibling;
                        }

                        // EXTRA: Check for "Breakfast included" to differentiate
                        // Look in the current row's conditions column
                        const conditions = row.innerText;
                        if (conditions.toLowerCase().includes('breakfast included')) {
                            roomName += ' (Breakfast included)';
                        }

                        // EXTRA: Capture Price for this specific row
                        // Price is usually in the "Price for X nights" column
                        const priceEl = row.querySelector('.bui-price-display__value') ||
                            row.querySelector('.prco-valign-middle-helper') ||
                            row.querySelector('[data-testid="price-and-discounted-price"]');

                        if (priceEl) {
                            roomName += ` (~${priceEl.innerText.trim()})`;
                        }
                    }

                    // Fallback check (if empty)
                    if (!roomName) return;

                    // FILTER: Remove garbage
                    // 1. Discard if it contains "Max. people" (occupancy info)
                    if (roomName.includes('Max. people')) return;

                    // 2. Discard if it starts with a number (likely a date row if table structure is weird)
                    if (/^\d/.test(roomName)) return;

                    details.push(`${count}x ${roomName}`);
                }
            });

            return details.join('\n');
        }

        // Observer on the SCOPE (Broader watch)
        if (app && app.updatePrice) {
            const observer = new MutationObserver(() => {
                const currentPrice = getBestPrice();
                app.updatePrice(currentPrice);

                // ALSO Update Details
                const currentDetails = getRoomDetails();
                if (app.updateDetails) app.updateDetails(currentDetails);
            });
            observer.observe(scope, { subtree: true, childList: true, characterData: true, attributes: true });

            // Initial Call
            const initialDetails = getRoomDetails();
            if (app.updateDetails) app.updateDetails(initialDetails);
        }

        return true;
    }

    function inject() {
        if (window.hasBookDirectInjected) return;
        if (!window.BookDirect) return;

        // NOTE: Search results prefetch is handled by the immediate page router IIFE
        // which runs before this hotel-page IIFE and sets window.__bookDirect_isSearchPage

        if (handleDetailsPage()) {
            window.hasBookDirectInjected = true;
            // Send page context to background for price comparison
            sendPageContext();
            return;
        }

        // NOTE: Search page handler disabled - the negotiation UI only makes sense
        // when viewing a specific hotel, not when browsing search results.
        // if (handleSearchPage()) {
        //     window.hasBookDirectInjected = true;
        //     return;
        // }
    }

    // --- INITIALIZATION: MutationObserver Pattern ---
    // Watch for DOM changes until hotel title element exists
    function waitForHotelElement() {
        // Already injected? Done.
        if (window.hasBookDirectInjected) return;

        // Check if BookDirect UI factory is available
        if (!window.BookDirect) {
            // Factory not loaded yet, retry shortly
            requestAnimationFrame(waitForHotelElement);
            return;
        }

        // Check for hotel name element (the anchor we need)
        const hotelNameSelectors = [
            ...SELECTORS.details.hotelName,
            ...SELECTORS.search.hotelName
        ];

        const hotelNameEl = findElement(hotelNameSelectors);

        if (hotelNameEl) {
            // Hotel element found! Attempt injection
            console.log('bookDirect: Hotel element found, attempting injection');
            inject();
            return;
        }

        // Element not found yet - set up observer to watch for it
        console.log('bookDirect: Waiting for hotel element...');

        const observer = new MutationObserver((mutations, obs) => {
            // Already injected? Stop observing.
            if (window.hasBookDirectInjected) {
                obs.disconnect();
                return;
            }

            // Check again for hotel name element
            const el = findElement(hotelNameSelectors);
            if (el) {
                console.log('bookDirect: Hotel element appeared, triggering injection');
                obs.disconnect();
                inject();
            }
        });

        // Observe the entire document body for new nodes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Safety timeout: Stop observing after 30 seconds to avoid memory leaks
        setTimeout(() => {
            if (!window.hasBookDirectInjected) {
                console.log('bookDirect: Timeout - stopping observer');
                observer.disconnect();
            }
        }, 30000);
    }

    // Start watching once DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForHotelElement);
    } else {
        // DOM already loaded - check immediately
        waitForHotelElement();
    }

})();
