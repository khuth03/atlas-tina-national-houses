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
import { lookupOwnerProperties, lookupByAddress } from "./assessor.js";

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
// CONFIRMED WORKING: wedge1.hcauditor.org/search/re/delinquent/{year}/1
// Returns HTML table with parcel, owner, address, city, zip, delinquent amount
async function scrapeTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const year = new Date().getFullYear();
    // CONFIRMED WORKING: wedge1.hcauditor.org delinquent search
    const url = `https://wedge1.hcauditor.org/search/re/delinquent/${year}/1`;
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) {
      // Fallback: try previous year
      const url2 = `https://wedge1.hcauditor.org/search/re/delinquent/${year - 1}/1`;
      const res2 = await fetchWithRetry(url2, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (!res2.ok) return leads;
      const html2 = await res2.text();
      return parseHamiltonDelinquentTable(html2, url2);
    }
    const html = await res.text();
    return parseHamiltonDelinquentTable(html, url);
  } catch (e) {
    console.error("[Hamilton OH] Tax Delinquent error:", e);
  }
  return leads;
}

function parseHamiltonDelinquentTable(html: string, sourceUrl: string): Lead[] {
  const leads: Lead[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    const cellRe2 = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRe2.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length < 2 || !cells[0]) continue;
    // Extract parcel ID from link if present
    const parcelMatch = rowMatch[1].match(/\/view\/re\/(\d+)\//i);
    const parcelId = parcelMatch?.[1];
    const owner = cells[1] || cells[0];
    const address = cells[2] || '';
    const city = cells[3] || 'Cincinnati';
    const zip = cells[4] || undefined;
    const delinqAmt = cells[5] || cells[4] || '';
    if (!owner || /owner|name|parcel/i.test(owner)) continue;
    leads.push({
      id: makeId(parcelId || owner, "Hamilton", "OH", "tax"),
      county: "Hamilton", state: "OH",
      lead_type: "Tax Delinquent",
      owner_name: owner,
      address: address || null, city: city, zip: zip || null,
      mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
      case_number: parcelId || null,
      filing_date: new Date().toISOString().split("T")[0],
      assessed_value: null, tax_year: new Date().getFullYear().toString(),
      lender: null, loan_amount: null,
      sale_date: null, sale_amount: delinqAmt || null,
      description: `Tax Delinquent — Hamilton County OH${delinqAmt ? ` — $${delinqAmt}` : ''}`,
      source_url: sourceUrl,
      raw_data: JSON.stringify(cells),
    });
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
    // CONFIRMED WORKING: cncm-znd6 = Cincinnati Code Enforcement dataset
    const url = `https://data.cincinnati-oh.gov/resource/cncm-znd6.json?$where=entered_date>='${fromDate}'&$limit=500&$order=entered_date DESC`;
    const res = await fetchWithRetry(url, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return leads;
    const data = await res.json() as Record<string, string>[];

    for (const item of data) {
      const address = item.full_address || item.address || "";
      const type = item.comp_type_desc || item.sub_type_desc || item.violation_type || "Code Violation";
      const date = item.entered_date || item.date_initiated || fromDate;
      const caseNum = item.number_key || item.case_number || item.id || "";

      if (!address && !caseNum) continue;
      const enriched = address ? await lookupByAddress(address, "Hamilton", "OH") : null;

      leads.push({
        id: makeId("CV", caseNum || address, "Hamilton", "OH"),
        county: "Hamilton", state: "OH",
        lead_type: "Code Violation",
        owner_name: enriched?.ownerName || item.owner_name || item.property_owner || null,
        address: enriched?.address || address || null, city: enriched?.city || "Cincinnati", zip: enriched?.zip || item.zip || null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum || null,
        filing_date: formatDate(date),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: `Code Violation — ${type} — ${address}`,
        source_url: "https://data.cincinnati-oh.gov/Neighborhoods/Cincinnati-Code-Enforcement/cncm-znd6",
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
    // CONFIRMED WORKING: vnsz-a3wp = Cincinnati Fire Incidents (CAD)
    // Fields: create_time_incident, address_x, incident_type_desc, cfd_incident_type_group, event_number
    const url = `https://data.cincinnati-oh.gov/resource/vnsz-a3wp.json?$where=create_time_incident>='${fromDate}' AND cfd_incident_type_group='STRUCTURE FIRE'&$limit=500&$order=create_time_incident DESC`;
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
      // Enrich with owner name via address lookup
      const enriched = address ? await lookupByAddress(address, "Hamilton", "OH") : null;

      leads.push({
        id: makeId("FIRE", item.event_number || item.incident_no || address, "Hamilton", "OH"),
        county: "Hamilton", state: "OH",
        lead_type: "Fire Damage",
        owner_name: enriched?.ownerName || null,
        address: enriched?.address || address || null, city: enriched?.city || "Cincinnati", zip: enriched?.zip || null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: item.event_number || item.incident_no || null,
        filing_date: formatDate(date),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: `Fire Damage — ${item.incident_type_desc || "Structure Fire"} — ${address}`,
        source_url: "https://data.cincinnati-oh.gov/Public-Safety/Cincinnati-Fire-Incidents-CAD/vnsz-a3wp",
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

// ─── OBITUARIES — Legacy.com Cincinnati ─────────────────────────────────────
// Enrichment: lookupOwnerProperties by decedent name → only keep leads with a found property
export async function scrapeObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rssUrls = [
      "https://www.legacy.com/obituaries/cincinnati/rss.aspx",
      "https://www.legacy.com/obituaries/enquirer/rss.aspx",
    ];
    for (const rssUrl of rssUrls) {
      try {
        const res = await fetchWithRetry(rssUrl);
        if (!res.ok) continue;
        const xml = await res.text();
        const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
        for (const item of items) {
          const title = (item.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/) || item.match(/<title>(.+?)<\/title>/))?.[1]?.trim() || "";
          const link  = (item.match(/<link>(.+?)<\/link>/))?.[1]?.trim() || "";
          const pubDate = (item.match(/<pubDate>(.+?)<\/pubDate>/))?.[1]?.trim() || "";
          if (!title) continue;
          if (pubDate) {
            const d = new Date(pubDate);
            if (!isNaN(d.getTime())) {
              const ds = d.toISOString().slice(0, 10);
              if (ds < fromDate || ds > toDate) continue;
            }
          }
          leads.push({
            id: makeId("Hamilton", "OH", "Obituary", link || title),
            county: "Hamilton", state: "OH",
            lead_type: "Obituary",
            owner_name: title || null,
            address: null, city: "Cincinnati", zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: null,
            filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0, 10)) : formatDate(fromDate),
            assessed_value: null, tax_year: null,
            lender: null, loan_amount: null, sale_date: null, sale_amount: null,
            description: `Obituary — ${title}`,
            source_url: link || rssUrl,
            raw_data: JSON.stringify({ title, pubDate }),
          });
        }
      } catch { /* try next URL */ }
    }
    // Enrich: only keep obituaries where decedent owns property in Hamilton OH
    const enriched: Lead[] = [];
    const CONCURRENCY_O = 5;
    for (let i = 0; i < leads.length; i += CONCURRENCY_O) {
      const batch = leads.slice(i, i + CONCURRENCY_O);
      const results = await Promise.all(batch.map(l => lookupOwnerProperties(l.owner_name || "", "Hamilton", "OH")));
      for (let j = 0; j < batch.length; j++) {
        const properties = results[j];
        if (properties.length === 0) continue;
        const lead = batch[j];
        for (const prop of properties) {
          enriched.push({
            ...lead,
            id: makeId("Hamilton", "OH", "Obituary", `${lead.owner_name || ""}-${prop.address}`),
            address: prop.address, city: prop.city || "Cincinnati", zip: prop.zip || null,
            owner_name: prop.ownerName || lead.owner_name,
            raw_data: JSON.stringify({ ...JSON.parse(lead.raw_data || "{}"), parcelId: prop.parcelId }),
          });
        }
      }
    }
    return enriched;
  } catch (e) {
    console.error("[Hamilton OH] Obituaries error:", e);
  }
  return [];
}
// ─── CODE VIOLATIONS — stub (handled inside scrapeOhio) ──────────────────────
export async function scrapeCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  return []; // handled inside scrapeOhio() via scrapeCodeViolationsHamilton()
}
// ─── DIVORCE — Hamilton County Clerk of Courts (case type DR) ────────────────
// Enrichment: lookupOwnerProperties by case name → only keep leads with a found property
export async function scrapeDivorce(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const searchUrl = "https://www.courtclerk.org/records-search/case-search/";
    const res = await fetchWithRetry(searchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ caseType: "DR", fromFiledDate: fromDate, toFiledDate: toDate, submit: "Search" }).toString(),
    });
    if (res.ok) {
      const html = await res.text();
      const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const rows = html.match(rowRe) || [];
      type DivorceRow = { caseNum: string; caseName: string; filedDate: string };
      const cases: DivorceRow[] = [];
      for (const row of rows) {
        const cells: string[] = [];
        let m;
        while ((m = cellRe.exec(row)) !== null) cells.push(m[1].replace(/<[^>]+>/g, "").trim());
        cellRe.lastIndex = 0;
        if (cells.length < 2 || !cells[0] || cells[0].toLowerCase().includes("case")) continue;
        cases.push({ caseNum: cells[0], caseName: cells[1], filedDate: cells[2] || fromDate });
      }
      const CONCURRENCY = 5;
      for (let i = 0; i < cases.length; i += CONCURRENCY) {
        const batch = cases.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(c => lookupOwnerProperties(c.caseName, "Hamilton", "OH")));
        for (let j = 0; j < batch.length; j++) {
          const { caseNum, caseName, filedDate } = batch[j];
          const properties = results[j];
          if (properties.length === 0) continue;
          for (const prop of properties) {
            leads.push({
              id: makeId("Hamilton", "OH", "Divorce", `${caseNum}-${prop.address}`),
              county: "Hamilton", state: "OH",
              lead_type: "Divorce",
              owner_name: prop.ownerName || caseName || null,
              address: prop.address, city: prop.city || "Cincinnati", zip: prop.zip || null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: caseNum,
              filing_date: formatDate(filedDate),
              assessed_value: null, tax_year: null,
              lender: null, loan_amount: null, sale_date: null, sale_amount: null,
              description: `Hamilton County OH Divorce — ${caseName}`,
              source_url: searchUrl,
              raw_data: JSON.stringify({ caseNum, caseName, filedDate, parcelId: prop.parcelId }),
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("[Hamilton OH] Divorce error:", e);
  }
  return leads;
}
// ─── VACANT/ABANDONED — Cincinnati Open Data Vacant Foreclosed Property Registry ─
// Dataset: w3jp-dfxy (Vacant Foreclosed Property Program)
// Fields: number_key, comp_type_desc, sub_type_desc, entered_date, latitude, longitude, neighborhood
// NOTE: No street address field — use Nominatim reverse geocoding from lat/lon
// Enrichment: lookupByAddress → owner name from Hamilton County Auditor
export async function scrapeVacantAbandoned(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://data.cincinnati-oh.gov/resource/w3jp-dfxy.json?$where=entered_date>='${fromDate}T00:00:00'&$limit=300&$order=entered_date DESC`;
    const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json() as Record<string, string>[];
      // Reverse geocode lat/lon to get street address (Nominatim, rate-limited)
      for (const item of data) {
        const lat = item.latitude || "";
        const lon = item.longitude || "";
        let address = "";
        let zip = "";
        if (lat && lon) {
          try {
            const geoRes = await fetchWithRetry(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
              { headers: { "User-Agent": "AtlasLeadSystem/1.0" } }
            );
            if (geoRes.ok) {
              const geo = await geoRes.json() as Record<string, any>;
              const addrObj = geo.address || {};
              const house = addrObj.house_number || "";
              const road = addrObj.road || "";
              address = house && road ? `${house} ${road}` : road;
              zip = addrObj.postcode || "";
            }
          } catch { /* skip geocoding if it fails */ }
          // Nominatim rate limit: 1 req/sec
          await new Promise(r => setTimeout(r, 1100));
        }
        if (!address) address = `[lat:${lat.slice(0,7)}, lon:${lon.slice(0,8)}]`;
        leads.push({
          id: makeId("Hamilton", "OH", "Vacant Abandoned", item.number_key || address),
          county: "Hamilton", state: "OH",
          lead_type: "Vacant/Abandoned",
          owner_name: null,
          address: address || null, city: "Cincinnati", zip: zip || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: item.number_key || null,
          filing_date: formatDate(item.entered_date?.slice(0, 10) || fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Vacant/Abandoned — ${item.comp_type_desc || ""} — ${item.sub_type_desc || ""} — ${item.neighborhood || ""}`,
          source_url: "https://data.cincinnati-oh.gov/resource/w3jp-dfxy",
          raw_data: JSON.stringify(item),
        });
      }
    }
    // Enrich with owner name via assessor address lookup — 5 concurrent
    const CONCURRENCY_V = 5;
    const unenriched = leads.filter(l => !l.owner_name && l.address && !l.address.startsWith("["));
    for (let i = 0; i < unenriched.length; i += CONCURRENCY_V) {
      const batch = unenriched.slice(i, i + CONCURRENCY_V);
      const results = await Promise.all(batch.map(l => lookupByAddress(l.address!, "Hamilton", "OH")));
      for (let j = 0; j < batch.length; j++) {
        const prop = results[j];
        if (prop?.ownerName) batch[j].owner_name = prop.ownerName;
        if (prop?.zip && !batch[j].zip) batch[j].zip = prop.zip;
        if (prop?.parcelId) batch[j].raw_data = JSON.stringify({ ...JSON.parse(batch[j].raw_data || "{}"), parcelId: prop.parcelId });
      }
    }
  } catch (e) {
    console.error("[Hamilton OH] Vacant/Abandoned error:", e);
  }
  return leads;
}
export async function scrapeOutOfStateOwners(fromDate: string, toDate: string): Promise<Lead[]> {
  return []; // out-of-state owners excluded per Atlas config
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
    scrapeObituaries(fromDate, toDate),
    scrapeDivorce(fromDate, toDate),
    scrapeVacantAbandoned(fromDate, toDate),
  ]);

  return results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => (r as PromiseFulfilledResult<Lead[]>).value);
}
