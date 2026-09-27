// Run with:
//   npx playwright install chromium   (one-time browser download)
//   npx tsx scripts/enrich-images.ts
//
// Safe to re-run — skips permits already marked as found or 'none'.
// Only processes planning applications by default; pass --all to include building permits.

import { chromium } from 'playwright';

const SUPABASE_URL = 'https://xefgxekuhmfpglzrbiww.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZmd4ZWt1aG1mcGdsenJiaXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMDY4MzIsImV4cCI6MjA5NTY4MjgzMn0.hvdcj-cOrXqV-VjLsec7hH-J8NG5eyTjyoWUHtGC0hM';

const ALL_PERMITS = process.argv.includes('--all');

async function fetchUnprocessed(): Promise<{ id: string; address: string; source: string }[]> {
  const permits: any[] = [];
  let offset = 0;
  const sourceFilter = ALL_PERMITS ? '' : `&source=eq.planning`;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/permits?image_url=eq.${sourceFilter}&select=id,address,source&offset=${offset}&limit=1000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) break;
    permits.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return permits;
}

async function saveImageUrl(id: string, imageUrl: string) {
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

async function getOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
           || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    return m ? m[1] : null;
  } catch { return null; }
}

// Extract UrbanToronto project URL from a page — checks link hrefs, link text,
// and full page HTML since search engines often wrap hrefs as redirects.
async function extractUrbanTorontoUrl(page: any): Promise<string | null> {
  const html: string = await page.content();
  const m = html.match(/urbantoronto\.ca\/database\/projects\/[a-z0-9-]+\.[0-9]+/);
  return m ? `https://${m[0]}` : null;
}

async function searchForUrbanTorontoUrl(page: any, address: string): Promise<string | null> {
  const parts = address.trim().split(/\s+/);
  const searchTerms = parts.slice(0, 2).join(' '); // e.g. "1711 KINGSTON"

  // Try DuckDuckGo first — uses site: operator to focus on UrbanToronto
  try {
    const query = `site:urbantoronto.ca "${searchTerms}" Toronto`;
    await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&kl=ca-en`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(2500);
    const url = await extractUrbanTorontoUrl(page);
    if (url) return url;
  } catch { /* fall through */ }

  // Fallback: Bing
  try {
    const query = `urbantoronto.ca/database/projects "${searchTerms}" Toronto`;
    await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(2500);
    const url = await extractUrbanTorontoUrl(page);
    if (url) return url;
  } catch { /* give up */ }

  return null;
}

async function main() {
  const permits = await fetchUnprocessed();
  console.log(`Found ${permits.length} permits to process (source: ${ALL_PERMITS ? 'all' : 'planning only'})`);
  if (permits.length === 0) {
    console.log('Nothing to do — all permits already have image_url set.');
    return;
  }

  // headless:false avoids bot-detection on search engines.
  // A browser window will open — you can minimise it; it closes automatically when done.
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

  let found = 0;
  let notFound = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < permits.length; i++) {
    const permit = permits[i];
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const eta = i > 0 ? Math.round((elapsed / i) * (permits.length - i)) : '?';
    process.stdout.write(`[${i + 1}/${permits.length}] ${permit.address.padEnd(40).substring(0, 40)} `);

    try {
      const utUrl = await searchForUrbanTorontoUrl(page, permit.address);

      if (utUrl) {
        const imageUrl = await getOgImage(utUrl);
        if (imageUrl) {
          await saveImageUrl(permit.id, imageUrl);
          process.stdout.write(`✓  ${imageUrl.substring(0, 60)}\n`);
          found++;
        } else {
          await saveImageUrl(permit.id, 'none');
          process.stdout.write(`—  page found but no image\n`);
          notFound++;
        }
      } else {
        await saveImageUrl(permit.id, 'none');
        process.stdout.write(`✗  not on UrbanToronto\n`);
        notFound++;
      }
    } catch (err: any) {
      process.stdout.write(`!  error: ${err.message?.substring(0, 50)}\n`);
      errors++;
    }

    // Progress summary every 25 permits
    if ((i + 1) % 25 === 0) {
      console.log(`\n  ── ${found} found, ${notFound} not found, ${errors} errors — ETA ~${eta}s ──\n`);
    }

    // Randomised delay to avoid bot detection (1.5–3s)
    await page.waitForTimeout(1500 + Math.random() * 1500);
  }

  await browser.close();
  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nDone in ${totalTime}s — ${found} images found, ${notFound} not on UrbanToronto, ${errors} errors.`);
}

main().catch(console.error);
