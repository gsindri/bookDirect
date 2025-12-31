// Factory function to create the UI
window.BookDirect = window.BookDirect || {};

// ========================================
// DEBUG FLAGS - Toggle features to isolate layout bugs
// Set to false to disable a feature
// ========================================
window.BookDirect.DEBUG_FLAGS = {
  ENABLE_SCREENSHOT: true,          // Screenshot capture on "Request Offer"
  ENABLE_HIGHLIGHT_BUBBLE: true,    // Table highlight + bubble when no room selected
  ENABLE_SCROLL_INTO_VIEW: true,    // scrollIntoView in highlight function
  ENABLE_DATE_GRID_INJECTION: true, // Inject date grid into sidebar for screenshot
  ENABLE_OVERFLOW_FIX: true,        // overflow-x:hidden on html/body (nuclear fix)
  ENABLE_DIAGNOSTICS: true,         // Overflow diagnostics hooks
  FORCE_FLOATING: false,            // Force floating mode (bypass docking) for testing
  ENABLE_ROOM_SELECT_STABILIZER: true, // Fix gap after room dropdown change
};

window.BookDirect.createUI = function (hotelName, price, isSidebar = false) {
  const container = document.createElement('div');

  // Force visibility even when Booking.com hides parent sidebar on scroll
  // Inline styles have highest specificity and override inherited visibility:hidden
  container.style.cssText = 'visibility: visible !important; opacity: 1 !important; display: block !important;';

  const shadowRoot = container.attachShadow({ mode: 'closed' });

  // Internal state
  let _hotelName = hotelName;
  let _price = price;
  let _roomDetails = '';
  let _foundEmail = ''; // Discovered email from hotel website
  let _bookDirectUrl = null; // Best URL for Book Direct button
  let _bookDirectUrlSource = null; // 'hotelDetails' | 'compareOffer' | 'compareProperty'
  let _selectedRooms = []; // Structured room selection: [{ name, count }]

  // Get icon URL (needs to be computed before template)
  const iconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('icons/bookDirect_icon1.png')
    : '';

  const baseStyle = isSidebar ? `
      :host, .host-wrapper {
        position: relative;
        display: block;
        visibility: visible !important; /* Override Booking's visibility:hidden on scroll */
        opacity: 1 !important;
        max-width: 100%; /* Prevent overflow but don't force full width */
        min-width: 0; /* Key for flex contexts - prevents widening parent */
        margin-top: 10px;
        margin-bottom: 10px;
        contain: layout; /* Isolate layout from parent recalculations */
        overflow: hidden; /* Prevent content from causing horizontal overflow */
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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
        flex: 1 1 auto;
        min-width: 0;            /* critical for flex shrink */
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 600;
        color: #6b7280;
      }

      .price-value {
        flex: 0 0 auto;          /* keep price readable */
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

      .compare-header {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #94a3b8;
        margin-bottom: 8px;
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

      /* Mismatch warning */
      .compare-mismatch-warning {
        background: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 6px;
        padding: 10px 12px;
        margin-bottom: 10px;
        font-size: 12px;
        color: #856404;
      }

      /* 2-LINE GRID LAYOUT for compare rows */
      .compare-row {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-areas:
          "source price"
          "tags price";
        column-gap: 8px;
        row-gap: 2px;
        align-items: start;
        padding: 8px 0;
        font-size: 13px;
        border-bottom: 1px solid rgba(0,0,0,0.04);
      }

      .compare-row:last-of-type {
        border-bottom: none;
      }

      .compare-source {
        grid-area: source;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #374151;
        font-weight: 500;
      }

      .compare-source.is-cheapest {
        color: #059669;
        font-weight: 600;
      }

      .compare-tags {
        grid-area: tags;
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }

      .compare-tags:empty {
        display: none;
      }

      .compare-price {
        grid-area: price;
        justify-self: end;
        align-self: center;
        white-space: nowrap;
        text-align: right;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: #1f2937;
      }

      .compare-price a {
        color: inherit;
        text-decoration: none;
        white-space: nowrap;
      }

      .compare-price a:hover {
        text-decoration: underline;
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

      .compare-badge.member,
      .compare-badge.login {
        background: rgba(234, 179, 8, 0.15);
        color: #a16207;
      }

      .compare-badge.mobile,
      .compare-badge.promo {
        background: rgba(139, 92, 246, 0.1);
        color: #7c3aed;
      }

      .compare-badge.matched {
        background: rgba(59, 130, 246, 0.12);
        color: #2563eb;
      }

      .compare-badge.other-room {
        background: rgba(107, 114, 128, 0.1);
        color: #6b7280;
        font-size: 9px;
      }

      .compare-row-secondary {
        opacity: 0.75;
        font-size: 12px;
      }

      .compare-badge.booking-best {
        background: rgba(34, 197, 94, 0.12);
        color: #16a34a;
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

      .compare-member-note {
        font-size: 11px;
        color: #a16207;
        margin-top: 8px;
        padding: 6px 10px;
        background: rgba(234, 179, 8, 0.08);
        border-radius: 6px;
      }

      .compare-toggle {
        background: none;
        border: none;
        font-size: 12px;
        color: #003580;
        cursor: pointer;
        padding: 6px 0;
        margin-top: 4px;
      }

      .compare-toggle:hover {
        text-decoration: underline;
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

      /* COMPACT MODE (narrow widths) */
      .compare-section.compact .compare-source {
        white-space: normal;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .compare-section.compact .compare-badge {
        font-size: 9px;
        padding: 2px 4px;
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
              <span id="price-label" class="price-label" title="Booking.com price you're viewing">Booking.com (viewing)</span>
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
              <div class="compare-header">Prices found</div>
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
    const FLAGS = window.BookDirect?.DEBUG_FLAGS || {};

    // DEBUG: Skip highlight/bubble entirely if disabled
    if (FLAGS.ENABLE_HIGHLIGHT_BUBBLE === false) {
      console.log('[bookDirect][debug] Highlight/bubble disabled via DEBUG_FLAGS');
      return false;
    }

    // Find the dropdowns in the REAL DOM
    const selects = document.querySelectorAll('.hprt-nos-select, .hprt-table select');
    if (!selects.length) return false;

    const firstSelect = selects[0];

    // 1. Capture scrollLeft of all horizontally scrollable ancestors BEFORE any scrolling
    // This prevents the "columns separated" / gap effect caused by horizontal scroll drift
    const scrollableAncestors = [];
    for (let p = firstSelect; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const ox = cs.overflowX;
      if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1) {
        scrollableAncestors.push({ el: p, scrollLeft: p.scrollLeft });
      }
    }

    // 2. Scroll to the TABLE (block-level anchor), not the select
    // This avoids triggering horizontal scroll to "reveal" the select
    // DEBUG: Skip scrollIntoView if disabled
    if (FLAGS.ENABLE_SCROLL_INTO_VIEW !== false) {
      const scrollAnchor =
        firstSelect.closest('table') ||
        firstSelect.closest('[data-testid]') ||
        firstSelect.closest('section') ||
        firstSelect;

      scrollAnchor.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } else {
      console.log('[bookDirect][debug] scrollIntoView disabled via DEBUG_FLAGS');
    }

    // 3. Restore horizontal scrollLeft after browser finishes scroll
    // Use rAF to run after the browser's scroll step
    requestAnimationFrame(() => {
      scrollableAncestors.forEach(({ el, scrollLeft }) => {
        if (el.scrollLeft !== scrollLeft) {
          el.scrollLeft = scrollLeft;
        }
      });
    });

    // 4. Highlight the CELL/COLUMN (parent td)
    // Store references for cleanup
    const highlightedElements = [];

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
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve(); return;
      }

      // ========================================
      // STATE VARIABLES (declared upfront for guaranteed cleanup access)
      // ========================================
      const startX = window.scrollX || 0;
      const startY = window.scrollY || 0;
      const prevScrollBehavior = document.documentElement.style.scrollBehavior;
      let injectedDiv = null;
      let cleanupCalled = false;

      // ========================================
      // CLEANUP FUNCTION (defined upfront, always callable)
      // ========================================
      const doCleanup = () => {
        if (cleanupCalled) return; // Prevent double-cleanup
        cleanupCalled = true;

        // Restore container visibility
        try {
          container.style.visibility = '';
          container.style.opacity = '';
          container.style.pointerEvents = '';
        } catch (e) { /* container might be gone */ }

        // Remove injected date grid
        if (injectedDiv) {
          try { injectedDiv.remove(); } catch (e) { }
          injectedDiv = null;
        }

        // Restore scroll position
        try {
          window.scrollTo({ left: startX, top: startY, behavior: 'auto' });
        } catch (e) {
          try { window.scrollTo(startX, startY); } catch (e2) { }
        }

        // Restore scroll behavior
        try {
          document.documentElement.style.scrollBehavior = prevScrollBehavior;
        } catch (e) { }

        // Optional: nudge Booking to recompute sticky positions
        try {
          requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        } catch (e) { }
      };

      // ========================================
      // MAIN CAPTURE LOGIC (wrapped in try/catch)
      // ========================================
      try {
        document.documentElement.style.scrollBehavior = 'auto';

        // 1. Hide our UI (use visibility to preserve layout space)
        container.style.visibility = 'hidden';
        container.style.opacity = '0';
        container.style.pointerEvents = 'none';

        // 2. Wait a tick, then proceed
        setTimeout(() => {
          try {
            // STEP A: Scrape dates
            const dateEl = document.querySelector('[data-testid="searchbox-dates-container"]') ||
              document.querySelector('.sb-date-field__display');

            let checkIn = 'Check-in Date';
            let checkOut = 'Check-out Date';

            if (dateEl) {
              const raw = dateEl.innerText.replace(/\n/g, ' ');
              const parts = raw.split(/—|-/);
              if (parts.length >= 2) {
                checkIn = parts[0].trim();
                checkOut = parts[1].trim();
              } else {
                checkIn = raw;
                checkOut = '';
              }
            }

            // STEP B: Find sidebar
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

            // STEP C: Inject date grid
            // DEBUG: Skip date grid injection if disabled
            const FLAGS = window.BookDirect?.DEBUG_FLAGS || {};
            if (sidebarEl && FLAGS.ENABLE_DATE_GRID_INJECTION !== false) {
              injectedDiv = createDateGrid(checkIn, checkOut, _hotelName);
              sidebarEl.prepend(injectedDiv);
              sidebarEl.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
            } else if (FLAGS.ENABLE_DATE_GRID_INJECTION === false) {
              console.log('[bookDirect][debug] Date grid injection disabled via DEBUG_FLAGS');
            }

            // STEP D: Wait for scroll, then capture
            setTimeout(() => {
              try {
                const rect = sidebarEl ? sidebarEl.getBoundingClientRect() : null;

                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    // Safety timeout
                    const safetyTimeout = setTimeout(() => {
                      console.warn('bookDirect: Screenshot safety timeout - forcing cleanup');
                      doCleanup();
                      reject(new Error('Screenshot timed out'));
                    }, 5000);

                    // Check extension context
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
                      clearTimeout(safetyTimeout);
                      doCleanup(); // Always cleanup after capture attempt

                      if (chrome.runtime.lastError || !response || !response.success) {
                        reject(chrome.runtime.lastError || response?.error);
                        return;
                      }

                      try {
                        const res = await fetch(response.dataUrl);
                        const blob = await res.blob();
                        const imageBitmap = await createImageBitmap(blob);

                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        const dpr = window.devicePixelRatio || 1;

                        if (rect && rect.width > 0 && rect.height > 0) {
                          canvas.width = rect.width * dpr;
                          canvas.height = rect.height * dpr;
                          ctx.drawImage(imageBitmap,
                            rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr,
                            0, 0, canvas.width, canvas.height
                          );
                          const croppedBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                          const item = new ClipboardItem({ 'image/png': croppedBlob });
                          await navigator.clipboard.write([item]);
                        } else {
                          const item = new ClipboardItem({ [blob.type]: blob });
                          await navigator.clipboard.write([item]);
                        }
                        resolve();
                      } catch (err) {
                        reject(err);
                      }
                    });
                  });
                });
              } catch (e) {
                doCleanup();
                reject(e);
              }
            }, 500);
          } catch (e) {
            doCleanup();
            reject(e);
          }
        }, 50);
      } catch (e) {
        doCleanup();
        reject(e);
      }
    });
  }

  async function copyToClipboard() {
    const FLAGS = window.BookDirect?.DEBUG_FLAGS || {};

    try {
      // FIX: Ensure document has focus for clipboard API
      window.focus();

      // DEBUG: Skip screenshot if disabled
      if (FLAGS.ENABLE_SCREENSHOT === false) {
        console.log('[bookDirect][debug] Screenshot disabled via DEBUG_FLAGS');
        showToast();
        return;
      }

      await captureAndCopyScreenshot();
      showToast();
    } catch (e) {
      console.error('Screenshot copy failed:', e.message || e.name || String(e));

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
          // Set initial _bookDirectUrl from hotelDetails (lowest priority fallback)
          if (!_bookDirectUrl) {
            _bookDirectUrl = data.website;
            _bookDirectUrlSource = 'hotelDetails';
          }

          // Extract domain for trust label
          let domain = '';
          try {
            const url = new URL(_bookDirectUrl);
            domain = url.hostname.replace(/^www\./, '');
          } catch (e) {
            domain = '';
          }

          const websiteBtn = document.createElement('button');
          websiteBtn.className = 'btn-outline';
          websiteBtn.innerHTML = `<svg class="bd-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="color: #003580;" aria-hidden="true"><path d="M21.721 12.752a9.711 9.711 0 0 0-.945-5.003 12.754 12.754 0 0 1-4.339 2.708 18.991 18.991 0 0 1-.214 4.772 17.165 17.165 0 0 0 5.498-2.477ZM14.634 15.55a17.324 17.324 0 0 0 .332-4.647c-.952.227-1.945.347-2.966.347-1.021 0-2.014-.12-2.966-.347a17.515 17.515 0 0 0 .332 4.647 17.385 17.385 0 0 0 5.268 0ZM9.772 17.119a18.963 18.963 0 0 0 4.456 0A17.182 17.182 0 0 1 12 21.724a17.18 17.18 0 0 1-2.228-4.605ZM7.777 15.23a18.87 18.87 0 0 1-.214-4.774 12.753 12.753 0 0 1-4.34-2.708 9.711 9.711 0 0 0-.944 5.004 17.165 17.165 0 0 0 5.498 2.477ZM21.356 14.752a9.765 9.765 0 0 1-7.478 6.817 18.64 18.64 0 0 0 1.988-4.718 18.627 18.627 0 0 0 5.49-2.098ZM2.644 14.752c1.682.971 3.53 1.688 5.49 2.099a18.64 18.64 0 0 0 1.988 4.718 9.765 9.765 0 0 1-7.478-6.816ZM13.878 2.43a9.755 9.755 0 0 1 6.116 3.986 11.267 11.267 0 0 1-3.746 2.504 18.63 18.63 0 0 0-2.37-6.49ZM12 2.276a17.152 17.152 0 0 1 2.805 7.121c-.897.23-1.837.353-2.805.353-.968 0-1.908-.122-2.805-.353A17.151 17.151 0 0 1 12 2.276ZM10.122 2.43a18.629 18.629 0 0 0-2.37 6.49 11.266 11.266 0 0 1-3.746-2.504 9.754 9.754 0 0 1 6.116-3.985Z" /></svg> <span>Book Direct</span>`;
          websiteBtn.title = domain ? `Opens: ${domain}` : 'Go to official website';
          // Use _bookDirectUrl at click time (dynamic, can be upgraded later)
          websiteBtn.addEventListener('click', () => {
            if (!_bookDirectUrl) return;
            window.open(_bookDirectUrl, '_blank', 'noopener,noreferrer');
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
  let _compareCalledOnce = false;
  let _compareUsedOfficialUrl = false;
  let _waitingForOfficialUrl = true;
  let _compareReqSeq = 0;           // Race-condition guard
  let _lastCompareData = null;      // Store for footer logic
  let _currentMismatch = false;
  let _retryMatchCooldownUntil = 0;
  let _cooldownTimer = null;
  let _lastCompareClickAt = 0;      // Click debounce
  let _compareRerenderTimer = null; // Debounced rerender for room/price changes
  let _compareInFlight = false;     // Guard against rerender during fetch

  // Debounced rerender for room/price changes (avoids rapid fire during room selection)
  function scheduleCompareRerender() {
    if (!_lastCompareData || !compareResults) return;
    if (_compareInFlight) return; // Don't rerender during fetch

    if (_compareRerenderTimer) clearTimeout(_compareRerenderTimer);
    _compareRerenderTimer = setTimeout(() => {
      try {
        renderCompareResults(_lastCompareData);
        console.log('bookDirect: Debounced rerender complete');
      } catch (e) {
        console.error('bookDirect: Rerender error', e);
      }
    }, 180);
  }

  // Get DOM elements for compare section
  const compareSection = shadowRoot.getElementById('compare-section');
  const compareLoading = shadowRoot.getElementById('compare-loading');
  const compareNoDates = shadowRoot.getElementById('compare-no-dates');
  const compareError = shadowRoot.getElementById('compare-error');
  const compareResults = shadowRoot.getElementById('compare-results');
  const compareFooter = shadowRoot.getElementById('compare-footer');
  const compareTimestamp = shadowRoot.getElementById('compare-timestamp');
  const compareRefresh = shadowRoot.getElementById('compare-refresh');

  // Compact mode detection via ResizeObserver on container
  const containerEl = shadowRoot.querySelector('.container');
  const priceLabel = shadowRoot.getElementById('price-label');

  // Function to update compact mode for compare section
  function updateCompactMode(width) {
    const isCompact = width < 360;

    // Toggle compact class on compare section if exists
    if (compareSection) {
      compareSection.classList.toggle('compact', isCompact);
    }
    // Hero label always shows "Booking.com (viewing)" - no switching needed
  }

  if (containerEl) {
    const compactRO = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width || 0;
      updateCompactMode(w);
    });
    compactRO.observe(containerEl);

    // Also do an immediate check on the next frame (after layout)
    requestAnimationFrame(() => {
      updateCompactMode(containerEl.offsetWidth);
    });
  }

  // Helper: Format price with currency (uses NBSP to prevent line breaks)
  function formatComparePrice(total, currency) {
    if (total == null) return '—';
    const formatted = total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (!currency) return formatted;
    return `${currency}\u00A0${formatted}`;  // NBSP between currency and number
  }

  // Helper: Parse price string to number (robust for various formats)
  // Handles: "ISK 25,103", "25.103 ISK", "€ 450", "$1,234.56"
  function parseCurrencyNumber(priceStr) {
    if (!priceStr || typeof priceStr !== 'string') return NaN;
    // For whole number currencies (ISK, JPY, KRW, etc.), strip everything except digits
    // This handles both "25,103" (comma as thousands) and "25.103" (period as thousands)
    const digitsOnly = priceStr.replace(/[^\d]/g, '');
    const num = parseInt(digitsOnly, 10);
    return Number.isFinite(num) && num > 0 ? num : NaN;
  }

  // --- ROOM MATCHING HELPERS (for like-for-like comparison) ---

  // Parse selected rooms from _roomDetails string (e.g., "2 x Deluxe Double Room • 1 x Suite")
  function parseSelectedRoomsFromDetails(details) {
    if (!details || typeof details !== 'string') return [];

    return details
      .split('•')
      .map(s => s.trim())
      .map(part => {
        const m = part.match(/^(\d+)\s*x\s*(.+)$/i);
        if (!m) return null;

        const count = parseInt(m[1], 10) || 1;
        let name = (m[2] || '').trim();

        // Remove trailing "(~ISK 12,345)" price annotation
        name = name.replace(/\(\s*~[^)]*\)\s*$/i, '').trim();
        // Remove "(Breakfast included)" suffix
        name = name.replace(/\(Breakfast included\)/i, '').trim();
        // Normalize whitespace
        name = name.replace(/\s+/g, ' ').trim();

        if (!name) return null;
        return { count, name };
      })
      .filter(Boolean);
  }

  // Normalize room name for fuzzy matching
  function normalizeRoomName(name) {
    return (name || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')      // Remove parentheticals
      .replace(/[^a-z0-9]+/g, ' ')     // Keep only alphanumeric
      .replace(/\b(room|rooms|the|and|or|with|without|a|an|of|to|in)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Jaccard similarity score between two room names
  function roomNameScore(a, b) {
    const A = normalizeRoomName(a).split(' ').filter(Boolean);
    const B = normalizeRoomName(b).split(' ').filter(Boolean);
    if (!A.length || !B.length) return 0;

    const setA = new Set(A);
    const setB = new Set(B);

    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter++;

    const union = setA.size + setB.size - inter;
    return union ? inter / union : 0;
  }

  // Find best matching room from provider's room list
  function bestRoomMatch(selectedName, providerRooms) {
    let best = null;
    let bestScore = 0;

    for (const r of providerRooms || []) {
      if (!r?.name || typeof r?.total !== 'number') continue;
      const s = roomNameScore(selectedName, r.name);
      if (s > bestScore) {
        bestScore = s;
        best = r;
      }
    }

    return best ? { room: best, score: bestScore } : null;
  }

  // Compute total for selected rooms from a single offer
  function offerTotalForSelection(offer, selections) {
    if (!offer || !Array.isArray(offer.rooms) || offer.rooms.length === 0) return null;

    let total = 0;
    const matched = [];

    for (const sel of selections) {
      const m = bestRoomMatch(sel.name, offer.rooms);
      if (!m || m.score < 0.30) return null; // Threshold for match quality

      total += (m.room.total * sel.count);
      matched.push({
        selected: sel.name,
        provider: m.room.name,
        perRoomTotal: m.room.total,
        count: sel.count,
        link: m.room.link || offer.link,
        score: m.score
      });
    }

    const link = matched.length === 1 ? matched[0].link : offer.link;
    return { total, matched, link };
  }

  // Find cheapest offer for selected room(s) across all providers
  function cheapestOfferForSelection(offers, selections, currentHost) {
    let best = null;

    for (const o of offers || []) {
      // Skip Booking.com itself when comparing to Booking
      if (currentHost && currentHost.includes('booking') &&
        (o.source || '').toLowerCase().includes('booking')) {
        continue;
      }

      const calc = offerTotalForSelection(o, selections);
      if (!calc) continue;

      if (!best || calc.total < best.total) {
        best = {
          offer: o,
          total: calc.total,
          matched: calc.matched,
          link: calc.link
        };
      }
    }

    return best;
  }

  // --- BOOK DIRECT URL HELPERS ---
  function isHttpUrl(u) {
    try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; }
    catch { return false; }
  }

  function isGoogleTrackingUrl(u) {
    try {
      const h = new URL(u).hostname;
      return h.includes('google.com') || h.includes('googleadservices.com') || h.includes('googlesyndication.com');
    } catch { return false; }
  }

  function isKnownOtaUrl(u) {
    try {
      const h = new URL(u).hostname.replace(/^www\./, '');
      return ['booking.com', 'expedia.com', 'hotels.com', 'agoda.com', 'trip.com', 'priceline.com'].some(d => h === d || h.endsWith('.' + d));
    } catch { return false; }
  }

  function hasDateParams(u) {
    try {
      const p = new URL(u).searchParams;
      return p.has('checkin') || p.has('checkIn') || p.has('checkout') || p.has('checkOut') || p.has('arrival') || p.has('departure');
    } catch { return false; }
  }

  function isValidDirectLink(u) {
    return isHttpUrl(u) && !isGoogleTrackingUrl(u) && !isKnownOtaUrl(u);
  }

  // Pick best official URL from compare data
  function pickBestOfficialUrl(data) {
    if (!data) return null;

    // 1. Best: Official offer deep link with date params
    const offers = data.offers || [];
    const officialOffers = offers.filter(o => o.isOfficial && o.link && isValidDirectLink(o.link));

    // Prefer offers with date params
    const withDates = officialOffers.filter(o => hasDateParams(o.link));
    if (withDates.length > 0) {
      return { url: withDates[0].link, source: 'compareOffer' };
    }
    if (officialOffers.length > 0) {
      return { url: officialOffers[0].link, source: 'compareOffer' };
    }

    // 2. Fallback: property.link (homepage)
    if (data.property?.link && isValidDirectLink(data.property.link)) {
      return { url: data.property.link, source: 'compareProperty' };
    }

    return null;
  }

  // Update Book Direct button with new URL
  function updateBookDirectButton(url, source) {
    if (!url) return;
    _bookDirectUrl = url;
    _bookDirectUrlSource = source;

    // Update button tooltip to show hostname
    const dynamicContainer = shadowRoot.getElementById('dynamic-buttons');
    const websiteBtn = dynamicContainer?.querySelector('.btn-outline');
    if (websiteBtn) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        websiteBtn.title = `Opens: ${host}`;
      } catch { /* ignore */ }
    }

    console.log('bookDirect: Updated _bookDirectUrl from', source, '->', url);
  }

  // --- ROOM MATCHING HELPERS ---
  // Normalize room name for matching
  function normRoomName(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\u2013\u2014-]/g, ' ')  // en/em dash to space
      .replace(/[^a-z0-9]+/g, ' ')       // non-alphanumeric to space
      .replace(/\b(with|and|or|the|a|an)\b/g, '') // remove stopwords
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Score room name similarity (token overlap)
  function roomScore(selectedName, offerRoomName) {
    const aTokens = normRoomName(selectedName).split(' ').filter(Boolean);
    const bTokens = new Set(normRoomName(offerRoomName).split(' ').filter(Boolean));
    if (!aTokens.length) return 0;
    const hits = aTokens.filter(t => bTokens.has(t)).length;
    return hits / aTokens.length;
  }

  // Find best room match across all offers
  function findBestRoomMatch(offers, selectedRoomName) {
    let best = null;
    for (const offer of (offers || [])) {
      for (const room of (offer.rooms || [])) {
        const score = roomScore(selectedRoomName, room.name);
        if (!best || score > best.score) {
          best = { score, offer, room };
        }
      }
    }
    // Threshold: require at least 50% token overlap
    return best && best.score >= 0.5 ? best : null;
  }

  function computeRoomAwareComparison(data) {
    const totalSelectedRooms = (_selectedRooms || []).reduce((s, r) => s + (r.count || 0), 0);
    const singleSelection = totalSelectedRooms === 1 ? _selectedRooms[0] : null;

    // DEBUG: Log selected rooms state
    console.log('bookDirect: _selectedRooms state:', { _selectedRooms, totalSelectedRooms, singleSelection });

    // Multi-room: check if all selected rooms are the same type
    let multiRoomSameName = null;
    if (totalSelectedRooms > 1 && _selectedRooms.length > 0) {
      const firstNorm = normRoomName(_selectedRooms[0].name);
      const allSame = _selectedRooms.every(r => normRoomName(r.name) === firstNorm);
      if (allSame) {
        multiRoomSameName = _selectedRooms[0].name;
      }
    }

    // Single room selection
    if (singleSelection) {
      const match = findBestRoomMatch(data.offers, singleSelection.name);
      if (match) {
        return {
          type: 'matched',
          selectedName: singleSelection.name,
          matchedRoom: match.room,
          matchedOffer: match.offer,
          matchedTotal: match.room.total,
          confidence: match.score,
        };
      }
    }

    // Multi-room same type: multiply matched room total
    if (multiRoomSameName) {
      const match = findBestRoomMatch(data.offers, multiRoomSameName);
      if (match) {
        return {
          type: 'matched-multi',
          selectedName: multiRoomSameName,
          roomCount: totalSelectedRooms,
          matchedRoom: match.room,
          matchedOffer: match.offer,
          matchedTotal: match.room.total * totalSelectedRooms,
          confidence: match.score,
        };
      }
    }

    // Multi-room different types: can't match
    if (totalSelectedRooms > 1) {
      return { type: 'multi-room-unmatchable', roomCount: totalSelectedRooms };
    }

    // No selection or no match: fall back to cheapest overall
    return { type: 'fallback' };
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

  // --- MISMATCH DETECTION HELPERS ---
  function normalizeNameForComparison(s) {
    return String(s || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(hotel|resort|inn|suites?|apartments?)\b/gi, '')
      .trim();
  }

  function checkNameMismatch(searchedName, matchedName) {
    if (!matchedName) return { isMismatch: false };
    const a = normalizeNameForComparison(searchedName);
    const b = normalizeNameForComparison(matchedName);

    const aTokens = a.split(' ').filter(Boolean);
    const bTokens = new Set(b.split(' ').filter(Boolean));
    const hits = aTokens.filter(t => bTokens.has(t)).length;
    const coverage = aTokens.length > 0 ? hits / aTokens.length : 0;

    // Strong disambiguators only
    const keyTokens = ['airport', 'station', 'beach', 'downtown', 'central', 'centre', 'oldtown', 'harbor', 'harbour'];
    const aKeyTokens = keyTokens.filter(k => a.includes(k));
    const missingKeyTokens = aKeyTokens.filter(k => !b.includes(k));

    return { isMismatch: coverage < 0.4 || missingKeyTokens.length > 0, matchedName };
  }

  // --- MEANINGFUL SAVINGS THRESHOLD ---
  function isMeaningfulSavings(savings, baseTotal, currency) {
    const MIN_PCT = 0.015; // 1.5%
    const MIN_ABS_BY_CCY = {
      USD: 5, EUR: 5, GBP: 5,
      CAD: 7, AUD: 7,
      DKK: 35, SEK: 50, NOK: 50,
      ISK: 500,
      JPY: 600,
      KRW: 5000
    };
    const minAbs = MIN_ABS_BY_CCY[currency] ?? 5;
    const minPct = baseTotal > 0 ? baseTotal * MIN_PCT : Infinity;
    return savings >= Math.max(minAbs, minPct);
  }

  // --- FOOTER UPDATE FUNCTION ---
  function updateCompareFooter() {
    const data = _lastCompareData;
    const showRetry = _currentMismatch || data?.error || data?.matchUncertain;
    const now = Date.now();
    const cooldownRemaining = Math.max(0, Math.ceil((_retryMatchCooldownUntil - now) / 1000));

    if (showRetry) {
      if (cooldownRemaining > 0) {
        compareRefresh.textContent = 'Retry match';
        compareRefresh.style.pointerEvents = 'none';
        compareRefresh.style.opacity = '0.5';
      } else {
        compareRefresh.textContent = 'Retry match';
        compareRefresh.style.pointerEvents = '';
        compareRefresh.style.opacity = '';
      }
      compareRefresh.dataset.expensive = 'true';
    } else {
      compareRefresh.textContent = 'Refresh';
      compareRefresh.style.pointerEvents = '';
      compareRefresh.style.opacity = '';
      compareRefresh.dataset.expensive = 'false';
    }
  }

  // Render compare results
  function renderCompareResults(data) {
    if (!data || data.error) {
      compareError.textContent = data?.error || 'Unable to compare prices.';
      showCompareState('error');
      updateCompareFooter();
      return;
    }

    // Debug: Log full response
    console.log('bookDirect: Compare response data:', data);
    console.log('bookDirect: Offers count:', data.offersCount, 'cheapestOverall:', data.cheapestOverall, 'cheapestOfficial:', data.cheapestOfficial);

    // --- MISMATCH DETECTION ---
    // Use match.matchedHotelName, or fall back to property.name (cached responses may not have matchedHotelName)
    const matchedHotelName = data.match?.matchedHotelName || data.matchedHotelName || data.property?.name || null;
    const mismatchCheck = checkNameMismatch(_hotelName, matchedHotelName);
    const isLowConfidence = (data.match?.confidence ?? 1) < 0.4;

    // Debug: Log mismatch detection values
    console.log('bookDirect: Mismatch detection:', {
      searchedHotel: _hotelName,
      matchedHotel: matchedHotelName,
      isMismatch: mismatchCheck.isMismatch,
      confidence: data.match?.confidence,
      isLowConfidence,
      matchUncertain: data.matchUncertain
    });

    _currentMismatch = mismatchCheck.isMismatch || isLowConfidence || data.matchUncertain;

    // --- UPGRADE BOOK DIRECT URL ---
    // Try to find a better official link from compare data (deep link > homepage > hotelDetails)
    const betterUrl = pickBestOfficialUrl(data);
    if (betterUrl && betterUrl.url !== _bookDirectUrl) {
      updateBookDirectButton(betterUrl.url, betterUrl.source);
    }

    const currency = data.query?.currency || 'USD';
    const currentHost = data.query?.currentHost || '';
    let { cheapestOverall, cheapestOfficial, currentOtaOffer, bookingOffer } = data;

    // --- SELECTION-AWARE CHEAPEST ---
    // Parse selected rooms and find cheapest provider for those exact rooms
    const selections = parseSelectedRoomsFromDetails(_roomDetails);
    let selectionCheapest = null;
    let usingRoomMatch = false;

    if (selections.length && Array.isArray(data.offers)) {
      selectionCheapest = cheapestOfferForSelection(data.offers, selections, currentHost);

      if (selectionCheapest) {
        console.log('bookDirect: Room-matched cheapest found:', {
          provider: selectionCheapest.offer.source,
          total: selectionCheapest.total,
          matched: selectionCheapest.matched
        });

        // Replace cheapestOverall with selection-aware version
        cheapestOverall = {
          ...selectionCheapest.offer,
          total: selectionCheapest.total,
          totalText: formatComparePrice(selectionCheapest.total, currency),
          link: selectionCheapest.link || selectionCheapest.offer.link,
          roomMatch: selectionCheapest.matched
        };
        usingRoomMatch = true;
      }
    }

    let html = '';

    // Show mismatch warning at top if detected
    if (_currentMismatch && matchedHotelName) {
      html += `
        <div class="compare-mismatch-warning">
          ⚠️ Prices may be for: <strong>${matchedHotelName}</strong>
        </div>
      `;
    }

    // --- ROOM-AWARE COMPARISON (moved earlier to use in cheapest display) ---
    const roomComparison = computeRoomAwareComparison(data);
    console.log('bookDirect: Room comparison:', roomComparison);

    // Parse the visible page price EARLY (needed for smart badge display)
    const viewingTotal = parseCurrencyNumber(_price);
    console.log('bookDirect: Page price for comparison:', { _price, viewingTotal });

    // Determine what to show as "cheapest" - room-matched price vs overall cheapest
    const isRoomMatched = roomComparison.type === 'matched' || roomComparison.type === 'matched-multi';

    // When room is matched, show the matched room's offer as comparison
    // Otherwise fall back to overall cheapest
    const displayOffer = isRoomMatched ? roomComparison.matchedOffer : cheapestOverall;
    const displayTotal = isRoomMatched ? roomComparison.matchedTotal : cheapestOverall?.total;
    const displayRoom = isRoomMatched ? roomComparison.matchedRoom : null;

    // Cheapest display (room-matched when available, otherwise overall)
    if (displayOffer || displayTotal) {
      const sourceLabel = displayOffer?.source || 'Best price';
      const roomLabel = displayRoom?.name ? ` – ${displayRoom.name.slice(0, 25)}${displayRoom.name.length > 25 ? '…' : ''}` : '';
      const displayLink = displayRoom?.link || displayOffer?.link;
      const priceLink = displayLink
        ? `<a href="${displayLink}" target="_blank" rel="noopener">${formatComparePrice(displayTotal, currency)}</a>`
        : formatComparePrice(displayTotal, currency);

      // Determine if this is actually cheaper than what user is paying on Booking.com
      const isActuallyCheaper = Number.isFinite(viewingTotal) &&
        Number.isFinite(displayTotal) &&
        displayTotal < viewingTotal;
      const bookingIsBest = Number.isFinite(viewingTotal) &&
        Number.isFinite(displayTotal) &&
        viewingTotal <= displayTotal;

      // Build badges array - only show "Cheaper" if actually cheaper than Booking.com!
      const badges = [];
      if (isRoomMatched) {
        badges.push('<span class="compare-badge matched">Same Room</span>');
      }

      if (isActuallyCheaper) {
        // This offer IS cheaper than Booking.com
        badges.push('<span class="compare-badge cheapest">Cheaper</span>');
      } else if (bookingIsBest) {
        // Booking.com is same or better - highlight that
        badges.push('<span class="compare-badge booking-best">Booking Best</span>');
      }

      for (const b of (displayOffer?.badges || [])) {
        badges.push(`<span class="compare-badge ${b.toLowerCase()}">${b}</span>`);
      }

      // Only highlight as cheapest (green) if it actually IS cheaper
      const sourceClass = isActuallyCheaper ? 'compare-source is-cheapest' : 'compare-source';

      html += `
        <div class="compare-row">
          <div class="${sourceClass}" title="${sourceLabel}${roomLabel}">${sourceLabel}</div>
          <div class="compare-price">${priceLink}</div>
          <div class="compare-tags">${badges.join('')}</div>
        </div>
      `;

      // If room matched, also show overall cheapest if different and cheaper
      if (isRoomMatched && cheapestOverall && cheapestOverall.total < displayTotal) {
        const overallLink = cheapestOverall.link
          ? `<a href="${cheapestOverall.link}" target="_blank" rel="noopener">${formatComparePrice(cheapestOverall.total, currency)}</a>`
          : formatComparePrice(cheapestOverall.total, currency);

        html += `
          <div class="compare-row compare-row-secondary">
            <div class="compare-source" title="${cheapestOverall.source} (different room type)">${cheapestOverall.source}</div>
            <div class="compare-price">${overallLink}</div>
            <div class="compare-tags"><span class="compare-badge other-room">Other Room</span></div>
          </div>
        `;
      }
    }

    // Official site (if different from cheapest)
    if (cheapestOfficial && cheapestOfficial.source !== cheapestOverall?.source) {
      const fullSourceName = cheapestOfficial.source || 'Official Site'; // Keep for tooltip
      const priceLink = cheapestOfficial.link
        ? `<a href="${cheapestOfficial.link}" target="_blank" rel="noopener">${formatComparePrice(cheapestOfficial.total, currency)}</a>`
        : formatComparePrice(cheapestOfficial.total, currency);

      // Build badges array
      const badges = ['<span class="compare-badge official">Direct</span>'];
      for (const b of (cheapestOfficial.badges || [])) {
        badges.push(`<span class="compare-badge ${b.toLowerCase()}">${b}</span>`);
      }

      html += `
        <div class="compare-row">
          <div class="compare-source" title="${fullSourceName}">Official site</div>
          <div class="compare-price">${priceLink}</div>
          <div class="compare-tags">${badges.join('')}</div>
        </div>
      `;
    }

    // NOTE: Removed duplicate 'Booking.com (viewing)' row - already shown in hero section above
    const currentOffer = currentOtaOffer || bookingOffer;

    // Savings calculation - use PAGE price as baseline (what user is actually paying)
    // Suppress if mismatch detected, member-only, or not meaningful
    const cheapestHasMemberBadge = (cheapestOverall?.badges || []).some(
      b => ['Member', 'Login', 'Mobile'].includes(b)
    );

    // viewingTotal already parsed earlier at line 2228
    // Google's Booking.com price from compare data
    const googleBookingTotal = bookingOffer?.total ?? currentOtaOffer?.total ?? null;

    // (roomComparison already computed earlier at line 2053)

    // Choose baseline - prefer room-matched comparison when available
    let baselineTotal = null;
    let baselineLabel = 'Booking.com';
    let roomNote = '';

    if (roomComparison.type === 'multi-room-unmatchable') {
      // Multi-room with different types: can't compare accurately
      html += `
        <div class="compare-room-note">
          ℹ️ Multi-room selection – savings shown for cheapest room
        </div>
      `;
    }

    // Use page price as baseline (what user is actually paying)
    if (Number.isFinite(viewingTotal) && Number.isFinite(googleBookingTotal)) {
      // Both exist - use the VIEWING price (what user selected) for user-centric comparison
      baselineTotal = viewingTotal;
    } else if (Number.isFinite(viewingTotal)) {
      baselineTotal = viewingTotal;
    } else if (Number.isFinite(googleBookingTotal)) {
      baselineTotal = googleBookingTotal;
    }

    // Room match feedback
    if (roomComparison.type === 'matched' || roomComparison.type === 'matched-multi') {
      const roomName = roomComparison.matchedRoom?.name || roomComparison.selectedName;
      roomNote = roomName ? ` (${roomName.slice(0, 30)}${roomName.length > 30 ? '...' : ''})` : '';
    }

    // --- DEBUG: Savings calculation inputs ---
    console.log('bookDirect: Savings calc inputs:', {
      _price,
      viewingTotal,
      googleBookingTotal,
      baselineTotal,
      cheapestOverallTotal: cheapestOverall?.total,
      displayTotal,
      isRoomMatched,
      _currentMismatch,
      wouldShowSavings: displayTotal && baselineTotal && displayTotal < baselineTotal && !_currentMismatch,
    });

    // Calculate savings using room-matched price when available, otherwise overall cheapest
    const savingsCompareTotal = displayTotal ?? cheapestOverall?.total;
    if (savingsCompareTotal && baselineTotal && savingsCompareTotal < baselineTotal && !_currentMismatch) {
      const savings = baselineTotal - savingsCompareTotal;
      console.log('bookDirect: Savings calculation:', {
        savings,
        currency,
        comparedTo: isRoomMatched ? 'room-matched' : 'cheapest-overall',
        isMeaningful: isMeaningfulSavings(savings, baselineTotal, currency)
      });

      // Only show savings callout if meaningful (>=1.5% or above currency minimum)
      if (isMeaningfulSavings(savings, baselineTotal, currency)) {
        if (cheapestHasMemberBadge) {
          // Cheapest requires membership - show note instead of full savings
          html += `
            <div class="compare-member-note">
              💡 Cheapest price may require membership/login
            </div>
          `;
        } else {
          html += `
            <div class="compare-savings">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
                <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clip-rule="evenodd" />
              </svg>
              Save ${formatComparePrice(savings, currency)} vs your selection
            </div>
          `;
        }
      }
      // If savings are trivial, just show nothing (cleaner than a preachy message)
    }

    if (!html) {
      html = '<div class="compare-no-dates">No price data found.</div>';
    }

    compareResults.innerHTML = html;
    compareTimestamp.textContent = `Checked ${formatTimestamp(data.fetchedAt)}`;
    showCompareState('results');
    updateCompareFooter();
  }

  // Fetch compare data from background
  async function fetchCompareData(forceRefresh = false, opts = {}) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      console.log('bookDirect: Chrome runtime not available for compare');
      return;
    }

    const seq = ++_compareReqSeq; // Race-condition guard

    // Show section and loading state
    compareSection.style.display = 'block';
    showCompareState('loading');

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: forceRefresh ? 'REFRESH_COMPARE' : 'GET_COMPARE_DATA',
          officialUrl: _officialUrl,
          forceRefresh,
          hotelName: _hotelName,
          bookingUrl: window.location.href,
          reason: opts.reason || null
        }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
          }
        });
      });

      // Race guard: ignore stale responses
      if (seq !== _compareReqSeq) {
        console.log('bookDirect: Ignoring stale compare response', seq, _compareReqSeq);
        return;
      }

      _lastCompareData = response;

      if (response?.needsDates) {
        showCompareState('no-dates');
        return;
      }

      if (response?.error) {
        console.warn('bookDirect: Compare API error:', response.error, response);

        // Retry once for 'No page context' error (race condition on page load)
        if (response.error.includes('No page context') && !opts._retried) {
          console.log('bookDirect: Retrying after 500ms (waiting for page context)');
          await new Promise(r => setTimeout(r, 500));
          return fetchCompareData(forceRefresh, { ...opts, _retried: true });
        }

        // User-friendly error messages
        let userMessage = 'Unable to compare prices.';
        if (response.error.includes('google_hotels failed')) {
          // Check if it's "no results" vs actual API failure
          const detailsStr = JSON.stringify(response.details || '').toLowerCase();
          if (detailsStr.includes("didn't return any results") || detailsStr.includes('no results')) {
            userMessage = 'Hotel not found in Google Hotels database.';
          } else {
            userMessage = 'Price data temporarily unavailable. Try refreshing.';
          }
        } else if (response.error.includes('Rate limit')) {
          userMessage = 'Too many requests. Please wait a moment.';
        } else if (response.error.includes('No property_token')) {
          userMessage = 'Hotel not found in price database.';
        } else if (response.error.includes('No page context')) {
          userMessage = 'Page not ready. Try refreshing.';
        }

        compareError.textContent = userMessage;
        showCompareState('error');
        updateCompareFooter();
        return;
      }

      renderCompareResults(response);

    } catch (err) {
      console.error('bookDirect: Compare fetch error', err);
      compareError.textContent = 'Unable to check prices.';
      showCompareState('error');
      updateCompareFooter();
    }
  }

  // Refresh button handler with debounce and cooldown
  if (compareRefresh) {
    compareRefresh.addEventListener('click', () => {
      const now = Date.now();
      if (now - _lastCompareClickAt < 1500) return; // 1.5s debounce
      _lastCompareClickAt = now;

      const isExpensive = compareRefresh.dataset.expensive === 'true';
      if (isExpensive) {
        _retryMatchCooldownUntil = Date.now() + 90000; // 90s cooldown
        // Start countdown timer
        if (!_cooldownTimer) {
          _cooldownTimer = setInterval(() => {
            if (Date.now() >= _retryMatchCooldownUntil) {
              clearInterval(_cooldownTimer);
              _cooldownTimer = null;
            }
            updateCompareFooter();
          }, 1000);
        }
      }
      fetchCompareData(isExpensive);
    });
  }

  // Store officialUrl when contact lookup completes
  container.setOfficialUrl = function (url) {
    _officialUrl = url;
    _waitingForOfficialUrl = false;

    // Notify background about the officialUrl
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'SET_OFFICIAL_URL',
        officialUrl: url
      });
    }

    if (!_compareCalledOnce) {
      // First call - with officialUrl
      _compareCalledOnce = true;
      _compareUsedOfficialUrl = true;
      fetchCompareData();
    } else if (!_compareUsedOfficialUrl) {
      // Already called without officialUrl - refresh with it (system refresh bypasses throttle)
      _compareUsedOfficialUrl = true;
      console.log('bookDirect: officialUrl arrived late, refreshing compare');
      fetchCompareData(true, { reason: 'officialUrl_late' });
    }
  };

  // Fallback: if officialUrl not received after 3500ms, call compare anyway
  setTimeout(() => {
    if (_waitingForOfficialUrl && !_compareCalledOnce) {
      console.log('bookDirect: officialUrl timeout (3500ms), calling compare without it');
      _compareCalledOnce = true;
      _compareUsedOfficialUrl = false; // Ran WITHOUT officialUrl - may need upgrade later
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

        // LIVE RECOMPUTE: Schedule debounced re-render with updated baseline
        scheduleCompareRerender();
      }
    }
  };

  container.updateDetails = function (details) {
    _roomDetails = details;
  };

  // Update structured room selection (for room-aware matching)
  container.updateSelectedRooms = function (rooms) {
    _selectedRooms = Array.isArray(rooms) ? rooms : [];
    // Schedule debounced re-render with new room context
    scheduleCompareRerender();
  };

  return container;
};
