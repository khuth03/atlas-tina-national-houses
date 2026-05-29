/**
 * Alabama County Scrapers
 * Counties: Madison, Limestone, Morgan, Montgomery, Autauga, Elmore, Jefferson, Shelby
 */

import { Lead, CountyConfig, makeId, formatDate, fetchWithRetry } from "./base.js";
import { lookupOwnerProperties } from "./assessor.js";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const AL_CRAIGSLIST: Record<string, string> = {
  Madison: "huntsville", Limestone: "huntsville", Morgan: "huntsville",
  Montgomery: "montgomery", Autauga: "montgomery", Elmore: "montgomery",
  Jefferson: "birmingham", Shelby: "birmingham",
};

// ─── Pre-Foreclosure via AlaCourt public search ───────────────────────────────
async function scrapePreForeclosure(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // AlaCourt public civil case search
    const url = `https://v2.alacourt.com/frmPublicCaseSearch.aspx?county=${encodeURIComponent(county)}&caseType=CV&fromDate=${fromDate}&toDate=${toDate}`;
    const res = await fetchWithRetry(url);
    const html = await res.text();

    // Simple regex parse for case rows (AlaCourt uses tables)
    const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const rows = html.match(rowRe) || [];

    for (const row of rows) {
      const cells: string[] = [];
      let m;
      while ((m = cellRe.exec(row)) !== null) {
        cells.push(m[1].replace(/<[^>]+>/g, "").trim());
      }
      cellRe.lastIndex = 0;
      if (cells.length < 3) continue;

      const caseNumber = cells[0];
      const caseStyle = cells[1];
      const filedDate = cells[2];

      if (!caseNumber || !/foreclos|lis pendens|mortgage/i.test(caseStyle)) continue;

      const parts = caseStyle.split(/\s+v\.?\s+/i);
      const ownerName = parts.length > 1 ? parts[1].trim() : caseStyle;

      leads.push({
        id: makeId(caseNumber, county, "AL"),
        county, state: "AL",
        lead_type: "Pre-Foreclosure",
        owner_name: ownerName,
        address: null, city: null, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNumber,
        filing_date: formatDate(filedDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: caseStyle,
        source_url: `https://v2.alacourt.com/frmPublicCaseSearch.aspx`,
        raw_data: JSON.stringify({ caseStyle }),
      });
    }
  } catch (_) { /* silent */ }
  return leads;
}

// ─── Tax Delinquent via Alabama Revenue Commissioner sites ────────────────────
async function scrapeTaxDelinquent(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const urls: Record<string, string> = {
    Jefferson: "https://www.jeffcointouch.com/revenue/delinquent-tax-list",
    Madison: "https://www.madisoncountyal.gov/departments/revenue/delinquent-taxes",
    Montgomery: "https://www.montgomerycountyal.gov/departments/revenue/delinquent-tax",
    Shelby: "https://www.shelbyal.com/departments/revenue/delinquent-tax-list",
  };
  const url = urls[county] || `https://www.revenue.alabama.gov/property-tax/delinquent-property-tax-list/?county=${county}`;

  try {
    const res = await fetchWithRetry(url);
    const html = await res.text();
    const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const rows = html.match(rowRe) || [];

    for (const row of rows) {
      const cells: string[] = [];
      let m;
      while ((m = cellRe.exec(row)) !== null) {
        cells.push(m[1].replace(/<[^>]+>/g, "").trim());
      }
      cellRe.lastIndex = 0;
      if (cells.length < 2 || !cells[0]) continue;

      leads.push({
        id: makeId(cells[0], county, "AL", "tax"),
        county, state: "AL",
        lead_type: "Tax Delinquent",
        owner_name: cells[0],
        address: cells[1] || null, city: null, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: cells[3] || null,
        filing_date: formatDate(cells[4]) || new Date().toISOString().split("T")[0],
        assessed_value: cells[2] || null, tax_year: new Date().getFullYear().toString(),
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: `Tax delinquent — amount: ${cells[2] || "unknown"}`,
        source_url: url,
        raw_data: JSON.stringify(cells),
      });
    }
  } catch (_) { /* silent */ }
  return leads;
}

// ─── Sheriff Sales ────────────────────────────────────────────────────────────
async function scrapeSheriffSales(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const urls: Record<string, string> = {
    Jefferson: "https://www.jeffcosheriff.net/civil/sheriff-sales",
    Madison: "https://www.madisoncountyal.gov/departments/sheriff/civil-process/sheriff-sales",
    Montgomery: "https://www.montgomeryal.gov/city-government/departments-offices/police-department/sheriff-sales",
    Shelby: "https://www.shelbycountysheriff.com/sheriff-sales",
    Morgan: "https://www.morgancountyal.gov/sheriff/sheriff-sales",
    Limestone: "https://www.limestonecountyal.com/sheriff/civil",
    Autauga: "https://www.autaugaso.com/sheriff-sales",
    Elmore: "https://www.elmorecountysheriff.com/sheriff-sales",
  };
  const url = urls[county];
  if (!url) return leads;

  try {
    const res = await fetchWithRetry(url);
    const html = await res.text();
    const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const rows = html.match(rowRe) || [];

    for (const row of rows) {
      const cells: string[] = [];
      let m;
      while ((m = cellRe.exec(row)) !== null) {
        cells.push(m[1].replace(/<[^>]+>/g, "").trim());
      }
      cellRe.lastIndex = 0;
      if (cells.length < 2) continue;

      const address = cells[1] || cells[0];
      const ownerName = cells[2] || cells[0];
      const saleDate = cells[3] || cells[0];
      const amount = cells[4] || "";

      if (!address && !ownerName) continue;

      leads.push({
        id: makeId(cells[0], county, "AL", "sheriff"),
        county, state: "AL",
        lead_type: "Sheriff Sale",
        owner_name: ownerName,
        address: address || null, city: null, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: cells[0] || null,
        filing_date: null,
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: formatDate(saleDate),
        sale_amount: amount || null,
        description: `Sheriff sale — ${county} County, AL`,
        source_url: url,
        raw_data: JSON.stringify(cells),
      });
    }
  } catch (_) { /* silent */ }
  return leads;
}

// ─── Craigslist FSBO ──────────────────────────────────────────────────────────
async function scrapeFSBO(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const city = AL_CRAIGSLIST[county];
  if (!city) return leads;

  try {
    const url = `https://${city}.craigslist.org/search/reo?format=json`;
    const res = await fetchWithRetry(url);
    const data = await res.json() as any;
    const items = data?.data?.items || [];

    for (const item of items.slice(0, 60)) {
      const title: string = item.title || "";
      if (!/fsbo|for sale by owner|motivated|must sell|price.?reduc|cash.?only|as.?is/i.test(title)) continue;

      leads.push({
        id: makeId(item.id || title, county, "AL", "fsbo"),
        county, state: "AL",
        lead_type: "FSBO",
        owner_name: "Unknown (Craigslist)",
        address: title, city: null, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null,
        filing_date: formatDate(item.posted_date) || new Date().toISOString().split("T")[0],
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: item.ask?.toString() || null,
        description: title,
        source_url: item.url || url,
        raw_data: JSON.stringify({ title, price: item.ask }),
      });
    }
  } catch (_) { /* silent */ }
  return leads;
}

// ─── Obituaries (estate leads) ────────────────────────────────────────────────
async function scrapeObituaries(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const city = AL_CRAIGSLIST[county]; // same city mapping
  if (!city) return leads;

  try {
    const url = `https://obits.al.com/${city}/obituaries`;
    const res = await fetchWithRetry(url);
    const html = await res.text();

    // Extract obituary names and dates
    const nameRe = /class="[^"]*obit[^"]*name[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi;
    const dateRe = /class="[^"]*date[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi;
    const names: string[] = [];
    const dates: string[] = [];
    let m;
    while ((m = nameRe.exec(html)) !== null) names.push(m[1].replace(/<[^>]+>/g, "").trim());
    while ((m = dateRe.exec(html)) !== null) dates.push(m[1].replace(/<[^>]+>/g, "").trim());

    for (let i = 0; i < Math.min(names.length, 30); i++) {
      if (!names[i]) continue;
      leads.push({
        id: makeId(names[i], county, "AL", "obit"),
        county, state: "AL",
        lead_type: "Obituary",
        owner_name: names[i],
        address: null, city: null, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null,
        filing_date: formatDate(dates[i]) || new Date().toISOString().split("T")[0],
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: "Obituary — potential estate/probate lead",
        source_url: url,
        raw_data: JSON.stringify({ name: names[i], date: dates[i] }),
      });
    }
  } catch (_) { /* silent */ }
  return leads;
}

// ─── BANKRUPTCY — Northern District of AL (ecf.alnb.uscourts.gov) ─────────────

// ─── PROBATE — Alabama SJIS probate court filings ────────────────────────────
export async function scrapeProbate(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://v2.alacourt.com/frmPublicCaseSearch.aspx?county=${encodeURIComponent(county)}&caseType=PR&fromDate=${fromDate}&toDate=${toDate}`;
    const res = await fetchWithRetry(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return leads;
    const html = await res.text();
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    // Collect all cases first
    type ALProbateRow = { caseNum: string; name: string; filed: string };
    const cases: ALProbateRow[] = [];
    for (const row of rows) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length < 3) continue;
      const getCell = (cell: string) => cell.replace(/<[^>]+>/g, "").trim();
      const caseNum = getCell(cells[0] || "");
      const name = getCell(cells[1] || "");
      const filed = getCell(cells[2] || "");
      if (!caseNum && !name) continue;
      cases.push({ caseNum, name, filed });
    }
    // Parallel assessor lookups — 5 concurrent
    const CONCURRENCY = 5;
    for (let i = 0; i < cases.length; i += CONCURRENCY) {
      const batch = cases.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(c => lookupOwnerProperties(c.name, county, "AL"))
      );
      for (let j = 0; j < batch.length; j++) {
        const { caseNum, name, filed } = batch[j];
        const properties = results[j];
        if (properties.length === 0) continue;
        for (const prop of properties) {
          leads.push({
            id: makeId("PROB", `${caseNum || name}-${prop.address}`, county, "AL"),
            county, state: "AL", lead_type: "Probate",
            owner_name: name || null, address: prop.address, city: prop.city || county, zip: prop.zip || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: caseNum || null, filing_date: formatDate(filed),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `${county} County AL Probate — ${name || caseNum}`,
            source_url: url, raw_data: JSON.stringify({ caseNum, name, filed, parcelId: prop.parcelId }),
          });
        }
      }
    }
  } catch (e) { console.error(`[AL] Probate ${county} error:`, e); }
  return leads;
}

export async function scrapeBankruptcy(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  // AL Northern District covers Madison, Morgan, Jefferson, Shelby; Southern covers Montgomery, Autauga, Elmore
  const RSS_FEEDS = [
    { url: "https://ecf.alnb.uscourts.gov/cgi-bin/rss_outside.pl", counties: ["Madison", "Morgan", "Jefferson", "Shelby"] },
    { url: "https://ecf.alsb.uscourts.gov/cgi-bin/rss_outside.pl", counties: ["Montgomery", "Autauga", "Elmore"] },
  ];
  try {
    for (const feed of RSS_FEEDS) {
      const rss = await fetchWithRetry(feed.url);
      if (!rss.ok) continue;
      const xml = await rss.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      // Parse all items first
      type ALBkItem = { title: string; link: string; pubDate: string; caseNum: string; caseName: string };
      const bkItems: ALBkItem[] = [];
      for (const item of items) {
        const title = (item.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/) || item.match(/<title>(.+?)<\/title>/))?.[1]?.trim() || "";
        const link  = (item.match(/<link>(.+?)<\/link>/))?.[1]?.trim() || "";
        const desc  = (item.match(/<description><!\[CDATA\[(.+?)\]\]><\/description>/) || item.match(/<description>(.+?)<\/description>/))?.[1]?.trim() || "";
        const pubDate = (item.match(/<pubDate>(.+?)<\/pubDate>/))?.[1]?.trim() || "";
        const caseNum = (title.match(/([0-9]{2}-[0-9]{5})/)?.[1]) || title;
        const ownerFromTitle = title.replace(/^[0-9]{2}-[0-9]{5}(-[0-9]+)?\s*/, "").trim();
        const caseName = ownerFromTitle || desc.replace(/<[^>]+>/g, "").replace(/&[a-z0-9#]+;/g, "").trim();
        bkItems.push({ title, link, pubDate, caseNum, caseName });
      }
      // Parallel assessor lookups across counties — 5 concurrent
      const CONCURRENCY = 5;
      for (let i = 0; i < bkItems.length; i += CONCURRENCY) {
        const batch = bkItems.slice(i, i + CONCURRENCY);
        // For each item, try all counties in parallel and pick first match
        const batchResults = await Promise.all(
          batch.map(async b => {
            for (const county of feed.counties) {
              const props = await lookupOwnerProperties(b.caseName, county, "AL");
              if (props.length > 0) return { county, props };
            }
            return null;
          })
        );
        for (let j = 0; j < batch.length; j++) {
          const match = batchResults[j];
          if (!match) continue;
          const { title, link, pubDate, caseNum, caseName } = batch[j];
          const { county, props } = match;
          for (const prop of props) {
            leads.push({
              id: makeId("AL", "AL", "Bankruptcy", `${caseNum}-${prop.address}`),
              county,
              state: "AL",
              lead_type: "Bankruptcy",
              owner_name: caseName || caseNum,
              address: prop.address,
              city: prop.city || county,
              zip: prop.zip || null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: caseNum,
              filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate),
              assessed_value: null, tax_year: null,
              lender: null, loan_amount: null, sale_date: null, sale_amount: null,
              source_url: link || feed.url,
              description: `AL Bankruptcy — ${caseName || caseNum}`,
              raw_data: JSON.stringify({ title, caseNum, caseName, pubDate, parcelId: prop.parcelId }),
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("[AL] Bankruptcy RSS error:", e);
  }
  return leads;
}

// ─── Main export ──────────────────────────────────────────────────────────────

// ─── CODE VIOLATIONS — Huntsville Open Data + Birmingham municipal portal ─────
export async function scrapeCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];

  // Huntsville Open Data — code enforcement complaints
  try {
    const url = `https://data.huntsvilleal.gov/resource/code-violations.json?$where=date_opened>='${fromDate}'&$limit=200&$order=date_opened DESC`;
    const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json() as Record<string, string>[];
      for (const item of data) {
        const address = item.address || item.location || "";
        const type = item.violation_type || item.complaint_type || "Code Violation";
        const date = item.date_opened || fromDate;
        const caseNum = item.case_number || item.id || "";
        if (!address && !caseNum) continue;
        leads.push({
          id: makeId("CV", caseNum || address, "Madison", "AL"),
          county: "Madison", state: "AL",
          lead_type: "Code Violation",
          owner_name: null,
          address: address || null, city: "Huntsville", zip: item.zip || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: caseNum || null,
          filing_date: formatDate(date),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Code Violation — ${type} — ${address}`,
          source_url: "https://data.huntsvilleal.gov/",
          raw_data: JSON.stringify(item),
        });
      }
    }
  } catch (e) {
    console.error("[AL] Huntsville Code Violations error:", e);
  }

  // Jefferson County (Birmingham) code enforcement
  try {
    const url = `https://www.jeffcointouch.com/codeenforcement/search?fromDate=${fromDate}&toDate=${fromDate}`;
    const res = await fetchWithRetry(url);
    if (res.ok) {
      const html = await res.text();
      const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const rows = html.match(rowRe) || [];
      for (const row of rows) {
        const cells: string[] = [];
        let m;
        while ((m = cellRe.exec(row)) !== null) cells.push(m[1].replace(/<[^>]+>/g, "").trim());
        cellRe.lastIndex = 0;
        if (cells.length < 2 || !cells[0]) continue;
        leads.push({
          id: makeId("CV", cells[0], "Jefferson", "AL"),
          county: "Jefferson", state: "AL",
          lead_type: "Code Violation",
          owner_name: cells[1] || null,
          address: cells[2] || null, city: "Birmingham", zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: cells[0] || null,
          filing_date: formatDate(cells[3]) || new Date().toISOString().split("T")[0],
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Code Violation — Jefferson County AL — ${cells[2] || cells[0]}`,
          source_url: url,
          raw_data: JSON.stringify(cells),
        });
      }
    }
  } catch (e) {
    console.error("[AL] Jefferson Code Violations error:", e);
  }

  return leads;
}

// ─── OUT-OF-STATE OWNERS — removed (CourtListener federal dockets ≠ county RE leads) ─
export async function scrapeOutOfStateOwners(fromDate: string, toDate: string): Promise<Lead[]> {
  // This source was CourtListener federal civil dockets which returned 0 relevant leads.
  // Out-of-state owner data requires county assessor parcel data (not yet available via free API).
  return [];
}

// ─── VACANT / ABANDONED — removed (PACER Ch.7 RSS is not a reliable proxy for vacant RE) ─
export async function scrapeVacantAbandoned(fromDate: string, toDate: string): Promise<Lead[]> {
  // Previously used PACER Ch.7 RSS as a proxy for vacant/abandoned — not reliable.
  // Vacant/abandoned data requires city blight registries (added via code violations above).
  return [];
}

// ─── DIVORCE / EVICTION — removed (federal PACER does not contain state divorce cases) ─
export async function scrapeDivorce(fromDate: string, toDate: string): Promise<Lead[]> {
  // Federal PACER RSS does not contain state-level divorce/eviction cases.
  // AL divorce cases are in AlaCourt (state system) — accessible via scrapeProbate with caseType=DR.
  return [];
}

export async function scrapeAlabama(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const results = await Promise.allSettled([
    scrapePreForeclosure(county, fromDate, toDate),
    scrapeTaxDelinquent(county, fromDate, toDate),
    scrapeSheriffSales(county, fromDate, toDate),
    scrapeFSBO(county, fromDate, toDate),
    scrapeObituaries(county, fromDate, toDate),
    scrapeBankruptcy(fromDate, toDate),
    scrapeCodeViolations(fromDate, toDate),
    scrapeDivorce(fromDate, toDate),
    scrapeOutOfStateOwners(fromDate, toDate),
    scrapeVacantAbandoned(fromDate, toDate),
    scrapeProbate(county, fromDate, toDate),
  
  
  ]);

  return results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => (r as PromiseFulfilledResult<Lead[]>).value);
}
