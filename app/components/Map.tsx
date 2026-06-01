'use client';

import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const STATUS_COLORS: Record<string, string> = {
  active: '#EF9F27',
  completed: '#639922',
  proposed: '#378ADD',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Under Construction',
  completed: 'Completed',
  proposed: 'Proposed',
};

function makeIcon(status: string) {
  const color = STATUS_COLORS[status] || '#888';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="${color}" stroke="white" stroke-width="1.5"/></svg>`;
  return L.divIcon({ html: svg, iconSize: [12, 12], iconAnchor: [6, 6], popupAnchor: [0, -8], className: '' });
}

interface Permit {
  id: string;
  permitNum: string;
  address: string;
  lat: number;
  lng: number;
  status: string;
  rawStatus: string;
  type: string;
  structureType: string;
  work: string;
  description: string;
  applicationDate: string;
  issuedDate: string;
  completedDate: string;
  units: string;
  unitsLost: string;
  cost: string;
  builder: string;
  currentUse: string;
  proposedUse: string;
  residentialGFA: number;
  commercialGFA: number;
  industrialGFA: number;
  ward: string;
  municipality: string;
  postal: string;
  applicationUrl: string;
  imageUrl: string;
}

function MapBoundsTracker({ onBoundsChange }: { onBoundsChange: (bounds: any) => void }) {
  useMapEvents({
    moveend: (e) => {
      const b = e.target.getBounds();
      onBoundsChange({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    },
    zoomend: (e) => {
      const b = e.target.getBounds();
      onBoundsChange({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    },
  });
  return null;
}

function jitterPermits(permits: Permit[]): Permit[] {
  const groups: Record<string, number[]> = {};
  permits.forEach((p, i) => {
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(i);
  });
  const result = [...permits];
  for (const key of Object.keys(groups)) {
    const indices = groups[key];
    if (indices.length <= 1) continue;
    const n = indices.length;
    const radius = 0.00015;
    indices.forEach((idx, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      result[idx] = {
        ...permits[idx],
        lat: permits[idx].lat + radius * Math.cos(angle),
        lng: permits[idx].lng + radius * Math.sin(angle),
      };
    });
  }
  return result;
}

export default function Map() {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [bounds, setBounds] = useState({ north: 43.85, south: 43.55, east: -79.1, west: -79.75 });

  useEffect(() => {
    const params = new URLSearchParams({
      north: String(bounds.north),
      south: String(bounds.south),
      east: String(bounds.east),
      west: String(bounds.west),
    });
    if (filter !== 'all') params.set('status', filter);

    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/permits?${params}`)
        .then((res) => res.json())
        .then((data) => { setPermits(data); setLoading(false); })
        .catch(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [bounds, filter]);

  const displayPermits = useMemo(() => jitterPermits(permits), [permits]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, background: 'white', padding: '10px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>GTA Development Map</span>
        <span style={{ fontSize: '13px', color: '#888' }}>
          {loading ? 'Loading...' : `${permits.length.toLocaleString()} projects in view`}
        </span>
        {['all', 'active', 'proposed', 'completed'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding: '4px 12px', borderRadius: '20px', border: '1px solid #ccc', background: filter === s ? '#222' : 'white', color: filter === s ? 'white' : '#222', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
            {s === 'all' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <MapContainer center={[43.7, -79.42]} zoom={11} style={{ width: '100%', height: '100%' }}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution="© OpenStreetMap © CARTO" />
        <MapBoundsTracker onBoundsChange={setBounds} />
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={80}
          disableClusteringAtZoom={14}
          showCoverageOnHover={false}
          iconCreateFunction={(cluster: { getChildCount: () => number }) => {
            const count = cluster.getChildCount();
            const label = count >= 1000 ? `${Math.floor(count / 1000)}k+` : `${count}+`;
            return L.divIcon({
              html: `<div style="background:#1a1a1a;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${label}</div>`,
              iconSize: [36, 36], iconAnchor: [18, 18], className: '',
            });
          }}
        >
          {displayPermits.map((permit) => (
            <Marker
              key={permit.id}
              position={[permit.lat, permit.lng]}
              icon={makeIcon(permit.status)}
            >
              <Popup>
                <div style={{ minWidth: '220px', maxWidth: '260px', fontFamily: 'system-ui, sans-serif' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#111', marginBottom: '6px', lineHeight: 1.3 }}>
                    {permit.address}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: (STATUS_COLORS[permit.status] || '#888') + '22', color: STATUS_COLORS[permit.status] || '#888' }}>
                      {STATUS_LABELS[permit.status] || permit.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#555', marginBottom: '2px' }}>{permit.type}</div>
                  {permit.applicationDate && (
                    <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>Applied {permit.applicationDate}</div>
                  )}
                  <a
                    href={`/project/${encodeURIComponent(permit.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'block', padding: '7px 10px', background: '#1a1a1a', color: 'white', borderRadius: '6px', textAlign: 'center', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}
                  >
                    View Project Details →
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      <div style={{ position: 'absolute', bottom: '24px', left: '12px', zIndex: 1000, background: 'white', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: '13px' }}>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: STATUS_COLORS[key] }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
