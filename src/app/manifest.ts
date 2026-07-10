import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TindaPOS — Point of Sale',
    short_name: 'TindaPOS',
    description:
      'Point of sale with unlimited sales history, employee management, and advanced inventory.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F7F6F2',
    theme_color: '#1F6E4E',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
