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
            // 2. The DYNAMIC Gland Total (Priority)
            totalPrice: [
                '.js-reservation-total-price', // Top Priority
                '.hprt-reservation-total__price',
                '[data-component="hotel/new-rooms-table/reservation-cta"] .bui-price-display__value',
                '.bui-price-display__value'
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
        // 1. ANCHOR: The "I'll Reserve" Button
        // It's the most stable element in the sidebar.
        // We look for button type='submit' inside the sidebar container.
        const sidebar = findElement(SELECTORS.details.sidebar);
        if (!sidebar) return false;

        const nameEl = findElement(SELECTORS.details.hotelName);
        const hotelName = nameEl ? nameEl.innerText.trim() : 'Hotel';

        // Helper: Find price relative to button
        // The price usually lives in a container just before the button part of the form
        function findPriceRelativeToButton() {
            // Try to find the button first
            const button = sidebar.querySelector('.js-reservation-button') ||
                sidebar.querySelector('button[type="submit"]');

            if (!button) {
                console.log('bookDirect: Button anchor not found');
                return null;
            }

            // Look up the tree for the "Total" container. 
            // It's usually a sibling or cousin of the button's wrapper.
            // We search the whole sidebar for anything that looks like a large price.
            // But we prioritize ELEMENTS closer to the button? 
            // Actually, let's just use specific selectors inside the sidebar but apply the DEBUG BORDER.

            const possiblePrices = [
                '.js-reservation-total-price',
                '.hprt-reservation-total__price',
                '.hprt-price-price',
                '[data-component="hotel/new-rooms-table/reservation-cta"] .bui-price-display__value',
                '.bui-heading--large',
                'span[class*="total_price"]'
            ];

            for (let sel of possiblePrices) {
                const el = sidebar.querySelector(sel);
                if (el && isVisible(el) && /\d/.test(el.innerText)) {
                    return el;
                }
            }
            return null;
        }

        function updatePriceLogic() {
            // Find price element
            let priceEl = findPriceRelativeToButton();
            let activePrice = '';

            if (priceEl) {
                // VISUAL DEBUGGING: RED BORDER
                // This confirms to the user "We found THIS element"
                priceEl.style.border = '3px solid red';
                activePrice = priceEl.innerText.trim();
                console.log('bookDirect: Found Price (DEBUG)', activePrice);
            } else {
                // Fallback
                const fallbackEl = findElement(SELECTORS.details.fallbackPrice);
                // Also apply debug border to fallback if used?
                if (fallbackEl) fallbackEl.style.border = '3px solid orange';

                activePrice = fallbackEl ? fallbackEl.innerText.trim() : 'Select Room';
                console.log('bookDirect: Using Fallback Price', activePrice);
            }

            return { activePrice, priceEl };
        }

        // Initial check
        const { activePrice } = updatePriceLogic();

        if (!app && window.BookDirect) {
            app = window.BookDirect.createUI(hotelName, activePrice, true);
            sidebar.insertBefore(app, sidebar.firstElementChild);
        } else if (app && app.updatePrice) {
            app.updatePrice(activePrice);
        }

        // RE-APLY OBSERVER to the Sidebar Container
        // We watch the whole sidebar subtree because the price element is often destroyed and recreated
        if (app && app.updatePrice) {
            const observer = new MutationObserver(() => {
                // Re-run the logic
                const { activePrice } = updatePriceLogic();
                app.updatePrice(activePrice);
            });

            // Watch everything in sidebar
            observer.observe(sidebar, { subtree: true, childList: true, characterData: true, attributes: true });
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
