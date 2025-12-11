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
                'h2'
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

    // --- STRATEGY 1: SEARCH RESULTS (Fixed Position) ---
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
        // 1. ANCHOR: The "I'll Reserve" Button
        // We find the button first, then find its MAIN container (Scope)
        const button = document.querySelector('.js-reservation-button') ||
            document.querySelector('button[type="submit"].hprt-reservation-cta__book') ||
            document.querySelector('button[type="submit"]');

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
        scope.style.border = '2px dashed blue'; // BLUE DASHED = SEARCH AREA

        const nameEl = findElement(SELECTORS.details.hotelName);
        const hotelName = nameEl ? nameEl.innerText.trim() : 'Hotel';

        function getBestPrice() {
            // Search inside the expanded SCOPE
            let totalEl = findElement(SELECTORS.details.totalPrice, scope);

            // Validation: Must be visible and have numbers
            if (totalEl && isVisible(totalEl) && /\d/.test(totalEl.innerText)) {
                // SUCCESS
                totalEl.style.border = '3px solid #00FF00'; // GREEN

                // Clear fallback
                const fallbackEl = findElement(SELECTORS.details.fallbackPrice);
                if (fallbackEl) fallbackEl.style.outline = '';

                return totalEl.innerText.trim();
            }

            // FALLBACK
            const fallbackEl = findElement(SELECTORS.details.fallbackPrice);
            if (fallbackEl) {
                fallbackEl.style.outline = '3px solid #FF0000'; // RED
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

        // Observer on the SCOPE (Broader watch)
        if (app && app.updatePrice) {
            const observer = new MutationObserver(() => {
                const currentPrice = getBestPrice();
                app.updatePrice(currentPrice);
            });
            observer.observe(scope, { subtree: true, childList: true, characterData: true });
        }

        return true;
    }

    function inject() {
        if (window.hasBookDirectInjected) return;
        if (!window.BookDirect) return;

        if (handleDetailsPage()) {
            window.hasBookDirectInjected = true;
            return;
        }

        if (handleSearchPage()) {
            window.hasBookDirectInjected = true;
            return;
        }
    }

    const interval = setInterval(() => {
        if (window.hasBookDirectInjected) {
            clearInterval(interval);
            return;
        }
        inject();
    }, 2000);

})();
