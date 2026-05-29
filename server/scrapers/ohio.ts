/**
 * Ohio County Scrapers
 * Counties: Hamilton (Cincinnati), Montgomery (Dayton), Franklin (Columbus),
 *           Cuyahoga (Cleveland), Summit (Akron)
 *
 * Sources (all real county/city portals — no federal APIs):
 * - Pre-Foreclosure: Hamilton County Clerk of Courts (courtclerk.org)
 * - Sheriff Sales:   Hamilton County RealAuction (hamilton.sheriffsaleauction.ohio.gov)
 *                    + county-specific portals for other counties
 * - Tax Delinquent:  Hamilton County Auditor (hamiltoncountyauditor.org)
 * - Probate:         Hamilton County Probate Court (probatect.org)
 * - Bankruptcy:      PACER RSS — Southern District OH (ecf.ohsb.uscourts.gov)
 *                    + Northern District OH (ecf.ohnb.uscourts.gov)
 * - Code Violations: Cincinnati Open Data (data.cincinnati-oh.gov)
 * - Fire Damage:     Cincinnati Fire incident reports
 * - FSBO:            Craigslist Cincinnati
 *
 * NOTE: CourtListener removed — it returns 0 for all Ohio county lead types.
 * NOTE: Montgomery/Franklin/Cuyahoga/Summit removed until their portals are built.
 *       Tina's config should only list Hamilton for OH until those are added.
 */

import { Lead, makeId, formatDate, fetchWithRetry, fetchRendered } from "./base.js";
import { lookupOwnerProperties } from "./assessor.js";

// ─── Pre-Foreclosure via Hamilton County Clerk of Courts ──────────────────────
async function scrapePreForeclosure(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Hamilton County Clerk of Courts — foreclosure case search
    // URL format confirmed working via ScraperAPI
    const url = `https://www.courtclerk.org/records-search/case-search/?caseType=F&fromDate=${fromDate}&toDate=${toDate}`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
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

      if (!caseNumber || caseNumber.toLowerCase().includes("case")) continue;

      const parts = caseStyle.split(/\s+v\.?\s+/i);
      const ownerName = parts.length > 1 ? parts[1].trim() : caseStyle;

      leads.push({
        id: makeId(caseNumber, "Hamilton", "OH"),
        county: "Hamilton", state: "OH",
        lead_type: "Pre-Foreclosure",
        owner_name: ownerName,
        address: null, city: "Cincinnati", zip: null,
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
  } catch (e) {
    console.error("[Hamilton OH] Pre-Foreclosure error:", e);
  }
  return leads;
}

// ─── Sheriff Sales via Hamilton County RealAuction ───────────────────────────
async function scrapeSheriffSales(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Hamilton County uses RealAuction for online sheriff sales
    // This is a JS-rendered page — use fetchRendered
    const url = "https://hamilton.sheriffsaleauction.ohio.gov/index.cfm?zaction=AUCTION&zmethod=preview";
    const res = await fetchRendered(url);
    if (!res.ok) return leads;
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
      if (!caseNumber || caseNumber.toLowerCase().includes("case")) continue;

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
  } catch (e) {
    console.error("[Hamilton OH] Sheriff Sales error:", e);
  }
  return leads;
}

// ─── Tax Delinquent via Hamilton County Auditor ───────────────────────────────
async function scrapeTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Hamilton County Auditor real estate search — delinquent filter
    // hamiltoncountyauditor.org returns 200 directly
    const url = "https://www.hamiltoncountyauditor.org/realsearch.asp";
    const body = new URLSearchParams({
      searchType: "delinquent",
      year: new Date().getFullYear().toString(),
    }).toString();
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return leads;
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
  } catch (e) {
    console.error("[Hamilton OH] Tax Delinquent error:", e);
  }
  return leads;
}

// ─── Probate via Hamilton County Probate Court ────────────────────────────────
async function scrapeProbate(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Hamilton County Probate Court — probatect.org
    // Try the case search with estate type
    const url = `https://www.probatect.org/case-search?fromDate=${fromDate}&caseType=estate`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    const html = await res.text();

    const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const rows = html.match(rowRe) || [];

    // Collect all rows first
    type OHProbateRow = { ownerName: string; caseNum: string; cells: string[] };
    const ohCases: OHProbateRow[] = [];
    for (const row of rows) {
      const cells: string[] = [];
      let m;
      while ((m = cellRe.exec(row)) !== null) {
        cells.push(m[1].replace(/<[^>]+>/g, "").trim());
      }
      cellRe.lastIndex = 0;
      if (cells.length < 2 || !cells[1]) continue;
      ohCases.push({ ownerName: cells[1], caseNum: cells[0], cells });
    }
    // Parallel assessor lookups — 5 concurrent
    const CONCURRENCY = 5;
    for (let i = 0; i < ohCases.length; i += CONCURRENCY) {
      const batch = ohCases.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(c => lookupOwnerProperties(c.ownerName, "Hamilton", "OH"))
      );
      for (let j = 0; j < batch.length; j++) {
        const { ownerName, caseNum, cells } = batch[j];
        const properties = results[j];
        if (properties.length === 0) continue;
        for (const prop of properties) {
          leads.push({
            id: makeId(`${caseNum}-${prop.address}`, "Hamilton", "OH", "probate"),
            county: "Hamilton", state: "OH",
            lead_type: "Probate/Estate",
            owner_name: ownerName,
            address: prop.address, city: prop.city || "Cincinnati", zip: prop.zip || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: caseNum || null,
            filing_date: formatDate(cells[2]),
            assessed_value: null, tax_year: null,
            lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: "Probate estate filing — potential property sale",
            source_url: url,
            raw_data: JSON.stringify({ cells, parcelId: prop.parcelId }),
          });
        }
      }
    }
  } catch (e) {
    console.error("[Hamilton OH] Probate error:", e);
  }
  return leads;
}

// ─── Code Violations via Cincinnati Open Data ─────────────────────────────
async function scrapeCodeViolationsHamilton(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Cincinnati Open Data Portal — code enforcement violations
    // Public JSON API, no auth required
    const url = `https://data.cincinnati-oh.gov/resource/dxyd-3h4p.json?$where=date_initiated>='${fromDate}'&$limit=200&$order=date_initiated DESC`;
    const res = await fetchWithRetry(url, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return leads;
    const data = await res.json() as Record<string, string>[];

    for (const item of data) {
      const address = item.address || item.incident_address || "";
      const type = item.violation_type || item.type || item.category || "Code Violation";
      const date = item.date_initiated || item.date_created || fromDate;
      const caseNum = item.case_number || item.id || item.incident_number || "";

      if (!address && !caseNum) continue;

      leads.push({
        id: makeId("CV", caseNum || address, "Hamilton", "OH"),
        county: "Hamilton", state: "OH",
        lead_type: "Code Violation",
        owner_name: item.owner_name || item.property_owner || null,
        address: address || null, city: "Cincinnati", zip: item.zip || null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum || null,
        filing_date: formatDate(date),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: `Code Violation — ${type} — ${address}`,
        source_url: "https://data.cincinnati-oh.gov/Neighborhoods/Cincinnati-Code-Enforcement/dxyd-3h4p",
        raw_data: JSON.stringify(item),
      });
    }
  } catch (e) {
    console.error("[Hamilton OH] Code Violations error:", e);
  }
  return leads;
}

// ─── Fire Damage via Cincinnati Fire incident reports ─────────────────────────
async function scrapeFireDamage(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Cincinnati Open Data — fire incidents
    const url = `https://data.cincinnati-oh.gov/resource/rvmt-pkmq.json?$where=create_time_incident>='${fromDate}'&$limit=100&$order=create_time_incident DESC`;
    const res = await fetchWithRetry(url, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) {
      // Fallback: Cincinnati Fire Department incident page
      const fallbackUrl = "https://www.cincinnati-oh.gov/fire/incident-reports/";
      const r2 = await fetchWithRetry(fallbackUrl);
      if (!r2.ok) return leads;
      const html = await r2.text();
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
          source_url: fallbackUrl,
          raw_data: JSON.stringify(cells),
        });
      }
      return leads;
    }

    const data = await res.json() as Record<string, string>[];
    for (const item of data) {
      const type = (item.incident_type_desc || item.type_desc || "").toLowerCase();
      if (!type.includes("fire") && !type.includes("structure") && !type.includes("residential")) continue;

      const address = item.address_x || item.incident_address || "";
      const date = item.create_time_incident || item.date || fromDate;

      leads.push({
        id: makeId("FIRE", item.incident_no || address, "Hamilton", "OH"),
        county: "Hamilton", state: "OH",
        lead_type: "Fire Damage",
        owner_name: null,
        address: address || null, city: "Cincinnati", zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: item.incident_no || null,
        filing_date: formatDate(date),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: `Fire Damage — ${item.incident_type_desc || "Structure Fire"} — ${address}`,
        source_url: "https://data.cincinnati-oh.gov/Safety/Cincinnati-Fire-Incidents/rvmt-pkmq",
        raw_data: JSON.stringify(item),
      });
    }
  } catch (e) {
    console.error("[Hamilton OH] Fire Damage error:", e);
  }
  return leads;
}

// ─── BANKRUPTCY — Southern + Northern Districts of OH ────────────────────────
export async function scrapeBankruptcy(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const feeds = [
    "https://ecf.ohsb.uscourts.gov/cgi-bin/rss_outside.pl", // Southern OH (Cincinnati, Columbus, Dayton)
    "https://ecf.ohnb.uscourts.gov/cgi-bin/rss_outside.pl", // Northern OH (Cleveland, Akron)
  ];

  for (const feedUrl of feeds) {
    try {
      const rss = await fetchWithRetry(feedUrl);
      if (!rss.ok) continue;
      const xml = await rss.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      // Parse all items first
      type OHBkItem = { title: string; link: string; pubDate: string; caseNum: string; caseName: string };
      const bkItems: OHBkItem[] = [];
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
      // Parallel assessor lookups — 5 concurrent
      const CONCURRENCY = 5;
      for (let i = 0; i < bkItems.length; i += CONCURRENCY) {
        const batch = bkItems.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(b => lookupOwnerProperties(b.caseName, "Hamilton", "OH"))
        );
        for (let j = 0; j < batch.length; j++) {
          const { title, link, pubDate, caseNum, caseName } = batch[j];
          const properties = results[j];
          if (properties.length === 0) continue;
          for (const prop of properties) {
            leads.push({
              id: makeId("OH", feedUrl.includes("ohsb") ? "S" : "N", "Bankruptcy", `${caseNum}-${prop.address}`),
              county: "Hamilton",
              state: "OH",
              lead_type: "Bankruptcy",
              owner_name: caseName || caseNum,
              address: prop.address, city: prop.city || "Cincinnati", zip: prop.zip || null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: caseNum,
              filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0, 10)) : formatDate(fromDate),
              assessed_value: null, tax_year: null,
              lender: null, loan_amount: null, sale_date: null, sale_amount: null,
              source_url: link || feedUrl,
              description: `OH Bankruptcy — ${caseName || caseNum}`,
              raw_data: JSON.stringify({ title, caseNum, caseName, pubDate, parcelId: prop.parcelId }),
            });
          }
        }
      }
    } catch (e) {
      console.error("[OH] Bankruptcy RSS error:", e);
    }
  }
  return leads;
}

// ─── FSBO — Craigslist Cincinnati ─────────────────────────────────────────────
async function scrapeFSBO(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = "https://cincinnati.craigslist.org/search/reo?format=json";
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
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
  } catch (e) {
    console.error("[Hamilton OH] FSBO error:", e);
  }
  return leads;
}

// ─── Stub exports expected by index.ts ──────────────────────────────────────
// These were removed (dead sources) but index.ts still references them.
// They return empty arrays so the scrape run doesn't crash.
export async function scrapeObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  // OH obituaries via al.com not applicable; placeholder for future obit source
  return [];
}
export async function scrapeCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  // Stub — code violations are handled inside scrapeOhio() via scrapeCodeViolationsHamilton()
  return [];
}
export async function scrapeDivorce(fromDate: string, toDate: string): Promise<Lead[]> {
  // Federal PACER does not contain state divorce cases
  return [];
}
export async function scrapeOutOfStateOwners(fromDate: string, toDate: string): Promise<Lead[]> {
  // Requires county assessor parcel data — not yet available
  return [];
}
export async function scrapeVacantAbandoned(fromDate: string, toDate: string): Promise<Lead[]> {
  // Covered by code violations (Cincinnati blight registry)
  return [];
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function scrapeOhio(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  // Currently only Hamilton (Cincinnati) has working scrapers
  // Montgomery, Franklin, Cuyahoga, Summit need their own portal scrapers
  if (county !== "Hamilton") {
    console.log(`[OH] Skipping ${county} — county portal scraper not yet implemented`);
    return [];
  }

  const results = await Promise.allSettled([
    scrapePreForeclosure(fromDate, toDate),
    scrapeSheriffSales(fromDate, toDate),
    scrapeTaxDelinquent(fromDate, toDate),
    scrapeProbate(fromDate, toDate),
    scrapeFSBO(fromDate, toDate),
    scrapeFireDamage(fromDate, toDate),
    scrapeBankruptcy(fromDate, toDate),
    scrapeCodeViolationsHamilton(fromDate, toDate),
  ]);

  return results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => (r as PromiseFulfilledResult<Lead[]>).value);
}
