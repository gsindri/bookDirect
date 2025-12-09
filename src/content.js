(function () {
    console.log('bookDirect: Content script started');

    const SELECTORS = {
        hotelName: 'h2.d2fee87262', // Note: This might change, ideally we'd use a more robust strategy later
        price: 'div[data-testid="price-and-discounted-price"]'
    };

    function findData() {
        const nameEl = document.querySelector(SELECTORS.hotelName);
        const priceEl = document.querySelector(SELECTORS.price);

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
        // Check if already injected
        if (document.querySelector('price-check-ui')) {
            return;
        }

        const data = findData();
        if (!data) {
            console.log('bookDirect: Elements not found yet, retrying...');
            return;
        }

        console.log('bookDirect: Found data:', data);

        const app = document.createElement('price-check-ui');
        app.setAttribute('hotel-name', data.hotelName);
        app.setAttribute('price', data.price);

        document.body.appendChild(app);
        console.log('bookDirect: UI Injected');
    }

    // Initial attempt
    inject();

    // Poll for a bit (Booking.com is dynamic)
    // In a production app, we would use MutationObserver
    const interval = setInterval(() => {
        if (document.querySelector('price-check-ui')) {
            clearInterval(interval);
            return;
        }
        inject();
    }, 2000);

})();
