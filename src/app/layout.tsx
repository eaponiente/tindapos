import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TindaPOS — Point of Sale',
  description:
    'Point of sale with unlimited sales history, employee management, and advanced inventory.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-180.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TindaPOS',
  },
};

export const viewport: Viewport = {
  themeColor: '#191410',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // POS taps shouldn't zoom the layout
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
