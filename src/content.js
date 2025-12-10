(function () {
    console.log('bookDirect: Content script started');

    const SELECTORS = {
        hotelName: [
            'h2.pp-header__title',
            '[data-testid="header-title"]',
            '.hp__hotel-name',
            'h2.d2fee87262' // Old fallback
        ],
        price: [
            '[data-testid="price-and-discounted-price"]', // Tag agnostic
            '.bui-price-display__value',
            '.prco-valign-middle-helper',
            '.prco-text-nowrap-helper',
            '[class*="price_display"]' // Wildcard match
        ]
    };

    function findElement(selectorList) {
        for (const selector of selectorList) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    function findData() {
        const nameEl = findElement(SELECTORS.hotelName);
        const priceEl = findElement(SELECTORS.price);

        if (!nameEl) console.log('bookDirect: Hotel Name not found. Checked:', SELECTORS.hotelName);
        if (!priceEl) console.log('bookDirect: Price not found. Checked:', SELECTORS.price);

        // Keep trying if not found (simple polling for this phase)
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
