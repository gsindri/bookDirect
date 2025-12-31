# bookDirect

> **⚠️ Disclaimer:** This extension is not affiliated with, endorsed by, or sponsored by Booking.com. "Booking.com" is a trademark of its respective owner. This extension runs only on Booking.com pages to help users compare prices and optionally navigate to direct booking or contact paths.

A browser extension that helps you book hotels directly by comparing prices across providers and finding direct contact information for hotels.

---

## Data Usage

### Data Read from the Booking.com Page (Local Only)

| Data | Purpose |
|------|---------|
| **Hotel name** | Used to label the UI and look up direct contact info / price comparisons |
| **Itinerary parameters** | Check-in/check-out dates, adults, currency, language/region codes from the URL/search context — used to match comparable offers |
| **Room selection** | Room name + count from Booking's room dropdowns — used for room-aware price comparison |

### Data Sent to Backend (Cloudflare Worker)

All backend communication is made via the extension's background service worker (never directly from page scripts).

| Endpoint | Data Sent | When |
|----------|-----------|------|
| **Prefetch** (`/prefetchCtx`) | Search query, check-in, check-out, adults, currency, region/language codes | When viewing search results (to pre-warm the comparison cache) |
| **Compare** (`/compare`) | Hotel name, itinerary params, current host, optional official URL, context ID | When viewing a hotel page (to fetch price comparisons) |
| **Contact lookup** (`/?query=...`) | Hotel name | When the UI needs phone/website/email contact info |

> **Why we need this:** The backend matches hotels across providers (via Google Hotels API) and returns structured offer data. This enables accurate price comparisons that would be impossible with client-side scraping alone.

### Data NOT Collected

- ❌ No account creation or login required
- ❌ No continuous browsing history collection — the extension only activates on `booking.com/*` pages
- ❌ No sale or sharing of personal data
- ❌ No persistent user identifiers sent to backend

### Screenshot & Clipboard Behavior

The extension requests `clipboardWrite` permission for optional screenshot functionality:
- Screenshots are captured **only when the user explicitly clicks** an action that requests it
- The captured image is used locally for composing a message (e.g., email draft)
- **Screenshots are NOT sent to our backend**

---

## Backend Communication

### Base URL

All backend requests go to: `https://hotelfinder.gsindrih.workers.dev`

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/prefetchCtx` | GET | Pre-warm search context from search results page; returns a `ctxId` for faster subsequent lookups |
| `/compare` | GET | Fetch price comparison data for a specific hotel; supports `refresh=1` for cache bypass |
| `/` | GET | Hotel contact lookup via `?query=<hotelName>` |

### Security Notes

- All `/compare` requests originate from the extension's background service worker (not arbitrary web pages)
- The backend applies **CORS controls** limiting allowed origins to the extension
- **Rate limiting**: 60 requests/hour per client IP for abuse prevention

### Third-Party APIs (Backend-Side)

The backend uses [SearchApi](https://www.searchapi.io/) to fetch Google Hotels results. This is handled server-side — your browser never communicates directly with SearchApi.

---

## Caching Policy & Retention

### Extension-Side Caching

| Cache | Location | Duration | Purpose |
|-------|----------|----------|---------|
| Compare results | In-memory (background worker) | **5 minutes** | Avoid redundant API calls for the same hotel/dates |
| Context IDs (`ctxId`) | `chrome.storage.session` | Session only | Link search context to hotel pages for better matching |
| Force-refresh throttle | In-memory | **60 seconds** | Prevent spam-clicking the refresh button |

### Backend-Side Caching (Cloudflare KV)

| Cache | Duration | Contents |
|-------|----------|----------|
| Search context | ~30 minutes | Context identifiers for hotel matching |
| Offer data | ~30 minutes | Price comparison results |
| Property tokens | 7–30 days | Hotel identifiers for faster lookups |

> **Note:** `ctxId` is a backend identifier for search context, not a user identifier. No personally identifiable information is stored in backend caches.

### How to Clear Cache

- **Extension caches:** Uninstall/reinstall the extension, or clear extension data via `chrome://extensions` → Details → Clear data
- **Backend caches:** Expire automatically based on the durations above

---

## Permissions Justification

| Permission | Why Needed |
|------------|-----------|
| `activeTab` | Read hotel/itinerary info from the current Booking.com page |
| `clipboardWrite` | Optional: copy screenshots to clipboard for email composition |
| `storage` | Cache contact lookup results and search context IDs |
| `host_permissions: booking.com/*` | The extension only runs on Booking.com pages |
| `host_permissions: hotelfinder.gsindrih.workers.dev/*` | Backend API for price comparisons and contact lookups |

---

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `bookDirect` folder

---

## License

MIT
