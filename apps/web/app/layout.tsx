import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PingLoyal — WhatsApp Loyalty Automation for African Retail",
  description:
    "Turn every purchase into a loyal customer. WhatsApp loyalty automation built for Nigerian retail SMBs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full scroll-smooth antialiased">
      <head>
        {/* Load Inter from CDN — bypasses Tailwind PostCSS so no /assets/fonts/ @font-face is generated */}
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
      </body>
    </html>
  );
}
