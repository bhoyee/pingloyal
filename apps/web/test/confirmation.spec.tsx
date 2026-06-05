import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockRouter = { replace: jest.fn() };

import ConfirmationScreen from '../app/cashier/transaction/ConfirmationScreen';
import type { ConfirmationData } from '../app/cashier/transaction/ConfirmationScreen';

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

it('T100 — shows points earned from session data', () => {
  render(<ConfirmationScreen data={BASE_DATA} />);

  expect(screen.getByText(/\+50/)).toBeInTheDocument();
  expect(screen.getByText('Ada Okonkwo')).toBeInTheDocument();
  expect(screen.getByText(/400 pts total/i)).toBeInTheDocument();
});

// ── T101 — WA queued line when verified ──────────────────────────────────────

it('T101 — shows WhatsApp queued line when WA is verified', () => {
  render(<ConfirmationScreen data={BASE_DATA} />);

  expect(
    screen.getByText(/whatsapp message queued/i),
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
    screen.queryByText(/whatsapp message queued/i),
  ).not.toBeInTheDocument();
});

// ── T103 — auto-navigates after 3 seconds ────────────────────────────────────

it('T103 — auto-navigates to /cashier after 3 seconds', () => {
  render(<ConfirmationScreen data={BASE_DATA} />);

  act(() => {
    jest.advanceTimersByTime(3000);
  });

  expect(mockRouter.replace).toHaveBeenCalledWith('/cashier');
});

// ── T104 — tap dismisses immediately ─────────────────────────────────────────

it('T104 — tapping the screen navigates immediately without waiting', async () => {
  jest.useRealTimers();
  const user = userEvent.setup();
  render(<ConfirmationScreen data={BASE_DATA} />);

  await user.click(
    screen.getByLabelText(/confirmation screen/i),
  );

  expect(mockRouter.replace).toHaveBeenCalledWith('/cashier');
});
