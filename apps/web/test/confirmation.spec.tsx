import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockRouter = { replace: jest.fn() };

import ConfirmationScreen from '../app/cashier/(app)/transaction/ConfirmationScreen';
import type { ConfirmationData } from '../app/cashier/(app)/transaction/ConfirmationScreen';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_DATA: ConfirmationData = {
  transactionId: 'tx-001',
  customerName: 'Ada Okonkwo',
  pointsEarned: 50,
  newBalance: 400,
  progressPercent: 40,
  threshold: 1000,
  tier: 'Silver',
  waVerificationStatus: 'verified',
  amount: '5000',
  categoryName: 'Food',
  currency: 'NGN',
  queued: false,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  sessionStorage.setItem('cashier_last_transaction', JSON.stringify(BASE_DATA));
  sessionStorage.setItem(
    'cashier_selected_customer',
    JSON.stringify({ id: 'cust-1' }),
  );
});

afterEach(() => {
  jest.useRealTimers();
  jest.resetAllMocks();
  sessionStorage.clear();
});

// ── T100 — shows points earned ────────────────────────────────────────────────

it('T100 — shows points earned and customer name', () => {
  render(<ConfirmationScreen data={BASE_DATA} />);

  expect(screen.getByText(/\+50/)).toBeInTheDocument();
  expect(screen.getByText(/Ada Okonkwo/)).toBeInTheDocument();
  expect(screen.getByText(/400/)).toBeInTheDocument();
});

// ── T101 — WA nudge line when verified ───────────────────────────────────────

it('T101 — shows WhatsApp nudge line when WA is verified', () => {
  render(<ConfirmationScreen data={BASE_DATA} />);

  expect(
    screen.getByText(/whatsapp nudge sent automatically/i),
  ).toBeInTheDocument();
});

// ── T102 — no WA line when not verified ──────────────────────────────────────

it('T102 — does NOT show WhatsApp line when WA is not verified', () => {
  render(
    <ConfirmationScreen
      data={{ ...BASE_DATA, waVerificationStatus: 'pending' }}
    />,
  );

  expect(
    screen.queryByText(/whatsapp nudge sent automatically/i),
  ).not.toBeInTheDocument();
});

// ── T103 — auto-navigates after 8 seconds ────────────────────────────────────

it('T103 — auto-navigates to /cashier after 8 seconds', () => {
  render(<ConfirmationScreen data={BASE_DATA} />);

  act(() => {
    jest.advanceTimersByTime(8000);
  });

  expect(mockRouter.replace).toHaveBeenCalledWith('/cashier');
});

// ── T104 — button dismisses immediately ──────────────────────────────────────

it('T104 — clicking New Customer navigates immediately', async () => {
  jest.useRealTimers();
  const user = userEvent.setup();
  render(<ConfirmationScreen data={BASE_DATA} />);

  await user.click(screen.getByRole('button', { name: /new customer/i }));

  expect(mockRouter.replace).toHaveBeenCalledWith('/cashier');
});

// ── T105 — offline/queued state shows amber UI ───────────────────────────────

it('T105 — queued:true shows "Transaction Queued" heading and offline notice', () => {
  render(<ConfirmationScreen data={{ ...BASE_DATA, queued: true }} />);

  expect(screen.getByText(/transaction queued/i)).toBeInTheDocument();
  expect(screen.getByText(/saved offline/i)).toBeInTheDocument();
  expect(screen.queryByText(/whatsapp nudge/i)).not.toBeInTheDocument();
});
