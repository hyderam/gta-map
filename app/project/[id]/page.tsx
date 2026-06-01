import { notFound } from 'next/navigation';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY!;

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

async function getPermit(id: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/permits?id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
  );
  const data = await res.json();
  return data?.[0] ?? null;
}

async function cacheImageUrl(id: string, imageUrl: string) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/permits?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ image_url: imageUrl }),
    }
  );
}

async function findUrbanTorontoImage(address: string): Promise<string | null> {
  try {
    // Use first two parts of address for search (e.g. "1711 KINGSTON" from "1711 KINGSTON RD")
    const parts = address.trim().split(/\s+/);
    const query = parts.slice(0, 2).join(' ');

    const searchRes = await fetch(
      `https://urbantoronto.ca/database/search?query=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        next: { revalidate: 86400 },
      }
    );
    if (!searchRes.ok) return null;
    const searchHtml = await searchRes.text();

    const projectMatch = searchHtml.match(/href="(\/database\/projects\/[^"?#]+)"/);
    if (!projectMatch) return null;

    const projectRes = await fetch(`https://urbantoronto.ca${projectMatch[1]}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 86400 },
    });
    if (!projectRes.ok) return null;
    const projectHtml = await projectRes.text();

    const imgMatch = projectHtml.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
                  || projectHtml.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    return imgMatch ? imgMatch[1] : null;
  } catch {
    return null;
  }
}

function Row({ label, value }: { label: string; value?: string | number }) {
  if (!value || value === '0' || value === 'Not specified') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', gap: 12 }}>
      <span style={{ fontSize: 13, color: '#888', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#222', textAlign: 'right', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  const permit = await getPermit(decodedId);
  if (!permit) notFound();

  // 'none' = already searched, nothing found. '' = not yet searched.
  let imageUrl: string | null =
    permit.image_url && permit.image_url !== 'none' ? permit.image_url : null;
  if (!imageUrl && permit.image_url !== 'none') {
    imageUrl = await findUrbanTorontoImage(permit.address);
    const cacheValue = imageUrl || 'none';
    cacheImageUrl(decodedId, cacheValue); // fire-and-forget
  }

  const color = STATUS_COLORS[permit.status] || '#888';
  const label = STATUS_LABELS[permit.status] || permit.status;
  const cityUrl = permit.application_url ||
    `https://secure.toronto.ca/ApplicationStatus/search.do`;

  return (
    <main style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <nav style={{ background: 'white', borderBottom: '1px solid #eee', padding: '12px 24px', position: 'sticky', top: 0, zIndex: 10 }}>
        <a href="/" style={{ color: '#555', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>← Back to map</a>
      </nav>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px 64px' }}>

        {imageUrl && (
          <div style={{ marginBottom: 32, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
            <img
              src={imageUrl}
              alt={`Rendering of ${permit.address}`}
              style={{ width: '100%', maxHeight: 480, objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}

        <div style={{ background: 'white', borderRadius: 12, padding: '28px 32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111', margin: '0 0 12px' }}>{permit.address}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: color + '22', color }}>
              {label}
            </span>
            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#f0f0f0', color: '#555' }}>
              {permit.type}
            </span>
          </div>

          {permit.description && (
            <p style={{ fontSize: 14, color: '#444', lineHeight: 1.7, margin: '0 0 20px', borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
              {permit.description}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Permit Details</div>
              <Row label="Application #" value={permit.permit_num} />
              <Row label="Status" value={permit.raw_status} />
              <Row label="Work" value={permit.work} />
              <Row label="Structure" value={permit.structure_type} />
              <Row label="Application date" value={permit.application_date} />
              <Row label="Issued date" value={permit.issued_date} />
              <Row label="Completed date" value={permit.completed_date} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Development</div>
              <Row label="Units created" value={permit.units} />
              <Row label="Units lost" value={permit.units_lost} />
              <Row label="Est. cost" value={permit.cost} />
              <Row label="Residential GFA" value={permit.residential_gfa ? `${permit.residential_gfa} m²` : undefined} />
              <Row label="Commercial GFA" value={permit.commercial_gfa ? `${permit.commercial_gfa} m²` : undefined} />
              <Row label="Builder" value={permit.builder} />
              <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 8px' }}>Location</div>
              <Row label="Ward" value={permit.ward} />
              <Row label="Municipality" value={permit.municipality} />
              <Row label="Postal" value={permit.postal} />
            </div>
          </div>

          <a
            href={cityUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', marginTop: 24, padding: '12px', background: '#1a1a1a', color: 'white', borderRadius: 8, textAlign: 'center', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}
          >
            View on City of Toronto →
          </a>
        </div>
      </div>
    </main>
  );
}
