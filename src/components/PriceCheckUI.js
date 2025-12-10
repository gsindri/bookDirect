class PriceCheckUI extends HTMLElement {
  constructor() {
    super();
    this._shadowRoot = this.attachShadow({ mode: 'closed' }); // Closed shadow DOM to prevent external styles interfering
    this._hotelName = 'Unknown Hotel';
    this._price = 'N/A';
  }

  static get observedAttributes() {
    return ['hotel-name', 'price'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'hotel-name') {
      this._hotelName = newValue;
    }
    if (name === 'price') {
      this._price = newValue;
    }
    this.render();
  }

  set hotelName(value) {
    this.setAttribute('hotel-name', value);
  }

  set price(value) {
    this.setAttribute('price', value);
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const style = `
      :host {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      
      .container {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
        border-radius: 12px;
        padding: 16px;
        width: 300px;
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
            <span class="value" title="${this._hotelName}">${this.truncate(this._hotelName, 20)}</span>
          </div>
          <div class="info-row">
            <span class="label">Current Price:</span>
            <span class="value price">${this._price}</span>
          </div>
          <button id="draft-email">Draft Negotiation Email</button>
          <div id="open-gmail" class="secondary-link">Open in Gmail</div>
          <div id="toast" class="toast">Screenshot copied! Paste it in your email.</div>
        </div>
      </div>
    `;

    this._shadowRoot.innerHTML = `<style>${style}</style>${html}`;

    // Bind events
    this._shadowRoot.getElementById('draft-email').addEventListener('click', () => {
      this.draftEmail();
    });

    this._shadowRoot.getElementById('open-gmail').addEventListener('click', () => {
      this.openGmail();
    });
  }

  draftEmail() {
    const { subject, body } = this.getEmailContent();

    // 1. Copy to Clipboard
    this.copyToClipboard();

    // 2. Open Email Client
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  }

  openGmail() {
    const { subject, body } = this.getEmailContent();
    this.copyToClipboard();

    // Gmail compose URL
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  }

  getEmailContent() {
    const subject = `Question about booking directly`;
    const body = `Hi there,\n\nI'm looking to book a room at your hotel. I saw you listed on Booking.com for ${this._price}, but I'd much rather book directly with you so you don't have to pay their commission fees.\n\nIf I book directly right now, could you offer a better rate or maybe throw in breakfast?\n\nThanks,`;
    return { subject, body };
  }

  async copyToClipboard() {
    // 1. Copy Screenshot
    try {
      await this.captureAndCopyScreenshot();
      this.showToast();
    } catch (e) {
      console.error('Screenshot copy failed', e);
      // Fallback to text if screenshot fails
      const clipText = `Found on Booking.com for ${this._price}`;
      navigator.clipboard.writeText(clipText);
    }
  }

  captureAndCopyScreenshot() {
    return new Promise((resolve, reject) => {
      // Detect if we are in Test Harness (Mock Mode)
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        console.log('bookDirect: Mock Mode - Copying mock data');
        const mockBlob = new Blob([' [Mock Screenshot Data] '], { type: 'text/plain' });
        const item = new ClipboardItem({ 'text/plain': mockBlob });
        navigator.clipboard.write([item]).then(resolve).catch(reject);
        return;
      }

      // Real Extension Mode
      chrome.runtime.sendMessage({ type: 'ACTION_CAPTURE_VISIBLE_TAB' }, async (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          reject(chrome.runtime.lastError || response?.error);
          return;
        }

        try {
          // Convert Base64 to Blob
          const res = await fetch(response.dataUrl);
          const blob = await res.blob();

          // Write to clipboard
          const item = new ClipboardItem({ [blob.type]: blob });
          await navigator.clipboard.write([item]);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  showToast() {
    const toast = this._shadowRoot.getElementById('toast');
    toast.className = 'toast show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
  }

  truncate(str, n) {
    return (str.length > n) ? str.substr(0, n - 1) + '&hellip;' : str;
  }
}

// Define the custom element
customElements.define('price-check-ui', PriceCheckUI);
