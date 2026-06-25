'use client';
import { useEffect, useRef, useState } from 'react';

interface Bubble {
  key: string;
  direction: 'in' | 'out';
  text: string;
  time: string;
}

// One continuous, realistic chat history — hovering a message type on the
// left scrolls to and highlights its bubble(s) here, instead of swapping
// out the whole screen for a single message.
const CONVERSATION: Bubble[] = [
  {
    key: 'welcome',
    direction: 'in',
    text: '🎉 Welcome to FreshMart Rewards, Chioma! You just earned 20 points for joining. Reply "balance" anytime to check your points.',
    time: 'Mon 9:41 AM',
  },
  {
    key: 'purchase',
    direction: 'in',
    text: '✅ Purchase confirmed! You earned 45 pts. Total: 230 pts',
    time: 'Wed 3:12 PM',
  },
  {
    key: 'birthday',
    direction: 'in',
    text: '🎂 Happy birthday, Chioma! Enjoy 50 bonus points on us — valid for your next purchase this month.',
    time: 'Fri 9:00 AM',
  },
  { key: 'balance', direction: 'out', text: 'balance', time: 'Fri 2:14 PM ✓✓' },
  {
    key: 'balance',
    direction: 'in',
    text: '💰 Balance: 230 points (~₦1,150 value). Next reward at 300 pts!',
    time: 'Fri 2:14 PM',
  },
];

const messageTypes = [
  {
    key: 'welcome',
    name: 'Welcome message',
    description: 'Sent instantly when a customer registers via QR',
    type: 'Utility',
    tagClass: 'bg-blue-50 text-blue-700',
    tagLabel: 'Included',
  },
  {
    key: 'purchase',
    name: 'Purchase confirmation',
    description: 'Points earned + running total after every transaction',
    type: 'Utility',
    tagClass: 'bg-blue-50 text-blue-700',
    tagLabel: 'Included',
  },
  {
    key: 'birthday',
    name: 'Birthday greeting',
    description: 'Personalised message with a bonus offer on their birthday',
    type: 'Marketing',
    tagClass: 'bg-amber-50 text-amber-700',
    tagLabel: 'From wallet',
  },
  {
    key: 'balance',
    name: 'Balance bot reply',
    description: 'Customer texts "balance" and gets an instant points reply',
    type: 'Service',
    tagClass: 'bg-green-50 text-green-700',
    tagLabel: 'Free',
  },
];

export default function MessagesSection() {
  const [activeKey, setActiveKey] = useState('welcome');
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const firstIndex = CONVERSATION.findIndex((b) => b.key === activeKey);
    bubbleRefs.current[firstIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [activeKey]);

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
              {messageTypes.map((msg) => (
                <button
                  key={msg.key}
                  type="button"
                  onMouseEnter={() => setActiveKey(msg.key)}
                  onClick={() => setActiveKey(msg.key)}
                  className={`flex w-full items-start gap-4 rounded-2xl border p-5 text-left backdrop-blur-sm transition-colors ${
                    msg.key === activeKey
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
            <div className="relative w-full max-w-[270px]">
              {/* Side buttons */}
              <div className="absolute -left-[3px] top-24 h-8 w-[3px] rounded-l-sm bg-gray-700" />
              <div className="absolute -left-[3px] top-36 h-12 w-[3px] rounded-l-sm bg-gray-700" />
              <div className="absolute -right-[3px] top-28 h-16 w-[3px] rounded-r-sm bg-gray-700" />

              <div className="relative overflow-hidden rounded-[2.5rem] border-8 border-gray-900 bg-gray-900 shadow-2xl shadow-black/50">
                {/* Notch */}
                <div className="absolute left-1/2 top-0 z-20 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-gray-900" />

                {/* Status bar */}
                <div className="flex items-center justify-between bg-[#075E54] px-5 pb-1.5 pt-2">
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
                <div className="flex items-center gap-3 bg-[#075E54] px-3 pb-3">
                  <svg width="9" height="15" viewBox="0 0 9 15" fill="none" className="shrink-0 text-white/90" aria-hidden="true">
                    <path d="M8 1L1 7.5L8 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0DC56A] text-xs font-bold text-white">
                    FM
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">FreshMart Rewards</p>
                    <p className="text-xs text-white/70">Online</p>
                  </div>
                  <div className="flex items-center gap-3.5 text-white/85">
                    <svg width="17" height="13" viewBox="0 0 17 13" fill="none" aria-hidden="true">
                      <rect x="0.5" y="1.5" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M12.5 4.3l4-2v8.4l-4-2V4.3z" fill="currentColor" />
                    </svg>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path
                        d="M1 2.6C1 1.7 1.7 1 2.6 1h1.6c.5 0 .9.3 1 .8l.7 2.6c.1.4 0 .8-.3 1.1l-1 1c1 2 2.6 3.6 4.6 4.6l1-1c.3-.3.7-.4 1.1-.3l2.6.7c.5.1.8.5.8 1v1.6c0 .9-.7 1.6-1.6 1.6C7.4 14.7.3 7.6.3 1.6 1 1 1.7 1 2.6 1"
                        fill="currentColor"
                      />
                    </svg>
                    <svg width="3" height="14" viewBox="0 0 3 14" fill="none" aria-hidden="true">
                      <circle cx="1.5" cy="2" r="1.5" fill="currentColor" />
                      <circle cx="1.5" cy="7" r="1.5" fill="currentColor" />
                      <circle cx="1.5" cy="12" r="1.5" fill="currentColor" />
                    </svg>
                  </div>
                </div>

                {/* Chat area — a real scrollable conversation history */}
                <div className="h-[580px] space-y-3 overflow-y-auto bg-[#E5DDD5] p-4 scroll-smooth">
                  {CONVERSATION.map((bubble, i) => {
                    const isActive = bubble.key === activeKey;
                    return bubble.direction === 'out' ? (
                      <div
                        key={i}
                        ref={(el) => {
                          bubbleRefs.current[i] = el;
                        }}
                        className={`ml-auto max-w-[75%] rounded-lg rounded-tr-none bg-[#DCF8C6] p-3 shadow-sm transition-all ${
                          isActive ? 'ring-2 ring-[#0DC56A] ring-offset-1' : 'opacity-70'
                        }`}
                      >
                        <p className="text-xs text-gray-800">{bubble.text}</p>
                        <p className="mt-1 text-right text-xs text-gray-400">{bubble.time}</p>
                      </div>
                    ) : (
                      <div
                        key={i}
                        ref={(el) => {
                          bubbleRefs.current[i] = el;
                        }}
                        className={`max-w-[90%] rounded-lg rounded-tl-none bg-white p-3 shadow-sm transition-all ${
                          isActive ? 'ring-2 ring-[#0DC56A] ring-offset-1' : 'opacity-70'
                        }`}
                      >
                        <p className="mt-1 text-xs leading-relaxed text-gray-800">{bubble.text}</p>
                        <p className="mt-1 text-right text-xs text-gray-400">{bubble.time}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
