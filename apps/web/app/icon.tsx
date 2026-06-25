import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A1628',
          borderRadius: 7,
        }}
      >
        <svg width={20} height={20} viewBox="0 0 22 22" fill="none">
          <path
            d="M18 2H4C2.9 2 2 2.9 2 4v10c0 1.1.9 2 2 2h4l3 3 3-3h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth={1.5}
            fill="none"
          />
          <path
            d="M7 11l2.5 2.5 5.5-5.5"
            stroke="#0DC56A"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
