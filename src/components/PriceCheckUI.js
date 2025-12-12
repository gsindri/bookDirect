// Factory function to create the UI
window.BookDirect = window.BookDirect || {};

window.BookDirect.createUI = function (hotelName, price, isSidebar = false) {
  const container = document.createElement('div');
  const shadowRoot = container.attachShadow({ mode: 'closed' });

  // Internal state
  let _hotelName = hotelName;
  let _price = price;
  let _roomDetails = '';

  const baseStyle = isSidebar ? `
      :host, .host-wrapper {
        position: relative;
        width: 100%;
        margin-top: 10px;
        margin-bottom: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .container {
        width: 100%;
        box-sizing: border-box; 
        border-radius: 4px; /* Flatter for sidebar */
        background: #fff;
        border: 2px solid #003580; /* Distinct border */
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
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
      }
    `;

  const commonStyle = `
      .container {
        padding: 16px;
        transition: transform 0.3s ease;
        animation: slideIn 0.5s ease-out;
      }

      @keyframes slideIn {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        border-bottom: 1px solid #eee;
        padding-bottom: 8px;
      }

      .logo {
        font-weight: 700;
        color: #003580; /* Booking.com blue */
        font-size: 16px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .logo-icon {
        width: 16px;
        height: 16px;
        background: #003580;
        border-radius: 3px;
        display: inline-block;
      }

      .content {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        font-size: 14px;
        color: #444;
      }

      .label {
        font-weight: 500;
        color: #666;
      }

      .value {
        font-weight: 700;
        color: #003580;
      }
      
      .value.price {
        color: #008009; /* Green for price */
        font-size: 16px;
      }

      button {
        background: #003580;
        color: white;
        border: none;
        padding: 10px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        width: 100%;
        margin-top: 12px;
        transition: background 0.2s;
      }

      button:hover {
        background: #00224f;
      }

      .secondary-link {
        text-align: center;
        margin-top: 8px;
        font-size: 12px;
        color: #666;
        cursor: pointer;
        text-decoration: underline;
      }
      
      .secondary-link:hover {
        color: #003580;
      }

      /* Outline-style button for Official Website */
      .btn-outline {
        background: transparent;
        color: #008009;
        border: 2px solid #008009;
        padding: 8px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        width: 100%;
        margin-top: 8px;
        transition: background 0.2s, color 0.2s;
        font-size: 13px;
      }

      .btn-outline:hover {
        background: #008009;
        color: white;
      }

      /* Phone link styling */
      .phone-link {
        display: block;
        text-align: center;
        margin-top: 8px;
        font-size: 12px;
        color: #003580;
        text-decoration: none;
      }

      .phone-link:hover {
        text-decoration: underline;
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
    `;

  const html = `
      <div class="host-wrapper">
        <div class="container">
            <div class="header">
            <div class="logo">
                <span class="logo-icon"></span>
                bookDirect
            </div>
            </div>
            <div class="content">
            <div class="info-row">
                <span class="label">Hotel:</span>
                <span class="value" title="${_hotelName}">${truncate(_hotelName, 20)}</span>
            </div>
            <div class="info-row">
                <span class="label">Current Price:</span>
                <span class="value price">${_price}</span>
            </div>
            
            <!-- Error Tooltip -->
            <div id="error-tooltip" class="error-tooltip">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:16px;">⚠️</span>
                    <span>Please select rooms in the table first.</span>
                </div>
            </div>

            <button id="draft-email">Draft Negotiation Email</button>
            <div id="open-gmail" class="secondary-link">Open in Gmail</div>
            <div id="dynamic-buttons" class="dynamic-buttons"></div>
            <div id="toast" class="toast">Screenshot copied! Psssaste it in your email.</div>
            </div>
        </div>
      </div>
    `;

  shadowRoot.innerHTML = `<style>${baseStyle}${commonStyle}</style>${html}`;

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

    // HOTEL NAME (At the top for trust)
    if (hotelName) {
      const hotelHeader = document.createElement('div');
      hotelHeader.innerText = hotelName;
      hotelHeader.style.cssText = 'font-weight:700; color:#003b95; font-size:18px; margin-bottom:8px; text-align:left;';
      grid.appendChild(hotelHeader);

      const divider = document.createElement('div');
      divider.style.cssText = 'border-bottom:1px solid #e7e7e7; margin-bottom:12px;';
      grid.appendChild(divider);
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
        // Also style the select itself slightly to match
        sel.style.border = '1px solid #d4111e';

        highlightedElements.push({ cell, sel });
      }
    });

    // 3. Show Bubble (Native Booking style)
    // Create a temporary div in the body (outside shadow root)
    const bubble = document.createElement('div');
    bubble.style.cssText = `
        position: absolute;
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
        min-width: 180px;
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

    // Position it
    const rect = firstSelect.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    // Position: To the RIGHT of the select, vertically centered
    // rect.right + spacing
    bubble.style.top = (rect.top + scrollTop + (rect.height / 2) - 20) + 'px'; // Center roughly
    bubble.style.left = (rect.right + scrollLeft + 12) + 'px';

    // Show
    requestAnimationFrame(() => { bubble.style.opacity = '1'; });

    // CLEANUP FUNCTION
    const clearHighlights = () => {
      bubble.style.opacity = '0';
      setTimeout(() => bubble.remove(), 300);

      highlightedElements.forEach(({ cell, sel }) => {
        cell.style.backgroundColor = '';
        sel.style.border = '';
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

      // 1. Hide UI
      container.style.display = 'none';

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

          // Measure
          rect = sidebarEl.getBoundingClientRect();
        }

        // STEP C: Capture
        // FIX: Yield to browser to ensure the injected div is painted before capturing
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            chrome.runtime.sendMessage({ type: 'ACTION_CAPTURE_VISIBLE_TAB' }, async (response) => {
              // STEP D: Cleanup immediately (Restore UI & Remove Injection)
              container.style.display = ''; // Restore visibility
              if (injectedDiv) injectedDiv.remove();

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
      }, 50);
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
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  }

  async function openGmail() {
    // VALIDATION: Gatekeeper check
    if (!_roomDetails || _roomDetails.length === 0) {
      showError();
      return;
    }

    await copyToClipboard(); // Wait for screenshot
    const { subject, body } = getEmailContent();
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  }

  // Bind events
  shadowRoot.getElementById('draft-email').addEventListener('click', draftEmail);
  shadowRoot.getElementById('open-gmail').addEventListener('click', openGmail);

  // FETCH HOTEL DETAILS FROM BACKEND (async, non-blocking)
  (async function fetchHotelDetails() {
    try {
      const apiUrl = `https://hotelfinder.gsindrih.workers.dev/?query=${encodeURIComponent(_hotelName)}`;
      const response = await fetch(apiUrl);

      if (!response.ok) return; // Fail silently

      const data = await response.json();
      const dynamicContainer = shadowRoot.getElementById('dynamic-buttons');

      if (!dynamicContainer) return;

      // Add Official Website button
      if (data.website) {
        const websiteBtn = document.createElement('button');
        websiteBtn.className = 'btn-outline';
        websiteBtn.textContent = '🌐 Official Website';
        websiteBtn.addEventListener('click', () => {
          window.open(data.website, '_blank');
        });
        dynamicContainer.appendChild(websiteBtn);
      }

      // Add Phone link
      if (data.phone) {
        const phoneLink = document.createElement('a');
        phoneLink.className = 'phone-link';
        phoneLink.href = `tel:${data.phone.replace(/\s/g, '')}`;
        phoneLink.textContent = `📞 ${data.phone}`;
        dynamicContainer.appendChild(phoneLink);
      }

    } catch (e) {
      // Fail silently - don't show errors to user
      console.log('bookDirect: Hotel details fetch failed (silent):', e.message);
    }
  })();

  // Expose update methods
  container.updatePrice = function (newPrice) {
    _price = newPrice;
    const priceEl = shadowRoot.querySelector('.value.price');
    if (priceEl) {
      priceEl.textContent = newPrice;

      // Small animation to show update
      priceEl.style.transition = 'color 0.3s';
      priceEl.style.color = '#e2aa11'; // Flash yellow/gold
      setTimeout(() => {
        priceEl.style.color = '#008009'; // Back to green
      }, 500);
    }
  };

  container.updateDetails = function (details) {
    _roomDetails = details;
  };

  return container;
};
