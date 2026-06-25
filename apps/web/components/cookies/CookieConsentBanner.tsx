'use client';
import { useEffect, useState } from 'react';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import {
  getCookieConsent,
  setCookieConsent,
  OPEN_COOKIE_PREFERENCES_EVENT,
} from '@/lib/cookie-consent';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  // True while no choice has ever been made — the overlay can't be
  // dismissed without picking accept/reject/save in that case. Reopening
  // via "Manage cookie preferences" (after a choice already exists) is a
  // voluntary edit, so that case stays closable.
  const [mandatory, setMandatory] = useState(false);
  const [managing, setManaging] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!getCookieConsent()) {
      setMandatory(true);
      setVisible(true);
    }

    function handleReopen() {
      const existing = getCookieConsent();
      setAnalytics(existing?.analytics ?? false);
      setMarketing(existing?.marketing ?? false);
      setMandatory(false);
      setManaging(true);
      setVisible(true);
    }

    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleReopen);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleReopen);
  }, []);

  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [visible]);

  function close() {
    setVisible(false);
    setManaging(false);
  }

  function acceptAll() {
    setCookieConsent({ analytics: true, marketing: true });
    close();
  }

  function rejectNonEssential() {
    setCookieConsent({ analytics: false, marketing: false });
    close();
  }

  function savePreferences() {
    setCookieConsent({ analytics, marketing });
    close();
  }

  if (!visible) return null;

  return (
    // No dimming/blur over the page — visitors should still be able to read
    // what the site is while deciding. This layer is transparent but still
    // covers the full viewport, so clicks on the page behind it are blocked
    // until a choice is made.
    <div className="fixed inset-0 z-[9999] flex items-end justify-center p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl sm:p-8">
        {!managing ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/10 text-2xl">
              🍪
            </div>
            <h2 className="mt-4 text-xl font-bold text-[#0A1628]">We value your privacy</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
              We use cookies to keep you signed in and, with your permission, to understand how
              PingLoyal is used. Choose what you&apos;re comfortable with — you can change this
              any time from our{' '}
              <a href="/cookies" className="font-medium text-[#0A1628] underline">
                Cookie Policy
              </a>
              .
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={acceptAll}
                className="flex-1 rounded-lg bg-[#0DC56A] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0ab55e]"
              >
                Accept all
              </button>
              <button
                type="button"
                onClick={rejectNonEssential}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-[#0A1628] hover:border-[#0A1628]"
              >
                Reject non-essential
              </button>
              <button
                type="button"
                onClick={() => setManaging(true)}
                className="flex-1 rounded-lg px-4 py-3 text-sm font-medium text-gray-500 hover:text-[#0A1628]"
              >
                Manage preferences
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-[#0A1628]">Cookie preferences</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#0A1628]">Strictly necessary</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Keeps you signed in and remembers basic preferences. Always on.
                  </p>
                </div>
                <ToggleSwitch checked disabled onChange={() => undefined} />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#0A1628]">Analytics</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Helps us understand how PingLoyal is used. Not currently active — your choice
                    is saved for when it is.
                  </p>
                </div>
                <ToggleSwitch checked={analytics} onChange={setAnalytics} />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#0A1628]">Marketing</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Used to measure the performance of our ads. Not currently active.
                  </p>
                </div>
                <ToggleSwitch checked={marketing} onChange={setMarketing} />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              {!mandatory && (
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-[#0A1628]"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={() => setManaging(false)}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-[#0A1628] hover:border-[#0A1628]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={savePreferences}
                className="rounded-lg bg-[#0DC56A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0ab55e]"
              >
                Save preferences
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
