const STORAGE_KEY = 'cookie_consent';
export const OPEN_COOKIE_PREFERENCES_EVENT = 'open-cookie-preferences';

export interface CookieConsent {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

export function getCookieConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CookieConsent;
  } catch {
    return null;
  }
}

export function setCookieConsent(prefs: { analytics: boolean; marketing: boolean }): void {
  const consent: CookieConsent = {
    necessary: true,
    analytics: prefs.analytics,
    marketing: prefs.marketing,
    decidedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
}

// Lets the Cookie Policy page (or anywhere else) reopen the preferences
// panel after the visitor has already made a choice — CookieConsentBanner
// listens for this on window.
export function openCookiePreferences(): void {
  window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT));
}
