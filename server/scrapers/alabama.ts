/**
 * Alabama County Scrapers
 * Counties: Madison, Limestone, Morgan, Montgomery, Autauga, Elmore, Jefferson, Shelby
 */

import { Lead, CountyConfig, makeId, formatDate, fetchWithRetry } from "./base.js";

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
        lead_type: "Probate/Estate",
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

// ─── Main export ──────────────────────────────────────────────────────────────
export async function scrapeAlabama(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const results = await Promise.allSettled([
    scrapePreForeclosure(county, fromDate, toDate),
    scrapeTaxDelinquent(county, fromDate, toDate),
    scrapeSheriffSales(county, fromDate, toDate),
    scrapeFSBO(county, fromDate, toDate),
    scrapeObituaries(county, fromDate, toDate),
  ]);

  return results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => (r as PromiseFulfilledResult<Lead[]>).value);
}
