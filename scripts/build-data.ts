const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://xefgxekuhmfpglzrbiww.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZmd4ZWt1aG1mcGdsenJiaXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMDY4MzIsImV4cCI6MjA5NTY4MjgzMn0.hvdcj-cOrXqV-VjLsec7hH-J8NG5eyTjyoWUHtGC0hM';
const CKAN_BASE = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search';
const PERMITS_RESOURCE = '6d0229af-bc54-46de-9c2b-26759b01dd05';
const ADDRESS_RESOURCE = '0b3756af-9caf-4f0f-ac28-9c6617adede4';

// Only include permits from the last 7 years
const cutoff = new Date();
cutoff.setFullYear(cutoff.getFullYear() - 7);
const CUTOFF_DATE = cutoff.toISOString().split('T')[0];
console.log(`Date cutoff: ${CUTOFF_DATE}`);

function toTitleCase(str: string): string {
  return str.toLowerCase().split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim();
}

function buildAddress(r: any): string {
  return [r.STREET_NUM?.trim(), r.STREET_NAME?.trim(), r.STREET_TYPE?.trim(), r.STREET_DIRECTION?.trim()].filter(Boolean).join(' ').trim();
}

function mapStatus(status: string): string {
  const s = status?.toLowerCase() || '';
  if (s.includes('inspection') || s.includes('issued')) return 'active';
  if (s.includes('complete') || s.includes('cleared')) return 'completed';
  return 'proposed';
}

function formatCost(cost: string): string {
  if (!cost || cost.includes('DO NOT') || cost === '0') return 'Not specified';
  const num = parseFloat(cost.replace(/,/g, ''));
  if (isNaN(num) || num === 0) return 'Not specified';
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

// Load already-geocoded addresses from Supabase to avoid re-geocoding
async function loadGeoCache(): Promise<Map<string, { lat: number; lng: number; ward: string; municipality: string }>> {
  console.log('Loading geocode cache from Supabase...');
  const cache = new Map<string, { lat: number; lng: number; ward: string; municipality: string }>();
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/permits?select=address,lat,lng,ward,municipality&offset=${offset}&limit=1000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) break;
    for (const r of data) {
      if (!cache.has(r.address) && r.lat && r.lng) {
        cache.set(r.address, { lat: r.lat, lng: r.lng, ward: r.ward || '', municipality: r.municipality || '' });
      }
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`Loaded ${cache.size} addresses from cache.`);
  return cache;
}

async function getCoordinates(streetNum: string, streetName: string): Promise<{ lat: number; lng: number; ward: string; municipality: string } | null> {
  try {
    const filters = encodeURIComponent(JSON.stringify({ ADDRESS_NUMBER: streetNum.trim(), LINEAR_NAME: toTitleCase(streetName) }));
    const url = `${CKAN_BASE}?resource_id=${ADDRESS_RESOURCE}&filters=${filters}&limit=1`;
    const res = await fetch(url);
    const json = await res.json();
    const record = json?.result?.records?.[0];
    if (!record?.geometry) return null;
    const geo = JSON.parse(record.geometry);
    const [lng, lat] = geo.coordinates;
    return { lat, lng, ward: record.WARD_NAME || '', municipality: record.MUNICIPALITY_NAME || '' };
  } catch { return null; }
}

async function fetchAllBldPermits(): Promise<any[]> {
  console.log(`Fetching BLD permits applied after ${CUTOFF_DATE}...`);
  const allRecords: any[] = [];
  let offset = 0;
  const BATCH_SIZE = 1000;
  let totalScanned = 0;

  while (true) {
    const url = `${CKAN_BASE}?resource_id=${PERMITS_RESOURCE}&limit=${BATCH_SIZE}&offset=${offset}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success || !json.result?.records?.length) break;

    for (const r of json.result.records) {
      // Only keep BLD (main building permits) - exclude sub-trades like PLB, HVA, DRN, FSU, etc.
      if (!r.PERMIT_NUM?.trim().endsWith(' BLD')) continue;
      // Only keep permits within the last 7 years
      if (!r.APPLICATION_DATE || r.APPLICATION_DATE < CUTOFF_DATE) continue;
      allRecords.push(r);
    }

    totalScanned += json.result.records.length;
    if (totalScanned % 10000 === 0) {
      console.log(`Scanned ${totalScanned} records, found ${allRecords.length} qualifying BLD permits...`);
    }

    offset += BATCH_SIZE;
    if (json.result.records.length < BATCH_SIZE) break;
  }

  console.log(`Total scanned: ${totalScanned}. BLD permits in last 7 years: ${allRecords.length}`);
  return allRecords;
}

async function main() {
  const geoCache = await loadGeoCache();
  const bldRecords = await fetchAllBldPermits();

  // Find addresses not yet in the cache — need fresh geocoding
  const uncachedMap = new Map<string, { streetNum: string; streetName: string }>();
  for (const r of bldRecords) {
    const addr = buildAddress(r);
    if (!geoCache.has(addr) && !uncachedMap.has(addr)) {
      uncachedMap.set(addr, { streetNum: r.STREET_NUM?.trim() || '', streetName: r.STREET_NAME?.trim() || '' });
    }
  }

  console.log(`Geocoding ${uncachedMap.size} new addresses...`);
  const uncachedEntries = [...uncachedMap.entries()];
  const GEOCODE_BATCH = 10;

  for (let i = 0; i < uncachedEntries.length; i += GEOCODE_BATCH) {
    const batch = uncachedEntries.slice(i, i + GEOCODE_BATCH);
    await Promise.all(batch.map(async ([addr, { streetNum, streetName }]) => {
      const geo = await getCoordinates(streetNum, streetName);
      if (geo) geoCache.set(addr, geo);
    }));
    if (i % 500 === 0 && i > 0) console.log(`  Geocoded ${i} / ${uncachedEntries.length}...`);
  }

  // Map every BLD permit to its coordinates — no deduplication, all permits per address included
  const permits: any[] = [];
  let skipped = 0;

  for (const r of bldRecords) {
    const addr = buildAddress(r);
    const geo = geoCache.get(addr);
    if (!geo) { skipped++; continue; }

    permits.push({
      id: `${r.PERMIT_NUM?.trim()}-${r.REVISION_NUM}`,
      permitNum: r.PERMIT_NUM?.trim() || '',
      address: addr,
      lat: geo.lat,
      lng: geo.lng,
      status: mapStatus(r.STATUS),
      rawStatus: r.STATUS || '',
      type: r.PERMIT_TYPE || 'Building Permit',
      structureType: r.STRUCTURE_TYPE || '',
      work: r.WORK || '',
      description: r.DESCRIPTION || '',
      applicationDate: r.APPLICATION_DATE || '',
      issuedDate: r.ISSUED_DATE || '',
      completedDate: r.COMPLETED_DATE || '',
      units: r.DWELLING_UNITS_CREATED || '0',
      unitsLost: r.DWELLING_UNITS_LOST || '0',
      cost: formatCost(r.EST_CONST_COST || ''),
      builder: r.BUILDER_NAME || '',
      currentUse: r.CURRENT_USE || '',
      proposedUse: r.PROPOSED_USE || '',
      residentialGFA: r.RESIDENTIAL || 0,
      commercialGFA: r.BUSINESS_AND_PERSONAL_SERVICES || 0,
      industrialGFA: r.INDUSTRIAL || 0,
      ward: geo.ward,
      municipality: geo.municipality,
      postal: r.POSTAL || '',
      source: 'permit',
    });
  }

  // Deduplicate by id (same permit_num + revision_num can appear twice in CKAN)
  const seen = new Set<string>();
  const deduped = permits.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  console.log(`\nDone: ${deduped.length} permits mapped (${permits.length - deduped.length} duplicates removed), ${skipped} skipped (no geocode match).`);
  const permits_final = deduped;

  const outputPath = path.join(process.cwd(), 'public', 'permits.json');
  fs.writeFileSync(outputPath, JSON.stringify(permits_final, null, 2));
  console.log(`Saved to ${outputPath}`);
}

main().catch(console.error);
