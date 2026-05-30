'use client';

import dynamic from 'next/dynamic';

const MapComponent = dynamic(() => import('./components/Map'), { ssr: false });

export default function Home() {
  return (
    <main style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <MapComponent />
    </main>
  );
}