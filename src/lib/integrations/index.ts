import 'server-only';

/**
 * Integration ports. Every external dependency sits behind one of these interfaces.
 * Today each port has a single honest implementation: the manual fallback.
 * A real adapter is added by implementing the interface and returning it from the factory —
 * nothing else in the app needs to change.
 *
 * No marketplace API, payment, cargo or FX access exists yet. Nothing here pretends otherwise.
 */

// ── Product data (photo + price preview) ──
// Lives in src/lib/product-preview: allow-listed stores, SSRF-safe fetch, JSON-LD / Open Graph parsing.

// ── Payments (Azerbaijani PSPs: e.g. Kapital Bank, PAŞA Bank, Payriff, Epoint...) ──
export interface PaymentProvider {
  readonly key: string;
  /** True when the provider itself confirms payments (webhook). Manual = staff confirms. */
  readonly autoConfirms: boolean;
  /** Returns a redirect URL for hosted checkout, or null when the customer pays offline. */
  createCheckout(args: { orderId: string; amountAzn: number }): Promise<{ redirectUrl: string | null }>;
}

const manualPayments: PaymentProvider = {
  key: 'manual',
  autoConfirms: false,
  async createCheckout() {
    return { redirectUrl: null };
  },
};

export function getPaymentProvider(): PaymentProvider {
  return manualPayments;
}

// ── Cargo / logistics tracking ──
export interface CargoTracker {
  /** Returns the latest carrier status text, or null when it must be updated by staff. */
  fetchStatus(trackingNumber: string, carrier: string): Promise<string | null>;
}

export function getCargoTracker(): CargoTracker {
  return { fetchStatus: async () => null };
}

// ── Exchange rates ──
export interface ExchangeRateProvider {
  /** Returns AZN per 1 unit of each currency, or null when rates are maintained manually. */
  fetchRates(currencies: string[]): Promise<Record<string, number> | null>;
}

export function getExchangeRateProvider(): ExchangeRateProvider {
  return { fetchRates: async () => null };
}

// ── Image-based product search ──
export interface ImageSearchProvider {
  search(image: Buffer): Promise<{ url: string; title: string }[] | null>;
}

export function getImageSearchProvider(): ImageSearchProvider {
  // Staff source photo requests manually until a provider is connected.
  return { search: async () => null };
}
