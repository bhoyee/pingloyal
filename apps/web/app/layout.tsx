import type { Metadata } from "next";
import "./globals.css";
import { CookieConsentBanner } from "@/components/cookies/CookieConsentBanner";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.pingloyal.com"),
  title: {
    default: "PingLoyal — WhatsApp Loyalty Automation for African SMBs",
    template: "%s | PingLoyal",
  },
  description:
    "Turn every visit into a loyal customer. WhatsApp loyalty automation built for Nigerian retail, food, and service SMBs. Reward customers, send campaigns, and grow — all via WhatsApp.",
  keywords: [
    "WhatsApp loyalty",
    "loyalty app Nigeria",
    "customer loyalty SMB",
    "WhatsApp marketing",
    "loyalty points Nigeria",
    "retail loyalty Africa",
    "PingLoyal",
  ],
  authors: [{ name: "PingLoyal", url: "https://www.pingloyal.com" }],
  creator: "PingLoyal",
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: "https://www.pingloyal.com",
    siteName: "PingLoyal",
    title: "PingLoyal — WhatsApp Loyalty Automation for African SMBs",
    description:
      "Turn every visit into a loyal customer. Reward customers, send WhatsApp campaigns, and grow your business — built for Nigerian SMBs.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PingLoyal — WhatsApp Loyalty Automation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PingLoyal — WhatsApp Loyalty Automation for African SMBs",
    description:
      "Turn every visit into a loyal customer. Reward customers, send WhatsApp campaigns, and grow your business — built for Nigerian SMBs.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full scroll-smooth antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
