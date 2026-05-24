import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterForm from '../app/register/[slug]/RegisterForm';
import SuccessScreen from '../app/register/[slug]/SuccessScreen';
import type { TenantInfo } from '../lib/api';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_VERIFIED: TenantInfo = {
  businessName: 'Test Store',
  logoUrl: null,
  qrCodeUrl: null,
  currency: 'NGN',
  pointsThreshold: 1000,
  rewardValue: 500,
  waVerificationStatus: 'verified',
};

const TENANT_PENDING: TenantInfo = {
  ...TENANT_VERIFIED,
  waVerificationStatus: 'pending',
};

// ── Mock fetch ────────────────────────────────────────────────────────────────

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetchOk() {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ id: 'cust-1', isNew: true }),
  });
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), 'Ada Okonkwo');
  await user.type(screen.getByLabelText(/phone number/i), '08012345678');
  await user.selectOptions(screen.getByLabelText(/country/i), 'NG');
  await user.click(screen.getByLabelText(/i consent/i));
}

// ── T60 — RegisterForm renders business name and reward info ──────────────────

it('T60 — RegisterForm renders business name and reward description', () => {
  render(<RegisterForm slug="test-store" tenantInfo={TENANT_VERIFIED} />);

  expect(screen.getByText('Test Store')).toBeInTheDocument();
  expect(screen.getByText(/1000/)).toBeInTheDocument();
  expect(screen.getByText(/500/)).toBeInTheDocument();
});

// ── T61 — fullName validation ─────────────────────────────────────────────────

it('T61 — shows validation error when fullName is too short', async () => {
  const user = userEvent.setup();
  render(<RegisterForm slug="test-store" tenantInfo={TENANT_VERIFIED} />);

  await user.type(screen.getByLabelText(/full name/i), 'A');
  await user.click(screen.getByRole('button', { name: /join/i }));

  await waitFor(() => {
    expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();
  });
});

// ── T62 — phone validation ────────────────────────────────────────────────────

it('T62 — shows validation error when phone is empty', async () => {
  const user = userEvent.setup();
  render(<RegisterForm slug="test-store" tenantInfo={TENANT_VERIFIED} />);

  await user.click(screen.getByRole('button', { name: /join/i }));

  await waitFor(() => {
    expect(screen.getByText(/phone number is required/i)).toBeInTheDocument();
  });
});

// ── T63 — age validation ──────────────────────────────────────────────────────

it('T63 — shows age error when date of birth is within last 13 years', async () => {
  const user = userEvent.setup();
  render(<RegisterForm slug="test-store" tenantInfo={TENANT_VERIFIED} />);

  const underageDate = new Date();
  underageDate.setFullYear(underageDate.getFullYear() - 12);
  const dobString = underageDate.toISOString().split('T')[0];

  await user.type(screen.getByLabelText(/full name/i), 'Ada Okonkwo');
  await user.type(screen.getByLabelText(/phone number/i), '08012345678');
  await user.selectOptions(screen.getByLabelText(/country/i), 'NG');
  fireEvent.change(screen.getByLabelText(/date of birth/i), {
    target: { value: dobString },
  });
  await user.click(screen.getByLabelText(/i consent/i));
  await user.click(screen.getByRole('button', { name: /join/i }));

  await waitFor(() => {
    expect(screen.getByText(/at least 13 years/i)).toBeInTheDocument();
  });
});

// ── T64 — waOptedIn required ──────────────────────────────────────────────────

it('T64 — shows waOptedIn consent error when checkbox is unchecked', async () => {
  const user = userEvent.setup();
  render(<RegisterForm slug="test-store" tenantInfo={TENANT_VERIFIED} />);

  await user.type(screen.getByLabelText(/full name/i), 'Ada Okonkwo');
  await user.type(screen.getByLabelText(/phone number/i), '08012345678');
  await user.selectOptions(screen.getByLabelText(/country/i), 'NG');
  // deliberately do NOT click the checkbox
  await user.click(screen.getByRole('button', { name: /join/i }));

  await waitFor(() => {
    expect(screen.getByText(/whatsapp consent is required/i)).toBeInTheDocument();
  });
});

// ── T65 — successful registration shows SuccessScreen ────────────────────────

it('T65 — shows SuccessScreen after a successful POST', async () => {
  mockFetchOk();
  const user = userEvent.setup();
  render(<RegisterForm slug="test-store" tenantInfo={TENANT_VERIFIED} />);

  await fillRequiredFields(user);
  await user.click(screen.getByRole('button', { name: /join/i }));

  await waitFor(() => {
    expect(screen.getByText(/registration successful/i)).toBeInTheDocument();
  });
});

// ── T66 — network error retries once then shows error message ─────────────────

it('T66 — retries fetch once on network error and shows an error message', async () => {
  (global.fetch as jest.Mock).mockRejectedValue(new Error('Failed to fetch'));
  const user = userEvent.setup();
  render(<RegisterForm slug="test-store" tenantInfo={TENANT_VERIFIED} />);

  await fillRequiredFields(user);
  await user.click(screen.getByRole('button', { name: /join/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

// ── T67 — SuccessScreen shows WhatsApp message when tenant is verified ────────

it('T67 — SuccessScreen shows WhatsApp message when waVerificationStatus is verified', () => {
  render(<SuccessScreen tenantInfo={TENANT_VERIFIED} />);

  expect(screen.getByText(/check whatsapp/i)).toBeInTheDocument();
});

// ── T68 — SuccessScreen shows generic message when tenant is not verified ─────

it('T68 — SuccessScreen shows generic success message when tenant is not verified', () => {
  render(<SuccessScreen tenantInfo={TENANT_PENDING} />);

  expect(screen.queryByText(/check whatsapp/i)).not.toBeInTheDocument();
  expect(screen.getByText(/successfully joined/i)).toBeInTheDocument();
});

// ── T69 — country selector renders NG and GB options ─────────────────────────

it('T69 — country selector renders Nigeria and United Kingdom options', () => {
  render(<RegisterForm slug="test-store" tenantInfo={TENANT_VERIFIED} />);

  expect(screen.getByRole('option', { name: /nigeria/i })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: /united kingdom/i })).toBeInTheDocument();
});
