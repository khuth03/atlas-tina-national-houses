/**
 * Ohio County Scrapers
 * Counties: Hamilton (Cincinnati area)
 */

import { Lead, makeId, formatDate, fetchWithRetry } from "./base.js";

// ─── Pre-Foreclosure via Hamilton County Clerk of Courts ──────────────────────
async function scrapePreForeclosure(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://www.courtclerk.org/records-search/case-search/?caseType=F&fromDate=${fromDate}&toDate=${toDate}`;
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

      const caseNumber = cells[0];
      const caseStyle = cells[1];
      const filedDate = cells[2] || "";

      const parts = caseStyle.split(/\s+v\.?\s+/i);
      const ownerName = parts.length > 1 ? parts[1].trim() : caseStyle;

      leads.push({
        id: makeId(caseNumber, "Hamilton", "OH"),
        county: "Hamilton", state: "OH",
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
        source_url: "https://www.courtclerk.org/records-search/case-search/",
        raw_data: JSON.stringify({ caseStyle }),
      });
    }
  } catch (_) { /* silent */ }
  return leads;
}

// ─── Sheriff Sales via HCSO ───────────────────────────────────────────────────
async function scrapeSheriffSales(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = "https://www.hcso.org/civil/sheriff-sales";
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

      const caseNumber = cells[0];
      const address = cells[1];
      const ownerName = cells[2] || "Unknown";
      const saleDate = cells[3] || "";
      const amount = cells[4] || "";

      if (!address && !ownerName) continue;

      leads.push({
        id: makeId(caseNumber, "Hamilton", "OH", "sheriff"),
        county: "Hamilton", state: "OH",
        lead_type: "Sheriff Sale",
        owner_name: ownerName,
        address: address || null, city: "Cincinnati", zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNumber || null,
        filing_date: null,
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: formatDate(saleDate),
        sale_amount: amount || null,
        description: `Sheriff sale — Hamilton County, OH`,
        source_url: url,
        raw_data: JSON.stringify(cells),
      });
    }
  } catch (_) { /* silent */ }
  return leads;
}

// ─── Tax Delinquent via Hamilton County Auditor ───────────────────────────────
async function scrapeTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = "https://www.hamiltoncountyauditor.org/realsearch.asp";
    const body = new URLSearchParams({ searchType: "delinquent", year: new Date().getFullYear().toString() }).toString();
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
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
        id: makeId(cells[0], "Hamilton", "OH", "tax"),
        county: "Hamilton", state: "OH",
        lead_type: "Tax Delinquent",
        owner_name: cells[0],
        address: cells[1] || null, city: null, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: cells[3] || null,
        filing_date: new Date().toISOString().split("T")[0],
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

// ─── Probate via Hamilton County Probate Court ────────────────────────────────
async function scrapeProbate(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://www.probatect.org/case-search?fromDate=${fromDate}&caseType=estate`;
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
      if (cells.length < 2 || !cells[1]) continue;

      leads.push({
        id: makeId(cells[0], "Hamilton", "OH", "probate"),
        county: "Hamilton", state: "OH",
        lead_type: "Probate/Estate",
        owner_name: cells[1],
        address: null, city: null, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: cells[0] || null,
        filing_date: formatDate(cells[2]),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: "Probate estate filing — potential property sale",
        source_url: url,
        raw_data: JSON.stringify(cells),
      });
    }
  } catch (_) { /* silent */ }
  return leads;
}

// ─── Craigslist Cincinnati FSBO ───────────────────────────────────────────────
async function scrapeFSBO(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = "https://cincinnati.craigslist.org/search/reo?format=json";
    const res = await fetchWithRetry(url);
    const data = await res.json() as any;
    const items = data?.data?.items || [];

    for (const item of items.slice(0, 60)) {
      const title: string = item.title || "";
      if (!/fsbo|for sale by owner|motivated|must sell|price.?reduc|cash.?only|as.?is/i.test(title)) continue;

      leads.push({
        id: makeId(item.id || title, "Hamilton", "OH", "fsbo"),
        county: "Hamilton", state: "OH",
        lead_type: "FSBO",
        owner_name: "Unknown (Craigslist)",
        address: title, city: "Cincinnati", zip: null,
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

// ─── Cincinnati Fire Department daily incidents ───────────────────────────────
async function scrapeFireDamage(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = "https://www.cincinnati-oh.gov/fire/incident-reports/";
    const res = await fetchWithRetry(url);
    const html = await res.text();

    const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const rows = html.match(rowRe) || [];

    for (const row of rows) {
      const text = row.replace(/<[^>]+>/g, " ");
      if (!/structure fire|building fire|residential fire|house fire/i.test(text)) continue;

      const cells: string[] = [];
      let m;
      while ((m = cellRe.exec(row)) !== null) {
        cells.push(m[1].replace(/<[^>]+>/g, "").trim());
      }
      cellRe.lastIndex = 0;
      if (!cells[0]) continue;

      leads.push({
        id: makeId(cells[0], "Hamilton", "OH", "fire"),
        county: "Hamilton", state: "OH",
        lead_type: "Fire Damage",
        owner_name: "Unknown",
        address: cells[0] || null, city: "Cincinnati", zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null,
        filing_date: formatDate(cells[1]) || new Date().toISOString().split("T")[0],
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: cells[2] || "Structure Fire",
        source_url: url,
        raw_data: JSON.stringify(cells),
      });
    }
  } catch (_) { /* silent */ }
  return leads;
}

// ─── BANKRUPTCY — Southern District of OH (ecf.ohsb.uscourts.gov) ─────────────
export async function scrapeBankruptcy(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rss = await fetchWithRetry("https://ecf.ohsb.uscourts.gov/cgi-bin/rss_outside.pl");
    if (!rss.ok) return leads;
    const xml = await rss.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const item of items) {
      const title = (item.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/) || item.match(/<title>(.+?)<\/title>/))?.[1]?.trim() || "";
      const link  = (item.match(/<link>(.+?)<\/link>/))?.[1]?.trim() || "";
      const desc  = (item.match(/<description><!\[CDATA\[(.+?)\]\]><\/description>/) || item.match(/<description>(.+?)<\/description>/))?.[1]?.trim() || "";
      const pubDate = (item.match(/<pubDate>(.+?)<\/pubDate>/))?.[1]?.trim() || "";
      const caseNum = (title.match(/([0-9]{2}-[0-9]{5})/)?.[1]) || title;
      // Extract owner name from title: "26-70730-13 Jesse Ray Evin Keeton" -> "Jesse Ray Evin Keeton"
      const ownerFromTitle = title.replace(/^[0-9]{2}-[0-9]{5}(-[0-9]+)?\s*/, "").trim();
      const caseName = ownerFromTitle || desc.replace(/<[^>]+>/g, "").replace(/&[a-z0-9#]+;/g, "").trim();
      leads.push({
        id: makeId("OH", "OH", "Bankruptcy", caseNum),
        county: "Hamilton",
        state: "OH",
        lead_type: "Bankruptcy",
        owner_name: caseName || caseNum,
        address: "", city: "", zip: "",
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum,
        filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        source_url: link || "https://ecf.ohsb.uscourts.gov/cgi-bin/rss_outside.pl",
        description: `OH Bankruptcy — ${caseName || caseNum}`,
        raw_data: JSON.stringify({ title, caseNum, caseName, pubDate }),
      });
    }
  } catch (e) {
    console.error("[OH] Bankruptcy RSS error:", e);
  }
  return leads;
}

// ─── OBITUARIES — Legacy.com OH (Cincinnati Enquirer) ───────────────────────
export async function scrapeObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const url = `https://www.legacy.com/us/obituaries/enquirer/browse?dateRange=last30Days&countryId=1&regionId=36`; // OH
  try {
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    const html = await res.text();
    const nameMatches = html.matchAll(/<span[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/span>/gi);
    const locationMatches = [...html.matchAll(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*(?:OH|Ohio)/g)];
    const names = [...nameMatches].map(m => m[1].trim()).filter(n => n.length > 3);
    const linkMatches = [...html.matchAll(/href="(\/us\/obituaries\/[^"]+)"/g)].map(m => `https://www.legacy.com${m[1]}`);
    names.forEach((name, i) => {
      const location = locationMatches[i]?.[1] || "Cincinnati";
      leads.push({
        id: makeId("Hamilton", "OH", "Obituary", name + i),
        county: "Hamilton",
        state: "OH",
        lead_type: "Obituary",
        owner_name: name,
        address: "", city: location, zip: "",
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null,
        filing_date: formatDate(fromDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        source_url: linkMatches[i] || url,
        description: `Obituary — ${name}, ${location}, OH. Potential estate/probate lead.`,
        raw_data: JSON.stringify({ name, location }),
      });
    });
  } catch (e) {
    console.error("[OH] Obituaries error:", e);
  }
  return leads;
}

// ─── Main export ──────────────────────────────────────────────────────────────

// ─── CODE VIOLATIONS — Ohio municipal portals ─────────────────────────
export async function scrapeCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  // CourtListener API — Ohio district court civil cases (code enforcement)
  try {
    const url =
      `https://www.courtlistener.com/api/rest/v4/dockets/` +
      `?court=ohsd&date_filed__gte=${fromDate}&date_filed__lte=${toDate}` +
      `&nature_of_suit=440&order_by=-date_filed&page_size=50`;
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": "Atlas/1.0 (atlas@easybuttonrealestate.com)", Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json() as { results?: unknown[] };
      for (const r of (data?.results || []) as Record<string, unknown>[]) {
        const caseName = String(r.case_name || "");
        const caseNum = String(r.docket_number || "");
        const filedDate = String(r.date_filed || "");
        if (!caseName && !caseNum) continue;
        leads.push({
          id: makeId("CV", caseNum || caseName, "OH", "code"),
          county: "OH",
          state: "OH",
          lead_type: "Code Violation",
          owner_name: caseName || null,
          address: null, city: null, zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: caseNum || null,
          filing_date: formatDate(filedDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Code Violation / Civil Rights — ${caseName || caseNum}`,
          source_url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : "https://www.courtlistener.com/",
          raw_data: JSON.stringify({ caseName, caseNum, filedDate }),
        });
      }
    }
  } catch (e) {
    console.error("[OH] Code Violations error:", e);
  }
  return leads;
}

// ─── OUT-OF-STATE OWNERS — CourtListener Ohio ─────────────────────────
export async function scrapeOutOfStateOwners(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  // Use CourtListener to find absentee/out-of-state property cases
  try {
    const url =
      `https://www.courtlistener.com/api/rest/v4/dockets/` +
      `?court=ohsd&date_filed__gte=${fromDate}&date_filed__lte=${toDate}` +
      `&nature_of_suit=290&order_by=-date_filed&page_size=50`;
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": "Atlas/1.0 (atlas@easybuttonrealestate.com)", Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json() as { results?: unknown[] };
      for (const r of (data?.results || []) as Record<string, unknown>[]) {
        const caseName = String(r.case_name || "");
        const caseNum = String(r.docket_number || "");
        const filedDate = String(r.date_filed || "");
        if (!caseName && !caseNum) continue;
        leads.push({
          id: makeId("OOS", caseNum || caseName, "OH", "oos"),
          county: "OH",
          state: "OH",
          lead_type: "Out-of-State Owner",
          owner_name: caseName || null,
          address: null, city: null, zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: caseNum || null,
          filing_date: formatDate(filedDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Out-of-State Owner / Property Dispute — ${caseName || caseNum}`,
          source_url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : "https://www.courtlistener.com/",
          raw_data: JSON.stringify({ caseName, caseNum, filedDate }),
        });
      }
    }
  } catch (e) {
    console.error("[OH] Out-of-State Owners error:", e);
  }
  return leads;
}

// ─── VACANT / ABANDONED — Ohio PACER civil RSS ────────────────────────
export async function scrapeVacantAbandoned(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rssRes = await fetchWithRetry("https://ecf.ohsb.uscourts.gov/cgi-bin/rss_outside.pl");
    if (rssRes.ok) {
      const xml = await rssRes.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items) {
        const title = (item.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/) || item.match(/<title>(.+?)<\/title>/))?.[1]?.trim() || "";
        const link = (item.match(/<link>(.+?)<\/link>/))?.[1]?.trim() || "";
        const pubDate = (item.match(/<pubDate>(.+?)<\/pubDate>/))?.[1]?.trim() || "";
        const desc = (item.match(/<description><!\[CDATA\[(.+?)\]\]><\/description>/) || item.match(/<description>(.+?)<\/description>/))?.[1]?.trim() || "";
        if (!title) continue;
        const lower = (title + " " + desc).toLowerCase();
        // Chapter 7 liquidations often involve vacant/abandoned properties
        if (!lower.includes("chapter 7") && !lower.includes("vacant") && !lower.includes("abandon")) continue;
        leads.push({
          id: makeId("VAC", title, "OH", "vacant"),
          county: "OH",
          state: "OH",
          lead_type: "Vacant/Abandoned",
          owner_name: title.split(/\s+v\.?\s+/i)[0]?.trim() || title,
          address: null, city: null, zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: null,
          filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Vacant/Abandoned — Chapter 7 Liquidation — ${title}`,
          source_url: link || "https://ecf.ohsb.uscourts.gov/cgi-bin/rss_outside.pl",
          raw_data: JSON.stringify({ title, pubDate, desc }),
        });
      }
    }
  } catch (e) {
    console.error("[OH] Vacant/Abandoned error:", e);
  }
  return leads;
}

// ─── DIVORCE / EVICTION — Ohio PACER civil RSS ────────────────────────
export async function scrapeDivorce(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rssRes = await fetchWithRetry("https://ecf.ohsd.uscourts.gov/cgi-bin/rss_outside.pl");
    if (rssRes.ok) {
      const xml = await rssRes.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items) {
        const title = (item.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/) || item.match(/<title>(.+?)<\/title>/))?.[1]?.trim() || "";
        const link = (item.match(/<link>(.+?)<\/link>/))?.[1]?.trim() || "";
        const pubDate = (item.match(/<pubDate>(.+?)<\/pubDate>/))?.[1]?.trim() || "";
        const desc = (item.match(/<description><!\[CDATA\[(.+?)\]\]><\/description>/) || item.match(/<description>(.+?)<\/description>/))?.[1]?.trim() || "";
        if (!title) continue;
        const lower = (title + " " + desc).toLowerCase();
        if (!lower.includes("matrimon") && !lower.includes("divorce") && !lower.includes("dissolution") && !lower.includes("evict")) continue;
        const parts = title.split(/\s+v\.?\s+/i);
        leads.push({
          id: makeId("DIV", title, "OH", "divorce"),
          county: "OH",
          state: "OH",
          lead_type: "Divorce",
          owner_name: parts.join(" & ") || title,
          address: null, city: null, zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: null,
          filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Divorce / Eviction — ${title}`,
          source_url: link || "https://ecf.ohsd.uscourts.gov/cgi-bin/rss_outside.pl",
          raw_data: JSON.stringify({ title, pubDate, desc }),
        });
      }
    }
  } catch (e) {
    console.error("[OH] Divorce/Eviction RSS error:", e);
  }
  return leads;
}

export async function scrapeOhio(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  if (county !== "Hamilton") return [];

  const results = await Promise.allSettled([
    scrapePreForeclosure(fromDate, toDate),
    scrapeSheriffSales(fromDate, toDate),
    scrapeTaxDelinquent(fromDate, toDate),
    scrapeProbate(fromDate, toDate),
    scrapeFSBO(fromDate, toDate),
    scrapeFireDamage(fromDate, toDate),
    scrapeBankruptcy(fromDate, toDate),
    scrapeObituaries(fromDate, toDate),
    scrapeCodeViolations(fromDate, toDate),
    scrapeDivorce(fromDate, toDate),
    scrapeOutOfStateOwners(fromDate, toDate),
    scrapeVacantAbandoned(fromDate, toDate),
  
  ]);

  return results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => (r as PromiseFulfilledResult<Lead[]>).value);
}
