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
            // 2. The DYNAMIC Total Price (updates when room selected)
            totalPrice: [
                '.hprt-reservation-total__price',
                '.js-reservation-total-price',
                '.bui-price-display__value',
                '[data-testid="price-and-discounted-price"]'
            ],
            // 3. Fallback / "Cheapest" Price (always visible at top)
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
        const nameEl = findElement(SELECTORS.details.hotelName);
        if (!nameEl) return false;

        const hotelName = nameEl.innerText.trim();

        // 1. Find Sidebar CTA
        const sidebar = findElement(SELECTORS.details.sidebar);
        if (sidebar) {
            // Find valid price: Try Total first (if room selected), else Fallback
            let priceEl = findElement(SELECTORS.details.totalPrice, sidebar);
            let usingFallback = false;

            // If total is hidden or empty, use fallback
            if (!priceEl || !priceEl.innerText.trim()) {
                priceEl = findElement(SELECTORS.details.fallbackPrice);
                usingFallback = true;
            }

            const initialPrice = priceEl ? priceEl.innerText.trim() : 'Select Room';

            console.log('bookDirect: Details Page Detected', { hotelName, initialPrice, usingFallback });

            if (!app && window.BookDirect) {
                app = window.BookDirect.createUI(hotelName, initialPrice, true);

                // Inject INSIDE sidebar, BEFORE the button (find the button or append)
                // We want to be visible. Usually sidebar has some text then a button.
                // Inserting at top of sidebar might be safest fallback if button logic fails.
                sidebar.insertBefore(app, sidebar.firstElementChild);
            }

            // OBSERVER: Watch for price updates in the sidebar
            if (app && app.updatePrice && sidebar) {
                const observer = new MutationObserver(() => {
                    const totalEl = findElement(SELECTORS.details.totalPrice, sidebar);
                    // Check if total element exists AND has text (meaning rooms selected)
                    if (totalEl && totalEl.innerText.trim()) {
                        const newPrice = totalEl.innerText.trim();
                        // Only update if it looks like a price (contains numbers)
                        if (/\d/.test(newPrice)) {
                            app.updatePrice(newPrice);
                        }
                    } else {
                        // Revert to fallback if user deselected everything? 
                        // Optional, but good UX.
                        const fallbackEl = findElement(SELECTORS.details.fallbackPrice);
                        if (fallbackEl) {
                            app.updatePrice(fallbackEl.innerText.trim());
                        }
                    }
                });

                // Observe subtree because the price might be deeply nested or replaced entirely
                observer.observe(sidebar, { subtree: true, childList: true, characterData: true });
            }

            return true;
        }
        return false;
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
