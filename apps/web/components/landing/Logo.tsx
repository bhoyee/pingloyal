export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0A1628]">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path
            d="M18 2H4C2.9 2 2 2.9 2 4v10c0 1.1.9 2 2 2h4l3 3 3-3h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M7 11l2.5 2.5 5.5-5.5"
            stroke="#0DC56A"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className={`text-lg font-bold ${light ? 'text-white' : 'text-[#0A1628]'}`}>
        PingLoyal
      </span>
    </div>
  );
}
