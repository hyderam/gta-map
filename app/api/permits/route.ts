import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json([], { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const north = parseFloat(searchParams.get('north') ?? '43.85');
  const south = parseFloat(searchParams.get('south') ?? '43.55');
  const east  = parseFloat(searchParams.get('east')  ?? '-79.1');
  const west  = parseFloat(searchParams.get('west')  ?? '-79.75');
  const status = searchParams.get('status') ?? 'all';

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 7);
  const cutoffDate = cutoff.toISOString().split('T')[0];

  const params = new URLSearchParams({
    'lat': `gte.${south}`,
    'lng': `gte.${west}`,
    'application_date': `gte.${cutoffDate}`,
    'limit': '5000',
    'select': '*',
  });
  params.append('lat', `lte.${north}`);
  params.append('lng', `lte.${east}`);
  if (status !== 'all') params.set('status', `eq.${status}`);

  const res = await fetch(`${supabaseUrl}/rest/v1/permits?${params}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Supabase error:', err);
    return NextResponse.json([], { status: 500 });
  }

  const rows: any[] = await res.json();

  const permits = rows.map((r) => ({
    id:              r.id,
    permitNum:       r.permit_num,
    address:         r.address,
    lat:             r.lat,
    lng:             r.lng,
    status:          r.status,
    rawStatus:       r.raw_status,
    type:            r.type,
    structureType:   r.structure_type,
    work:            r.work,
    description:     r.description,
    applicationDate: r.application_date,
    issuedDate:      r.issued_date,
    completedDate:   r.completed_date,
    units:           r.units,
    unitsLost:       r.units_lost,
    cost:            r.cost,
    builder:         r.builder,
    currentUse:      r.current_use,
    proposedUse:     r.proposed_use,
    residentialGFA:  r.residential_gfa,
    commercialGFA:   r.commercial_gfa,
    industrialGFA:   r.industrial_gfa,
    ward:            r.ward,
    municipality:    r.municipality,
    postal:          r.postal,
  }));

  return NextResponse.json(permits);
}
