import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'PingLoyal — WhatsApp Loyalty Automation for African SMBs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0A1628',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* WhatsApp badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: '#0DC56A22',
            border: '1px solid #0DC56A55',
            borderRadius: '999px',
            padding: '8px 20px',
            marginBottom: '36px',
          }}
        >
          <span style={{ fontSize: '20px' }}>💬</span>
          <span style={{ color: '#0DC56A', fontSize: '18px', fontWeight: 600 }}>
            WhatsApp Loyalty Automation
          </span>
        </div>

        {/* Logo / brand name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div
            style={{
              width: '60px',
              height: '60px',
              background: '#0DC56A',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
            }}
          >
            🏆
          </div>
          <span style={{ color: '#ffffff', fontSize: '52px', fontWeight: 700, letterSpacing: '-1px' }}>
            PingLoyal
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            color: '#94a3b8',
            fontSize: '28px',
            lineHeight: 1.4,
            maxWidth: '800px',
            marginBottom: '48px',
          }}
        >
          Turn every visit into a loyal customer — built for Nigerian retail, food &amp; service SMBs.
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: '16px' }}>
          {['Loyalty Points', 'WhatsApp Campaigns', 'Cashier App', 'Free to start'].map((f) => (
            <div
              key={f}
              style={{
                background: '#ffffff14',
                border: '1px solid #ffffff22',
                borderRadius: '8px',
                padding: '10px 20px',
                color: '#cbd5e1',
                fontSize: '16px',
                fontWeight: 500,
              }}
            >
              {f}
            </div>
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            right: '80px',
            color: '#475569',
            fontSize: '18px',
          }}
        >
          www.pingloyal.com
        </div>
      </div>
    ),
    { ...size },
  );
}
