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
    background_color: '#F6F3EA',
    theme_color: '#191410',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
