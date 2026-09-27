import { chromium } from 'playwright';

const SUPABASE_URL = 'https://xefgxekuhmfpglzrbiww.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZmd4ZWt1aG1mcGdsenJiaXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMDY4MzIsImV4cCI6MjA5NTY4MjgzMn0.hvdcj-cOrXqV-VjLsec7hH-J8NG5eyTjyoWUHtGC0hM';

// Grab a few planning app URLs
const res = await fetch(`${SUPABASE_URL}/rest/v1/permits?source=eq.planning&application_url=neq.&select=id,address,application_url&limit=4&offset=1`, {
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
});
const rows = await res.json();

const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await context.newPage();

for (const row of rows) {
  console.log(`\n========== ${row.address} ==========`);
  console.log('URL:', row.application_url);
  const apiHits = [];
  const handler = (resp) => { if (resp.url().includes('api.toronto.ca')) apiHits.push(`${resp.status()} ${resp.url().split('/').pop()}`); };
  page.on('response', handler);

  try {
    await page.goto(row.application_url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(6000);
    console.log('Redirected to:', page.url());
    console.log('API calls so far:', apiHits);

    // Try to expand Supporting Documentation
    const sel = await page.$('text=Supporting Documentation');
    console.log('Supporting Documentation element found:', !!sel);
    if (sel) {
      await sel.click();
      await page.waitForTimeout(4000);
      console.log('API calls after expand:', apiHits);
    }

    // Check for any terms/agree gate
    const agreeBtn = await page.$('text=/agree|accept|terms/i');
    console.log('Terms/agree gate found:', !!agreeBtn);

    // Page heading
    const h1 = await page.$eval('h1', el => el.textContent?.trim()).catch(() => 'no h1');
    console.log('H1:', h1);
  } catch (e) {
    console.log('ERROR:', e.message);
  }
  page.off('response', handler);
}

await page.waitForTimeout(2000);
await browser.close();
