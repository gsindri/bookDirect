// Factory function to create the UI
window.BookDirect = window.BookDirect || {};

window.BookDirect.createUI = function (hotelName, price, isSidebar = false) {
  const container = document.createElement('div');
  const shadowRoot = container.attachShadow({ mode: 'closed' });

  // Internal state
  let _hotelName = hotelName;
  let _price = price;
  let _roomDetails = '';
  let _foundEmail = ''; // Discovered email from hotel website

  // Get icon URL (needs to be computed before template)
  const iconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('icons/bookDirect_icon1.png')
    : '';

  const baseStyle = isSidebar ? `
      :host, .host-wrapper {
        position: sticky;
        top: 10px; /* Become sticky when reaching 10px from top of viewport */
        display: block;
        max-width: 100%; /* Prevent overflow but don't force full width */
        min-width: 0; /* Key for flex contexts - prevents widening parent */
        margin-top: 10px;
        margin-bottom: 10px;
        contain: layout; /* Isolate layout from parent recalculations */
        overflow: hidden; /* Prevent content from causing horizontal overflow */
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        z-index: 100; /* Ensure it stays on top when sticky */
      }
      .container {
        width: 100%;
        max-width: 100%; /* Let content determine width, but cap at parent */
        min-width: 0; /* Key for flex contexts */
        box-sizing: border-box; 
        border-radius: 4px; /* Flatter for sidebar */
        background: #fff;
        border: 2px solid #003580; /* Distinct border */
        overflow: hidden; /* Prevent content overflow */
      }
    ` : `
      :host, .host-wrapper {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647; 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .container {
        width: 300px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.98);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
    `;

  const commonStyle = `
      /* 1. Base Container: Modern & Clean */
      .container {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: #ffffff;
        color: #1a1a1a;
        padding: 24px;
        border-radius: 16px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        border: 1px solid rgba(0,0,0,0.05);
        transition: transform 0.3s ease;
        animation: slideIn 0.5s ease-out;
      }

      @keyframes slideIn {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      /* Header - Centered badge style */
      .header {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: 4px;
        padding-bottom: 14px;
        margin-bottom: 14px;
      }

      .header::after {
        content: '';
        display: block;
        width: 70%;
        height: 1px;
        background: rgba(0,0,0,0.03);
        margin-top: 18px;
      }

      .logo {
        font-weight: 600;
        color: #003580;
        font-size: 14px;
        opacity: 0.9;
        display: flex;
        align-items: center;
        gap: 6px;
        letter-spacing: 0;
        position: relative;
        top: 1px;
      }
      
      .logo-icon {
        width: 18px;
        height: 18px;
        border-radius: 3px;
        object-fit: contain;
        opacity: 0.85;
      }

      .content {
        display: flex;
        flex-direction: column;
      }

      /* 2. Hotel Name: Premium headline */
      .hotel-name {
        margin: 0 0 12px 0;
        font-size: 26px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: -0.01em;
        color: #0f172a;
        text-wrap: balance;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        word-break: normal;
        overflow-wrap: normal;
        hyphens: auto;
        padding-bottom: 0.08em;
        padding-right: 4px;
        box-sizing: border-box;
      }

      /* Dynamic size tiers for long names */
      .hotel-name.is-long {
        font-size: 24px;
      }
      .hotel-name.is-very-long {
        font-size: 22px;
      }

      /* 3. Price Row: Designed layout */
      .price-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-top: 8px;
        margin-bottom: 6px;
      }

      .price-label {
        font-size: 12px;
        font-weight: 600;
        color: #6b7280;
      }

      .price-value {
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
        font-feature-settings: "tnum" 1;
        letter-spacing: -0.01em;
      }

      .price-currency {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        margin-right: 6px;
        color: #0a8a1f;
        opacity: 0.75;
      }

      .price-amount {
        font-size: 23px;
        font-weight: 800;
        line-height: 1.05;
        color: #0a8a1f;
      }

      /* Section Label */
      .section-header {
        margin-top: 14px;
        margin-bottom: 10px;
        font-size: 11px;
        font-weight: 650;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #94a3b8;
      }

      /* Info icon tooltip */
      .info-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        margin-left: 6px;
        font-size: 10px;
        color: #94a3b8;
        cursor: help;
        position: relative;
        vertical-align: middle;
      }

      .info-icon::before {
        content: 'ⓘ';
      }

      .info-icon::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 6px;
        padding: 8px 12px;
        background: #1a1a1a;
        color: #fff;
        font-size: 11px;
        font-weight: 400;
        letter-spacing: 0;
        text-transform: none;
        white-space: nowrap;
        border-radius: 6px;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s ease, visibility 0.2s ease;
        z-index: 1000;
        pointer-events: none;
      }

      .info-icon:hover::after {
        opacity: 1;
        visibility: visible;
      }

      /* 4. Primary Button: Premium styling */
      button, .btn-primary {
        width: 100%;
        height: 50px;
        padding: 0 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.10);
        background: #0b4bb3;
        color: #fff;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.01em;
        white-space: nowrap;
        cursor: pointer;
        box-shadow:
          0 10px 18px rgba(2,6,23,0.14),
          0  2px  6px rgba(2,6,23,0.08);
        transition: transform 140ms ease, box-shadow 140ms ease, filter 140ms ease;
      }

      button svg, .btn-primary svg {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
      }

      button:hover, .btn-primary:hover {
        transform: translateY(-1px);
        box-shadow:
          0 14px 24px rgba(2,6,23,0.16),
          0  3px  8px rgba(2,6,23,0.10);
        filter: brightness(1.02);
      }

      button:active, .btn-primary:active {
        transform: translateY(0px);
        box-shadow:
          0  8px 14px rgba(2,6,23,0.16),
          0  2px  6px rgba(2,6,23,0.10);
        filter: brightness(0.98);
      }

      button:focus-visible, .btn-primary:focus-visible {
        outline: none;
        box-shadow:
          0 0 0 3px rgba(59,130,246,0.35),
          0 10px 18px rgba(2,6,23,0.16),
          0  2px  6px rgba(2,6,23,0.10);
      }

      @media (prefers-reduced-motion: reduce) {
        button, .btn-primary { transition: none; }
        button:hover, .btn-primary:hover { transform: none; }
      }

      .btn-outline, .btn-secondary {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        height: 50px;
        padding: 0 16px;
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: center;
        gap: 10px;
        border-radius: 14px;
        background: #ffffff;
        color: #0f172a;
        border: 1px solid rgba(15, 23, 42, 0.18);
        box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
        font-size: 14px;
        font-weight: 650;
        letter-spacing: -0.01em;
        cursor: pointer;
        margin-top: 12px;
        text-decoration: none;
        box-sizing: border-box;
        overflow: hidden;
        transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
      }

      .btn-outline span, .btn-secondary span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
        line-height: 1;
        font-size: 13px;
      }

      .btn-outline svg, .btn-secondary svg,
      .btn-outline img, .btn-secondary img {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
        opacity: 0.9;
      }

      .btn-outline:hover, .btn-secondary:hover {
        background: rgba(15, 23, 42, 0.02);
        border-color: rgba(15, 23, 42, 0.24);
        box-shadow:
          0 10px 18px rgba(2,6,23,0.06),
          0  2px  6px rgba(2,6,23,0.04);
        transform: translateY(-1px);
      }

      .btn-outline:active, .btn-secondary:active {
        transform: translateY(0px);
        background: rgba(15, 23, 42, 0.03);
        box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
      }

      .btn-outline:focus-visible, .btn-secondary:focus-visible {
        outline: none;
        box-shadow:
          0 0 0 3px rgba(59,130,246,0.22),
          0 1px 0 rgba(15, 23, 42, 0.04);
      }

      @media (prefers-reduced-motion: reduce) {
        .btn-outline, .btn-secondary { transition: none; }
        .btn-outline:hover, .btn-secondary:hover { transform: none; }
      }

      /* 6. Helper caption (Gmail link) */
      .secondary-link, .sub-link {
        margin-top: 10px;
        font-size: 12px;
        font-weight: 500;
        color: #94a3b8;
        line-height: 1.2;
        text-align: center;
        display: block;
        text-decoration: none;
        cursor: pointer;
      }

      .secondary-link:hover, .sub-link:hover {
        color: #003580;
        text-decoration: underline;
      }

      /* Microcopy styling */
      .microcopy {
        font-size: 10px;
        color: #999;
        text-align: center;
        margin-top: 4px;
        margin-bottom: 2px;
      }

      /* Phone link styling */
      .phone-link {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 15px;
        font-size: 13px;
        font-weight: 500;
        color: rgba(0, 53, 128, 0.8);
        text-decoration: none;
        transition: all 0.2s ease;
        min-width: 0;
        max-width: 100%;
        word-break: break-word;
      }

      .phone-link:hover {
        color: #003580;
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .phone-link svg {
        fill: currentColor;
      }

      /* Shared icon styling */
      .bd-icon {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
        display: block;
      }

      /* Container for dynamic buttons */
      .dynamic-buttons {
        margin-top: 8px;
      }
      
      .toast {
        visibility: hidden;
        min-width: 250px;
        background-color: #333;
        color: #fff;
        text-align: center;
        border-radius: 4px;
        padding: 12px;
        position: fixed;
        z-index: 10000;
        left: 50%;
        bottom: 30px;
        transform: translateX(-50%);
        font-size: 14px;
        opacity: 0;
        transition: opacity 0.3s, bottom 0.3s;
      }
      
      .toast.show {
        visibility: visible;
        opacity: 1;
        bottom: 50px;
      }
      
      .error-tooltip {
        visibility: hidden;
        background-color: #ffebeb;
        color: #d4111e;
        border: 1px solid #d4111e;
        text-align: left;
        border-radius: 4px;
        padding: 12px;
        position: absolute;
        z-index: 10000;
        bottom: 70px; /* Above the button */
        left: 16px;
        right: 16px;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        opacity: 0;
        transition: opacity 0.2s, transform 0.2s;
        transform: translateY(10px);
      }
      
      .error-tooltip.show {
        visibility: visible;
        opacity: 1;
        transform: translateY(0);
      }
      
      /* Arrow for tooltip */
      .error-tooltip::after {
        content: "";
        position: absolute;
        bottom: -6px;
        left: 50%;
        margin-left: -6px;
        border-width: 6px 6px 0;
        border-style: solid;
        border-color: #d4111e transparent transparent transparent;
      }
      .error-tooltip::before {
        content: "";
        position: absolute;
        bottom: -4px;
        left: 50%;
        margin-left: -6px;
        border-width: 6px 6px 0;
        border-style: solid;
        border-color: #ffebeb transparent transparent transparent;
        z-index: 1;
      }

      /* Price Comparison Section */
      .compare-section {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(0,0,0,0.06);
      }

      .compare-content {
        margin-top: 10px;
      }

      .compare-loading {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 0;
        color: #6b7280;
        font-size: 13px;
      }

      .compare-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(0, 53, 128, 0.2);
        border-top-color: #003580;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .compare-no-dates {
        font-size: 12px;
        color: #94a3b8;
        padding: 8px 0;
      }

      .compare-error {
        font-size: 12px;
        color: #dc2626;
        padding: 8px 0;
      }

      .compare-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        padding: 8px 0;
        font-size: 13px;
        border-bottom: 1px solid rgba(0,0,0,0.04);
      }

      .compare-row:last-child {
        border-bottom: none;
      }

      .compare-source {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #374151;
        font-weight: 500;
      }

      .compare-source.is-cheapest {
        color: #059669;
        font-weight: 600;
      }

      .compare-source.is-current {
        color: #6b7280;
      }

      .compare-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .compare-badge.cheapest {
        background: rgba(5, 150, 105, 0.1);
        color: #059669;
      }

      .compare-badge.official {
        background: rgba(0, 53, 128, 0.1);
        color: #003580;
      }

      .compare-price {
        text-align: right;
        font-weight: 600;
        color: #1f2937;
      }

      .compare-price a {
        color: inherit;
        text-decoration: none;
      }

      .compare-price a:hover {
        text-decoration: underline;
      }

      .compare-savings {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 10px;
        padding: 10px 12px;
        background: linear-gradient(135deg, rgba(5, 150, 105, 0.08), rgba(5, 150, 105, 0.04));
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        color: #059669;
      }

      .compare-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 10px;
        font-size: 11px;
        color: #94a3b8;
      }

      .compare-refresh {
        cursor: pointer;
        color: #003580;
        opacity: 0.7;
        transition: opacity 0.15s;
      }

      .compare-refresh:hover {
        opacity: 1;
        text-decoration: underline;
      }
    `;

  const html = `
      <div class="host-wrapper">
        <div class="container">
            <div class="header">
            <div class="logo">
                <img class="logo-icon" src="${iconUrl}" alt="">
                bookDirect
            </div>
            </div>
            <div class="content">
            <!-- Hotel Name (Hero) -->
            <div class="hotel-name" title="${_hotelName}">${_hotelName}</div>
            
            <!-- Price (Hero) -->
            <div class="price-row">
              <span class="price-label">Price</span>
              <span class="price-value" id="price-display">${_price}</span>
            </div>
            
            <!-- Error Tooltip -->
            <div id="error-tooltip" class="error-tooltip">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:16px;">⚠️</span>
                    <span>Please select rooms in the table first.</span>
                </div>
            </div>

            <!-- Direct Deal Section (Hidden by default, shown when data available) -->
            <div id="direct-deal-section" style="display:none;">
              <div class="section-header">Direct Deal Options<span class="info-icon" data-tooltip="We draft the email for you. Nothing is sent automatically."></span></div>
              
              <!-- Email buttons (shown if found_email exists) -->
              <div id="email-actions" style="display:none;">
                <button id="draft-email"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;"><path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67Z" /><path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z" /></svg> Request Offer</button>
                <div id="open-gmail" class="secondary-link">Send via Gmail</div>
              </div>
              
              <!-- Contact fallback (shown if no email found) -->
              <div id="contact-fallback" style="display:none;">
                <button id="find-contact"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;"><path fill-rule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z" clip-rule="evenodd" /></svg> Find Email</button>
              </div>
              
              <!-- Dynamic buttons: Website & Phone -->
              <div id="dynamic-buttons" class="dynamic-buttons"></div>
            </div>
            
            <!-- Price Comparison Section (Hidden by default) -->
            <div id="compare-section" class="compare-section" style="display:none;">
              <div class="section-header">Price Comparison</div>
              <div id="compare-content" class="compare-content">
                <!-- Loading state -->
                <div id="compare-loading" class="compare-loading" style="display:none;">
                  <div class="compare-spinner"></div>
                  <span>Checking prices...</span>
                </div>
                <!-- No dates state -->
                <div id="compare-no-dates" class="compare-no-dates" style="display:none;">
                  Select dates on the site to compare prices.
                </div>
                <!-- Error state -->
                <div id="compare-error" class="compare-error" style="display:none;"></div>
                <!-- Results container -->
                <div id="compare-results" style="display:none;"></div>
              </div>
              <div id="compare-footer" class="compare-footer" style="display:none;">
                <span id="compare-timestamp"></span>
                <span id="compare-refresh" class="compare-refresh">Refresh</span>
              </div>
            </div>
            
            <div id="toast" class="toast">Screenshot copied! Paste it in your email.</div>
            </div>
        </div>
      </div>
    `;

  shadowRoot.innerHTML = `<style>${baseStyle}${commonStyle}</style>${html}`;

  // Apply language-aware hyphenation and size tier for hotel name
  const hotelNameEl = shadowRoot.querySelector('.hotel-name');
  if (hotelNameEl) {
    // Set language for browser hyphenation rules
    const pageLang = document.documentElement.lang || 'en';
    hotelNameEl.setAttribute('lang', pageLang);

    // Use plain text, let browser handle hyphenation
    hotelNameEl.textContent = _hotelName.trim();
    hotelNameEl.title = _hotelName.trim(); // Tooltip shows full name

    // Apply size tier based on name length OR longest word length
    const nameStr = _hotelName.trim();
    const nameLength = nameStr.length;
    const longestWord = nameStr.split(/\s+/).reduce((max, w) => w.length > max ? w.length : max, 0);

    hotelNameEl.classList.remove('is-long', 'is-very-long');

    // Trigger smaller size if name is long OR has a very long single word
    if (nameLength >= 34 || longestWord >= 14) {
      hotelNameEl.classList.add('is-very-long');
    } else if (nameLength >= 26 || longestWord >= 12) {
      hotelNameEl.classList.add('is-long');
    }
  }

  // Format price with separate currency and amount
  const priceDisplay = shadowRoot.getElementById('price-display');
  if (priceDisplay && _price) {
    // Parse currency and amount from price string (e.g., "ISK 67,730" or "€ 450")
    const priceStr = _price.trim();
    const match = priceStr.match(/^([A-Z]{2,3}|[€$£¥₹])\s*(.+)$/i) ||
      priceStr.match(/^(.+?)\s*([A-Z]{2,3})$/i);

    if (match) {
      const [, currency, amount] = match;
      priceDisplay.innerHTML = `<span class="price-currency">${currency}</span><span class="price-amount">${amount}</span>`;
    } else {
      // Fallback: just style the whole thing as amount
      priceDisplay.innerHTML = `<span class="price-amount">${priceStr}</span>`;
    }
  }

  // HELPER: Scrape and parse dates with "Smart Year" logic
  function getScrapedDates() {
    const dateEl = document.querySelector('[data-testid="searchbox-dates-container"]') ||
      document.querySelector('.sb-date-field__display');

    if (!dateEl) return { checkIn: 'Date', checkOut: 'Date', raw: '' };

    const raw = dateEl.innerText.replace(/\n/g, ' ');
    // Handle "Fri, Dec 12 — Sun, Dec 14"
    let parts = raw.split(/—|-/); // Em-dash or hyphen
    if (parts.length < 2) parts = [raw, ''];

    const cleanDate = (str) => {
      str = str.trim();
      // Check if year exists (4 digits)
      if (/\d{4}/.test(str)) return str;

      // Smart Year Logic
      // Parse the month from the string (e.g. "Fri, Dec 12")
      const monthMatch = str.match(/[A-Z][a-z]{2}/); // Matches "Dec", "Jan"
      if (monthMatch) {
        const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
        const targetMonth = months[monthMatch[0]];
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Logic: If target month is significantly earlier than current, assume next year.
        if (targetMonth !== undefined) {
          const year = (targetMonth < currentMonth) ? currentYear + 1 : currentYear;
          return `${str}, ${year}`;
        }
      }
      return str; // Fallback
    };

    return {
      checkIn: cleanDate(parts[0]),
      checkOut: cleanDate(parts[1]),
      raw: raw
    };
  }

  // HELPER Functions
  function createDateGrid(checkIn, checkOut, hotelName) {
    const grid = document.createElement('div');
    grid.style.cssText = 'background:#fff; border:1px solid #e7e7e7; border-radius:8px; padding:12px; margin-bottom:12px; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; box-shadow:0 1px 2px rgba(0,0,0,0.05);';

    // HOTEL NAME (At the top for trust - Booking.com style)
    if (hotelName) {
      const hotelHeader = document.createElement('div');
      hotelHeader.innerText = hotelName;
      hotelHeader.style.cssText = 'font-weight:700; color:#1a1a1a; font-size:20px; margin-bottom:8px; text-align:left; line-height:1.3; border-bottom:3px solid #febb02; padding-bottom:8px;';
      grid.appendChild(hotelHeader);
    }

    const title = document.createElement('div');
    title.innerText = 'Your booking details';
    title.style.cssText = 'font-weight:700; color:#1a1a1a; font-size:14px; margin-bottom:12px;';
    grid.appendChild(title);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; border-top:1px solid #e7e7e7; padding-top:12px;';

    // Check-in
    const col1 = document.createElement('div');
    col1.style.cssText = 'flex:1; border-right:1px solid #e7e7e7; padding-right:12px;';
    col1.innerHTML = `<div style="font-size:12px; color:#595959; margin-bottom:4px;">Check-in</div><div style="font-weight:700; color:#1a1a1a; font-size:14px;">${checkIn}</div>`;

    // Check-out
    const col2 = document.createElement('div');
    col2.style.cssText = 'flex:1; padding-left:12px;';
    col2.innerHTML = `<div style="font-size:12px; color:#595959; margin-bottom:4px;">Check-out</div><div style="font-weight:700; color:#1a1a1a; font-size:14px;">${checkOut}</div>`;

    row.appendChild(col1);
    row.appendChild(col2);
    grid.appendChild(row);

    return grid;
  }

  function getEmailContent() {
    const dates = getScrapedDates();

    // Subject: Direct Booking Inquiry: Dec 12 - Dec 14
    const cleanSubjectDate = (str) => {
      const parts = str.split(',');
      if (parts.length >= 2) return parts[1].trim();
      return str;
    };

    // Fallback if scraping failed
    const d1 = cleanSubjectDate(dates.checkIn);
    const d2 = cleanSubjectDate(dates.checkOut);
    const subjectDatePart = (d1 && d2 && d1 !== 'Date') ? `${d1} - ${d2}` : 'Rate Inquiry';

    const subject = `Direct Booking Inquiry: ${subjectDatePart}`;

    // Clean Hotel Name
    let cleanHotelName = _hotelName.replace(/Hotel\s+Hotel/i, 'Hotel').trim();

    // BODY - THE GOLDEN SCRIPT
    const body = `Hello ${cleanHotelName} Reservations Team,

I found your property on Booking.com and it looks perfect for my upcoming trip.

I generally prefer to book directly with the hotel rather than using third-party sites, as I know this helps you save on commission fees.

My Trip Details:
Check-in: ${dates.checkIn}
Check-out: ${dates.checkOut}

The Request: I am looking to book:
${_roomDetails || '1x Room (See details in attachment)'}

The current rate on Booking.com is ${_price}.

Since booking directly saves you the platform commission (approx. 15-20%), would you be open to offering a 10% discount on this rate? This way, we both save money compared to the Booking.com price.

Alternatively, if you cannot lower the rate, would you include free breakfast or a room upgrade if I book directly at the matched price?

Please see the attached screenshot of the current online offer.

Best regards,`;

    return { subject, body };
  }

  function showToast() {
    const toast = shadowRoot.getElementById('toast');
    toast.textContent = '📸 Proof Copied! Press Ctrl+V to paste the screenshot in your email.';
    toast.className = 'toast show';
    // Persistent: stays for 8 seconds to ensure they see the instruction
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 8000);
  }

  function showError() {
    // Try to highlight the actual table first
    const highlighted = highlightTableAndShowBubble();
    if (highlighted) return; // If we found the table, don't show the button tooltip

    // Fallback: Show tooltip on the button itself
    const errorEl = shadowRoot.getElementById('error-tooltip');
    errorEl.className = 'error-tooltip show';
    // Shake animation
    const containerEl = shadowRoot.querySelector('.container');
    containerEl.style.transform = 'translateX(5px)';
    setTimeout(() => { containerEl.style.transform = 'translateX(-5px)'; }, 50);
    setTimeout(() => { containerEl.style.transform = 'translateX(5px)'; }, 100);
    setTimeout(() => { containerEl.style.transform = 'translateX(0)'; }, 150);

    setTimeout(() => { errorEl.className = 'error-tooltip'; }, 4000); // Hide after 4s
  }

  function highlightTableAndShowBubble() {
    // Find the dropdowns in the REAL DOM
    const selects = document.querySelectorAll('.hprt-nos-select, .hprt-table select');
    if (!selects.length) return false;

    // 1. Scroll to table (gentler)
    const firstSelect = selects[0];
    firstSelect.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // 2. Highlight the CELL/COLUMN (parent td)
    // Store references for cleanup
    const highlightedElements = [];

    // 2. Highlight the CELL/COLUMN (parent td)
    selects.forEach(sel => {
      // Traverse to the table cell (td)
      const cell = sel.closest('td') || sel.parentNode;

      if (cell) {
        cell.style.transition = 'background-color 0.2s';
        cell.style.backgroundColor = '#ffebeb'; // The pinkish row highlight
        // Use outline instead of border - doesn't affect layout width
        sel.style.outline = '2px solid #d4111e';
        sel.style.outlineOffset = '2px';

        highlightedElements.push({ cell, sel });
      }
    });

    // 3. Show Bubble (Native Booking style)
    // Create a temporary div in the body (outside shadow root)
    const bubble = document.createElement('div');
    bubble.style.cssText = `
        position: fixed;
        background: #ffebeb;
        color: #d4111e;
        border: 1px solid #d4111e;
        padding: 12px;
        border-radius: 4px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        font-weight: 700;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s;
        max-width: min(240px, calc(100vw - 24px));
        min-width: 0;
    `;
    bubble.innerHTML = '<span>Select one or more options you want to book</span>';

    // Arrow (Pointing Left)
    const arrow = document.createElement('div');
    arrow.style.cssText = `
        position: absolute;
        width: 0; 
        height: 0; 
        border-top: 6px solid transparent;
        border-bottom: 6px solid transparent; 
        border-right: 6px solid #d4111e;
        left: -6px; 
        top: 50%;
        transform: translateY(-50%);
    `;
    // Inner arrow to make it look hollow/filled correctly? Simple solid arrow matches the flat design enough.
    const arrowInner = document.createElement('div');
    arrowInner.style.cssText = `
        position: absolute;
        width: 0; 
        height: 0; 
        border-top: 5px solid transparent;
        border-bottom: 5px solid transparent; 
        border-right: 5px solid #ffebeb;
        left: -4px; 
        top: 50%;
        transform: translateY(-50%);
    `;

    bubble.appendChild(arrow);
    bubble.appendChild(arrowInner);
    document.body.appendChild(bubble);

    // Position it using FIXED positioning (viewport-relative, no scroll offsets)
    const rect = firstSelect.getBoundingClientRect();

    // Temporarily place off-screen so we can measure width/height
    bubble.style.left = '0px';
    bubble.style.top = '0px';

    // Use rAF to measure after browser has computed dimensions
    requestAnimationFrame(() => {
      // Clamp vertically and horizontally to prevent overflow beyond viewport
      const desiredTop = rect.top + (rect.height / 2) - 20;
      const maxTop = window.innerHeight - bubble.offsetHeight - 12;
      const top = Math.max(12, Math.min(desiredTop, maxTop));

      const desiredLeft = rect.right + 12;
      const maxLeft = window.innerWidth - bubble.offsetWidth - 12;
      const left = Math.max(12, Math.min(desiredLeft, maxLeft));

      bubble.style.top = `${top}px`;
      bubble.style.left = `${left}px`;
      bubble.style.opacity = '1';
    });

    // CLEANUP FUNCTION
    const clearHighlights = () => {
      bubble.style.opacity = '0';
      setTimeout(() => bubble.remove(), 300);

      highlightedElements.forEach(({ cell, sel }) => {
        cell.style.backgroundColor = '';
        sel.style.outline = '';
        sel.style.outlineOffset = '';
      });
    };

    // Auto clear after 4s (Fallback)
    const timerId = setTimeout(clearHighlights, 4000);

    // Clear on user interaction (Clicking/Changing the select)
    selects.forEach(sel => {
      sel.addEventListener('change', () => {
        clearTimeout(timerId);
        clearHighlights();
      }, { once: true });
    });

    return true; // Captured
  }

  // HELPER FUNCTIONS (Internal)
  function truncate(str, n) {
    return (str.length > n) ? str.substr(0, n - 1) + '&hellip;' : str;
  }

  function captureAndCopyScreenshot() {
    // ... (mock mode logic same)
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        // ... mock ...
        resolve(); return;
      }

      // ✅ Save current scroll position (key fix for horizontal drift)
      const startX = window.scrollX || 0;
      const startY = window.scrollY || 0;

      // Save scroll behavior to restore later
      const prevScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';

      // 1. Hide UI (use visibility instead of display to preserve layout space)
      // display:none triggers Booking.com's sticky sidebar recalculation
      container.style.visibility = 'hidden';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';

      // 2. Wait
      setTimeout(() => {
        // STEP A: Scrape
        const dateEl = document.querySelector('[data-testid="searchbox-dates-container"]') ||
          document.querySelector('.sb-date-field__display');

        let checkIn = 'Check-in Date';
        let checkOut = 'Check-out Date';

        if (dateEl) {
          const raw = dateEl.innerText.replace(/\n/g, ' ');
          // Split by em-dash or dash
          const parts = raw.split(/—|-/);
          if (parts.length >= 2) {
            checkIn = parts[0].trim();
            checkOut = parts[1].trim();
          } else {
            checkIn = raw;
            checkOut = '';
          }
        }

        // Sidebar Target
        const reserveBtn = document.querySelector('.js-reservation-button') ||
          document.querySelector('button[type="submit"].hprt-reservation-cta__book');
        let sidebarEl = null;

        if (reserveBtn) {
          sidebarEl = reserveBtn.closest('.hprt-block') ||
            reserveBtn.closest('aside') ||
            reserveBtn.closest('.hprt-reservation-cta') ||
            reserveBtn.parentNode.parentNode;
        }
        if (!sidebarEl) {
          sidebarEl = document.querySelector('.hprt-reservation-cta') ||
            document.querySelector('.hprt-price-block') ||
            document.body;
        }

        let injectedDiv = null;
        let rect = null;


        if (sidebarEl) {
          // STEP B: Inject Visual Grid
          injectedDiv = createDateGrid(checkIn, checkOut, _hotelName);
          sidebarEl.prepend(injectedDiv);

          // STEP B.5: SCROLL INTO VIEW (Critical for captureVisibleTab reliability)
          // Scroll the sidebar to center of viewport so it's fully visible
          // Use inline:'nearest' to prevent horizontal drift, behavior:'auto' for deterministic restore
          sidebarEl.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        }

        // STEP C: Capture (with delay to let scroll settle)
        // Wait 500ms for smooth scroll to complete before measuring/capturing
        setTimeout(() => {
          // Re-measure after scroll
          if (sidebarEl) {
            rect = sidebarEl.getBoundingClientRect();
          }

          // FIX: Yield to browser to ensure the injected div is painted before capturing
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Cleanup function to restore UI state
              const doCleanup = () => {
                // Restore visibility (matches the hide method above)
                container.style.visibility = '';
                container.style.opacity = '';
                container.style.pointerEvents = '';
                if (injectedDiv) {
                  injectedDiv.remove();
                  injectedDiv = null; // Prevent double-remove
                }

                // ✅ Restore scroll position (key fix for horizontal drift)
                try {
                  window.scrollTo({ left: startX, top: startY, behavior: 'auto' });
                } catch (e) {
                  window.scrollTo(startX, startY);
                }

                // Restore scroll behavior
                document.documentElement.style.scrollBehavior = prevScrollBehavior;
              };

              // Safety timeout: ensure cleanup happens even if callback never fires
              // (happens when extension context is invalidated)
              const safetyTimeout = setTimeout(() => {
                console.warn('bookDirect: Screenshot safety timeout triggered - forcing cleanup');
                doCleanup();
                reject(new Error('Screenshot timed out'));
              }, 5000);

              // Check if extension context is still valid
              try {
                if (!chrome.runtime?.id) {
                  clearTimeout(safetyTimeout);
                  doCleanup();
                  reject(new Error('Extension context invalidated'));
                  return;
                }
              } catch (e) {
                clearTimeout(safetyTimeout);
                doCleanup();
                reject(new Error('Extension context check failed'));
                return;
              }

              chrome.runtime.sendMessage({ type: 'ACTION_CAPTURE_VISIBLE_TAB' }, async (response) => {
                // Clear safety timeout - callback fired normally
                clearTimeout(safetyTimeout);

                // STEP D: Cleanup immediately (Restore UI & Remove Injection)
                doCleanup();

                if (chrome.runtime.lastError || !response || !response.success) {
                  reject(chrome.runtime.lastError || response?.error);
                  return;
                }

                try {
                  const res = await fetch(response.dataUrl);
                  const blob = await res.blob();
                  const imageBitmap = await createImageBitmap(blob);

                  // Canvas for cropping
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');

                  // Handle DPR
                  const dpr = window.devicePixelRatio || 1;

                  // If we successfully identified a sidebar area to crop
                  if (rect && rect.width > 0 && rect.height > 0) {
                    canvas.width = rect.width * dpr;
                    canvas.height = rect.height * dpr;

                    ctx.drawImage(imageBitmap,
                      rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr, // Source
                      0, 0, canvas.width, canvas.height // Dest
                    );

                    const croppedBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                    const item = new ClipboardItem({ 'image/png': croppedBlob });
                    await navigator.clipboard.write([item]);
                  } else {
                    // Fallback: copy full image if no rect
                    const item = new ClipboardItem({ [blob.type]: blob });
                    await navigator.clipboard.write([item]);
                  }
                  resolve();
                } catch (err) { reject(err); }
              });
            });
          });
        }, 500); // Wait 500ms for smooth scroll to settle
      }, 50); // Initial delay before scroll
    });
  }

  async function copyToClipboard() {
    try {
      // FIX: Ensure document has focus for clipboard API
      window.focus();

      await captureAndCopyScreenshot();
      showToast();
    } catch (e) {
      console.error('Screenshot copy failed', e);

      // If it was a permission/screenshot specific error, show that
      // Otherwise fall back to text
      const errorMsg = e.message || e.toString();
      if (errorMsg.includes('permission') || errorMsg.includes('Capture')) {
        const toast = shadowRoot.getElementById('toast');
        toast.textContent = '❌ Screenshot failed. Please check permissions.';
        toast.className = 'toast show';
        setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 4000);
      } else {
        // Fallback to text if it's just a general failure (or if we still want to give them something)
        const clipText = `Found on Booking.com for ${_price}`;
        navigator.clipboard.writeText(clipText);
        showToast(); // Still show instruction even if image failed, they might have text
      }
    }
  }

  async function draftEmail() {
    // VALIDATION: Gatekeeper check
    if (!_roomDetails || _roomDetails.length === 0) {
      showError();
      return;
    }

    await copyToClipboard(); // Wait for screenshot
    const { subject, body } = getEmailContent();
    const recipient = _foundEmail || '';
    window.open(`mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  }

  async function openGmail() {
    // VALIDATION: Gatekeeper check
    if (!_roomDetails || _roomDetails.length === 0) {
      showError();
      return;
    }

    await copyToClipboard(); // Wait for screenshot
    const { subject, body } = getEmailContent();
    const recipient = _foundEmail ? encodeURIComponent(_foundEmail) : '';
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${recipient}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  }

  // Bind events
  shadowRoot.getElementById('draft-email').addEventListener('click', draftEmail);
  shadowRoot.getElementById('open-gmail').addEventListener('click', openGmail);

  // FETCH HOTEL DETAILS FROM BACKEND (with SMART CACHE)
  (async function fetchHotelDetails() {
    try {
      const cacheKey = `cache_${_hotelName}`;
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

      // Helper to render buttons from data (Ghost Logic)
      const renderButtons = (data) => {
        const directDealSection = shadowRoot.getElementById('direct-deal-section');
        const emailActions = shadowRoot.getElementById('email-actions');
        const dynamicContainer = shadowRoot.getElementById('dynamic-buttons');

        if (!dynamicContainer || !directDealSection) return;

        // Clear existing dynamic buttons first
        dynamicContainer.innerHTML = '';

        // Track if we have anything to show
        let hasAnyData = false;

        // Email actions: Show only if found_email exists
        if (data.found_email && emailActions) {
          _foundEmail = data.found_email;
          emailActions.style.display = 'block';
          hasAnyData = true;
          console.log('bookDirect: Found email:', _foundEmail);
        } else if (!data.found_email) {
          // Search Assist fallback: If no email found, show "Find Contact Info" button
          const contactFallback = shadowRoot.getElementById('contact-fallback');
          if (contactFallback) {
            contactFallback.style.display = 'block';
            const findContactBtn = shadowRoot.getElementById('find-contact');
            if (findContactBtn) {
              findContactBtn.onclick = () => {
                // Open Google search for hotel contact email
                const searchQuery = encodeURIComponent(_hotelName + ' contact email address');
                window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
              };
            }
            hasAnyData = true;
          }
        }

        // Website button: Show only if website exists
        if (data.website) {
          // Extract domain for trust label
          let domain = '';
          try {
            const url = new URL(data.website);
            domain = url.hostname.replace(/^www\./, '');
          } catch (e) {
            domain = '';
          }

          const websiteBtn = document.createElement('button');
          websiteBtn.className = 'btn-outline';
          websiteBtn.innerHTML = `<svg class="bd-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="color: #003580;" aria-hidden="true"><path d="M21.721 12.752a9.711 9.711 0 0 0-.945-5.003 12.754 12.754 0 0 1-4.339 2.708 18.991 18.991 0 0 1-.214 4.772 17.165 17.165 0 0 0 5.498-2.477ZM14.634 15.55a17.324 17.324 0 0 0 .332-4.647c-.952.227-1.945.347-2.966.347-1.021 0-2.014-.12-2.966-.347a17.515 17.515 0 0 0 .332 4.647 17.385 17.385 0 0 0 5.268 0ZM9.772 17.119a18.963 18.963 0 0 0 4.456 0A17.182 17.182 0 0 1 12 21.724a17.18 17.18 0 0 1-2.228-4.605ZM7.777 15.23a18.87 18.87 0 0 1-.214-4.774 12.753 12.753 0 0 1-4.34-2.708 9.711 9.711 0 0 0-.944 5.004 17.165 17.165 0 0 0 5.498 2.477ZM21.356 14.752a9.765 9.765 0 0 1-7.478 6.817 18.64 18.64 0 0 0 1.988-4.718 18.627 18.627 0 0 0 5.49-2.098ZM2.644 14.752c1.682.971 3.53 1.688 5.49 2.099a18.64 18.64 0 0 0 1.988 4.718 9.765 9.765 0 0 1-7.478-6.816ZM13.878 2.43a9.755 9.755 0 0 1 6.116 3.986 11.267 11.267 0 0 1-3.746 2.504 18.63 18.63 0 0 0-2.37-6.49ZM12 2.276a17.152 17.152 0 0 1 2.805 7.121c-.897.23-1.837.353-2.805.353-.968 0-1.908-.122-2.805-.353A17.151 17.151 0 0 1 12 2.276ZM10.122 2.43a18.629 18.629 0 0 0-2.37 6.49 11.266 11.266 0 0 1-3.746-2.504 9.754 9.754 0 0 1 6.116-3.985Z" /></svg> <span>Book Direct</span>`;
          websiteBtn.title = domain ? `Go to ${domain}` : 'Go to official website';
          websiteBtn.addEventListener('click', () => {
            window.open(data.website, '_blank');
          });
          dynamicContainer.appendChild(websiteBtn);
          hasAnyData = true;

          // Trigger price comparison with official website URL
          if (container.setOfficialUrl) {
            container.setOfficialUrl(data.website);
          }
        }

        // Phone link: Show only if phone exists
        if (data.phone) {
          const phoneLink = document.createElement('a');
          phoneLink.className = 'phone-link';
          phoneLink.href = `tel:${data.phone.replace(/\s/g, '')}`;
          phoneLink.innerHTML = `<svg class="bd-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="color: #003580;" aria-hidden="true"><path fill-rule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clip-rule="evenodd" /></svg> ${data.phone}`;
          dynamicContainer.appendChild(phoneLink);
          hasAnyData = true;
        }

        // GHOST LOGIC: Only show the entire section if we have ANY data
        if (hasAnyData) {
          directDealSection.style.display = 'block';
        } else {
          directDealSection.style.display = 'none';
          console.log('bookDirect: No contact data found - hiding Direct Deal section');
        }
      };

      // STEP A: Check Cache
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const cached = await chrome.storage.local.get(cacheKey);

        if (cached[cacheKey]) {
          const { data, timestamp } = cached[cacheKey];
          const age = Date.now() - timestamp;

          // STEP B (HIT): Use cache if < 30 days old
          if (age < THIRTY_DAYS_MS && data) {
            console.log('bookDirect: Using cached hotel data (age:', Math.round(age / 86400000), 'days)');
            renderButtons(data);
            return; // Done! No API call needed.
          }
        }
      }

      // STEP C (MISS): Call API via background (avoids CORS)
      console.log('bookDirect: Cache miss, fetching from API via background...');

      let data = null;
      try {
        data = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'GET_HOTEL_DETAILS',
            query: _hotelName
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
      } catch (e) {
        console.log('bookDirect: Hotel details fetch failed:', e.message);
        return; // Fail silently
      }

      if (!data || data.error) {
        console.log('bookDirect: Hotel details response error:', data?.error);
        return; // Fail silently
      }

      // Save to cache with timestamp
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [cacheKey]: { data, timestamp: Date.now() } });
        console.log('bookDirect: Cached hotel data for', _hotelName);
      }

      renderButtons(data);

    } catch (e) {
      // Fail silently - don't show errors to user
      console.log('bookDirect: Hotel details fetch failed (silent):', e.message);
    }
  })();

  // --- PRICE COMPARISON LOGIC ---
  let _officialUrl = null; // Will be set from contact lookup

  // Get DOM elements for compare section
  const compareSection = shadowRoot.getElementById('compare-section');
  const compareLoading = shadowRoot.getElementById('compare-loading');
  const compareNoDates = shadowRoot.getElementById('compare-no-dates');
  const compareError = shadowRoot.getElementById('compare-error');
  const compareResults = shadowRoot.getElementById('compare-results');
  const compareFooter = shadowRoot.getElementById('compare-footer');
  const compareTimestamp = shadowRoot.getElementById('compare-timestamp');
  const compareRefresh = shadowRoot.getElementById('compare-refresh');

  // Helper: Format price with currency
  function formatComparePrice(total, currency) {
    if (total == null) return '—';
    const formatted = total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return `${currency || ''} ${formatted}`.trim();
  }

  // Helper: Format timestamp
  function formatTimestamp(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Show compare state
  function showCompareState(state) {
    compareLoading.style.display = state === 'loading' ? 'flex' : 'none';
    compareNoDates.style.display = state === 'no-dates' ? 'block' : 'none';
    compareError.style.display = state === 'error' ? 'block' : 'none';
    compareResults.style.display = state === 'results' ? 'block' : 'none';
    compareFooter.style.display = state === 'results' ? 'flex' : 'none';
  }

  // Render compare results
  function renderCompareResults(data) {
    if (!data || data.error) {
      compareError.textContent = data?.error || 'Unable to compare prices.';
      showCompareState('error');
      return;
    }

    // Debug: Log full response
    console.log('bookDirect: Compare response data:', data);
    console.log('bookDirect: Offers count:', data.offersCount, 'cheapestOverall:', data.cheapestOverall, 'cheapestOfficial:', data.cheapestOfficial);

    const currency = data.query?.currency || 'USD';
    const { cheapestOverall, cheapestOfficial, currentOtaOffer, bookingOffer } = data;

    let html = '';

    // Cheapest overall
    if (cheapestOverall) {
      const isCheapest = true;
      const priceLink = cheapestOverall.link
        ? `<a href="${cheapestOverall.link}" target="_blank" rel="noopener">${formatComparePrice(cheapestOverall.total, currency)}</a>`
        : formatComparePrice(cheapestOverall.total, currency);

      html += `
        <div class="compare-row">
          <div class="compare-source is-cheapest">
            ${cheapestOverall.source || 'Best price'}
            <span class="compare-badge cheapest">Cheapest</span>
          </div>
          <div class="compare-price">${priceLink}</div>
        </div>
      `;
    }

    // Official site (if different from cheapest)
    if (cheapestOfficial && cheapestOfficial.source !== cheapestOverall?.source) {
      const priceLink = cheapestOfficial.link
        ? `<a href="${cheapestOfficial.link}" target="_blank" rel="noopener">${formatComparePrice(cheapestOfficial.total, currency)}</a>`
        : formatComparePrice(cheapestOfficial.total, currency);

      html += `
        <div class="compare-row">
          <div class="compare-source">
            Official Site
            <span class="compare-badge official">Direct</span>
          </div>
          <div class="compare-price">${priceLink}</div>
        </div>
      `;
    }

    // Current OTA (what user is viewing)
    const currentOffer = currentOtaOffer || bookingOffer;
    if (currentOffer && currentOffer.source !== cheapestOverall?.source) {
      html += `
        <div class="compare-row">
          <div class="compare-source is-current">
            ${currentOffer.source || 'Booking.com'} (viewing)
          </div>
          <div class="compare-price">${formatComparePrice(currentOffer.total, currency)}</div>
        </div>
      `;
    }

    // Savings calculation
    if (cheapestOverall && currentOffer && cheapestOverall.total < currentOffer.total) {
      const savings = currentOffer.total - cheapestOverall.total;
      html += `
        <div class="compare-savings">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
            <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clip-rule="evenodd" />
          </svg>
          Save ${formatComparePrice(savings, currency)} vs ${currentOffer.source || 'current'}
        </div>
      `;
    }

    if (!html) {
      html = '<div class="compare-no-dates">No price data found.</div>';
    }

    compareResults.innerHTML = html;
    compareTimestamp.textContent = `Checked ${formatTimestamp(data.fetchedAt)}`;
    showCompareState('results');
  }

  // Fetch compare data from background
  async function fetchCompareData(forceRefresh = false) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      console.log('bookDirect: Chrome runtime not available for compare');
      return;
    }

    // Show section and loading state
    compareSection.style.display = 'block';
    showCompareState('loading');

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: forceRefresh ? 'REFRESH_COMPARE' : 'GET_COMPARE_DATA',
          officialUrl: _officialUrl,
          forceRefresh
        }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
          }
        });
      });

      if (response?.needsDates) {
        showCompareState('no-dates');
        return;
      }

      if (response?.error) {
        console.warn('bookDirect: Compare API error:', response.error, response);

        // User-friendly error messages
        let userMessage = 'Unable to compare prices.';
        if (response.error.includes('google_hotels failed')) {
          userMessage = 'Price data temporarily unavailable. Try refreshing.';
        } else if (response.error.includes('Rate limit')) {
          userMessage = 'Too many requests. Please wait a moment.';
        } else if (response.error.includes('No property_token')) {
          userMessage = 'Hotel not found in price database.';
        }

        compareError.textContent = userMessage;
        showCompareState('error');
        return;
      }

      renderCompareResults(response);

    } catch (err) {
      console.error('bookDirect: Compare fetch error', err);
      compareError.textContent = 'Unable to check prices.';
      showCompareState('error');
    }
  }

  // Refresh button handler
  if (compareRefresh) {
    compareRefresh.addEventListener('click', () => {
      fetchCompareData(true);
    });
  }

  // Track if compare has been called (to avoid duplicates)
  let _compareCalledOnce = false;
  let _waitingForOfficialUrl = true;

  // Store officialUrl when contact lookup completes
  container.setOfficialUrl = function (url) {
    _officialUrl = url;
    _waitingForOfficialUrl = false;

    // Notify background about the officialUrl
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'SET_OFFICIAL_URL',
        officialUrl: url
      });
    }

    // Only trigger compare if we haven't called it yet
    if (!_compareCalledOnce) {
      _compareCalledOnce = true;
      fetchCompareData();
    }
  };

  // Fallback: if officialUrl not received after 3500ms, call compare anyway
  setTimeout(() => {
    if (_waitingForOfficialUrl && !_compareCalledOnce) {
      console.log('bookDirect: officialUrl timeout (3500ms), calling compare without it');
      _compareCalledOnce = true;
      fetchCompareData();
    }
  }, 3500);

  // Expose update methods
  container.updatePrice = function (newPrice) {
    // Skip if price hasn't actually changed
    if (newPrice === _price) return;

    const oldPrice = _price;
    _price = newPrice;
    const priceDisplay = shadowRoot.getElementById('price-display');
    if (priceDisplay && newPrice) {
      // Parse and format with same logic as initial render
      const priceStr = newPrice.trim();
      const match = priceStr.match(/^([A-Z]{2,3}|[€$£¥₹])\s*(.+)$/i) ||
        priceStr.match(/^(.+?)\s*([A-Z]{2,3})$/i);

      if (match) {
        const [, currency, amount] = match;
        priceDisplay.innerHTML = `<span class="price-currency">${currency}</span><span class="price-amount">${amount}</span>`;
      } else {
        priceDisplay.innerHTML = `<span class="price-amount">${priceStr}</span>`;
      }

      // Only flash animation if price actually changed
      if (oldPrice && oldPrice !== newPrice) {
        const amountEl = priceDisplay.querySelector('.price-amount');
        if (amountEl) {
          amountEl.style.transition = 'color 0.3s';
          amountEl.style.color = '#e2aa11'; // Flash yellow/gold
          setTimeout(() => {
            amountEl.style.color = '#0a8a1f'; // Back to green
          }, 500);
        }
      }
    }
  };

  container.updateDetails = function (details) {
    _roomDetails = details;
  };

  return container;
};
