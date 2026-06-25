'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Joyride, EVENTS, STATUS, type EventData, type Step } from 'react-joyride';
import { api, type TenantMe } from '@/lib/api';

interface TourProfile {
  productTourCompletedAt: string | null;
}

// Anchored to the data-tour attributes set on Sidebar.tsx's nav links.
const WELCOME_STEP: Step = {
  target: 'body',
  placement: 'center',
  title: 'Welcome to PingLoyal',
  content: "Here's a quick walkthrough of where everything lives. Skip any time — you can replay this later from Profile.",
};

const CORE_STEPS: Step[] = [
  {
    target: '[data-tour="nav-dashboard"]',
    title: 'Dashboard',
    content: 'A snapshot of your customers, points awarded, and recent activity.',
  },
  {
    target: '[data-tour="nav-customers"]',
    title: 'Customers',
    content:
      'Everyone who scans your QR code or messages your WhatsApp number shows up here, with their points balance and tier.',
  },
  {
    target: '[data-tour="nav-campaigns"]',
    title: 'Campaigns',
    content: 'Broadcast a WhatsApp promo or reminder to a segment of your customers.',
  },
  {
    target: '[data-tour="nav-triggers"]',
    title: 'Triggers',
    content:
      "Automatic WhatsApp messages — like a thank-you after a purchase, or a nudge when someone hasn't visited in a while.",
  },
  {
    target: '[data-tour="nav-bot"]',
    title: 'WA Bot',
    content: 'Configure how your WhatsApp number auto-replies to customer messages.',
  },
  {
    target: '[data-tour="nav-reports"]',
    title: 'Reports',
    content: 'Track how your loyalty programme is performing over time.',
  },
];

// Only rendered in the sidebar (and therefore only relevant to the tour)
// when the tenant is on Native mode — see Sidebar.tsx's `tenant?.mode !==
// 'connected'` check.
const NATIVE_MODE_STEPS: Step[] = [
  {
    target: '[data-tour="nav-cashier-app"]',
    title: 'Cashier App',
    content: 'A simple till screen your staff use to log purchases and award points.',
  },
  {
    target: '[data-tour="nav-qr-registration"]',
    title: 'QR Registration',
    content: 'Print or display this QR code so new customers can join your loyalty programme themselves.',
  },
];

const SETTINGS_STEPS: Step[] = [
  {
    target: '[data-tour="nav-settings"]',
    title: 'Settings',
    content: 'Your business profile, loyalty programme rules, tiers, and team accounts.',
  },
  {
    target: '[data-tour="nav-integration"]',
    title: 'Integration',
    content: 'Connect WhatsApp and manage how PingLoyal talks to your other tools.',
  },
  {
    target: '[data-tour="nav-wallet"]',
    title: 'Wallet',
    content: 'Top up the wallet that funds your outgoing WhatsApp messages.',
  },
  {
    target: '[data-tour="nav-billing"]',
    title: 'Billing',
    content: 'Manage your subscription plan and payment method.',
  },
];

const HELP_STEP: Step = {
  target: '[data-tour="nav-help"]',
  title: 'Help & Support',
  content: "Stuck? Open a ticket here any time — we reply by email, and you'll see updates right here too.",
};

const TOUR_STYLES: Step['styles'] = {
  tooltip: {
    borderRadius: 16,
    padding: '20px 22px',
    fontSize: 14,
  },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#0F1E35',
    marginBottom: 4,
  },
  tooltipContent: {
    padding: '4px 0 0',
    textAlign: 'left',
    color: '#475569',
    lineHeight: 1.5,
  },
  tooltipFooter: {
    marginTop: 18,
  },
  buttonPrimary: {
    backgroundColor: '#0DC56A',
    color: '#0A1628',
    borderRadius: 10,
    padding: '8px 16px',
    fontWeight: 600,
    fontSize: 13,
  },
  buttonBack: {
    color: '#64748B',
    fontSize: 13,
    marginRight: 8,
  },
  buttonSkip: {
    color: '#94A3B8',
    fontSize: 13,
  },
  buttonClose: {
    color: '#94A3B8',
  },
  overlay: {
    backgroundColor: 'rgba(15, 30, 53, 0.55)',
  },
};

export function ProductTour() {
  const searchParams = useSearchParams();
  const forceReplay = searchParams.get('tour') === '1';
  const [run, setRun] = useState(false);

  const { data: profile } = useQuery<TourProfile>({
    queryKey: ['user-profile'],
    queryFn: () => api.get<TourProfile>('/api/v1/auth/me'),
  });

  // Shares the ['tenant-me'] cache with Sidebar/layout — no extra request.
  const { data: tenant } = useQuery<TenantMe>({
    queryKey: ['tenant-me'],
    queryFn: () => api.get<TenantMe>('/api/v1/tenants/me'),
  });

  const steps = useMemo(() => {
    const nativeSteps = tenant?.mode !== 'connected' ? NATIVE_MODE_STEPS : [];
    return [WELCOME_STEP, ...CORE_STEPS, ...nativeSteps, ...SETTINGS_STEPS, HELP_STEP];
  }, [tenant?.mode]);

  useEffect(() => {
    if (profile && (forceReplay || !profile.productTourCompletedAt)) {
      setRun(true);
    }
  }, [profile, forceReplay]);

  function handleEvent(data: EventData) {
    const tourEnded =
      data.type === EVENTS.TOUR_END &&
      (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED);
    if (tourEnded) {
      setRun(false);
      api.post('/api/v1/auth/tour-complete', {}).catch(() => null);
    }
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      onEvent={handleEvent}
      styles={TOUR_STYLES}
      options={{
        primaryColor: '#0DC56A',
        showProgress: true,
        buttons: ['back', 'skip', 'primary'],
        spotlightRadius: 10,
        zIndex: 10000,
      }}
    />
  );
}
