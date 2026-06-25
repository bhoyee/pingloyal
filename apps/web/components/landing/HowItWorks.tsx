export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center">
          <span className="inline-block rounded-full bg-[#0DC56A]/10 px-4 py-1.5 text-sm font-semibold text-[#0DC56A]">
            How it works
          </span>
          <h2 className="mt-4 text-4xl font-bold tracking-tight text-[#0A1628] lg:text-5xl">
            Set up once. Runs forever.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
            No developers. No complex integrations. Just a WhatsApp number and
            your store.
          </p>
        </div>

        {/* Step cards */}
        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Step 1 */}
          <div className="group relative rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#0DC56A]/30 hover:shadow-lg">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A1628] text-sm font-bold text-white">
                1
              </div>
            </div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/10 transition-transform duration-300 group-hover:scale-110">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M20 2H4C2.9 2 2 2.9 2 4v16l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d="M8 10h8M8 14h5"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#0A1628]">
              Connect your WhatsApp
            </h3>
            <p className="mt-2 leading-relaxed text-gray-600">
              Link your business WhatsApp number in minutes. Scan a QR code —
              no coding, no API keys, no developers needed.
            </p>
          </div>

          {/* Step 2 */}
          <div className="group relative rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#0DC56A]/30 hover:shadow-lg">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A1628] text-sm font-bold text-white">
                2
              </div>
            </div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/10 transition-transform duration-300 group-hover:scale-110">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="3"
                  width="8"
                  height="8"
                  rx="1.5"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                />
                <rect
                  x="13"
                  y="3"
                  width="8"
                  height="8"
                  rx="1.5"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                />
                <rect
                  x="3"
                  y="13"
                  width="8"
                  height="8"
                  rx="1.5"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                />
                <rect x="5" y="5" width="4" height="4" fill="#0DC56A" rx="0.5" />
                <rect x="15" y="5" width="4" height="4" fill="#0DC56A" rx="0.5" />
                <rect x="5" y="15" width="4" height="4" fill="#0DC56A" rx="0.5" />
                <path
                  d="M13 14h2v2h-2zM17 14h2v2h-2zM13 18h2v2h-2zM17 18h2v2h-2z"
                  fill="#0DC56A"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#0A1628]">
              Print your QR code
            </h3>
            <p className="mt-2 leading-relaxed text-gray-600">
              Download your custom QR code, print it, and place it at your
              till. Customers scan once to join your loyalty programme.
            </p>
          </div>

          {/* Step 3 */}
          <div className="group relative rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#0DC56A]/30 hover:shadow-lg">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A1628] text-sm font-bold text-white">
                3
              </div>
            </div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/10 transition-transform duration-300 group-hover:scale-110">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  fill="#0DC56A"
                  fillOpacity="0.15"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#0A1628]">
              Watch customers return
            </h3>
            <p className="mt-2 leading-relaxed text-gray-600">
              Automated WhatsApp messages remind customers of their points,
              celebrate birthdays, and win back those who haven&apos;t visited
              in a while.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
