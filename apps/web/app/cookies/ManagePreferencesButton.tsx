'use client';
import { openCookiePreferences } from '@/lib/cookie-consent';

export function ManagePreferencesButton() {
  return (
    <button
      type="button"
      onClick={openCookiePreferences}
      className="mt-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#0A1628] hover:border-[#0A1628]"
    >
      Manage cookie preferences
    </button>
  );
}
