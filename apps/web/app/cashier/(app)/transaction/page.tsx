'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  cashierApi,
  ApiError,
  type CustomerLookupResult,
  type Category,
  type TransactionResult,
} from '@/lib/api';
import { useCashier } from '../../context/cashier-context';
import { addToQueue } from '@/lib/offline-queue';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  food: '🍎',
  food_groceries: '🍎',
  beverages: '🥤',
  baby_products: '👶',
  electronics: '📱',
  fashion: '👗',
  household: '🏠',
  health_beauty: '💊',
  other: '📦',
};

const OTHER_CATEGORY: Category = { id: 'other', name: 'Other', slug: 'other' };

function categoryIcon(slug: string): string {
  return CATEGORY_ICONS[slug] ?? '🛍️';
}

function currencySymbol(currency: string): string {
  return currency === 'GBP' ? '£' : '₦';
}

function sanitiseAmount(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, '');
  const parts = v.split('.');
  if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
  if (parts[1] !== undefined && parts[1].length > 2) {
    v = parts[0] + '.' + parts[1].slice(0, 2);
  }
  return v;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TransactionPage() {
  const router = useRouter();
  const { tenant, refreshOfflineCount } = useCashier();

  const [customer, setCustomer] = useState<CustomerLookupResult | null>(null);
  const [amount, setAmount] = useState('');
  const [pointsPreview, setPointsPreview] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Generated once on mount — same key reused on retry to prevent double-charge
  const idempotencyKey = useRef(crypto.randomUUID());
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load customer from sessionStorage ────────────────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem('cashier_selected_customer');
    if (!raw) {
      router.replace('/cashier');
      return;
    }
    try {
      setCustomer(JSON.parse(raw) as CustomerLookupResult);
    } catch {
      router.replace('/cashier');
    }
  }, [router]);

  // ── Load categories (with sessionStorage cache) ────────────────────────────
  useEffect(() => {
    const cached = sessionStorage.getItem('cashier_categories');
    if (cached) {
      try {
        setCategories(JSON.parse(cached) as Category[]);
        return;
      } catch {
        /* fall through to fetch */
      }
    }

    cashierApi
      .get<Category[]>('/tenants/categories')
      .then((cats) => {
        sessionStorage.setItem('cashier_categories', JSON.stringify(cats));
        setCategories(cats);
      })
      .catch(() => {
        // Offline or error — show only 'Other' fallback
        setCategories([]);
      });
  }, []);

  // ── Points preview (200ms debounce) ──────────────────────────────────────────
  const schedulePreview = useCallback(
    (value: string) => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => {
        const parsed = parseFloat(value);
        if (!value || isNaN(parsed) || parsed <= 0) {
          setPointsPreview(null);
          return;
        }
        const earnRate = tenant?.pointsEarnRate ?? 100;
        setPointsPreview(Math.floor(parsed / earnRate));
      }, 200);
    },
    [tenant?.pointsEarnRate],
  );

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = sanitiseAmount(e.target.value);
    setAmount(value);
    setAmountError(null);
    schedulePreview(value);
  }

  function handleAmountFocus() {
    if (amount === '0.00') setAmount('');
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!customer || !tenant) return;

    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setAmountError('Please enter a valid amount greater than 0');
      return;
    }

    const decimalParts = amount.split('.');
    if (decimalParts[1] !== undefined && decimalParts[1].length > 2) {
      setAmountError('Maximum 2 decimal places allowed');
      return;
    }

    const categoryId =
      selectedCategoryId === 'other' ? null : selectedCategoryId;

    // ── Offline flow (device is offline) ─────────────────────────────────────
    if (!navigator.onLine) {
      await saveOffline(customer, amount, categoryId);
      return;
    }

    // ── Online flow ───────────────────────────────────────────────────────────
    setSubmitting(true);
    try {
      const result = await cashierApi.post<TransactionResult>('/transactions', {
        customerId: customer.id,
        amount,
        categoryId,
        idempotencyKey: idempotencyKey.current,
        notes: null,
      });

      // Store confirmation data for the next screen
      const confirmData = {
        transactionId: result.id,
        customerName: result.customer.fullName,
        pointsEarned: result.pointsEarned,
        newBalance: result.customer.pointsBalance,
        progressPercent: result.customer.progressPercent,
        threshold: tenant.pointsThreshold,
        tier: result.customer.tier,
        waVerificationStatus: tenant.whatsapp?.verificationStatus ?? '',
      };
      sessionStorage.setItem(
        'cashier_last_transaction',
        JSON.stringify(confirmData),
      );
      router.replace('/cashier/confirmation');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 0) {
          // Network error — fall through to offline save
          setToast('Network error — saving offline');
          await saveOffline(customer, amount, categoryId);
        } else if (err.status === 400) {
          setAmountError(err.message);
        } else if (err.status === 401) {
          router.replace('/cashier/login');
        } else if (err.status === 404) {
          setAmountError('Customer not found — please search again');
          setTimeout(() => router.replace('/cashier'), 2000);
        } else {
          setToast('Server error — transaction saved offline for retry');
          await saveOffline(customer, amount, categoryId);
        }
      } else {
        await saveOffline(customer, amount, categoryId);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function saveOffline(
    cust: CustomerLookupResult,
    amt: string,
    catId: string | null,
  ) {
    await addToQueue({
      tenantId: tenant?.id ?? '',
      customerId: cust.id,
      customerName: cust.fullName,
      amount: amt,
      categoryId: catId,
      idempotencyKey: idempotencyKey.current,
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
    });
    refreshOfflineCount();
    setToast('Saved offline — will sync when connected');
    setTimeout(() => router.replace('/cashier'), 1500);
  }

  // ── Derived display values ────────────────────────────────────────────────────
  const symbol = currencySymbol(tenant?.currency ?? 'NGN');
  const earnRate = tenant?.pointsEarnRate ?? 100;
  const parsedAmount = parseFloat(amount);
  const isValidAmount =
    !!amount && !isNaN(parsedAmount) && parsedAmount > 0;
  const pts = isValidAmount ? Math.floor(parsedAmount / earnRate) : 0;

  function buttonText() {
    if (!isValidAmount) return 'Enter Amount to Continue';
    if (pts === 0) return 'Amount Too Small — No Points Earned';
    return `Add ${pts} Points →`;
  }

  const buttonDisabled = !isValidAmount || submitting;

  const displayCategories = [
    ...categories.filter((c) => c.slug !== 'other'),
    ...(categories.some((c) => c.slug === 'other') ? [] : [OTHER_CATEGORY]),
    ...categories.filter((c) => c.slug === 'other'),
  ];

  if (!customer) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Section 1 — Customer summary */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-base font-bold text-gray-900">
              {customer.fullName}
            </p>
            <p className="text-sm text-green-600 font-semibold">
              {customer.pointsBalance.toLocaleString()} pts
            </p>
          </div>
          {customer.tier && (
            <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1 rounded-full">
              {customer.tier}
            </span>
          )}
        </div>
        <div
          className="h-1.5 bg-gray-100 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={customer.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-green-500 rounded-full"
            style={{ width: `${customer.progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24 space-y-6">
        {/* Section 2 — Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Purchase Amount
          </label>
          <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-green-500">
            <span className="text-2xl font-medium text-gray-500">{symbol}</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Amount"
              value={amount}
              onChange={handleAmountChange}
              onFocus={handleAmountFocus}
              placeholder="0.00"
              className="flex-1 text-3xl font-semibold text-gray-900 bg-transparent outline-none"
              style={{ fontSize: 28 }}
            />
          </div>
          {amountError && (
            <p role="alert" className="text-sm text-red-600 mt-1">
              {amountError}
            </p>
          )}
          {/* Live points preview */}
          {isValidAmount && pointsPreview !== null && (
            <p
              aria-label="Points preview"
              className="text-sm text-gray-500 mt-1.5"
            >
              {symbol}
              {parseFloat(amount).toLocaleString()} ={' '}
              {pointsPreview > 0 ? (
                <span className="text-green-600 font-medium">
                  {pointsPreview} point{pointsPreview !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-orange-500">
                  0 points (below minimum)
                </span>
              )}
            </p>
          )}
        </div>

        {/* Section 3 — Category */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Category</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {displayCategories.map((cat) => {
              const selected = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    setSelectedCategoryId(selected ? null : cat.id)
                  }
                  className={`flex flex-col items-center justify-center min-h-[72px] rounded-xl border text-xs font-medium transition-colors ${
                    selected
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  <span className="text-xl mb-1">{categoryIcon(cat.slug)}</span>
                  <span className="leading-tight text-center px-1">
                    {cat.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-20 left-4 right-4 bg-gray-800 text-white text-sm rounded-xl px-4 py-3 text-center shadow-lg"
        >
          {toast}
        </div>
      )}

      {/* Section 4 — Confirm button (fixed bottom) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={buttonDisabled}
          aria-label={buttonText()}
          className={`w-full min-h-[56px] rounded-xl text-base font-semibold transition-colors ${
            buttonDisabled
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing…
            </span>
          ) : (
            buttonText()
          )}
        </button>
      </div>
    </div>
  );
}
