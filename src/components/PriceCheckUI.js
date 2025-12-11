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

  // HELPER FUNCTIONS (Internal)
  function truncate(str, n) {
    return (str.length > n) ? str.substr(0, n - 1) + '&hellip;' : str;
  }

  function getEmailContent() {
    const subject = `Question about booking directly`;
    let body = `Hi there,\n\nI'm looking to book a room at your hotel. I saw you listed on Booking.com for ${_price}, but I'd much rather book directly with you so you don't have to pay their commission fees.\n\n`;

    if (_roomDetails) {
      body += `I'm interested in:\n${_roomDetails}\n\n`;
    }

    body += `If I book directly right now, could you offer a better rate or maybe throw in breakfast?\n\nThanks,`;
    return { subject, body };
  }

  function showToast() {
    const toast = shadowRoot.getElementById('toast');
    toast.className = 'toast show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
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

      chrome.runtime.sendMessage({ type: 'ACTION_CAPTURE_VISIBLE_TAB' }, async (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          reject(chrome.runtime.lastError || response?.error);
          return;
        }
        try {
          const res = await fetch(response.dataUrl);
          const blob = await res.blob();
          const item = new ClipboardItem({ [blob.type]: blob });
          await navigator.clipboard.write([item]);
          resolve();
        } catch (err) { reject(err); }
      });
    });
  }

  async function copyToClipboard() {
    try {
      await captureAndCopyScreenshot();
      showToast();
    } catch (e) {
      console.error('Screenshot copy failed', e);
      const clipText = `Found on Booking.com for ${_price}`;
      navigator.clipboard.writeText(clipText);
    }
  }

  function draftEmail() {
    const { subject, body } = getEmailContent();
    copyToClipboard();
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  }

  function openGmail() {
    const { subject, body } = getEmailContent();
    copyToClipboard();
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
