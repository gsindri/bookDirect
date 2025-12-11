(function () {
    console.log('bookDirect: Content script started');

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
                '#hp_hotel_name',
                '.pp-header__title',
                '.hp__hotel-name',
                '[data-testid="header-title"]',
                'h2.d2fee87262',
                '#hp_hotel_name_header',
                'h2' // Fallback
            ],
            // 1. Sidebar CTA Box
            sidebar: [
                '.hprt-reservation-cta',
                'div[data-component="hotel/new-rooms-table/reservation-cta"]',
                '#reservation_cta_box'
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
                'span[class*="total_price"]'
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

    // --- STRATEGY 1: SEARCH RESULTS (Fixed Position) ---
    function handleSearchPage() {
        // Only run if we are NOT on a details page (check specific details IDs to verify)
        if (document.getElementById('hp_hotel_name')) return false;

        const nameEl = findElement(SELECTORS.search.hotelName);
        const priceEl = findElement(SELECTORS.search.price);

        if (nameEl && priceEl) {
            const data = {
                hotelName: nameEl.innerText.trim(),
                price: priceEl.innerText.trim()
            };
            console.log('bookDirect: Search Page Detected', data);

            // Fixed Position Injection
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
        // 1. ANCHOR: The Sidebar Container (Constant)
        // This container exists even if the price inside is missing.
        const sidebar = findElement(SELECTORS.details.sidebar);
        if (!sidebar) return false;

        const nameEl = findElement(SELECTORS.details.hotelName);
        const hotelName = nameEl ? nameEl.innerText.trim() : 'Hotel';

        // Core Logic: Determine which price to show
        function getBestPrice() {
            // A. Try to find the Grand Total in Sidebar
            // We search for multiple possible selectors
            let totalEl = findElement(SELECTORS.details.totalPrice, sidebar);

            // Check if it's a valid price element
            if (totalEl && isVisible(totalEl) && /\d/.test(totalEl.innerText)) {
                // SUCCESS: Dynamic Price Found
                totalEl.style.border = '3px solid #00FF00'; // GREEN for Success

                // Clear fallback border if it exists
                const fallbackEl = findElement(SELECTORS.details.fallbackPrice);
                if (fallbackEl) fallbackEl.style.outline = '';

                console.log('bookDirect: Using Sidebar Total', totalEl.innerText);
                return totalEl.innerText.trim();
            }

            // B. Fallback: Lead Price from Table
            const fallbackEl = findElement(SELECTORS.details.fallbackPrice);
            if (fallbackEl) {
                // FALLBACK MODE
                fallbackEl.style.outline = '3px solid #FF0000'; // RED for Fallback

                // Clear sidebar border if it (somehow) exists
                if (totalEl) totalEl.style.border = '';

                console.log('bookDirect: Using Fallback Price', fallbackEl.innerText);
                return fallbackEl.innerText.trim();
            }

            return 'Select Room';
        }

        // 1. Initial Injection
        const initialPrice = getBestPrice();

        if (!app && window.BookDirect) {
            app = window.BookDirect.createUI(hotelName, initialPrice, true);
            // Inject at TOP of sidebar so it's always visible
            sidebar.insertBefore(app, sidebar.firstElementChild);
        } else if (app && app.updatePrice) {
            app.updatePrice(initialPrice);
        }

        // 2. The Hunter Observer
        // Watch the entire sidebar for additions/removals of the price element
        if (app && app.updatePrice) {
            const observer = new MutationObserver(() => {
                const currentPrice = getBestPrice();
                app.updatePrice(currentPrice);
            });

            // Subtree is critical because the price might be deep inside a new div
            observer.observe(sidebar, { subtree: true, childList: true, characterData: true });
        }

        return true;
    }


    function inject() {
        if (window.hasBookDirectInjected) return; // Simple check
        if (!window.BookDirect) return;

        // Try Details Page First (More specific)
        if (handleDetailsPage()) {
            window.hasBookDirectInjected = true;
            return;
        }

        // Try Search Page Fallback
        if (handleSearchPage()) {
            window.hasBookDirectInjected = true;
            return;
        }

        console.log('bookDirect: No recognized page data yet...');
    }

    // Poll for a bit (Booking.com is dynamic)
    const interval = setInterval(() => {
        if (window.hasBookDirectInjected) {
            clearInterval(interval);
            return;
        }
        inject();
    }, 2000);

})();
