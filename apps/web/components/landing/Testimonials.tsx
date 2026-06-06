const testimonials = [
  {
    quote:
      'We went from 40 regulars to over 200 loyal customers in 3 months. Every Sunday PingLoyal reminds people to come in for their loyalty special — and they actually do.',
    name: 'Adewale Ogundimu',
    store: 'FreshChoice Mart',
    city: 'Lagos Island',
    initials: 'AO',
    avatarClass: 'bg-[#0A1628]',
  },
  {
    quote:
      'Setup was 15 minutes. My cashier barely changed how she works — she just enters the amount and the message goes out automatically. It just works.',
    name: 'Chidinma Okafor',
    store: 'Coco Beauty Bar',
    city: 'Ikeja',
    initials: 'CO',
    avatarClass: 'bg-[#6366f1]',
  },
  {
    quote:
      "The birthday messages are something else. Customers call to say thank you before they even come in. That kind of goodwill you can't buy with ads.",
    name: 'Babatunde Salami',
    store: 'Salami General Stores',
    city: 'Surulere',
    initials: 'BS',
    avatarClass: 'bg-[#f59e0b]',
  },
];

function StarRating() {
  return (
    <div className="flex gap-0.5" aria-label="5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="#f59e0b"
          aria-hidden="true"
        >
          <path d="M8 1l1.8 5.6H15l-4.8 3.5 1.8 5.5L8 12.1l-4 3.5 1.8-5.5L1 6.6h5.2z" />
        </svg>
      ))}
    </div>
  );
}

export default function Testimonials() {
  return (
    <section className="bg-[#F9FAFB] px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center">
          <span className="inline-block rounded-full bg-[#0DC56A]/10 px-4 py-1.5 text-sm font-semibold text-[#0DC56A]">
            Customer stories
          </span>
          <h2 className="mt-4 text-4xl font-bold tracking-tight text-[#0A1628] lg:text-5xl">
            Real stores. Real results.
          </h2>
        </div>

        {/* Testimonial cards */}
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
            >
              <StarRating />
              <blockquote className="mt-4 flex-1 text-gray-700 leading-relaxed">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div className="mt-6 flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${t.avatarClass}`}
                >
                  {t.initials}
                </div>
                <div>
                  <p className="font-semibold text-[#0A1628]">{t.name}</p>
                  <p className="text-sm text-gray-500">
                    {t.store} · {t.city}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ROI callout */}
        <div className="mt-8 rounded-2xl bg-[#0A1628] p-10 text-center">
          <p className="text-5xl font-bold text-[#0DC56A] lg:text-6xl">8.7×</p>
          <p className="mt-2 text-xl font-semibold text-white">
            average return on PingLoyal investment
          </p>
          <p className="mt-3 text-base text-white/60">
            ₦280,000 in revenue from win-back campaigns alone in 60 days —
            across our top-performing stores
          </p>
        </div>
      </div>
    </section>
  );
}
