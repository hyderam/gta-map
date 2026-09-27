// Phase 1: Pull rich proposal description + planner + full document list from the
// City of Toronto AIC for every planning application. Stores in Supabase.
//
// Run: npx tsx scripts/enrich-aic.ts [--limit N]
// Resumable — skips rows where aic_status is already set.
// A visible browser window opens (the AIC blocks headless access).

import { chromium, Page } from 'playwright';

const SUPABASE_URL = 'https://xefgxekuhmfpglzrbiww.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZmd4ZWt1aG1mcGdsenJiaXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMDY4MzIsImV4cCI6MjA5NTY4MjgzMn0.hvdcj-cOrXqV-VjLsec7hH-J8NG5eyTjyoWUHtGC0hM';

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(process.argv[limitArg + 1]) : Infinity;

interface PlanningRow { id: string; address: string; application_url: string; }

async function fetchUnprocessed(): Promise<PlanningRow[]> {
  const rows: PlanningRow[] = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/permits?source=eq.planning&aic_status=eq.&application_url=neq.&select=id,address,application_url&offset=${offset}&limit=1000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

async function save(id: string, fields: Record<string, any>) {
  await fetch(`${SUPABASE_URL}/rest/v1/permits?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(fields),
  });
}

// Load the AIC app for a planning app and intercept its API responses.
async function fetchAicData(page: Page, applicationUrl: string): Promise<{ description: string; planner: string; documents: any[] } | null> {
  let detailsRes: any = null;
  let attachmentsRes: any = null;

  // Store the response objects synchronously; parse bodies after the page settles.
  const onResponse = (res: any) => {
    const url = res.url();
    if (url.includes('getapplicationdetails')) detailsRes = res;
    else if (url.includes('getapplicationattachments')) attachmentsRes = res;
  };
  page.on('response', onResponse);

  try {
    // Navigate to the (encrypted) AIC URL — it redirects to the modern app which calls the APIs.
    await page.goto(applicationUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    // Wait until both API responses have arrived (or timeout)
    const deadline = Date.now() + 22000;
    while ((!detailsRes || !attachmentsRes) && Date.now() < deadline) {
      await page.waitForTimeout(400);
    }
  } catch {
    /* navigation issue */
  } finally {
    page.off('response', onResponse);
  }

  // Parse bodies now (gracefully — closed folders return 400)
  let details: any = null;
  let attachments: any[] = [];
  if (detailsRes && detailsRes.status() === 200) {
    try { details = await detailsRes.json(); } catch {}
  }
  if (attachmentsRes && attachmentsRes.status() === 200) {
    try { attachments = await attachmentsRes.json(); } catch {}
  }

  if (!details && attachments.length === 0) return null;

  const main = details?.mainApplication || {};
  const planner = main.plannerInfo
    ? [main.plannerInfo.plannerName, main.plannerInfo.plannerTitle, main.plannerInfo.plannerPhone, main.plannerInfo.emailAddress].filter(Boolean).join(' | ')
    : '';
  const documents = (attachments || []).map((a: any) => ({
    name: a.attachmentDesc,
    fullName: a.attachmentInfoValue,
    rsn: a.attachmentRsn,
    sizeMB: a.attachmentSizeMB,
    date: a.attachmentDate,
  }));

  return {
    description: main.folderDescription?.trim() || '',
    planner,
    documents,
  };
}

async function main() {
  let rows = await fetchUnprocessed();
  console.log(`${rows.length} planning applications to process`);
  if (LIMIT !== Infinity) { rows = rows.slice(0, LIMIT); console.log(`Limiting to first ${LIMIT}`); }
  if (rows.length === 0) return;

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-CA',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await context.newPage();

  let withData = 0, empty = 0, errors = 0;
  const start = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const elapsed = Math.round((Date.now() - start) / 1000);
    const eta = i > 0 ? Math.round((elapsed / i) * (rows.length - i)) : '?';
    process.stdout.write(`[${i + 1}/${rows.length}] ${row.address.padEnd(34).substring(0, 34)} `);

    try {
      const data = await fetchAicData(page, row.application_url);
      if (data && (data.description || data.documents.length)) {
        await save(row.id, {
          aic_description: data.description,
          aic_planner: data.planner,
          aic_documents: data.documents,
          aic_status: 'done',
        });
        process.stdout.write(`✓ ${data.documents.length} docs${data.description ? ', desc' : ''}\n`);
        withData++;
      } else {
        await save(row.id, { aic_status: 'none' });
        process.stdout.write(`— no data\n`);
        empty++;
      }
    } catch (err: any) {
      process.stdout.write(`! ${err.message?.substring(0, 40)}\n`);
      errors++;
    }

    if ((i + 1) % 25 === 0) {
      console.log(`\n  ── ${withData} with data, ${empty} empty, ${errors} errors — ETA ~${eta}s ──\n`);
    }
    await page.waitForTimeout(800 + Math.random() * 800);
  }

  await browser.close();
  console.log(`\nDone in ${Math.round((Date.now() - start) / 1000)}s — ${withData} enriched, ${empty} empty, ${errors} errors.`);
}

main().catch(console.error);
