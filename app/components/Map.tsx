'use client';

import { useEffect, useState } from 'react';
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
  return L.divIcon({ html: svg, iconSize: [12, 12], iconAnchor: [6, 6], popupAnchor: [0, -6], className: '' });
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
}

function Row({ label, value }: { label: string; value: string | number }) {
  if (!value || value === '0' || value === 'Not specified') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid #f0f0f0', gap: '12px' }}>
      <span style={{ fontSize: '12px', color: '#888', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '12px', color: '#222', textAlign: 'right', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function SectionTitle({ text }: { text: string }) {
  return (
    <div style={{ paddingTop: '12px', marginBottom: '4px', fontSize: '11px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {text}
    </div>
  );
}

function DetailPanel({ permit, onClose }: { permit: Permit; onClose: () => void }) {
  const color = STATUS_COLORS[permit.status] || '#888';
  const label = STATUS_LABELS[permit.status] || permit.status;
  return (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '340px', background: 'white', zIndex: 2000, overflowY: 'auto', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, marginRight: '8px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#111', marginBottom: '6px', lineHeight: 1.3 }}>{permit.address}</div>
            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: color + '22', color: color }}>{label}</span>
          </div>
          <button onClick={onClose} style={{ background: '#f5f5f5', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>X</button>
        </div>
      </div>
      <div style={{ padding: '0 16px 16px', flex: 1 }}>
        <SectionTitle text="Permit Details" />
        <Row label="Permit #" value={permit.permitNum} />
        <Row label="Status" value={permit.rawStatus} />
        <Row label="Type" value={permit.type} />
        <Row label="Structure" value={permit.structureType} />
        <Row label="Work" value={permit.work} />
        <SectionTitle text="Dates" />
        <Row label="Application date" value={permit.applicationDate} />
        <Row label="Issued date" value={permit.issuedDate} />
        <Row label="Completed date" value={permit.completedDate} />
        <SectionTitle text="Land Use" />
        <Row label="Current use" value={permit.currentUse} />
        <Row label="Proposed use" value={permit.proposedUse} />
        <SectionTitle text="Units" />
        <Row label="Units created" value={permit.units} />
        <Row label="Units lost" value={permit.unitsLost} />
        <SectionTitle text="Floor Area (m2)" />
        <Row label="Residential GFA" value={permit.residentialGFA} />
        <Row label="Commercial GFA" value={permit.commercialGFA} />
        <Row label="Industrial GFA" value={permit.industrialGFA} />
        <SectionTitle text="Construction" />
        <Row label="Est. cost" value={permit.cost} />
        <Row label="Builder" value={permit.builder} />
        <SectionTitle text="Location" />
        <Row label="Ward" value={permit.ward} />
        <Row label="Municipality" value={permit.municipality} />
        <Row label="Postal code" value={permit.postal} />
        {permit.description && (
          <div>
            <SectionTitle text="Description" />
            <p style={{ fontSize: '12px', color: '#555', lineHeight: 1.6, margin: '8px 0' }}>{permit.description}</p>
          </div>
        )}
        <button
          onClick={() => {
            if (permit.applicationUrl) {
              window.open(permit.applicationUrl, '_blank');
            } else {
              navigator.clipboard.writeText(permit.permitNum).catch(() => {});
              window.open('https://secure.toronto.ca/ApplicationStatus/search.do', '_blank');
            }
          }}
          style={{ display: 'block', marginTop: '16px', padding: '10px', background: '#1a1a1a', color: 'white', borderRadius: '8px', textAlign: 'center', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', width: '100%' }}
        >
          View on City of Toronto
        </button>
        {!permit.applicationUrl && (
          <p style={{ fontSize: '11px', color: '#aaa', textAlign: 'center', marginTop: '6px', marginBottom: 0 }}>
            Permit # <strong style={{ color: '#555' }}>{permit.permitNum}</strong> will be copied to your clipboard
          </p>
        )}
      </div>
    </div>
  );
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

export default function Map() {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Permit | null>(null);
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
        .then((data) => {
          setPermits(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [bounds, filter]);

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
          {permits.map((permit) => (
            <Marker
              key={permit.id}
              position={[permit.lat, permit.lng]}
              icon={makeIcon(permit.status)}
              eventHandlers={{ click: () => setSelected(permit) }}
            >
              <Popup>
                <div style={{ minWidth: '180px' }}>
                  <strong style={{ fontSize: '13px' }}>{permit.address}</strong>
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: STATUS_COLORS[permit.status] + '22', color: STATUS_COLORS[permit.status] }}>
                      {STATUS_LABELS[permit.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>{permit.type}</div>
                  <div style={{ fontSize: '12px', color: '#777', marginTop: '2px' }}>{permit.work}</div>
                  <button onClick={() => setSelected(permit)} style={{ marginTop: '8px', width: '100%', padding: '6px', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                    View full details
                  </button>
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

      {selected && <DetailPanel permit={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}