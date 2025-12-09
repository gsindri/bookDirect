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
        </div>
      </div>
    `;

    this._shadowRoot.innerHTML = `<style>${style}</style>${html}`;

    // Bind events
    this._shadowRoot.getElementById('draft-email').addEventListener('click', () => {
      alert('Drafting email feature coming soon!'); // Placeholder
    });
  }

  truncate(str, n) {
    return (str.length > n) ? str.substr(0, n - 1) + '&hellip;' : str;
  }
}

// Define the custom element
customElements.define('price-check-ui', PriceCheckUI);
