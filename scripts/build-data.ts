const fs = require('fs');
const path = require('path');

const CKAN_BASE = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search';
const PERMITS_RESOURCE = '6d0229af-bc54-46de-9c2b-26759b01dd05';
const ADDRESS_RESOURCE = '0b3756af-9caf-4f0f-ac28-9c6617adede4';

function toTitleCase(str: string): string {
  return str.toLowerCase().split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim();
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

async function fetchAllPermits() {
  console.log('Fetching all permits...');
  let allRecords: any[] = [];
  let offset = 0;
  const BATCH_SIZE = 1000;

  while (true) {
    const url = `${CKAN_BASE}?resource_id=${PERMITS_RESOURCE}&limit=${BATCH_SIZE}&offset=${offset}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success || !json.result?.records?.length) break;
    allRecords = [...allRecords, ...json.result.records];
    console.log(`Fetched ${allRecords.length} permits so far...`);
    offset += BATCH_SIZE;
    if (json.result.records.length < BATCH_SIZE) break;
  }

  console.log(`Total permits fetched: ${allRecords.length}`);
  return allRecords;
}

async function fetchPlanningNotices() {
  console.log('Fetching planning notices...');
  try {
    const res = await fetch('http://app.toronto.ca/nm/notices.json');
    const json = await res.json();
    const notices = Array.isArray(json) ? json : json.notices || [];
    console.log(`Total planning notices fetched: ${notices.length}`);
    return notices;
  } catch (e) {
    console.log('Could not fetch planning notices:', e);
    return [];
  }
}

async function main() {
  // Fetch all permits
  const allRecords = await fetchAllPermits();

  // Deduplicate by address
  const seen = new Set<string>();
  const unique = allRecords.filter((r: any) => {
    const key = `${r.STREET_NUM?.trim()}-${r.STREET_NAME?.trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Unique addresses to geocode: ${unique.length}`);

  // Geocode in batches
  const permits: any[] = [];
  const GEOCODE_BATCH = 10;

  for (let i = 0; i < unique.length; i += GEOCODE_BATCH) {
    const batch = unique.slice(i, i + GEOCODE_BATCH);
    const results = await Promise.all(
      batch.map(async (r: any) => {
        const geo = await getCoordinates(r.STREET_NUM, r.STREET_NAME);
        if (!geo) return null;
        return {
          id: `${r.PERMIT_NUM?.trim()}-${r.REVISION_NUM}`,
          permitNum: r.PERMIT_NUM?.trim() || '',
          address: buildAddress(r),
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
        };
      })
    );
    permits.push(...results.filter(Boolean));
    if (i % 100 === 0) console.log(`Geocoded ${i} / ${unique.length}...`);
  }

  // Fetch and process planning notices
  const notices = await fetchPlanningNotices();
  const planningItems: any[] = [];

  for (const notice of notices) {
    const addresses = notice.addressList || [];
    for (const addr of addresses) {
      if (!addr.latitude || !addr.longitude) continue;
      planningItems.push({
        id: `notice-${notice.noticeId}-${addr.address}`,
        permitNum: notice.noticeId?.toString() || '',
        address: addr.address || 'Unknown address',
        lat: parseFloat(addr.latitude),
        lng: parseFloat(addr.longitude),
        status: 'proposed',
        rawStatus: 'Planning Application',
        type: 'Planning Application',
        structureType: '',
        work: notice.title || '',
        description: notice.subheading || '',
        applicationDate: '',
        issuedDate: '',
        completedDate: '',
        units: '0',
        unitsLost: '0',
        cost: 'Not specified',
        builder: '',
        currentUse: '',
        proposedUse: '',
        residentialGFA: 0,
        commercialGFA: 0,
        industrialGFA: 0,
        ward: '',
        municipality: 'Toronto',
        postal: '',
        source: 'planning',
      });
    }
  }

  console.log(`Planning items with coordinates: ${planningItems.length}`);

  const all = [...permits, ...planningItems];
  console.log(`Total items: ${all.length}`);

  // Save to public folder so the map can read it
  const outputPath = path.join(process.cwd(), 'public', 'permits.json');
  fs.writeFileSync(outputPath, JSON.stringify(all, null, 2));
  console.log(`Saved to ${outputPath}`);
}

main().catch(console.error);