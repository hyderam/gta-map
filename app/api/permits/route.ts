import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const north = parseFloat(searchParams.get('north') ?? '43.85');
  const south = parseFloat(searchParams.get('south') ?? '43.55');
  const east  = parseFloat(searchParams.get('east')  ?? '-79.1');
  const west  = parseFloat(searchParams.get('west')  ?? '-79.75');
  const status = searchParams.get('status') ?? 'all';

  let query = supabase
    .from('permits')
    .select('*')
    .gte('lat', south)
    .lte('lat', north)
    .gte('lng', west)
    .lte('lng', east)
    .limit(5000);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
