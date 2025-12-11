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
            <button id="draft-email">Draft Negotiation Email</button>
            <div id="open-gmail" class="secondary-link">Open in Gmail</div>
            <div id="toast" class="toast">Screenshot copied! Paste it in your email.</div>
            </div>
        </div>
      </div>
    `;

  shadowRoot.innerHTML = `<style>${baseStyle}${commonStyle}</style>${html}`;

  // TEMPLATES
  const emailTemplates = [
    {
      type: 'The Direct',
      body: (details, price) => `Hi,\n\nI want to book a stay at your hotel:\n\n${details || '(See details in attachment)'}\n\nI see a total of ${price} on Booking.com. I prefer to book directly. Can you match or beat this price?\n\nThanks,`
    },
    {
      type: 'The Friendly',
      body: (details, price) => `Hi there,\n\nI'm planning a trip and would love to stay at your place! I'm looking at:\n\n${details || '(See details in attachment)'}\n\nI found a rate of ${price} on Booking.com, but I always prefer to support hotels directly. Is there any way you could offer a better deal if I book with you?\n\nBest regards,`
    },
    {
      type: 'The Value',
      body: (details, price) => `Hello,\n\nI'm looking to make a reservation for:\n\n${details || '(See details in attachment)'}\n\nThe visible price on Booking.com is ${price}. Since booking directly saves you the commission user fees, could you pass some of those savings on to me with a better rate?\n\nThank you,`
    }
  ];

  function getEmailContent() {
    const subject = `Booking Inquiry: Direct Rate for ${_hotelName}`;
    const template = emailTemplates[Math.floor(Math.random() * emailTemplates.length)];
    const body = template.body(_roomDetails, _price);
    console.log(`bookDirect: Selected template '${template.type}'`);
    return { subject, body };
  }

  function showToast() {
    const toast = shadowRoot.getElementById('toast');
    toast.textContent = '📸 Proof Copied! Press Ctrl+V to paste the screenshot in your email.';
    toast.className = 'toast show';
    // Persistent: stays for 8 seconds to ensure they see the instruction
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 8000);
  }

  // HELPER FUNCTIONS (Internal)
  function truncate(str, n) {
    return (str.length > n) ? str.substr(0, n - 1) + '&hellip;' : str;
  }

  function captureAndCopyScreenshot() {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        console.log('bookDirect: Mock Mode');
        const mockBlob = new Blob([' [Mock Screenshot Data] '], { type: 'text/plain' });
        const item = new ClipboardItem({ 'text/plain': mockBlob });
        navigator.clipboard.write([item]).then(resolve).catch(reject);
        return;
      }

      // 1. Hide UI to prevent self-capture
      container.style.display = 'none';

      // 2. Wait for repaint (50ms)
      setTimeout(() => {
        // STEP A & B: Scrape & Inject
        const dateEl = document.querySelector('[data-testid="searchbox-dates-container"]') ||
          document.querySelector('.sb-date-field__display'); // fallback
        const sidebarEl = document.querySelector('.hprt-reservation-cta') ||
          document.querySelector('.hprt-price-block') ||
          document.body; // absolute fallback

        let injectedDiv = null;
        let rect = null;

        if (dateEl && sidebarEl) {
          const dateText = dateEl.innerText;
          injectedDiv = document.createElement('div');
          injectedDiv.style.cssText = 'background:#fff; color:#333; font-weight:bold; padding:8px; margin-bottom:10px; border:1px solid #ccc; font-size:14px; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.1);';
          injectedDiv.innerText = `Dates: ${dateText.replace(/\n/g, ' ')}`;
          sidebarEl.prepend(injectedDiv);

          // Measure with injected div
          rect = sidebarEl.getBoundingClientRect();
        } else {
          if (sidebarEl) rect = sidebarEl.getBoundingClientRect();
        }

        // STEP C: Capture
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
    await copyToClipboard(); // Wait for screenshot
    const { subject, body } = getEmailContent();
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  }

  async function openGmail() {
    await copyToClipboard(); // Wait for screenshot
    const { subject, body } = getEmailContent();
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  }

  // Bind events
  shadowRoot.getElementById('draft-email').addEventListener('click', draftEmail);
  shadowRoot.getElementById('open-gmail').addEventListener('click', openGmail);

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
