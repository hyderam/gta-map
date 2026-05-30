const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://xefgxekuhmfpglzrbiww.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZmd4ZWt1aG1mcGdsenJiaXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMDY4MzIsImV4cCI6MjA5NTY4MjgzMn0.hvdcj-cOrXqV-VjLsec7hH-J8NG5eyTjyoWUHtGC0hM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Reading permits.json...');
  const filePath = path.join(process.cwd(), 'public', 'permits.json');
  const data = fs.readFileSync(filePath, 'utf-8');
  const permits = JSON.parse(data);
  console.log(`Total permits to upload: ${permits.length}`);

  const rows = permits.map((p: any) => ({
    id: p.id,
    permit_num: p.permitNum,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    status: p.status,
    raw_status: p.rawStatus,
    type: p.type,
    structure_type: p.structureType,
    work: p.work,
    description: p.description,
    application_date: p.applicationDate,
    issued_date: p.issuedDate,
    completed_date: p.completedDate,
    units: p.units,
    units_lost: p.unitsLost,
    cost: p.cost,
    builder: p.builder,
    current_use: p.currentUse,
    proposed_use: p.proposedUse,
    residential_gfa: p.residentialGFA || 0,
    commercial_gfa: p.commercialGFA || 0,
    industrial_gfa: p.industrialGFA || 0,
    ward: p.ward,
    municipality: p.municipality,
    postal: p.postal,
    source: p.source || 'permit',
  }));

  // Upload in batches of 500
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('permits').upsert(batch);
    if (error) {
      console.error(`Error at batch ${i}:`, error.message);
    } else {
      console.log(`Uploaded ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`);
    }
  }

  console.log('Done!');
}

main().catch(console.error);