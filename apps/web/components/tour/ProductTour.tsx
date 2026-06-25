'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Joyride, EVENTS, STATUS, type EventData, type Step } from 'react-joyride';
import { api } from '@/lib/api';

interface TourProfile {
  productTourCompletedAt: string | null;
}

// Anchored to the data-tour attributes set on Sidebar.tsx's nav links.
const STEPS: Step[] = [
  {
    target: 'body',
    placement: 'center',
    title: 'Welcome to PingLoyal',
    content: "Let's take a 30-second look around so you know where everything lives.",
  },
  {
    target: '[data-tour="nav-dashboard"]',
    content: 'Your dashboard — a quick snapshot of customers, points, and recent activity.',
  },
  {
    target: '[data-tour="nav-customers"]',
    content:
      'Every customer who scans your QR code or messages your WhatsApp number shows up here, with their points balance and tier.',
  },
  {
    target: '[data-tour="nav-campaigns"]',
    content:
      'Send WhatsApp campaigns — broadcast a promo or reminder to a segment of your customers.',
  },
  {
    target: '[data-tour="nav-triggers"]',
    content:
      "Triggers send automatic WhatsApp messages — like a thank-you after a purchase, or a nudge when a customer hasn't visited in a while.",
  },
  {
    target: '[data-tour="nav-help"]',
    content:
      "Stuck? Open a ticket here any time — we reply by email, and you'll see updates right here too.",
  },
];

export function ProductTour() {
  const searchParams = useSearchParams();
  const forceReplay = searchParams.get('tour') === '1';
  const [run, setRun] = useState(false);

  const { data: profile } = useQuery<TourProfile>({
    queryKey: ['user-profile'],
    queryFn: () => api.get<TourProfile>('/api/v1/auth/me'),
  });

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
      steps={STEPS}
      run={run}
      continuous
      onEvent={handleEvent}
      options={{
        primaryColor: '#0F1E35',
        showProgress: true,
        buttons: ['back', 'close', 'primary', 'skip'],
        zIndex: 10000,
      }}
    />
  );
}
