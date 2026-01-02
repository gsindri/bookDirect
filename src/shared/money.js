/**
 * Shared money parsing utilities.
 * Single canonical implementation for consistent price parsing across
 * Worker, background, and content scripts.
 * 
 * @module shared/money
 */

/**
 * Parse a money string to a number.
 * Handles various international formats:
 * - US: "1,234.56" → 1234.56
 * - EU: "1.234,56" → 1234.56
 * - Plain: "1234.56" or "1234,56" → 1234.56
 * 
 * @param {string|number|null} val - Money value to parse
 * @returns {number|null} Parsed number, or null if unparseable
 */
export function parseMoneyToNumber(val) {
    if (val == null) return null;
    if (typeof val === "number" && Number.isFinite(val)) return val;

    const s = String(val).trim();
    if (!s) return null;

    // Keep digits, comma, dot, minus. Remove currency symbols and spaces.
    let cleaned = s.replace(/[^\d.,-]/g, "").replace(/\s+/g, "");
    if (!cleaned) return null;

    const lastDot = cleaned.lastIndexOf(".");
    const lastComma = cleaned.lastIndexOf(",");
    let normalized = cleaned;

    // If both exist, the last one is probably the decimal separator.
    if (lastDot !== -1 && lastComma !== -1) {
        if (lastDot > lastComma) {
            // dot decimal, commas thousands (e.g., "1,234.56")
            normalized = cleaned.replace(/,/g, "");
        } else {
            // comma decimal, dots thousands (e.g., "1.234,56")
            normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
        }
    } else if (lastComma !== -1) {
        // Only comma
        const digitsAfter = cleaned.length - lastComma - 1;
        if (digitsAfter === 2) {
            // Likely decimal (e.g., "1234,56")
            normalized = cleaned.replace(/,/g, ".");
        } else {
            // Likely thousands (e.g., "1,234")
            normalized = cleaned.replace(/,/g, "");
        }
    } else if (lastDot !== -1) {
        // Only dot
        const digitsAfter = cleaned.length - lastDot - 1;
        if (digitsAfter === 2) {
            // Likely decimal (e.g., "1234.56")
            normalized = cleaned;
        } else {
            // Likely thousands (e.g., "1.234")
            normalized = cleaned.replace(/\./g, "");
        }
    }

    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}

/**
 * Format a number as money string.
 * 
 * @param {number} amount - Amount to format
 * @param {string} [currency='USD'] - ISO currency code
 * @param {string} [locale='en-US'] - Locale for formatting
 * @returns {string} Formatted money string
 */
export function formatMoney(amount, currency = 'USD', locale = 'en-US') {
    if (!Number.isFinite(amount)) return '';
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        // Fallback for unsupported currencies
        return `${currency} ${amount.toFixed(2)}`;
    }
}
