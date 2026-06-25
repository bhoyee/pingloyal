'use client';
import { useState } from 'react';

interface Bubble {
  direction: 'in' | 'out';
  text: string;
  time: string;
}

const messageTypes: {
  name: string;
  description: string;
  type: string;
  tagClass: string;
  tagLabel: string;
  bubbles: Bubble[];
}[] = [
  {
    name: 'Welcome message',
    description: 'Sent instantly when a customer registers via QR',
    type: 'Utility',
    tagClass: 'bg-blue-50 text-blue-700',
    tagLabel: 'Included',
    bubbles: [
      {
        direction: 'in',
        text: '🎉 Welcome to FreshMart Rewards, Chioma! You just earned 20 points for joining. Reply "balance" anytime to check your points.',
        time: '9:41 AM',
      },
    ],
  },
  {
    name: 'Purchase confirmation',
    description: 'Points earned + running total after every transaction',
    type: 'Utility',
    tagClass: 'bg-blue-50 text-blue-700',
    tagLabel: 'Included',
    bubbles: [
      {
        direction: 'in',
        text: '✅ Purchase confirmed! You earned 45 pts. Total: 230 pts',
        time: '9:41 AM',
      },
    ],
  },
  {
    name: 'Birthday greeting',
    description: 'Personalised message with a bonus offer on their birthday',
    type: 'Marketing',
    tagClass: 'bg-amber-50 text-amber-700',
    tagLabel: 'From wallet',
    bubbles: [
      {
        direction: 'in',
        text: '🎂 Happy birthday, Chioma! Enjoy 50 bonus points on us — valid for your next purchase this month.',
        time: 'Wed 9:00 AM',
      },
    ],
  },
  {
    name: 'Balance bot reply',
    description: 'Customer texts "balance" and gets an instant points reply',
    type: 'Service',
    tagClass: 'bg-green-50 text-green-700',
    tagLabel: 'Free',
    bubbles: [
      { direction: 'out', text: 'balance', time: 'Thu 2:14 PM ✓✓' },
      {
        direction: 'in',
        text: '💰 Balance: 230 points (~₦1,150 value). Next reward at 300 pts!',
        time: 'Thu 2:14 PM',
      },
    ],
  },
];

export default function MessagesSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = messageTypes[activeIndex];

  return (
    <section className="bg-[#0A1628] px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
          {/* ── Left: message catalogue ── */}
          <div>
            <span className="inline-block rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-[#0DC56A]">
              Automated messages
            </span>
            <h2 className="mt-4 text-4xl font-bold tracking-tight text-white lg:text-5xl">
              The right message, at the right time.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-white/70">
              Every message type is pre-built and approved. Utility messages
              are included in your plan. Marketing messages come from your
              prepaid wallet — no surprise bills.
            </p>

            <div className="mt-10 space-y-4">
              {messageTypes.map((msg, i) => (
                <button
                  key={msg.name}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => setActiveIndex(i)}
                  className={`flex w-full items-start gap-4 rounded-2xl border p-5 text-left backdrop-blur-sm transition-colors ${
                    i === activeIndex
                      ? 'border-[#0DC56A]/40 bg-white/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0DC56A]/20">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M14 2H2C1.45 2 1 2.45 1 3v8c0 .55.45 1 1 1h2.5l2.5 2.5 2.5-2.5H14c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1z"
                        fill="#0DC56A"
                        fillOpacity="0.5"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">
                        {msg.name}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${msg.tagClass}`}
                      >
                        {msg.tagLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-white/60">
                      {msg.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Right: phone mockup ── */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-72 overflow-hidden rounded-[2.5rem] border-8 border-gray-700 bg-gray-800 shadow-2xl shadow-black/50">
              {/* Status bar */}
              <div className="flex items-center justify-between bg-[#075E54] px-5 py-2.5">
                <span className="text-xs font-medium text-white">9:41</span>
                <div className="flex items-center gap-1">
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="white" aria-hidden="true">
                    <rect x="0" y="4" width="2" height="6" rx="0.5" />
                    <rect x="3" y="2.5" width="2" height="7.5" rx="0.5" />
                    <rect x="6" y="1" width="2" height="9" rx="0.5" />
                    <rect x="9" y="0" width="2" height="10" rx="0.5" />
                    <path d="M12 3l1.5-1.5M12 3h1.5M12 3v-1.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              {/* WhatsApp header */}
              <div className="flex items-center gap-3 bg-[#075E54] px-4 pb-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0DC56A] text-xs font-bold text-white">
                  PL
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">PingLoyal</p>
                  <p className="text-xs text-white/70">loyalty programme</p>
                </div>
              </div>

              {/* Chat area */}
              <div className="min-h-[220px] space-y-3 bg-[#E5DDD5] p-4">
                {active.bubbles.map((bubble, i) =>
                  bubble.direction === 'out' ? (
                    <div
                      key={i}
                      className="ml-auto max-w-[75%] rounded-lg rounded-tr-none bg-[#DCF8C6] p-3 shadow-sm"
                    >
                      <p className="text-xs text-gray-800">{bubble.text}</p>
                      <p className="mt-1 text-right text-xs text-gray-400">{bubble.time}</p>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="max-w-[90%] rounded-lg rounded-tl-none bg-white p-3 shadow-sm"
                    >
                      <p className="text-xs font-semibold text-[#075E54]">PingLoyal</p>
                      <p className="mt-1 text-xs leading-relaxed text-gray-800">{bubble.text}</p>
                      <p className="mt-1 text-right text-xs text-gray-400">{bubble.time}</p>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
