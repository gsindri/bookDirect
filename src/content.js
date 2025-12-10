(function () {
    console.log('bookDirect: Content script started');

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
                '[data-testid="header-title"]'
            ],
            price: [
                '.prco-valign-middle-helper',
                '.bui-price-display__value',
                '[data-testid="price-and-discounted-price"]',
                '.prco-text-nowrap-helper'
            ]
        }
    };

    function findElement(selectorList) {
        for (const selector of selectorList) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    function findData() {
        // Strategy 1: Hotel Details Page (specific ID often present)
        let nameEl = findElement(SELECTORS.details.hotelName);
        let priceEl = findElement(SELECTORS.details.price);
        let pageType = 'details';

        // Strategy 2: Search Page fallback (if Details specific failed, or we are on search)
        // Note: some classes overlap, but Details usually has #hp_hotel_name
        if (!nameEl && !priceEl) {
            nameEl = findElement(SELECTORS.search.hotelName);
            priceEl = findElement(SELECTORS.search.price);
            pageType = 'search';
        }

        if (!nameEl) console.log(`bookDirect: Hotel Name not found (${pageType})`);
        if (!priceEl) console.log(`bookDirect: Price not found (${pageType})`);

        if (!nameEl || !priceEl) {
            return null;
        }

        return {
            hotelName: nameEl.innerText.trim(),
            price: priceEl.innerText.trim()
        };
    }

    function inject() {
        // Check if already injected (look for container with logic)
        // Harder to check with raw div, but we can check if we ran
        if (window.hasBookDirectInjected) return;

        const data = findData();
        if (!data) {
            console.log('bookDirect: Elements not found yet, retrying...');
            return;
        }

        console.log('bookDirect: Found data:', data);
        window.hasBookDirectInjected = true;

        if (window.BookDirect && window.BookDirect.createUI) {
            const app = window.BookDirect.createUI(data.hotelName, data.price);
            document.body.appendChild(app);
            console.log('bookDirect: UI Injected');
        } else {
            console.error('bookDirect: BookDirect.createUI not found');
        }
    }

    // Initial attempt
    inject();

    // Poll for a bit (Booking.com is dynamic)
    // In a production app, we would use MutationObserver
    const interval = setInterval(() => {
        const interval = setInterval(() => {
            if (window.hasBookDirectInjected) {
                clearInterval(interval);
                return;
            }
            inject();
        }, 2000);
    }, 2000);

})();
