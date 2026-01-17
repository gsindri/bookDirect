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

  // ========================================
  // ESCAPE HELPERS (XSS prevention)
  // ========================================
  const _ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function escHtml(s) { return String(s ?? "").replace(/[&<>"']/g, ch => _ESC_MAP[ch]); }
  function escAttr(s) { return escHtml(s).replace(/`/g, "&#96;"); }
  function safeClassToken(s) { return String(s ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, ""); }
  function safeHttpUrl(raw) {
    try {
      const u = new URL(String(raw));
      if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    } catch { }
    return null;
  }

  // Internal state
  let _hotelName = hotelName;
  let _price = price;
  let _priceState = 'unknown'; // selected_total | sidebar_total | from_price | unknown
  let _priceNumber = null; // Parsed numeric value of viewing price
  let _priceTaxState = 'unknown'; // F6: Tax state (included | excluded | unknown)
  let _roomDetails = '';
  let _foundEmail = ''; // Discovered email from hotel website
  let _bookDirectUrl = null; // Best URL for Book Direct button
  let _bookDirectUrlSource = null; // 'hotelDetails' | 'compareOffer' | 'compareProperty'
  let _selectedRooms = []; // Structured room selection: [{ name, count }]
  let _activePanel = null; // null | 'direct' | 'prices' - UI state for two-panel progressive disclosure

  // Chip status states
  let _directStatus = 'idle'; // 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  let _compareStatus = 'idle'; // 'idle' | 'loading' | 'ready' | 'noDates' | 'error'
  let _directPulsed = false; // Prevent re-pulsing
  let _comparePulsed = false; // Prevent re-pulsing
  let _onCompareDataChange = null; // Callback when compare data changes (for controller sync)

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
      /* ========================================
         BRAND COLOR SYSTEM
         Distinct from Booking.com (indigo vs blue)
         ======================================== */
      :host {
        --bd-accent: #6366f1;           /* Indigo 500 - primary accent */
        --bd-accent-dark: #4f46e5;      /* Indigo 600 - hover/active */
        --bd-accent-light: #a5b4fc;     /* Indigo 300 - subtle highlights */
        --bd-surface: #ffffff;
        --bd-text: #1f2937;
        --bd-muted: #6b7280;
        --bd-success: #059669;          /* Green for savings */
        --bd-success-light: rgba(5, 150, 105, 0.1);
        --bd-border: rgba(0, 0, 0, 0.08);
        --bd-border-strong: rgba(0, 0, 0, 0.15);
      }

      /* 1. Base Container: Modern & Clean */
      .container {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: var(--bd-surface);
        color: var(--bd-text);
        padding: 24px;
        border-radius: 16px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        border: 1px solid var(--bd-border);
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

      /* 4. Primary Button: Premium styling with indigo accent */
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
        background: var(--bd-accent);
        color: #fff;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.01em;
        white-space: nowrap;
        cursor: pointer;
        box-shadow:
          0 10px 18px rgba(99, 102, 241, 0.25),
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

      /* I9: Why this match link */
      .why-match-link {
        display: inline-block;
        margin-top: 6px;
        font-size: 11px;
        color: #0066cc;
        text-decoration: underline;
        cursor: pointer;
        font-weight: 500;
      }
      .why-match-link:hover {
        color: #003580;
      }

      /* I9: Why this match modal */
      .why-match-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .why-match-modal {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        max-width: 400px;
        width: 100%;
        max-height: 80vh;
        overflow-y: auto;
        padding: 20px;
        font-size: 13px;
        color: #1e293b;
      }
      .why-match-modal h3 {
        margin: 0 0 12px;
        font-size: 16px;
        font-weight: 600;
        color: #0f172a;
      }
      .why-match-modal .meta-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        border-bottom: 1px solid #f1f5f9;
      }
      .why-match-modal .meta-label {
        color: #64748b;
        font-size: 11px;
      }
      .why-match-modal .meta-value {
        font-weight: 500;
        text-align: right;
      }
      .why-match-modal .confidence-high { color: #0a8a1f; }
      .why-match-modal .confidence-likely { color: #d97706; }
      .why-match-modal .confidence-uncertain { color: #dc2626; }
      .why-match-modal .candidate-list {
        margin: 12px 0;
        padding: 0;
        list-style: none;
      }
      .why-match-modal .candidate-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
        border-bottom: 1px solid #f1f5f9;
        font-size: 12px;
      }
      .why-match-modal .candidate-rank {
        font-weight: 700;
        color: #94a3b8;
        min-width: 20px;
      }
      .why-match-modal .candidate-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .why-match-modal .candidate-conf {
        font-size: 11px;
        color: #64748b;
      }
      .why-match-modal .domain-badge {
        background: #dcfce7;
        color: #166534;
        font-size: 9px;
        padding: 2px 5px;
        border-radius: 4px;
        font-weight: 600;
      }
      .why-match-modal .skipped-summary {
        font-size: 11px;
        color: #94a3b8;
        margin: 8px 0;
      }
      .why-match-modal .modal-actions {
        display: flex;
        gap: 8px;
        margin-top: 16px;
      }
      .why-match-modal .btn-retry {
        flex: 1;
        padding: 8px 12px;
        background: #003580;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .why-match-modal .btn-retry:hover {
        background: #00264d;
      }
      .why-match-modal .btn-close {
        padding: 8px 12px;
        background: #f1f5f9;
        color: #475569;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
      }
      .why-match-modal .btn-close:hover {
        background: #e2e8f0;
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

      .selection-prompt {
        font-size: 11px;
        color: #64748b;
        margin-top: 4px;
        font-style: italic;
      }

      .potential-savings {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 10px;
        padding: 10px 12px;
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.04));
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        color: #2563eb;
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

      /* Two-button CTA grid */
      .cta-grid {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }
      .cta-grid.two-col {
        grid-template-columns: 1fr 1fr;
      }

      /* Panel styling (progressive disclosure containers) */
      .panel {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(0,0,0,0.06);
        animation: panelSlideIn 0.2s ease-out;
      }
      @keyframes panelSlideIn {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Active button indicator */
      .btn-primary.is-active,
      .btn-secondary.is-active {
        box-shadow: inset 0 0 0 2px #003580;
      }

      /* Panel back/close link */
      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .panel-title {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #64748b;
      }
      .panel-close {
        font-size: 11px;
        color: #94a3b8;
        cursor: pointer;
        transition: color 0.15s;
      }
      .panel-close:hover {
        color: var(--bd-accent);
        text-decoration: underline;
      }

      /* ========================================
         STATUS CHIPS (inside buttons)
         ======================================== */
      .btn-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: background 0.2s, color 0.2s;
      }

      /* Chip on primary button (light on dark) */
      .btn-primary .btn-chip {
        background: rgba(255,255,255,0.2);
        color: #fff;
      }

      /* Chip on secondary button (accent on white) */
      .btn-secondary .btn-chip {
        background: var(--bd-success-light);
        color: var(--bd-success);
      }

      .btn-secondary .btn-chip.loading {
        background: rgba(99, 102, 241, 0.1);
        color: var(--bd-accent);
      }

      /* Chip spinner */
      .btn-chip .chip-spinner {
        width: 10px;
        height: 10px;
        border: 1.5px solid currentColor;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      /* ========================================
         PULSE ANIMATION (value discovered)
         ======================================== */
      @keyframes bd-pulse {
        0% { box-shadow: 0 0 0 0 var(--bd-accent); }
        70% { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
        100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
      }

      .btn-pulse {
        animation: bd-pulse 1.2s ease-out;
      }

      @media (prefers-reduced-motion: reduce) {
        .btn-pulse { animation: none; }
      }

      /* ========================================
         RESPONSIVE BREAKPOINTS
         Compact: < 340px, Ultra-compact: < 290px
         ======================================== */
      :host(.bd-compact) .price-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }

      :host(.bd-compact) .price-label {
        font-size: 11px;
      }

      :host(.bd-compact) .hotel-name {
        font-size: 22px;
      }

      :host(.bd-ultra-compact) .hotel-name {
        font-size: 20px;
        -webkit-line-clamp: 2;
      }

      :host(.bd-ultra-compact) .price-label {
        display: none;
      }

      /* Buttons always full width, with flexible content */
      .cta-grid {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 16px;
      }

      .cta-grid button,
      .cta-grid .btn-primary,
      .cta-grid .btn-secondary {
        width: 100%;
        justify-content: space-between;
        padding: 0 16px;
      }

      .cta-grid .btn-label {
        flex: 0 0 auto;
      }

      /* ========================================
         PLACEMENT-SPECIFIC STYLING
         Styles differ for overlay vs docked modes
         ======================================== */
      :host([data-bd-placement="overlay"]) .container {
        box-shadow: 
          0 20px 40px rgba(0, 0, 0, 0.15),
          0 4px 12px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--bd-accent-light);
      }

      :host([data-bd-placement="button"]) .container,
      :host([data-bd-placement="rail"]) .container {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        border: 1px solid var(--bd-border-strong);
      }

      /* ========================================
         MINIMIZE/EXPAND PANEL UI (Phase 2)
         ======================================== */
      .header {
        position: relative;
      }

      .header-controls {
        position: absolute;
        top: 4px;
        right: 4px;
        display: flex;
        gap: 4px;
      }

      .header-btn {
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(0, 0, 0, 0.05);
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #6b7280;
        transition: background 120ms ease, color 120ms ease;
      }

      .header-btn:hover {
        background: rgba(0, 0, 0, 0.1);
        color: #374151;
      }

      .header-btn.pinned {
        background: var(--bd-accent-light);
        color: var(--bd-accent);
      }

      .header-btn svg {
        width: 16px;
        height: 16px;
      }

      /* Minimized panel state */
      :host([data-bd-panel-state="minimized"]) .content {
        display: none;
      }

      :host([data-bd-panel-state="minimized"]) .container {
        padding: 10px 16px;
      }

      :host([data-bd-panel-state="minimized"]) .header {
        padding-bottom: 0;
        margin-bottom: 0;
      }

      :host([data-bd-panel-state="minimized"]) .header::after {
        display: none;
      }

      :host([data-bd-panel-state="minimized"]) .logo {
        font-size: 13px;
      }

      :host([data-bd-panel-state="minimized"]) .header-controls {
        position: static;
        margin-left: auto;
      }

      :host([data-bd-panel-state="minimized"]) .header {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      /* Minimized state transition */
      .container {
        transition: padding 180ms ease;
      }

      .content {
        transition: opacity 120ms ease;
      }

      @media (prefers-reduced-motion: reduce) {
        .container, .content {
          transition: none;
        }
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
            <div class="header-controls">
              <button id="btn-pin" class="header-btn" title="Keep panel expanded">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 4a1 1 0 0 1 1 1v4.586l1.707 1.707a1 1 0 0 1 .293.707v2a1 1 0 0 1-1 1h-4v6l-1 2-1-2v-6H8a1 1 0 0 1-1-1v-2a1 1 0 0 1 .293-.707L9 9.586V5a1 1 0 0 1 1-1h6Z"/>
                </svg>
              </button>
              <button id="btn-minimize" class="header-btn" title="Minimize panel">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path fill-rule="evenodd" d="M5.25 12a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5H6a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd"/>
                </svg>
              </button>
            </div>
            </div>
            <div class="content">
            <!-- Hotel Name (Hero) -->
            <div class="hotel-name" id="bd-hotel-name"></div>
            
            <!-- Price (Hero) -->
            <div class="price-row">
              <span id="price-label" class="price-label" title="Booking.com price you're viewing">Booking.com (viewing)</span>
              <span class="price-value" id="price-display"></span>
            </div>
            
            <!-- Error Tooltip -->
            <div id="error-tooltip" class="error-tooltip">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:16px;">⚠️</span>
                    <span>Please select rooms in the table first.</span>
                </div>
            </div>

            <!-- Two-button CTA grid (always visible) -->
            <div class="cta-grid" id="cta-grid">
              <button id="btn-open-direct" class="btn-primary">
                <span class="btn-label">Book direct</span>
                <span id="chip-direct" class="btn-chip" style="display:none;"></span>
              </button>
              <button id="btn-open-prices" class="btn-secondary">
                <span class="btn-label">Find lowest price</span>
                <span id="chip-prices" class="btn-chip" style="display:none;"></span>
              </button>
            </div>

            <!-- Panel: Direct options (hidden by default) -->
            <section id="panel-direct" class="panel" style="display:none;">
              <div class="panel-header">
                <span class="panel-title">Direct Booking Options</span>
                <span id="panel-direct-close" class="panel-close">Close ✕</span>
              </div>
              
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
            </section>
            
            <!-- Panel: Prices comparison (hidden by default) -->
            <section id="panel-prices" class="panel" style="display:none;">
              <div class="panel-header">
                <span class="panel-title">Prices Found</span>
                <span id="panel-prices-close" class="panel-close">Close ✕</span>
              </div>
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
            </section>
            
            <div id="toast" class="toast">Screenshot copied! Paste it in your email.</div>
            </div>
        </div>
      </div>
    `;

  shadowRoot.innerHTML = `<style>${baseStyle}${commonStyle}</style>${html}`;

  // ========================================
  // PANEL TOGGLE LOGIC (Two-button progressive disclosure)
  // ========================================
  const panelDirect = shadowRoot.getElementById('panel-direct');
  const panelPrices = shadowRoot.getElementById('panel-prices');
  const btnOpenDirect = shadowRoot.getElementById('btn-open-direct');
  const btnOpenPrices = shadowRoot.getElementById('btn-open-prices');
  const panelDirectClose = shadowRoot.getElementById('panel-direct-close');
  const panelPricesClose = shadowRoot.getElementById('panel-prices-close');

  function setActivePanel(next) {
    _activePanel = (next === _activePanel) ? null : next; // Toggle behavior
    updatePanelVisibility();
  }

  function updatePanelVisibility() {
    // Show/hide panels
    if (panelDirect) panelDirect.style.display = (_activePanel === 'direct') ? 'block' : 'none';
    if (panelPrices) panelPrices.style.display = (_activePanel === 'prices') ? 'block' : 'none';

    // Update button active states
    if (btnOpenDirect) btnOpenDirect.classList.toggle('is-active', _activePanel === 'direct');
    if (btnOpenPrices) btnOpenPrices.classList.toggle('is-active', _activePanel === 'prices');

    // If prices panel just opened and we have data, ensure it's rendered
    if (_activePanel === 'prices' && _lastCompareData) {
      renderCompareResults(_lastCompareData);
    }
  }

  // Bind CTA button clicks
  if (btnOpenDirect) {
    btnOpenDirect.onclick = () => setActivePanel('direct');
  }
  if (btnOpenPrices) {
    btnOpenPrices.onclick = () => setActivePanel('prices');
  }

  // Bind panel close buttons
  if (panelDirectClose) {
    panelDirectClose.onclick = () => setActivePanel(null);
  }
  if (panelPricesClose) {
    panelPricesClose.onclick = () => setActivePanel(null);
  }

  // ========================================
  // MINIMIZE/EXPAND/PIN PANEL CONTROLS (Phase 2)
  // ========================================
  const btnMinimize = shadowRoot.getElementById('btn-minimize');
  const btnPin = shadowRoot.getElementById('btn-pin');
  let _panelState = 'expanded'; // 'expanded' | 'minimized' | 'pinned'
  let _controllerPanelStateCallback = null; // Callback to notify controller

  function updatePanelStateUI() {
    // Update host attribute for CSS
    container.dataset.bdPanelState = _panelState === 'pinned' ? 'expanded' : _panelState;

    // Update pin button visual
    if (btnPin) {
      btnPin.classList.toggle('pinned', _panelState === 'pinned');
      btnPin.title = _panelState === 'pinned' ? 'Unpin panel' : 'Pin panel (stay expanded)';
    }

    // Update minimize button icon based on state
    if (btnMinimize) {
      if (_panelState === 'minimized') {
        btnMinimize.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M11.47 7.72a.75.75 0 0 1 1.06 0l7.5 7.5a.75.75 0 1 1-1.06 1.06L12 9.31l-6.97 6.97a.75.75 0 0 1-1.06-1.06l7.5-7.5Z" clip-rule="evenodd"/>
          </svg>`;
        btnMinimize.title = 'Expand panel';
      } else {
        btnMinimize.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M5.25 12a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5H6a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd"/>
          </svg>`;
        btnMinimize.title = 'Minimize panel';
      }
    }
  }

  function setPanelState(newState, fromController = false) {
    if (!['expanded', 'minimized', 'pinned'].includes(newState)) return;
    _panelState = newState;
    updatePanelStateUI();

    // Notify controller if state changed from UI
    if (!fromController && _controllerPanelStateCallback) {
      _controllerPanelStateCallback(newState);
    }
    console.log('[bookDirect][panel] State changed to:', newState);
  }

  // Minimize button toggles between minimized ↔ expanded
  if (btnMinimize) {
    btnMinimize.onclick = () => {
      if (_panelState === 'minimized') {
        setPanelState('expanded');
      } else if (_panelState === 'expanded') {
        setPanelState('minimized');
      }
      // If pinned, minimize button unpins and minimizes
      else if (_panelState === 'pinned') {
        setPanelState('minimized');
      }
    };
  }

  // Pin button toggles pinned state
  if (btnPin) {
    btnPin.onclick = () => {
      if (_panelState === 'pinned') {
        setPanelState('expanded');
      } else {
        setPanelState('pinned');
      }
    };
  }

  /**
   * Called by controller to programmatically minimize panel
   * (e.g., when inline appears and panel should auto-minimize)
   */
  function minimizeIfNotPinned() {
    if (_panelState !== 'pinned') {
      setPanelState('minimized', true);
    }
  }

  /**
   * Called by controller to programmatically expand panel
   * (e.g., when inline hides and panel should restore)
   */
  function expandIfMinimized() {
    if (_panelState === 'minimized') {
      setPanelState('expanded', true);
    }
  }

  /**
   * Register a callback to notify controller of panel state changes
   */
  function setPanelStateCallback(cb) {
    _controllerPanelStateCallback = typeof cb === 'function' ? cb : null;
  }

  // ========================================
  // CHIP UPDATE HELPERS
  // ========================================
  const chipDirect = shadowRoot.getElementById('chip-direct');
  const chipPrices = shadowRoot.getElementById('chip-prices');

  /**
   * Update the direct button chip
   * @param {{ text: string, loading?: boolean }} opts
   */
  function updateDirectChip({ text, loading = false }) {
    if (!chipDirect) return;
    if (!text) {
      chipDirect.style.display = 'none';
      return;
    }
    chipDirect.style.display = 'inline-flex';
    chipDirect.classList.toggle('loading', loading);
    chipDirect.innerHTML = loading
      ? `<span class="chip-spinner"></span>${escHtml(text)}`
      : escHtml(text);
  }

  /**
   * Update the prices button chip
   * @param {{ text: string, loading?: boolean, isSavings?: boolean }} opts
   */
  function updatePricesChip({ text, loading = false, isSavings = false }) {
    if (!chipPrices) return;
    if (!text) {
      chipPrices.style.display = 'none';
      return;
    }
    chipPrices.style.display = 'inline-flex';
    chipPrices.classList.toggle('loading', loading);
    // Green chip for savings, accent for loading
    if (isSavings) {
      chipPrices.style.background = 'var(--bd-success-light)';
      chipPrices.style.color = 'var(--bd-success)';
    } else if (loading) {
      chipPrices.style.background = 'rgba(99, 102, 241, 0.1)';
      chipPrices.style.color = 'var(--bd-accent)';
    } else {
      chipPrices.style.cssText = ''; // Reset to default
      chipPrices.style.display = 'inline-flex';
    }
    chipPrices.innerHTML = loading
      ? `<span class="chip-spinner"></span>${escHtml(text)}`
      : escHtml(text);
  }

  /**
   * Trigger pulse animation on a button (once per page load)
   * @param {'direct' | 'prices'} which
   */
  function pulseOnce(which) {
    const btn = which === 'direct' ? btnOpenDirect : btnOpenPrices;
    const pulsedFlag = which === 'direct' ? '_directPulsed' : '_comparePulsed';
    if (!btn) return;

    // Check if already pulsed
    if (which === 'direct' && _directPulsed) return;
    if (which === 'prices' && _comparePulsed) return;

    // Check prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    btn.classList.add('btn-pulse');
    setTimeout(() => btn.classList.remove('btn-pulse'), 1200);

    // Mark as pulsed
    if (which === 'direct') _directPulsed = true;
    else _comparePulsed = true;
  }

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

  // Format price with separate currency and amount (DOM-based, XSS-safe)
  const priceDisplay = shadowRoot.getElementById('price-display');
  if (priceDisplay && _price) {
    // Parse currency and amount from price string (e.g., "ISK 67,730" or "€ 450")
    const priceStr = _price.trim();
    const match = priceStr.match(/^([A-Z]{2,3}|[€$£¥₹])\s*(.+)$/i) ||
      priceStr.match(/^(.+?)\s*([A-Z]{2,3})$/i);

    priceDisplay.textContent = "";
    if (match) {
      const [, currency, amount] = match;
      const cur = document.createElement("span");
      cur.className = "price-currency";
      cur.textContent = currency;
      const amt = document.createElement("span");
      amt.className = "price-amount";
      amt.textContent = amount;
      priceDisplay.append(cur, amt);
    } else {
      // Fallback: just style the whole thing as amount
      const amt = document.createElement("span");
      amt.className = "price-amount";
      amt.textContent = priceStr;
      priceDisplay.append(amt);
    }
  }

  // ========================================
  // RESPONSIVE BREAKPOINT OBSERVER
  // ========================================
  const hostWrapper = shadowRoot.querySelector('.host-wrapper');
  const bdContainerEl = shadowRoot.querySelector('.container');

  function updateResponsiveMode(width) {
    // Note: we add classes to the container's host (the custom element)
    // The :host() selector in CSS will match these
    const host = container; // The outer container element

    host.classList.remove('bd-compact', 'bd-ultra-compact');

    if (width < 290) {
      host.classList.add('bd-ultra-compact');
    } else if (width < 340) {
      host.classList.add('bd-compact');
    }
  }

  // Observe container width changes
  if (bdContainerEl && typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        updateResponsiveMode(width);
      }
    });
    resizeObserver.observe(bdContainerEl);
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

    // Check-in (safe DOM construction - no innerHTML with dynamic values)
    const col1 = document.createElement('div');
    col1.style.cssText = 'flex:1; border-right:1px solid #e7e7e7; padding-right:12px;';
    const col1Label = document.createElement('div');
    col1Label.style.cssText = 'font-size:12px; color:#595959; margin-bottom:4px;';
    col1Label.textContent = 'Check-in';
    const col1Value = document.createElement('div');
    col1Value.style.cssText = 'font-weight:700; color:#1a1a1a; font-size:14px;';
    col1Value.textContent = checkIn;
    col1.appendChild(col1Label);
    col1.appendChild(col1Value);

    // Check-out (safe DOM construction - no innerHTML with dynamic values)
    const col2 = document.createElement('div');
    col2.style.cssText = 'flex:1; padding-left:12px;';
    const col2Label = document.createElement('div');
    col2Label.style.cssText = 'font-size:12px; color:#595959; margin-bottom:4px;';
    col2Label.textContent = 'Check-out';
    const col2Value = document.createElement('div');
    col2Value.style.cssText = 'font-weight:700; color:#1a1a1a; font-size:14px;';
    col2Value.textContent = checkOut;
    col2.appendChild(col2Label);
    col2.appendChild(col2Value);

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
      Logger.debug('[debug] Highlight/bubble disabled via DEBUG_FLAGS');
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
      Logger.debug('[debug] scrollIntoView disabled via DEBUG_FLAGS');
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
              Logger.debug('[debug] Date grid injection disabled via DEBUG_FLAGS');
            }

            // STEP D: Wait for scroll, then capture
            setTimeout(() => {
              try {
                const rect = sidebarEl ? sidebarEl.getBoundingClientRect() : null;

                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    // Safety timeout
                    const safetyTimeout = setTimeout(() => {
                      Logger.warn('Screenshot safety timeout - forcing cleanup');
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

                    chrome.runtime.sendMessage({ type: BookDirect.Contracts.MSG_ACTION_CAPTURE_VISIBLE_TAB }, async (response) => {
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
        Logger.debug('[debug] Screenshot disabled via DEBUG_FLAGS');
        showToast();
        return;
      }

      await captureAndCopyScreenshot();
      showToast();
    } catch (e) {
      Logger.error('Screenshot copy failed:', e.message || e.name || String(e));

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

      // Set direct chip to loading state
      _directStatus = 'loading';
      updateDirectChip({ text: 'Finding…', loading: true });

      // Helper to render buttons from data (Ghost Logic)
      const renderButtons = (data) => {
        const directDealSection = shadowRoot.getElementById('panel-direct');
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
          Logger.info('Found email:', _foundEmail);
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

        // Phone link: Show only if phone exists (DOM-based, XSS-safe)
        if (data.phone) {
          const phoneLink = document.createElement('a');
          phoneLink.className = 'phone-link';
          // Sanitize href: only allow digits and basic phone chars
          const sanitizedPhone = String(data.phone).replace(/[^\d+\-()\s]/g, '');
          phoneLink.href = `tel:${sanitizedPhone.replace(/\s/g, '')}`;
          // Use innerHTML for static SVG only, then add text via DOM
          phoneLink.innerHTML = `<svg class="bd-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="color: #003580;" aria-hidden="true"><path fill-rule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clip-rule="evenodd" /></svg> <span class="bd-phone"></span>`;
          // Set phone text via textContent (safe from injection)
          const phoneSpan = phoneLink.querySelector('.bd-phone');
          if (phoneSpan) phoneSpan.textContent = data.phone;
          dynamicContainer.appendChild(phoneLink);
          hasAnyData = true;
        }

        // GHOST LOGIC: Track if we have direct data (but don't auto-display panel)
        // Panel visibility is now controlled by _activePanel via setActivePanel()
        // We just need to ensure the content EXISTS inside the panel for when user opens it
        // No auto-display - panel stays hidden until user clicks "Book direct"

        // Update direct chip based on what we found
        if (hasAnyData) {
          _directStatus = 'ready';
          // Determine best chip text
          let chipText = '';
          const hasWebsite = !!data.website;
          const hasEmail = !!data.found_email;
          const hasPhone = !!data.phone;
          const optionCount = [hasWebsite, hasEmail, hasPhone].filter(Boolean).length;

          if (optionCount > 1) {
            chipText = `${optionCount} options`;
          } else if (hasWebsite) {
            chipText = 'Official site';
          } else if (hasEmail) {
            chipText = 'Email ready';
          } else if (hasPhone) {
            chipText = 'Phone only';
          }

          updateDirectChip({ text: chipText, loading: false });
          pulseOnce('direct');
        } else {
          _directStatus = 'empty';
          updateDirectChip({ text: '', loading: false }); // Hide chip if nothing found
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
            Logger.debug('Using cached hotel data (age:', Math.round(age / 86400000), 'days)');
            renderButtons(data);
            return; // Done! No API call needed.
          }
        }
      }

      // STEP C (MISS): Call API via background (avoids CORS)
      Logger.debug('Cache miss, fetching from API via background...');

      let data = null;
      try {
        data = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: BookDirect.Contracts.MSG_GET_HOTEL_DETAILS,
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
        Logger.warn('Hotel details fetch failed:', e.message);
        _directStatus = 'error';
        updateDirectChip({ text: '', loading: false });
        return; // Fail silently
      }

      if (!data || data.error) {
        Logger.warn('Hotel details response error:', data?.error);
        _directStatus = 'empty';
        updateDirectChip({ text: '', loading: false });
        return; // Fail silently
      }

      // Save to cache with timestamp
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [cacheKey]: { data, timestamp: Date.now() } });
        Logger.debug('Cached hotel data for', _hotelName);
      }

      renderButtons(data);

    } catch (e) {
      // Fail silently - don't show errors to user
      Logger.warn('Hotel details fetch failed (silent):', e.message);
      _directStatus = 'error';
      updateDirectChip({ text: '', loading: false }); // Hide chip on error
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
  let _sanityState = null;          // { severity, reasons, message, stats } or null
  let _integrityAssessment = null;  // Output from assessComparisonIntegrity()
  let _autoVerifyDone = false;      // Guard for auto-verify on price anomaly
  let _autoSmartRetryDone = false;  // Guard for auto-retry on uncertain match

  // Debounced rerender for room/price changes (avoids rapid fire during room selection)
  function scheduleCompareRerender() {
    if (!_lastCompareData || !compareResults) return;
    if (_compareInFlight) return; // Don't rerender during fetch

    if (_compareRerenderTimer) clearTimeout(_compareRerenderTimer);
    _compareRerenderTimer = setTimeout(() => {
      try {
        renderCompareResults(_lastCompareData);
        Logger.debug('Debounced rerender complete');
      } catch (e) {
        Logger.error('Rerender error', e);
      }
    }, BookDirect.Contracts.COMPARE_RERENDER_DEBOUNCE_MS);
  }

  // Get DOM elements for compare section (now inside panel-prices)
  const compareSection = shadowRoot.getElementById('panel-prices');
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

    // Toggle two-column CTA grid based on width
    const ctaGrid = shadowRoot.getElementById('cta-grid');
    if (ctaGrid) {
      ctaGrid.classList.toggle('two-col', width >= 320);
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

  // ========================================
  // MONEY PARSING + FORMATTING
  // ========================================
  const ZERO_DECIMAL_CURRENCIES = new Set(["ISK", "JPY", "KRW", "VND", "CLP"]);

  // Helper: Format price with currency (uses NBSP to prevent line breaks)
  // Shows decimals for USD/EUR/GBP, none for ISK/JPY/KRW
  function formatComparePrice(total, currency) {
    if (total == null || !Number.isFinite(total)) return '—';
    const c = (currency || "").trim().toUpperCase();
    const maxFrac = ZERO_DECIMAL_CURRENCIES.has(c) ? 0 : 2;
    const formatted = Number(total).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFrac
    });
    return c ? `${c}\u00A0${formatted}` : formatted;
  }

  // Helper: Parse price string to number (locale-aware, handles decimals correctly)
  // Handles: "$1,234.56" -> 1234.56, "€ 1.234,56" -> 1234.56, "ISK 25,103" -> 25103
  // Use shared money parsing from BookDirect.Money (loaded from money.global.js)
  const parseMoneyToNumber = BookDirect.Money.parseMoneyToNumber;

  // Infer currency code from price string (e.g., "$1,234" → "USD", "€500" → "EUR")
  function inferCurrencyFromPrice(priceStr) {
    if (!priceStr) return null;
    const s = String(priceStr).trim();
    // Symbol map (common currencies)
    const SYMBOL_MAP = {
      '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR',
      'kr': 'ISK', '₩': 'KRW', '฿': 'THB', 'R$': 'BRL', 'zł': 'PLN'
    };
    for (const [sym, code] of Object.entries(SYMBOL_MAP)) {
      if (s.startsWith(sym) || s.includes(sym)) return code;
    }
    // Try code prefix (e.g., "USD 1,234" or "ISK 25,000")
    const codeMatch = s.match(/^([A-Z]{3})\s/i);
    if (codeMatch) return codeMatch[1].toUpperCase();
    return null;
  }

  // ========================================
  // PRICE SANITY LAYER
  // Detects "too good to be true" price differences
  // ========================================
  function computePriceSanity({
    viewingTotal,       // parsed number from _price
    viewingCurrency,    // inferred from _price (may be null)
    apiCurrency,        // data.query.currency
    nights,             // data.nights
    displayTotal,       // best comparison total
    displayHasGate,     // Member/Login/Mobile
    isRoomMatched,      // selectionCheapest exists
    totalSelectedRooms, // from mergedSelections
    bookingOfferTotal,  // data.bookingOffer?.total
  }) {
    const reasons = [];
    const stats = {};

    // --- 2A) Currency mismatch (highest priority) ---
    if (viewingCurrency && apiCurrency &&
      viewingCurrency.toUpperCase() !== apiCurrency.toUpperCase()) {
      return {
        severity: 'block',
        reasons: ['currency_mismatch'],
        stats: { viewingCurrency, apiCurrency },
        message: 'Prices appear to be in different currencies — refresh after switching currency.'
      };
    }

    // --- 2B) Per-night vs total baseline mistake ---
    if (nights >= 2 && Number.isFinite(viewingTotal) && Number.isFinite(bookingOfferTotal) && bookingOfferTotal > 0) {
      const multiplied = viewingTotal * nights;
      const ratio = multiplied / bookingOfferTotal;
      // If viewing * nights ≈ bookingOffer, the viewing price is likely per-night
      if (ratio >= 0.85 && ratio <= 1.15) {
        return {
          severity: 'block',
          reasons: ['baseline_per_night_suspect'],
          stats: { viewingTotal, multiplied, bookingOfferTotal, ratio, nights },
          message: 'Booking price looks like per-night, not total — select rooms to compare totals.'
        };
      }
    }

    // --- 2C) Room-selection mismatch ---
    if (totalSelectedRooms > 0 && !isRoomMatched) {
      reasons.push('room_selection_unmatched');
    }

    // --- 2D) Gated deals - treat as warn, don't suppress prices ---
    if (displayHasGate) {
      return {
        severity: 'warn',
        reasons: ['gated_rate'],
        stats: {},
        message: 'Cheapest price may require membership/login/mobile.'
      };
    }

    // --- 2E) Huge savings anomaly ---
    if (Number.isFinite(viewingTotal) && Number.isFinite(displayTotal) &&
      viewingTotal > 0 && displayTotal > 0 && displayTotal < viewingTotal) {
      const savingsAbs = viewingTotal - displayTotal;
      const savingsPct = savingsAbs / viewingTotal;
      const ccy = (apiCurrency || 'USD').toUpperCase();

      stats.savingsAbs = savingsAbs;
      stats.savingsPct = savingsPct;
      stats.ratio = viewingTotal / displayTotal;

      // Absolute thresholds scaled by currency and nights
      const ABS_WARN = { USD: 80, EUR: 80, GBP: 80, ISK: 8000, JPY: 9000, KRW: 90000 };
      const ABS_BLOCK = { USD: 150, EUR: 150, GBP: 150, ISK: 15000, JPY: 17000, KRW: 170000 };

      function scaledAbs(map, n) {
        const base = map[ccy] ?? 80;
        const clampedNights = Math.max(1, Math.min(14, n || 1));
        return base * Math.max(1, clampedNights / 2);
      }

      const absWarn = scaledAbs(ABS_WARN, nights);
      const absBlock = scaledAbs(ABS_BLOCK, nights);

      // Block: ≥65% savings AND above block threshold
      if (savingsPct >= 0.65 && savingsAbs >= absBlock) {
        return {
          severity: 'block',
          reasons: [...reasons, 'huge_savings_anomaly'],
          stats,
          message: 'Huge difference detected — likely not like-for-like. Retry matching.'
        };
      }

      // Warn: ≥45% savings AND above warn threshold
      if (savingsPct >= 0.45 && savingsAbs >= absWarn) {
        return {
          severity: 'warn',
          reasons: [...reasons, 'large_savings_anomaly'],
          stats,
          message: 'Unusually large difference — check room type, cancellation, and taxes.'
        };
      }
    }

    // Room selection unmatched as standalone warn
    if (reasons.includes('room_selection_unmatched')) {
      return {
        severity: 'warn',
        reasons,
        stats: { totalSelectedRooms },
        message: "We couldn't match your selected room(s) across sites — prices may be for different rooms."
      };
    }

    return null; // No sanity issues
  }

  // --- ROOM MATCHING HELPERS (for like-for-like comparison) ---

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

  // Merge duplicate room selections by normalized name
  function mergeSelections(selections) {
    const map = new Map();
    for (const s of selections) {
      const key = normalizeRoomName(s.name);
      if (!key) continue;
      const prev = map.get(key);
      if (prev) prev.count += s.count;
      else map.set(key, { ...s });
    }
    return [...map.values()];
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
    const roomBadges = new Set(); // Collect badges from matched rooms

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

      // Collect room-level badges (membership flags from room URL)
      if (Array.isArray(m.room.badges)) {
        for (const b of m.room.badges) roomBadges.add(b);
      }
    }

    const link = matched.length === 1 ? matched[0].link : offer.link;
    // Merge room badges with offer badges (room badges take precedence for room-matched display)
    const badges = [...new Set([...roomBadges, ...(offer.badges || [])])];
    return { total, matched, link, badges };
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
          link: calc.link,
          badges: calc.badges // Room-matched badges (from room URLs)
        };
      }
    }

    return best;
  }

  // ========================================
  // COMPARISON INTEGRITY ENGINE
  // Centralizes all integrity decisions for comparison display
  // ========================================
  /**
   * Assess comparison integrity and compute UI policy.
   * This is the heart of the Integrity Layer - it prevents misleading claims.
   * 
   * @param {Object} params - Input parameters
   * @param {Object} params.compareData - Worker response
   * @param {Object} params.bookingMeta - {total, currency, priceState, taxState}
   * @param {Array} params.mergedSelections - Merged room selections
   * @param {Object|null} params.selectionCheapest - Room-matched cheapest
   * @returns {Object} Integrity assessment with uiPolicy
   */
  function assessComparisonIntegrity({
    compareData,
    bookingMeta,
    mergedSelections = [],
    selectionCheapest = null,
  }) {
    const reasons = [];
    const data = compareData || {};
    const match = data.match || {};
    const offers = Array.isArray(data.offers) ? data.offers : [];

    // --- B2: Server-first mismatch detection ---
    const matchDetails = match.matchDetails || {};
    const confidence = match.confidence ?? 1;
    const serverHardMismatch = !!matchDetails.hardMismatch;
    const serverUncertain = !!(match.matchUncertain || data.matchUncertain);
    const lowConfidence = confidence < 0.40;

    // Determine mismatch level
    let integrityLevel = 'confirmed';
    if (serverHardMismatch) {
      integrityLevel = 'mismatch';
      reasons.push('match_hard_mismatch');
    } else if (serverUncertain || lowConfidence) {
      integrityLevel = (lowConfidence && confidence < 0.30) ? 'uncertain' : 'likely';
      if (serverUncertain) reasons.push('match_uncertain_flag');
      if (lowConfidence) reasons.push('match_low_confidence');
    }

    // --- D4: Room parity ---
    const totalSelectedRooms = mergedSelections.reduce((s, r) => s + (r.count || 0), 0);
    let roomParityState = 'none_selected';
    if (totalSelectedRooms > 0) {
      if (selectionCheapest) {
        roomParityState = 'matched';
      } else {
        // Check for partial match: any selected room matchable anywhere?
        let matchedRoomTypes = 0;
        const ROOM_MATCH_THRESHOLD = 0.30;
        for (const sel of mergedSelections) {
          for (const offer of offers) {
            if (!Array.isArray(offer.rooms)) continue;
            const match = bestRoomMatch(sel.name, offer.rooms);
            if (match && match.score >= ROOM_MATCH_THRESHOLD) {
              matchedRoomTypes++;
              break;
            }
          }
        }
        if (matchedRoomTypes === 0) {
          roomParityState = 'failed';
          reasons.push('room_failed_match');
        } else if (matchedRoomTypes < mergedSelections.length) {
          roomParityState = 'partial';
          reasons.push('room_partial_match');
        } else {
          roomParityState = 'failed'; // All matched individually but no offer has all
          reasons.push('room_failed_match');
        }
      }
    } else {
      reasons.push('room_none_selected');
    }

    // --- E5: Gating (cheapestAny vs cheapestPublic) ---
    function offerHasGate(offer) {
      const badges = offer?.badges || [];
      return badges.some(b => ['Member', 'Login', 'Mobile'].includes(b));
    }

    const cheapestAny = selectionCheapest
      ? { ...selectionCheapest.offer, total: selectionCheapest.total, isRoomMatched: true }
      : data.cheapestOverall || null;

    // Find cheapest non-gated offer
    let cheapestPublic = null;
    const sortedOffers = offers.slice().sort((a, b) => (a.total || Infinity) - (b.total || Infinity));
    for (const o of sortedOffers) {
      if (!offerHasGate(o) && o.total > 0) {
        cheapestPublic = o;
        break;
      }
    }

    const cheapestIsGated = cheapestAny && offerHasGate(cheapestAny);
    const allOffersGated = sortedOffers.length > 0 && sortedOffers.every(offerHasGate);
    if (cheapestIsGated) reasons.push('cheapest_gated');
    if (allOffersGated) reasons.push('all_offers_gated');

    // --- G7: Currency alignment ---
    const bookingCurrency = bookingMeta?.currency || null;
    const apiCurrency = data.query?.currency || null;
    const currencyState = (!bookingCurrency || !apiCurrency ||
      bookingCurrency.toUpperCase() === apiCurrency.toUpperCase()) ? 'aligned' : 'mismatch';
    if (currencyState === 'mismatch') {
      reasons.push('currency_mismatch');
      if (integrityLevel === 'confirmed') integrityLevel = 'uncertain';
    }

    // --- F6: Tax parity ---
    const taxState = bookingMeta?.taxState || 'unknown';
    let taxParityState = 'unknown';
    if (taxState === 'included') {
      taxParityState = 'aligned';
    } else if (taxState === 'excluded') {
      taxParityState = 'mismatch';
      reasons.push('tax_excluded');
    } else {
      reasons.push('tax_unknown');
    }

    // --- Baseline (Booking price) ---
    const baseline = bookingMeta?.total ? {
      total: bookingMeta.total,
      currency: bookingMeta.currency,
      priceState: bookingMeta.priceState || 'unknown',
      taxState: taxState,
    } : null;

    if (bookingMeta?.priceState === 'from_price') reasons.push('booking_price_from');
    if (bookingMeta?.priceState === 'unknown') reasons.push('booking_price_unknown');

    // --- Cheapest for savings calculation ---
    // Use public price if cheapest is gated (keeps claims credible)
    const cheapestComparable = (cheapestIsGated && cheapestPublic) ? cheapestPublic : cheapestAny;

    // --- Savings calculation ---
    let savings = null;
    if (baseline?.total && cheapestComparable?.total && cheapestComparable.total < baseline.total) {
      const amount = baseline.total - cheapestComparable.total;
      const pct = amount / baseline.total;

      // Determine savings label
      const canConfirm =
        integrityLevel === 'confirmed' &&
        roomParityState === 'matched' &&
        currencyState === 'aligned' &&
        taxParityState !== 'mismatch' &&
        !cheapestIsGated &&
        bookingMeta?.priceState === 'selected_total';

      savings = {
        amount,
        pct,
        label: canConfirm ? 'confirmed' : 'potential',
      };

      // --- H8: Outlier detection ---
      if (pct >= 0.35 || amount >= 200) {
        if (integrityLevel !== 'confirmed') {
          // Degrade one level if not fully confirmed
          if (integrityLevel === 'likely') integrityLevel = 'uncertain';
          reasons.push('outlier_savings');
        }
      }
    }

    // --- UI Policy ---
    const isHardMismatch = integrityLevel === 'mismatch';
    const isUncertain = integrityLevel === 'uncertain' || integrityLevel === 'likely';

    const uiPolicy = {
      showPriceRows: !isHardMismatch,
      showStrongSavings: savings?.label === 'confirmed',
      showPotentialSavings: savings?.label === 'potential' && !isHardMismatch,
      showUnconfirmedBadge: isUncertain && !isHardMismatch,
      showWhyMatchLink: serverUncertain || isUncertain || isHardMismatch,
      showTaxDisclaimer: taxParityState === 'mismatch' || taxParityState === 'unknown',
      showCurrencyDisclaimer: currencyState === 'mismatch',
      showGateDisclaimer: cheapestIsGated && !allOffersGated,
      showSelectRoomsCTA: roomParityState === 'none_selected' || roomParityState === 'partial',
      retryMode: (isHardMismatch || serverUncertain || reasons.includes('outlier_savings'))
        ? 'retry_match'
        : 'refresh',
    };

    return {
      integrityLevel,
      reasons,
      roomParityState,
      taxParityState,
      currencyState,
      cheapestAny,
      cheapestPublic,
      cheapestComparable,
      baseline,
      savings,
      uiPolicy,
    };
  }

  // ========================================
  // I9: WHY THIS MATCH? MODAL
  // Shows explanation when match is uncertain
  // ========================================
  function showWhyMatchModal(data) {
    const match = data?.match || {};
    const candidateSummary = match.candidateSummary || {};
    const confidence = match.confidence ?? 0;

    // Confidence label
    let confLabel, confClass;
    if (confidence >= 0.85) {
      confLabel = 'High confidence';
      confClass = 'confidence-high';
    } else if (confidence >= 0.65) {
      confLabel = 'Likely';
      confClass = 'confidence-likely';
    } else {
      confLabel = 'Uncertain';
      confClass = 'confidence-uncertain';
    }

    // Build candidate list HTML
    const candidates = candidateSummary.topCandidates || [];
    let candidateHtml = '';
    candidates.forEach((c, i) => {
      const confPct = ((c.confidence || 0) * 100).toFixed(0);
      const domainBadge = c.domainMatch ? '<span class="domain-badge">Domain</span>' : '';
      candidateHtml += `
        <li class="candidate-item">
          <span class="candidate-rank">${i + 1}.</span>
          <span class="candidate-name">${escHtml(c.name || 'Unknown')}</span>
          ${domainBadge}
          <span class="candidate-conf">${confPct}%</span>
        </li>
      `;
    });

    // Build skipped counts HTML
    const skippedCounts = candidateSummary.skippedCounts || {};
    const skippedParts = Object.entries(skippedCounts)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `${reason.replace(/_/g, ' ')} (${count})`);
    const skippedHtml = skippedParts.length > 0
      ? `<div class="skipped-summary">Skipped: ${skippedParts.join(', ')}</div>`
      : '';

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'why-match-modal-overlay';
    overlay.innerHTML = `
      <div class="why-match-modal">
        <h3>Why we think this is the hotel</h3>
        <div class="meta-row">
          <span class="meta-label">Confidence</span>
          <span class="meta-value ${confClass}">${confLabel} (${(confidence * 100).toFixed(0)}%)</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Matched hotel</span>
          <span class="meta-value">${escHtml(match.matchedHotelName || 'Unknown')}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Matched by</span>
          <span class="meta-value">${escHtml(match.matchedBy || 'name')}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Source</span>
          <span class="meta-value">${escHtml(match.candidateSummarySource || 'unknown')}</span>
        </div>
        ${candidateHtml ? `<ul class="candidate-list">${candidateHtml}</ul>` : ''}
        ${skippedHtml}
        <div class="modal-actions">
          <button class="btn-retry" data-action="retry-match">Retry match</button>
          <button class="btn-close" data-action="close-modal">Close</button>
        </div>
      </div>
    `;

    // Append to shadow root
    shadowRoot.appendChild(overlay);

    // Handle clicks
    overlay.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'close-modal' || e.target === overlay) {
        overlay.remove();
      } else if (action === 'retry-match') {
        overlay.remove();
        // Trigger smart retry
        const refreshBtn = shadowRoot.getElementById('compare-refresh');
        if (refreshBtn) {
          refreshBtn.dataset.expensive = 'true';
          refreshBtn.click();
        }
      }
    });
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

  // Extract hostname without www prefix for domain comparison
  function hostNoWww(u) {
    try {
      return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
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

    Logger.debug('Updated _bookDirectUrl from', source, '->', url);
  }

  // --- BOOK DIRECT URL HELPERS ---
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
  // Strip diacritics/accents from a string (mirrors Worker's approach)
  // Converts "Hótel" → "Hotel", "Valaskjálf" → "Valaskjalf", etc.
  function stripDiacritics(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeNameForComparison(s) {
    return stripDiacritics(s)
      .toLowerCase()
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
    const keyTokens = ['airport', 'station', 'beach', 'downtown', 'central', 'centre', 'oldtown', 'harbor', 'harbour', 'comfort', 'clarion', 'quality', 'scandic', 'radisson', 'marriott', 'hilton', 'sheraton', 'hyatt'];
    const aKeyTokens = keyTokens.filter(k => a.includes(k));
    const missingKeyTokens = aKeyTokens.filter(k => !b.includes(k));

    // If one has a key token that the other lacks, it's a mismatch
    // Also mismatch if "airport" is in one and not other (handled above)
    // Low coverage (< 0.5) is also a strong signal
    return { isMismatch: coverage < 0.5 || missingKeyTokens.length > 0, matchedName };
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

  // --- OFFER GATING DETECTION ---
  // Returns true if offer requires membership, login, or mobile app
  function offerHasGate(offer) {
    const badges = offer?.badges || [];
    return badges.some(b => ['Member', 'Login', 'Mobile'].includes(b));
  }

  // --- FOOTER UPDATE FUNCTION ---
  // J10: Uses uiPolicy.retryMode for smart retry behavior
  function updateCompareFooter() {
    const data = _lastCompareData;
    const uiPolicy = _integrityAssessment?.uiPolicy || {};
    const retryMode = uiPolicy.retryMode || 'refresh';

    const now = Date.now();
    const cooldownRemaining = Math.max(0, Math.ceil((_retryMatchCooldownUntil - now) / 1000));

    // J10: Apply cooldown only to 'retry_match' mode (expensive)
    const isCooldownActive = retryMode === 'retry_match' && cooldownRemaining > 0;

    if (retryMode === 'retry_match') {
      // Match mode: expensive retry with smart flag
      if (isCooldownActive) {
        compareRefresh.textContent = 'Retry match';
        compareRefresh.style.pointerEvents = 'none';
        compareRefresh.style.opacity = '0.5';
      } else {
        compareRefresh.textContent = 'Retry match';
        compareRefresh.style.pointerEvents = '';
        compareRefresh.style.opacity = '';
      }
      compareRefresh.dataset.expensive = 'true';
    } else if (uiPolicy.showSelectRoomsCTA) {
      // Rooms mode: nudge to select rooms (no API call)
      compareRefresh.textContent = 'Select rooms to confirm';
      compareRefresh.style.pointerEvents = '';
      compareRefresh.style.opacity = '';
      compareRefresh.dataset.expensive = 'false';
    } else {
      // Normal refresh
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
    Logger.debug('Compare response data:', data);
    Logger.debug('Offers count:', data.offersCount, 'cheapestOverall:', data.cheapestOverall, 'cheapestOfficial:', data.cheapestOfficial);

    // --- MISMATCH DETECTION ---
    // Use match.matchedHotelName, or fall back to property.name (cached responses may not have matchedHotelName)
    const matchedHotelName = data.match?.matchedHotelName || data.matchedHotelName || data.property?.name || null;
    const mismatchCheck = checkNameMismatch(_hotelName, matchedHotelName);

    // Split confidence/uncertainty handling for nuanced UI
    const confidence = (data.match?.confidence ?? 1);
    const matchUncertain = !!(data.match?.matchUncertain || data.matchUncertain);
    const isLowConfidence = confidence < 0.4;

    // Domain confirmation: if matchedBy='officialDomain', the domain confirms the match
    // This is strong evidence even if confidence is low or matchUncertain is set
    // BUT: Domain confirmation only overrides uncertainty if confidence is reasonable (>= 55%)
    // This prevents false confidence with parent company domains (e.g., Islandshotel covering
    // both "Hotel Reykjavík Saga" and "Hotel Reykjavík Grand" under the same domain)
    const domainConfirmed = data.match?.matchedBy === 'officialDomain';
    const domainOverridesUncertain = domainConfirmed && confidence >= 0.55;

    // Hard mismatch: name-based (coverage < 0.5 or missing key tokens)
    // Soft uncertainty: low confidence or matchUncertain flag, but names are OK
    // EXCEPTION: Domain confirmation WITH good confidence overrides soft uncertainty
    const hardMismatch = mismatchCheck.isMismatch;
    const softUncertain = !hardMismatch && !domainOverridesUncertain && (isLowConfidence || matchUncertain);

    _currentMismatch = hardMismatch || softUncertain;

    // Control flags for rendering
    const allowPriceRows = !hardMismatch;      // Hard mismatch = don't show any prices
    const allowStrongClaims = !_currentMismatch; // Only claim savings when fully confident

    // Debug: Log mismatch detection values
    Logger.debug('Mismatch detection:', {
      searchedHotel: _hotelName,
      matchedHotel: matchedHotelName,
      hardMismatch,
      softUncertain,
      domainConfirmed,
      domainOverridesUncertain,
      confidence,
      isLowConfidence,
      matchUncertain,
      allowPriceRows,
      allowStrongClaims
    });

    // --- UPGRADE BOOK DIRECT URL (with domain confirmation safety belt) ---
    // Only upgrade when confident, OR when domains match (extra layer check)
    const betterUrl = pickBestOfficialUrl(data);
    if (betterUrl && betterUrl.url !== _bookDirectUrl) {
      // Domain confirmation: if official URL matches compare URL domain, trust it
      const officialHost = hostNoWww(_officialUrl);
      const betterHost = hostNoWww(betterUrl.url);
      const domainConfirmsMatch = officialHost && betterHost && officialHost === betterHost;

      // Upgrade only if confident OR domain confirms
      if (!_currentMismatch || domainConfirmsMatch) {
        updateBookDirectButton(betterUrl.url, betterUrl.source);
      } else {
        Logger.debug('Skipping Book Direct URL upgrade due to mismatch/uncertainty:', {
          betterUrl: betterUrl.url,
          _currentMismatch,
          domainConfirmsMatch
        });
      }
    }


    const currency = data.query?.currency || 'USD';
    const currentHost = data.query?.currentHost || '';
    const { cheapestOfficial, currentOtaOffer, bookingOffer } = data;
    let { cheapestOverall } = data; // May be nullified on mismatch

    // --- SELECTION-AWARE CHEAPEST (use structured _selectedRooms) ---
    const rawSelections = Array.isArray(_selectedRooms)
      ? _selectedRooms
        .filter(r => r && typeof r.name === 'string' && r.name.trim() && (r.count | 0) > 0)
        .map(r => ({ name: r.name.replace(/\s+/g, ' ').trim(), count: r.count | 0 }))
      : [];

    // Merge duplicates by normalized name
    const mergedSelections = mergeSelections(rawSelections);
    const totalSelectedRooms = mergedSelections.reduce((sum, s) => sum + s.count, 0);

    Logger.debug('Room selections:', { rawSelections, mergedSelections, totalSelectedRooms });


    let selectionCheapest = null;
    if (mergedSelections.length && Array.isArray(data.offers)) {
      selectionCheapest = cheapestOfferForSelection(data.offers, mergedSelections, currentHost);

      if (selectionCheapest) {
        Logger.debug('Room-matched cheapest found:', {
          provider: selectionCheapest.offer.source,
          total: selectionCheapest.total,
          matched: selectionCheapest.matched
        });
      }
    }

    // --- INTEGRITY ASSESSMENT (Workstream A-K) ---
    // Build booking meta from current state
    const viewingTotal = parseMoneyToNumber(_price);
    const viewingCurrency = inferCurrencyFromPrice(_price);
    const bookingMeta = {
      total: viewingTotal,
      currency: viewingCurrency,
      priceState: _priceState || 'unknown',
      taxState: _priceTaxState || 'unknown', // From updateViewingPrice
    };

    _integrityAssessment = assessComparisonIntegrity({
      compareData: data,
      bookingMeta,
      mergedSelections,
      selectionCheapest,
    });

    Logger.debug('Integrity assessment:', _integrityAssessment);

    let html = '';
    let hasAnyRows = false;  // Track if any price rows were rendered

    // Show mismatch warning at top if detected (escaped for XSS safety)
    // I9: Include "Why this match?" link if candidateSummary available
    const candidateSummary = data.match?.candidateSummary || null;
    const showWhyMatchLink = _currentMismatch && candidateSummary;

    if (_currentMismatch && matchedHotelName) {
      html += `
        <div class="compare-mismatch-warning">
          ⚠️ ${hardMismatch ? 'Prices may be for:' : 'Match uncertain — prices may be for:'}
          <strong>${escHtml(matchedHotelName)}</strong>
          ${showWhyMatchLink ? '<span class="why-match-link" data-action="why-match">Why this match?</span>' : ''}
        </div>
      `;
      // Note: We no longer null cheapestOverall here.
      // Hard mismatch suppresses rows via allowPriceRows; soft uncertainty shows rows with "Unconfirmed" badge.
    }

    // viewingTotal already computed above in integrity assessment
    Logger.debug('Page price for comparison:', { _price, viewingTotal });

    // --- USE SELECTION-CHEAPEST FOR DISPLAY ---
    const isRoomMatched = Boolean(selectionCheapest);
    const displayOffer = isRoomMatched ? selectionCheapest.offer : cheapestOverall;
    const displayTotal = isRoomMatched ? selectionCheapest.total : cheapestOverall?.total;

    // Show provider room name only when a single room type is matched
    const displayRoomName = (isRoomMatched && selectionCheapest.matched?.length === 1)
      ? selectionCheapest.matched[0].provider
      : null;

    const displayLink = isRoomMatched
      ? (selectionCheapest.link || selectionCheapest.offer?.link)
      : displayOffer?.link;

    // Detect if displayed offer has membership/login gate
    // Use room-matched badges when available (they come from room URLs)
    const displayBadges = isRoomMatched ? (selectionCheapest.badges || displayOffer?.badges || []) : (displayOffer?.badges || []);
    const displayHasGate = displayBadges.some(b => ['Member', 'Login', 'Mobile'].includes(b));

    // --- PRICE SANITY CHECK ---
    // viewingCurrency already computed above in integrity assessment
    _sanityState = computePriceSanity({
      viewingTotal,
      viewingCurrency,
      apiCurrency: currency,
      nights: data.nights || 1,
      displayTotal,
      displayHasGate,
      isRoomMatched,
      totalSelectedRooms,
      bookingOfferTotal: bookingOffer?.total ?? null,
    });

    const _sanityIsBlocking = (_sanityState?.severity === 'block');

    // Update allowStrongClaims to include sanity check
    // Suppress "Save X", green highlight, "Cheaper" when sanity is triggered
    const allowStrongClaimsWithSanity = allowStrongClaims && !_sanityState;

    Logger.debug('Sanity check result:', {
      _sanityState,
      _sanityIsBlocking,
      viewingCurrency,
      apiCurrency: currency,
      allowStrongClaimsWithSanity
    });

    // --- SANITY BANNER (distinct from name mismatch warning) ---
    if (_sanityState && !hardMismatch) {
      const iconMap = { block: '🚫', warn: '⚠️' };
      html += `
        <div class="compare-mismatch-warning">
          ${iconMap[_sanityState.severity] || '⚠️'} ${escHtml(_sanityState.message)}
        </div>
      `;
    }

    // Cheapest display (room-matched when available, otherwise overall)
    // Only render price rows if not a hard mismatch
    if (allowPriceRows && (displayOffer || displayTotal)) {
      const sourceLabel = displayOffer?.source || 'Best price';
      const roomLabel = displayRoomName
        ? ` – ${displayRoomName.slice(0, 25)}${displayRoomName.length > 25 ? '…' : ''}`
        : '';

      // Validate URL before creating link (XSS prevention)
      const safeLink = safeHttpUrl(displayLink);
      const priceLink = safeLink
        ? `<a href="${escAttr(safeLink)}" target="_blank" rel="noopener noreferrer">${escHtml(formatComparePrice(displayTotal, currency))}</a>`
        : escHtml(formatComparePrice(displayTotal, currency));

      // Determine if this is actually cheaper than what user is paying on Booking.com
      const isActuallyCheaper = Number.isFinite(viewingTotal) &&
        Number.isFinite(displayTotal) &&
        displayTotal < viewingTotal;
      const bookingIsBest = Number.isFinite(viewingTotal) &&
        Number.isFinite(displayTotal) &&
        viewingTotal <= displayTotal;

      // Build badges array - "Same Room" for single type, "Selected Rooms" for mix
      const badges = [];
      if (isRoomMatched) {
        badges.push(mergedSelections.length > 1
          ? '<span class="compare-badge matched">Selected Rooms</span>'
          : '<span class="compare-badge matched">Same Room</span>');
      }

      // Cheap/best badges: suppress when uncertain OR sanity triggered (show "Unconfirmed" instead)
      if (_currentMismatch || _sanityState) {
        // Don't claim savings when uncertain or sanity triggered
        badges.push('<span class="compare-badge other-room">Unconfirmed</span>');
      } else if (isActuallyCheaper && allowStrongClaimsWithSanity) {
        // This offer IS cheaper than Booking.com
        badges.push('<span class="compare-badge cheapest">Cheaper</span>');
      } else if (bookingIsBest) {
        // Booking.com is same or better - highlight that
        badges.push('<span class="compare-badge booking-best">Booking Best</span>');
      }

      // External badges: escape text and sanitize class name
      // Use displayBadges which includes room-matched badges when applicable
      for (const b of displayBadges) {
        badges.push(`<span class="compare-badge ${safeClassToken(b)}">${escHtml(b)}</span>`);
      }

      // Only highlight as cheapest (green) if it actually IS cheaper AND we're confident AND sanity OK
      const sourceClass = (!_currentMismatch && !_sanityState && isActuallyCheaper) ? 'compare-source is-cheapest' : 'compare-source';

      html += `
        <div class="compare-row">
          <div class="${sourceClass}" title="${escAttr(sourceLabel + roomLabel)}">${escHtml(sourceLabel)}</div>
          <div class="compare-price">${priceLink}</div>
          <div class="compare-tags">${badges.join('')}</div>
        </div>
      `;
      hasAnyRows = true;

      // If room matched, also show overall cheapest if different and cheaper
      if (isRoomMatched && cheapestOverall && cheapestOverall.total < displayTotal) {
        const overallSafeLink = safeHttpUrl(cheapestOverall.link);
        const overallLink = overallSafeLink
          ? `<a href="${escAttr(overallSafeLink)}" target="_blank" rel="noopener noreferrer">${escHtml(formatComparePrice(cheapestOverall.total, currency))}</a>`
          : escHtml(formatComparePrice(cheapestOverall.total, currency));

        html += `
          <div class="compare-row compare-row-secondary">
            <div class="compare-source" title="${escAttr(cheapestOverall.source + ' (different room type)')}">${escHtml(cheapestOverall.source)}</div>
            <div class="compare-price">${overallLink}</div>
            <div class="compare-tags"><span class="compare-badge other-room">Other Room</span></div>
          </div>
        `;
        hasAnyRows = true;
      }

      // --- MEMBER/LOGIN GATE NOTE (always visible when relevant) ---
      // Show note outside savings block so it appears even if savings aren't shown
      // Skip if sanity already flagged it (to avoid duplicate messaging)
      if (!_currentMismatch && !_sanityState && displayHasGate) {
        html += `
          <div class="compare-member-note">
            💡 Cheapest price may require membership/login
          </div>
        `;
      }
    }

    // Official site (if different from the displayed offer)
    // Also gated by allowPriceRows to suppress on hard mismatch
    if (allowPriceRows && cheapestOfficial && cheapestOfficial.source !== displayOffer?.source) {
      const fullSourceName = cheapestOfficial.source || 'Official Site';
      const officialSafeLink = safeHttpUrl(cheapestOfficial.link);
      const priceLink = officialSafeLink
        ? `<a href="${escAttr(officialSafeLink)}" target="_blank" rel="noopener noreferrer">${escHtml(formatComparePrice(cheapestOfficial.total, currency))}</a>`
        : escHtml(formatComparePrice(cheapestOfficial.total, currency));

      // Build badges array (external badges escaped)
      const badges = ['<span class="compare-badge official">Direct</span>'];
      for (const b of (cheapestOfficial.badges || [])) {
        badges.push(`<span class="compare-badge ${safeClassToken(b)}">${escHtml(b)}</span>`);
      }

      html += `
        <div class="compare-row">
          <div class="compare-source" title="${escAttr(fullSourceName)}">Official site</div>
          <div class="compare-price">${priceLink}</div>
          <div class="compare-tags">${badges.join('')}</div>
        </div>
      `;
      hasAnyRows = true;
    }

    // NOTE: Removed duplicate 'Booking.com (viewing)' row - already shown in hero section above
    const currentOffer = currentOtaOffer || bookingOffer;

    // viewingTotal already parsed earlier
    // Google's Booking.com price from compare data
    const googleBookingTotal = bookingOffer?.total ?? currentOtaOffer?.total ?? null;

    // Choose baseline - prefer room-matched comparison when available
    let baselineTotal = null;
    let baselineLabel = 'Booking.com';

    // Multi-room unable to match note
    if (totalSelectedRooms > 1 && !selectionCheapest) {
      html += `
        <div class="compare-room-note">
          ℹ️ Multi-room – unable to match all rooms
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

    // --- DEBUG: Savings calculation inputs ---
    Logger.debug('Savings calc inputs:', {
      _price,
      _priceState,
      _priceNumber,
      viewingTotal,
      googleBookingTotal,
      baselineTotal,
      cheapestOverallTotal: cheapestOverall?.total,
      displayTotal,
      isRoomMatched,
      allowPriceRows,
      allowStrongClaims,
      wouldShowSavings: displayTotal && baselineTotal && displayTotal < baselineTotal && allowStrongClaims,
    });

    // Calculate savings using room-matched price when available, otherwise overall cheapest
    const savingsCompareTotal = displayTotal ?? cheapestOverall?.total;

    // Determine claim type based on _priceState
    const isExactClaim = _priceState === 'selected_total' || _priceState === 'sidebar_total';
    const isPotentialClaim = _priceState === 'from_price';

    // Sanity check for potential claims: compare viewingTotal vs googleBookingTotal
    // If ratio is wildly off (< 0.40 or > 2.50), don't show potential savings
    let sanityCheckPassed = true;
    if (isPotentialClaim && Number.isFinite(viewingTotal) && Number.isFinite(googleBookingTotal) && googleBookingTotal > 0) {
      const ratio = viewingTotal / googleBookingTotal;
      if (ratio < 0.40 || ratio > 2.50) {
        Logger.debug('Sanity check FAILED: viewing/google ratio out of bounds', { viewingTotal, googleBookingTotal, ratio });
        sanityCheckPassed = false;
      }
    }

    if (allowPriceRows && savingsCompareTotal && baselineTotal && savingsCompareTotal < baselineTotal && allowStrongClaimsWithSanity) {
      const savings = baselineTotal - savingsCompareTotal;
      console.log('bookDirect: Savings calculation:', {
        savings,
        currency,
        comparedTo: isRoomMatched ? 'room-matched' : 'cheapest-overall',
        isMeaningful: isMeaningfulSavings(savings, baselineTotal, currency),
        claimType: isExactClaim ? 'exact' : (isPotentialClaim ? 'potential' : 'none')
      });

      // Only show savings callout if meaningful (>=1.5% or above currency minimum)
      if (isMeaningfulSavings(savings, baselineTotal, currency) && !displayHasGate) {
        if (isExactClaim) {
          // Exact claim: "Save X vs your selection"
          html += `
            <div class="compare-savings">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
                <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clip-rule="evenodd" />
              </svg>
              Save ${formatComparePrice(savings, currency)} vs your selection
            </div>
          `;
        } else if (isPotentialClaim && sanityCheckPassed) {
          // Potential claim: "Potential savings up to X"
          html += `
            <div class="potential-savings">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
                <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clip-rule="evenodd" />
              </svg>
              Potential savings up to ${formatComparePrice(savings, currency)}
            </div>
          `;
        } else if (isPotentialClaim && !sanityCheckPassed) {
          // Sanity check failed - prompt to select rooms
          html += `
            <div class="compare-room-note">
              💡 Prices depend on room type — select rooms to confirm savings
            </div>
          `;
        }
      }
      // If savings are trivial, just show nothing (cleaner than a preachy message)
    } else if (_priceState === 'unknown' || (_priceState === 'from_price' && !baselineTotal)) {
      // Unknown state or no baseline - show prompt
      html += `
        <div class="compare-room-note">
          💡 Select rooms to see exact savings
        </div>
      `;
    }

    // Show "no prices" if no rows were rendered (warning alone doesn't count)
    if (!hasAnyRows) {
      html += '<div class="compare-no-dates">No price data found.</div>';
    }

    compareResults.innerHTML = html;
    compareTimestamp.textContent = `Checked ${formatTimestamp(data.fetchedAt)}`;
    showCompareState('results');

    // ========================================
    // UPDATE PRICES CHIP BASED ON RESULTS
    // ========================================
    const uiPolicy = _integrityAssessment?.uiPolicy || {};
    const retryMode = uiPolicy.retryMode || 'refresh';

    _compareStatus = 'ready';

    // Derive chip text from state
    let pricesChipText = '';
    let isSavings = false;

    if (retryMode === 'retry_match') {
      // Uncertain match - prompt to check
      pricesChipText = 'Check match';
    } else if (uiPolicy.showSelectRoomsCTA) {
      // Need room selection
      pricesChipText = 'Select rooms';
    } else if (uiPolicy.confirmedSavingsDisplay) {
      // Has confirmed savings
      pricesChipText = `Save ${uiPolicy.confirmedSavingsDisplay}`;
      isSavings = true;
      pulseOnce('prices');
    } else if (uiPolicy.potentialSavingsDisplay && uiPolicy.showPotentialSavings) {
      // Has potential savings
      pricesChipText = `Up to ${uiPolicy.potentialSavingsDisplay}`;
      isSavings = true;
      pulseOnce('prices');
    } else {
      // No meaningful savings
      pricesChipText = 'Best found';
    }

    updatePricesChip({ text: pricesChipText, loading: false, isSavings });

    updateCompareFooter();

    // I9: Add click handler for "Why this match?" link
    const whyMatchLink = compareResults.querySelector('[data-action="why-match"]');
    if (whyMatchLink) {
      whyMatchLink.addEventListener('click', () => showWhyMatchModal(data));
    }

    // Notify controller of data change (for inline card sync)
    if (_onCompareDataChange) {
      _onCompareDataChange({ status: 'ready', data });
    }

    // BROADCAST: emit to all listeners via bridge
    if (typeof emitCompareUpdate === 'function') {
      emitCompareUpdate('ready', data);
    }
  }

  // ========================================
  // COMPARE UPDATE BRIDGE (broadcasts state to inline controller)
  // ========================================
  function emitCompareUpdate(status, data) {
    try {
      const detail = { status, data };
      // Callback-based listener (for controller wiring)
      if (typeof container.onCompareUpdate === 'function') {
        container.onCompareUpdate(detail);
      }
      // Event-based listener (for decoupled consumers)
      if (typeof container.dispatchEvent === 'function') {
        container.dispatchEvent(new CustomEvent('bd:compare', { detail }));
      }
    } catch (e) {
      console.warn('bookDirect: emitCompareUpdate error', e);
    }
  }

  // Fetch compare data from background
  async function fetchCompareData(forceRefresh = false, opts = {}) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      console.log('bookDirect: Chrome runtime not available for compare');
      return;
    }

    const seq = ++_compareReqSeq; // Race-condition guard

    // Set prices chip to loading state
    _compareStatus = 'loading';
    updatePricesChip({ text: 'Checking…', loading: true });

    // Notify controller of loading state (for inline card sync)
    if (_onCompareDataChange) {
      _onCompareDataChange({ status: 'loading', data: null });
    }
    emitCompareUpdate('loading', null);

    // Only show loading state if prices panel is already open (silent prefetch otherwise)
    if (_activePanel === 'prices') {
      compareSection.style.display = 'block';
      showCompareState('loading');
    }

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: forceRefresh ? BookDirect.Contracts.MSG_REFRESH_COMPARE : BookDirect.Contracts.MSG_GET_COMPARE_DATA,
          officialUrl: _officialUrl,
          forceRefresh,
          hotelName: _hotelName,
          bookingUrl: window.location.href,
          reason: opts.reason || null,
          smart: (typeof opts.smart === 'boolean')
            ? opts.smart
            : (forceRefresh && !opts.reason)  // Smart mode on user-initiated retry only
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
        _compareStatus = 'noDates';
        updatePricesChip({ text: 'Add dates', loading: false });
        emitCompareUpdate('noDates', response);
        return;
      }

      if (response?.error) {
        console.warn('bookDirect: Compare API error:', response.error, response);
        const C = BookDirect.Contracts;
        const errorCode = response.error_code;

        // Retry once for 'No page context' error (race condition on page load)
        if (errorCode === C.ERR_NO_PAGE_CONTEXT && !opts._retried) {
          console.log('bookDirect: Retrying after 500ms (waiting for page context)');
          await new Promise(r => setTimeout(r, 500));
          return fetchCompareData(forceRefresh, { ...opts, _retried: true });
        }

        // Exponential backoff retry for page context errors (up to 3 retries)
        // Delays: 250ms, 750ms, 1500ms
        const retryDelays = [250, 750, 1500];
        const retryCount = opts._retryCount || 0;

        if (errorCode === C.ERR_NO_PAGE_CONTEXT && retryCount < retryDelays.length) {
          const delay = retryDelays[retryCount];
          console.log(`bookDirect: Retry ${retryCount + 1}/${retryDelays.length} after ${delay}ms (waiting for page context)`);

          // Show intermediate message on first few retries
          if (retryCount > 0) {
            compareError.textContent = 'Still loading Booking details… retrying.';
            showCompareState('error');
          }

          await new Promise(r => setTimeout(r, delay));
          return fetchCompareData(forceRefresh, { ...opts, _retried: true, _retryCount: retryCount + 1 });
        }

        // User-friendly error messages based on error_code
        let userMessage = 'Unable to compare prices.';
        switch (errorCode) {
          case C.ERR_SEARCH_FAILED:
            // Check if it's "no results" vs actual API failure
            const detailsStr = JSON.stringify(response.details || '').toLowerCase();
            if (detailsStr.includes("didn't return any results") || detailsStr.includes('no results')) {
              userMessage = 'Hotel not found in Google Hotels database.';
            } else {
              userMessage = 'Price data temporarily unavailable. Try refreshing.';
            }
            break;
          case C.ERR_RATE_LIMIT:
            userMessage = 'Too many requests. Please wait a moment.';
            break;
          case C.ERR_NO_PROPERTY_FOUND:
            userMessage = 'Hotel not found in price database.';
            break;
          case C.ERR_NO_PAGE_CONTEXT:
            userMessage = 'Page not ready. Try refreshing.';
            break;
          case C.ERR_INVALID_PARAMS:
            userMessage = 'Invalid request parameters.';
            break;
          case C.ERR_NETWORK:
            userMessage = 'Network error. Check your connection.';
            break;
          default:
            // Fallback to old string matching for backwards compatibility
            if (!errorCode) {
              console.warn('bookDirect: Compare error missing error_code, using string fallback:', response);
            }
            if (response.error.includes('google_hotels failed')) {
              userMessage = 'Price data temporarily unavailable. Try refreshing.';
            } else if (response.error.includes('Rate limit')) {
              userMessage = 'Too many requests. Please wait a moment.';
            } else if (response.error.includes('No property_token')) {
              userMessage = 'Hotel not found in price database.';
            } else if (response.error.includes('No page context')) {
              userMessage = 'Page not ready. Try refreshing.';
            }
        }

        compareError.textContent = userMessage;
        showCompareState('error');
        _compareStatus = 'error';
        emitCompareUpdate('error', response);
        updateCompareFooter();
        return;
      }

      renderCompareResults(response);

      // --- AUTO-VERIFY ON BLOCK-LEVEL SANITY ANOMALY ---
      // If the first compare returns a block-level anomaly, do one automatic
      // smart retry to self-heal (wrong property, stale cache, etc.)
      if (_sanityState?.severity === 'block' && !_autoVerifyDone && !_compareInFlight) {
        _autoVerifyDone = true;
        console.log('bookDirect: Auto-verify triggered for block-level sanity anomaly:', _sanityState.reasons);
        setTimeout(() => {
          fetchCompareData(true, { smart: true, reason: 'auto_verify_price_anomaly' });
        }, 700);
      }

      // --- AUTO-SMART-RETRY ON UNCERTAIN MATCH ---
      // If the first compare returns an uncertain match (soft or hard mismatch),
      // automatically retry with smart=true to find the correct hotel
      if (_currentMismatch && !_autoSmartRetryDone && !_compareInFlight && !opts._isSmartRetry) {
        _autoSmartRetryDone = true;
        console.log('bookDirect: Auto-smart-retry triggered for uncertain match');
        setTimeout(() => {
          fetchCompareData(true, { smart: true, reason: 'auto_smart_uncertain', _isSmartRetry: true });
        }, 700);
      }

    } catch (err) {
      console.error('bookDirect: Compare fetch error', err);
      compareError.textContent = 'Unable to check prices.';
      showCompareState('error');
      _compareStatus = 'error';
      updatePricesChip({ text: '', loading: false });
      emitCompareUpdate('error', { error: err?.message || 'compare_failed' });
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
      fetchCompareData(true, { smart: isExpensive });
    });
  }

  // Store officialUrl when contact lookup completes
  container.setOfficialUrl = function (url) {
    _officialUrl = url;
    _waitingForOfficialUrl = false;

    // Notify background about the officialUrl
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: BookDirect.Contracts.MSG_SET_OFFICIAL_URL,
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

  // Fallback: if officialUrl not received after OFFICIAL_URL_WAIT_MS, call compare anyway
  const officialUrlTimeout = BookDirect.Contracts.OFFICIAL_URL_WAIT_MS;
  setTimeout(() => {
    if (_waitingForOfficialUrl && !_compareCalledOnce) {
      console.log(`bookDirect: officialUrl timeout (${officialUrlTimeout}ms), calling compare without it`);
      _compareCalledOnce = true;
      _compareUsedOfficialUrl = false; // Ran WITHOUT officialUrl - may need upgrade later
      fetchCompareData();
    }
  }, officialUrlTimeout);

  // Expose update methods (DOM-based, XSS-safe)
  container.updatePrice = function (newPrice) {
    // Skip if price hasn't actually changed
    if (newPrice === _price) return;

    const oldPrice = _price;
    _price = newPrice;
    const priceDisplay = shadowRoot.getElementById('price-display');
    if (priceDisplay && newPrice) {
      // Parse and format with same logic as initial render (DOM-based)
      const priceStr = newPrice.trim();
      const match = priceStr.match(/^([A-Z]{2,3}|[€$£¥₹])\s*(.+)$/i) ||
        priceStr.match(/^(.+?)\s*([A-Z]{2,3})$/i);

      priceDisplay.textContent = "";
      if (match) {
        const [, currency, amount] = match;
        const cur = document.createElement("span");
        cur.className = "price-currency";
        cur.textContent = currency;
        const amt = document.createElement("span");
        amt.className = "price-amount";
        amt.textContent = amount;
        priceDisplay.append(cur, amt);
      } else {
        const amt = document.createElement("span");
        amt.className = "price-amount";
        amt.textContent = priceStr;
        priceDisplay.append(amt);
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

  // Update viewing price with structured state (new API)
  container.updateViewingPrice = function (priceObj) {
    if (!priceObj || typeof priceObj !== 'object') return;

    // Track state for label/savings computation
    _priceState = priceObj.state || 'unknown';
    _priceNumber = Number.isFinite(priceObj.totalNumber) ? priceObj.totalNumber : null;
    _priceTaxState = priceObj.taxState || 'unknown'; // F6: Tax state for integrity assessment

    Logger.debug('updateViewingPrice:', { state: _priceState, totalNumber: _priceNumber, taxState: _priceTaxState, rawText: priceObj.rawText });

    // Update hero label based on state
    const heroLabel = shadowRoot.querySelector('.label');
    if (heroLabel) {
      const labelMap = {
        'selected_total': 'Booking.com (your selection)',
        'sidebar_total': 'Booking.com (total shown)',
        'from_price': 'Booking.com (starting at)',
        'unknown': 'Booking.com'
      };
      heroLabel.textContent = labelMap[_priceState] || 'Booking.com';
    }

    // Show/hide selection prompt for from_price state
    let prompt = shadowRoot.getElementById('selection-prompt');
    if (_priceState === 'from_price' || _priceState === 'unknown') {
      if (!prompt) {
        prompt = document.createElement('div');
        prompt.id = 'selection-prompt';
        prompt.className = 'selection-prompt';
        prompt.textContent = 'Select a room to confirm exact total & savings';
        const priceDisplay = shadowRoot.getElementById('price-display');
        if (priceDisplay && priceDisplay.parentNode) {
          priceDisplay.parentNode.insertBefore(prompt, priceDisplay.nextSibling);
        }
      }
      prompt.style.display = 'block';
    } else if (prompt) {
      prompt.style.display = 'none';
    }

    // Delegate to legacy updatePrice for display rendering
    container.updatePrice(priceObj.rawText);
  };

  // ========================================
  // PANEL STATE METHODS (exposed for controller)
  // ========================================
  container.minimizeIfNotPinned = minimizeIfNotPinned;
  container.expandIfMinimized = expandIfMinimized;
  container.setPanelStateCallback = setPanelStateCallback;
  container.getPanelState = () => _panelState;
  container.setPanelState = (s) => setPanelState(s, true);

  // Compare data callback for controller sync
  container.setCompareDataCallback = (cb) => { _onCompareDataChange = cb; };
  container.getCompareData = () => _lastCompareData;

  return container;
};

// ========================================
// NEW TWO-SURFACE UI CONTROLLER (Phase 1 Architecture)
// ========================================
// Returns a controller object with:
// - panelEl: Primary panel (detailed info, always available)
// - inlineEl: Inline micro-card (CTA-focused, appears when rooms table visible)
// - Shared state + update methods so both surfaces stay in sync
// ========================================

window.BookDirect.createUIController = function (options = {}) {
  const {
    hotelName = 'Hotel',
    initialPrice = '',
    isHotelPage = true
  } = options;

  // ========================================
  // SHARED STATE (both surfaces render from this)
  // ========================================
  const state = {
    hotelName,
    viewingPrice: initialPrice,
    priceState: 'unknown',  // selected_total | sidebar_total | from_price | unknown
    priceNumber: null,
    priceTaxState: 'unknown',
    selectedRooms: [],
    offers: null,           // Compare API response data
    compareStatus: 'idle',  // idle | loading | ready | noDates | error
    directStatus: 'idle',   // idle | loading | ready | empty | error
    bestOffer: null,        // Cached best offer for quick access
    panelState: 'expanded', // expanded | minimized | pinned
    inlineVisible: false,   // Controlled by IntersectionObserver
    discoveryTriggered: false, // Prevents re-triggering discovery animation
  };

  // ========================================
  // CREATE PRIMARY PANEL (reuses existing createUI)
  // ========================================
  const panelEl = window.BookDirect.createUI(hotelName, initialPrice, true);
  panelEl.id = 'bd-panel-el';
  panelEl.dataset.bdSurface = 'panel';

  // Set up callback to sync compare data from panel to controller state
  // This enables the inline card to receive data updates
  if (panelEl.setCompareDataCallback) {
    panelEl.setCompareDataCallback(({ status, data }) => {
      state.compareStatus = status;
      if (data) {
        state.offers = data;
        // Re-compute best offer for inline display
        const offers = data.offers || [];
        if (offers.length > 0) {
          state.bestOffer = offers.reduce((best, offer) => {
            if (!best) return offer;
            return (offer.total || Infinity) < (best.total || Infinity) ? offer : best;
          }, null);
        }
      }
      renderInline();
    });
  }

  // ========================================
  // CREATE INLINE MICRO-CARD (minimal stub for Phase 1)
  // ========================================
  const inlineEl = document.createElement('div');
  inlineEl.id = 'bd-inline-el';
  inlineEl.dataset.bdSurface = 'inline';
  inlineEl.style.cssText = `
    visibility: visible !important;
    opacity: 1 !important;
    display: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;

  const inlineShadow = inlineEl.attachShadow({ mode: 'closed' });

  // Inline micro-card styles - "Other sites" focus
  const inlineStyles = document.createElement('style');
  inlineStyles.textContent = `
    :host {
      display: block;
      visibility: visible !important;
      opacity: 1 !important;
    }

    .inline-card {
      background: #ffffff;
      border: 2px solid #6366f1;
      border-radius: 10px;
      padding: 12px 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      font-family: inherit;
      min-width: 220px;
      max-width: 300px;
    }

    .inline-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .inline-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #6366f1;
    }

    .inline-info {
      font-size: 12px;
      color: #9ca3af;
      cursor: help;
    }

    /* Offers list */
    .inline-offers {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .inline-offer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      background: #f0fdf4;
      border-radius: 6px;
      text-decoration: none;
      color: inherit;
      transition: background 100ms ease;
      cursor: pointer;
    }

    .inline-offer-row:hover {
      background: #dcfce7;
    }

    .offer-source {
      font-weight: 500;
      font-size: 12px;
      color: #374151;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .offer-price {
      font-weight: 600;
      font-size: 12px;
      color: #059669;
      margin: 0 8px;
      white-space: nowrap;
    }

    .offer-savings {
      font-size: 10px;
      font-weight: 500;
      color: #10b981;
      background: #d1fae5;
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }

    .offer-savings.verify {
      background: #fef3c7;
      color: #92400e;
    }

    /* Booking baseline */
    .inline-baseline {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      margin-top: 8px;
      font-size: 11px;
      color: #9ca3af;
      border-top: 1px solid #e5e7eb;
    }

    .baseline-price {
      font-weight: 500;
    }

    /* Verified state (no cheaper deals) */
    .inline-verified {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 8px;
      gap: 4px;
      text-align: center;
    }

    .verified-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
    }

    .verified-icon {
      font-size: 16px;
      color: #10b981;
    }

    .verified-subtitle {
      font-size: 11px;
      color: #6b7280;
    }

    /* Footer */
    .inline-footer {
      margin-top: 10px;
      text-align: center;
    }

    .inline-expand {
      font-size: 11px;
      color: #6366f1;
      cursor: pointer;
      text-decoration: none;
    }

    .inline-expand:hover {
      text-decoration: underline;
    }

    /* Loading state */
    .inline-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #6b7280;
      font-size: 12px;
      padding: 8px 0;
    }

    .inline-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(99, 102, 241, 0.2);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Pulse animation for discovery */
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
      100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
    }

    .inline-card.pulse {
      animation: pulse 1.5s ease-out;
    }

    @media (prefers-reduced-motion: reduce) {
      .inline-card.pulse { animation: none; }
      .inline-offer-row { transition: none; }
    }
  `;

  // Initial inline HTML - "Other sites" structure
  const inlineContent = document.createElement('div');
  inlineContent.className = 'inline-card';
  inlineContent.innerHTML = `
    <div class="inline-header">
      <span class="inline-title">Other sites</span>
      <span class="inline-info" title="Prices may differ slightly due to taxes/fees">ⓘ</span>
    </div>
    <div class="inline-offers">
      <div class="inline-loading">
        <span class="inline-spinner"></span>
        Checking other sites…
      </div>
    </div>
    <div class="inline-verified" style="display:none">
      <div class="verified-row">
        <span class="verified-icon">✓</span>
        <span>Other sites checked</span>
      </div>
      <span class="verified-subtitle">Booking is best right now</span>
    </div>
    <div class="inline-baseline" style="display:none">
      <span class="baseline-source">Booking</span>
      <span class="baseline-price">—</span>
    </div>
    <div class="inline-footer" style="display:none">
      <span class="inline-expand" data-action="see-all">See all deals</span>
    </div>
  `;

  inlineShadow.appendChild(inlineStyles);
  inlineShadow.appendChild(inlineContent);

  // Get inline elements for updates
  const inlineCard = inlineContent;
  const inlineOffersEl = inlineContent.querySelector('.inline-offers');
  const inlineVerifiedEl = inlineContent.querySelector('.inline-verified');
  const inlineBaselineEl = inlineContent.querySelector('.inline-baseline');
  const inlineFooterEl = inlineContent.querySelector('.inline-footer');
  const inlineExpandEl = inlineContent.querySelector('.inline-expand');

  // ========================================
  // CONTROLLER METHODS (shared updates)
  // ========================================

  // Format price for display
  function formatInlinePrice(amount, currency) {
    if (!Number.isFinite(amount)) return '—';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency || '$'}${Math.round(amount).toLocaleString()}`;
    }
  }

  // Escape HTML for safe rendering
  function escInline(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderInline() {
    if (!state.inlineVisible) {
      inlineEl.style.display = 'none';
      return;
    }
    inlineEl.style.display = 'block';

    // Loading state
    if (state.compareStatus === 'loading') {
      inlineOffersEl.innerHTML = `
        <div class="inline-loading">
          <span class="inline-spinner"></span>
          Checking other sites…
        </div>
      `;
      inlineOffersEl.style.display = 'block';
      inlineVerifiedEl.style.display = 'none';
      inlineBaselineEl.style.display = 'none';
      inlineFooterEl.style.display = 'none';
      return;
    }

    // Get offers and booking price
    const offers = state.offers?.result?.offers || state.offers?.offers || [];
    const bookingPrice = state.priceNumber;
    const currency = state.offers?.result?.query?.currency || state.offers?.query?.currency || 'USD';

    // No data yet
    if (!offers.length || !bookingPrice) {
      inlineOffersEl.innerHTML = '<div class="inline-loading">No price data</div>';
      inlineOffersEl.style.display = 'block';
      inlineVerifiedEl.style.display = 'none';
      inlineBaselineEl.style.display = 'none';
      inlineFooterEl.style.display = 'none';
      return;
    }

    // Filter to 3rd-party offers cheaper than Booking by meaningful threshold
    const cheaperOffers = offers.filter(o => {
      if (!o.total || !bookingPrice) return false;
      const source = (o.source || '').toLowerCase();
      // Exclude Booking.com itself
      if (source.includes('booking')) return false;

      // Meaningful savings threshold: ≥2% OR ≥$5 equivalent
      const savings = bookingPrice - o.total;
      const savingsPercent = (savings / bookingPrice) * 100;
      return savings > 0 && (savingsPercent >= 2 || savings >= 5);
    });

    // Sort by price ascending (cheapest first)
    cheaperOffers.sort((a, b) => (a.total || Infinity) - (b.total || Infinity));

    if (cheaperOffers.length === 0) {
      // VERIFIED STATE: No cheaper deals found
      inlineOffersEl.style.display = 'none';
      inlineVerifiedEl.style.display = 'flex';
      inlineBaselineEl.style.display = 'none';
      inlineFooterEl.style.display = 'block';
      inlineExpandEl.textContent = `See all sites (${offers.length})`;
    } else {
      // OFFERS STATE: Show top 3 cheaper offers
      const topOffers = cheaperOffers.slice(0, 3);

      inlineOffersEl.innerHTML = topOffers.map(o => {
        const savings = bookingPrice - o.total;
        const savingsPercent = Math.round((savings / bookingPrice) * 100);

        // Sanity check: >50% savings should show "Verify" instead
        const isExtremeSavings = savingsPercent > 50;
        const savingsClass = isExtremeSavings ? 'offer-savings verify' : 'offer-savings';
        const savingsText = isExtremeSavings ? 'Verify price' : `Save ${savingsPercent}%`;

        const link = o.link || '#';
        const source = o.source || 'Unknown';

        return `
          <a class="inline-offer-row" href="${escInline(link)}" target="_blank" rel="noopener noreferrer">
            <span class="offer-source">${escInline(source)}</span>
            <span class="offer-price">${formatInlinePrice(o.total, currency)}</span>
            <span class="${savingsClass}">${savingsText}</span>
          </a>
        `;
      }).join('');

      inlineOffersEl.style.display = 'block';
      inlineVerifiedEl.style.display = 'none';

      // Show Booking baseline
      inlineBaselineEl.style.display = 'flex';
      inlineBaselineEl.querySelector('.baseline-price').textContent = formatInlinePrice(bookingPrice, currency);

      // Show footer with total count
      inlineFooterEl.style.display = 'block';
      inlineExpandEl.textContent = `See all deals (${offers.length})`;
    }
  }

  const controller = {
    // DOM elements
    panelEl,
    inlineEl,

    // Access to shared state (for debugging)
    get state() { return { ...state }; },

    // ----------------------------------------
    // UPDATE METHODS (mutate state, re-render both surfaces)
    // ----------------------------------------

    updateViewingPrice(priceObj) {
      if (!priceObj || typeof priceObj !== 'object') return;

      state.viewingPrice = priceObj.rawText || state.viewingPrice;
      state.priceState = priceObj.state || 'unknown';
      state.priceNumber = Number.isFinite(priceObj.totalNumber) ? priceObj.totalNumber : null;
      state.priceTaxState = priceObj.taxState || 'unknown';

      // Delegate to panel's existing method
      if (panelEl.updateViewingPrice) {
        panelEl.updateViewingPrice(priceObj);
      }
      // Inline doesn't show viewing price, but could re-render savings
      renderInline();
    },

    updateSelectedRooms(rooms) {
      state.selectedRooms = Array.isArray(rooms) ? rooms : [];
      if (panelEl.updateSelectedRooms) {
        panelEl.updateSelectedRooms(rooms);
      }
      renderInline();
    },

    updateOffers(data) {
      state.offers = data;
      state.compareStatus = data ? 'ready' : 'idle';

      // Compute best offer
      if (data?.result?.offers && data.result.offers.length > 0) {
        // Find cheapest offer
        state.bestOffer = data.result.offers.reduce((best, offer) => {
          if (!best) return offer;
          const bestPrice = best.total || best.price || Infinity;
          const offerPrice = offer.total || offer.price || Infinity;
          return offerPrice < bestPrice ? offer : best;
        }, null);

        // Calculate savings if we have viewing price
        if (state.bestOffer && state.priceNumber) {
          const offerPrice = state.bestOffer.total || state.bestOffer.price;
          if (offerPrice && offerPrice < state.priceNumber) {
            state.bestOffer.savings = state.priceNumber - offerPrice;
            state.bestOffer.savingsPercent = Math.round((state.bestOffer.savings / state.priceNumber) * 100);
            state.bestOffer.savingsDisplay = `Save ${state.bestOffer.savingsPercent}%`;
          }
        }
      } else {
        state.bestOffer = null;
      }

      // Update panel via existing method
      if (panelEl.updateCompareData) {
        panelEl.updateCompareData(data);
      }
      renderInline();

      // Trigger discovery animation if meaningful savings found
      this.checkDiscoveryTrigger();
    },

    setDiscoveryState(triggered) {
      state.discoveryTriggered = triggered;
    },

    checkDiscoveryTrigger() {
      if (state.discoveryTriggered) return;
      if (!state.bestOffer || !state.bestOffer.savings) return;

      // Threshold: 5% savings OR equivalent of ~$10
      const SAVINGS_PERCENT_THRESHOLD = 5;
      const percent = state.bestOffer.savingsPercent || 0;

      if (percent >= SAVINGS_PERCENT_THRESHOLD) {
        state.discoveryTriggered = true;

        // Trigger pulse animation on inline card
        if (state.inlineVisible && inlineCard) {
          const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
          if (!prefersReduced) {
            inlineCard.classList.add('pulse');
            setTimeout(() => inlineCard.classList.remove('pulse'), 1500);
          }
        }

        // Notify panel to highlight best offer (Phase 3 will add more here)
        console.log('[bookDirect] Discovery triggered: meaningful savings found');
      }
    },

    // ----------------------------------------
    // VISIBILITY CONTROL (called by placers)
    // ----------------------------------------

    showInline() {
      state.inlineVisible = true;
      renderInline();
      // Auto-minimize panel when inline appears (unless pinned)
      if (panelEl.minimizeIfNotPinned) {
        panelEl.minimizeIfNotPinned();
        state.panelState = panelEl.getPanelState?.() || 'minimized';
      }
    },

    hideInline() {
      state.inlineVisible = false;
      inlineEl.style.display = 'none';
      // Restore panel when inline hides
      if (panelEl.expandIfMinimized) {
        panelEl.expandIfMinimized();
        state.panelState = panelEl.getPanelState?.() || 'expanded';
      }
    },

    setPanelState(newState) {
      if (['expanded', 'minimized', 'pinned'].includes(newState)) {
        state.panelState = newState;
      }
    },

    // ----------------------------------------
    // PASSTHROUGH METHODS (delegate to panel)
    // ----------------------------------------

    updatePrice(price) {
      state.viewingPrice = price;
      if (panelEl.updatePrice) panelEl.updatePrice(price);
    },

    updateDetails(details) {
      if (panelEl.updateDetails) panelEl.updateDetails(details);
    },

    updateCompareData(data) {
      this.updateOffers(data);
    },

    updateHotelInfo(info) {
      if (panelEl.updateHotelInfo) panelEl.updateHotelInfo(info);
      // Note: Direct site CTA removed from inline - inline now focuses on other sites
    },

    // ----------------------------------------
    // LIFECYCLE
    // ----------------------------------------

    destroy() {
      // Remove DOM elements
      if (panelEl.isConnected) panelEl.remove();
      if (inlineEl.isConnected) inlineEl.remove();

      // Clear state
      state.offers = null;
      state.bestOffer = null;
      state.discoveryTriggered = false;

      console.log('[bookDirect] UIController destroyed');
    }
  };

  // Wire up "See all deals" click to open panel and highlight deals
  const seeAllLink = inlineShadow.querySelector('[data-action="see-all"]');
  if (seeAllLink) {
    seeAllLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Expand and pin panel
      controller.setPanelState('pinned');
      if (panelEl.expandIfMinimized) panelEl.expandIfMinimized();

      // Switch to prices/deals view in panel
      if (panelEl._setActivePanel) {
        panelEl._setActivePanel('prices');
      }

      // Subtle highlight pulse on panel
      panelEl.classList.add('bd-highlight');
      setTimeout(() => panelEl.classList.remove('bd-highlight'), 600);

      console.log('[bookDirect] Inline: See all deals clicked');
    });
  }

  // ========================================
  // COMPARE UPDATE BRIDGE LISTENER
  // ========================================
  // Subscribes to compare lifecycle updates from the panel
  // to keep the inline card in sync with loading/error/ready states
  const handleCompareUpdate = (detail) => {
    if (!detail) return;

    const status = detail.status || 'idle';
    const data = detail.data || null;

    // Update state based on status
    state.compareStatus = status;

    // For 'ready' status with valid data, delegate to updateOffers
    const isReadyPayload = status === 'ready' && data && !data.error && (data.ok || Array.isArray(data.offers) || data.cheapestOfficial);
    if (isReadyPayload) {
      controller.updateOffers(data);
      return;
    }

    // For other states (loading, noDates, error), just update state and re-render
    state.offers = data;
    state.bestOffer = null;
    renderInline();
  };

  // Register callback listener
  panelEl.onCompareUpdate = handleCompareUpdate;

  // Register event listener (fallback)
  if (typeof panelEl.addEventListener === 'function') {
    panelEl.addEventListener('bd:compare', (e) => handleCompareUpdate(e.detail));
  }

  return controller;
};
