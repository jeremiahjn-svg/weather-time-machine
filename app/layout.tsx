import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter, Playfair_Display, Bree_Serif } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' });
const breeSerif = Bree_Serif({ subsets: ['latin'], weight: '400', variable: '--font-bree-serif' });

export const metadata: Metadata = {
  title: 'Temp Trends | Historical Weather & Forecast Comparison',
  description: 'Compare current 10-day weather forecasts and recent temperatures with historical climate baselines over the last 30 years.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7552274163687165"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      <body
        className={`${inter.variable} ${playfair.variable} ${breeSerif.variable} font-sans bg-space-900 text-starlight-200 antialiased min-h-screen bg-cosmic-gradient bg-fixed selection:bg-brass-500 selection:text-space-900`}
      >
        <div className="h-px w-full bg-gradient-to-r from-transparent via-brass-400/70 to-transparent" />
        {children}
      </body>
    </html>
  );
}
