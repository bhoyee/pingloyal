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
  const [managing, setManaging] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true);

    function handleReopen() {
      const existing = getCookieConsent();
      setAnalytics(existing?.analytics ?? false);
      setMarketing(existing?.marketing ?? false);
      setManaging(true);
      setVisible(true);
    }

    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleReopen);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleReopen);
  }, []);

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
    <div className="fixed inset-x-0 bottom-0 z-[9999] border-t border-gray-200 bg-white px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:px-6">
      <div className="mx-auto max-w-3xl">
        {!managing ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-relaxed text-gray-600">
              We use cookies to keep you signed in and, with your permission, to understand how
              PingLoyal is used. Read our{' '}
              <a href="/cookies" className="font-medium text-[#0A1628] underline">
                Cookie Policy
              </a>
              .
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setManaging(true)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#0A1628] hover:border-[#0A1628]"
              >
                Manage
              </button>
              <button
                type="button"
                onClick={rejectNonEssential}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#0A1628] hover:border-[#0A1628]"
              >
                Reject all
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="rounded-lg bg-[#0DC56A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0ab55e]"
              >
                Accept all
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-[#0A1628]">Cookie preferences</p>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-[#0A1628]">Strictly necessary</p>
                  <p className="text-xs text-gray-500">
                    Keeps you signed in and remembers basic preferences. Always on.
                  </p>
                </div>
                <ToggleSwitch checked disabled onChange={() => undefined} />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-[#0A1628]">Analytics</p>
                  <p className="text-xs text-gray-500">
                    Helps us understand how PingLoyal is used. Not currently active — your choice
                    is saved for when it is.
                  </p>
                </div>
                <ToggleSwitch checked={analytics} onChange={setAnalytics} />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-[#0A1628]">Marketing</p>
                  <p className="text-xs text-gray-500">
                    Used to measure the performance of our ads. Not currently active.
                  </p>
                </div>
                <ToggleSwitch checked={marketing} onChange={setMarketing} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setManaging(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#0A1628] hover:border-[#0A1628]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={savePreferences}
                className="rounded-lg bg-[#0DC56A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0ab55e]"
              >
                Save preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
