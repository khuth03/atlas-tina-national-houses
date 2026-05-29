/**
 * Missouri County Scrapers
 * Counties: Jackson, Clay, Platte, Cass
 *
 * Sources (all real county/city portals — no federal APIs):
 * - Pre-Foreclosure: Jackson County Recorder of Deeds (recorder.jacksongov.org)
 * - Sheriff Sales:   County sheriff civil process pages
 * - Tax Delinquent:  County collector/treasurer portals
 * - Probate:         Missouri Case.net (courts.mo.gov) — state court system
 * - Bankruptcy:      PACER RSS — Western District MO (ecf.mowb.uscourts.gov)
 * - Code Violations: Kansas City Open Data (data.kcmo.org)
 * - FSBO:            Craigslist Kansas City
 *
 * NOTE: CourtListener removed — returns 0 for all MO county lead types.
 * NOTE: Divorce/Eviction via PACER removed — federal courts don't have state divorce cases.
 * NOTE: Out-of-State Owners via CourtListener removed — not a valid source.
 */

import * as cheerio from "cheerio";
import { Lead, makeId, formatDate, fetchWithRetry, CountyConfig } from "./base.js";
import { lookupOwnerProperties } from "./assessor.js";

const STATE = "MO";

// ─── JACKSON COUNTY Pre-Foreclosure via Recorder of Deeds ────────────────────
async function scrapeJacksonPreForeclosure(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Jackson";
  try {
    // Jackson County Recorder of Deeds — Lis Pendens search
    const url = `https://recorder.jacksongov.org/search/commonsearch.aspx?mode=advanced`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);
    const viewstate = $("input[name='__VIEWSTATE']").val() as string;
    const eventvalidation = $("input[name='__EVENTVALIDATION']").val() as string;

    if (!viewstate) return leads; // page didn't load properly

    const searchRes = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        "__VIEWSTATE": viewstate || "",
        "__EVENTVALIDATION": eventvalidation || "",
        "DocType": "LIS PENDENS",
        "DateFrom": fromDate,
        "DateTo": toDate,
        "btnSearch": "Search",
      }).toString(),
    });

    if (searchRes.ok) {
      const searchHtml = await searchRes.text();
      const $s = cheerio.load(searchHtml);

      $s("table.searchResults tr, #searchResults tr, table tr").each((_, row) => {
        const cells = $s(row).find("td");
        if (cells.length < 3) return;

        const docNum = $s(cells[0]).text().trim();
        const grantor = $s(cells[1]).text().trim();
        const grantee = $s(cells[2]).text().trim();
        const recDate = $s(cells[3])?.text().trim() || "";
        const address = $s(cells[4])?.text().trim() || "";

        if (!docNum || docNum === "Doc #" || docNum === "Document") return;

        leads.push({
          id: makeId(COUNTY, STATE, "Pre-Foreclosure", docNum),
          county: COUNTY, state: STATE,
          lead_type: "Pre-Foreclosure",
          owner_name: grantor || null,
          address: address || null, city: "Kansas City", zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: docNum,
          filing_date: formatDate(recDate),
          assessed_value: null, tax_year: null,
          lender: grantee || null, loan_amount: null,
          sale_date: null, sale_amount: null,
          description: `Lis Pendens recorded — ${grantor} / ${grantee}`,
          source_url: url,
          raw_data: JSON.stringify({ docNum, grantor, grantee, recDate }),
        });
      });
    }
  } catch (e) {
    console.error(`[Jackson MO] Pre-Foreclosure error:`, e);
  }
  return leads;
}

// ─── JACKSON COUNTY Tax Delinquent ───────────────────────────────────────────
async function scrapeJacksonTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Jackson";
  try {
    const url = `https://www.jacksongov.org/172/Delinquent-Tax-List`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Look for downloadable delinquent list links
    $("a[href*='delinquent'], a[href*='tax-sale'], a[href*='.pdf'], a[href*='.csv']").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href) return;

      leads.push({
        id: makeId(COUNTY, STATE, "Tax Delinquent", href),
        county: COUNTY, state: STATE,
        lead_type: "Tax Delinquent",
        owner_name: null, address: null, city: "Kansas City", zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null,
        filing_date: formatDate(fromDate),
        assessed_value: null, tax_year: new Date().getFullYear().toString(),
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        description: `Jackson County Tax Delinquent List — ${text}`,
        source_url: href.startsWith("http") ? href : `https://www.jacksongov.org${href}`,
        raw_data: JSON.stringify({ text, href }),
      });
    });

    // Also parse any table on the page
    $("table tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;
      const parcel = $(cells[0]).text().trim();
      const owner = $(cells[1]).text().trim();
      const address = $(cells[2]).text().trim();
      const amount = $(cells[3])?.text().trim();

      if (!parcel || parcel === "Parcel" || parcel === "Parcel ID") return;

      leads.push({
        id: makeId(COUNTY, STATE, "Tax Delinquent", parcel),
        county: COUNTY, state: STATE,
        lead_type: "Tax Delinquent",
        owner_name: owner || null,
        address: address || null, city: "Kansas City", zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: parcel,
        filing_date: formatDate(fromDate),
        assessed_value: null, tax_year: new Date().getFullYear().toString(),
        lender: null, loan_amount: null, sale_date: null, sale_amount: amount || null,
        description: `Tax Delinquent — Parcel ${parcel}`,
        source_url: url,
        raw_data: JSON.stringify({ parcel, owner, address, amount }),
      });
    });
  } catch (e) {
    console.error(`[Jackson MO] Tax Delinquent error:`, e);
  }
  return leads;
}

// ─── JACKSON COUNTY Sheriff Sales ────────────────────────────────────────────
async function scrapeJacksonSheriffSales(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Jackson";
  try {
    const url = `https://www.jacksongov.org/sheriff/civil-sales`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    $("table tr, .sale-listing, article").each((_, el) => {
      const cells = $(el).find("td");
      if (cells.length >= 3) {
        const caseNum = $(cells[0]).text().trim();
        const address = $(cells[1]).text().trim();
        const saleDate = $(cells[2]).text().trim();
        const amount = $(cells[3])?.text().trim();

        if (!caseNum || caseNum === "Case #") return;

        leads.push({
          id: makeId(COUNTY, STATE, "Sheriff Sale", caseNum),
          county: COUNTY, state: STATE,
          lead_type: "Sheriff Sale",
          owner_name: null,
          address: address || null, city: "Kansas City", zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: caseNum,
          filing_date: formatDate(fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null,
          sale_date: formatDate(saleDate), sale_amount: amount || null,
          description: `Sheriff Sale — Case ${caseNum}`,
          source_url: url,
          raw_data: JSON.stringify({ caseNum, address, saleDate, amount }),
        });
      }
    });
  } catch (e) {
    console.error(`[Jackson MO] Sheriff Sales error:`, e);
  }
  return leads;
}

// ─── JACKSON COUNTY Probate via Missouri Case.net ────────────────────────────
async function scrapeJacksonProbate(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Jackson";
  try {
    // Missouri Case.net — public court search
    // Jackson County = county code 16
    const url = `https://www.courts.mo.gov/casenet/cases/searchCases.do`;
    const body = new URLSearchParams({
      countyCode: "16", // Jackson County
      caseType: "P",    // Probate
      fromDate: fromDate,
      toDate: toDate,
      submit: "Search",
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

    // Collect all cases first, then batch-lookup assessor in parallel
    type CaseRow = { caseNum: string; caseName: string; filedDate: string };
    const cases: CaseRow[] = [];
    for (const row of rows) {
      const cells: string[] = [];
      let m;
      while ((m = cellRe.exec(row)) !== null) {
        cells.push(m[1].replace(/<[^>]+>/g, "").trim());
      }
      cellRe.lastIndex = 0;
      if (cells.length < 2 || !cells[0]) continue;
      const caseNum = cells[0];
      const caseName = cells[1];
      const filedDate = cells[2] || fromDate;
      if (!caseNum || caseNum.toLowerCase().includes("case")) continue;
      cases.push({ caseNum, caseName, filedDate });
    }
    // Parallel assessor lookups — 5 concurrent
    const CONCURRENCY = 5;
    for (let i = 0; i < cases.length; i += CONCURRENCY) {
      const batch = cases.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(c => lookupOwnerProperties(c.caseName, COUNTY, STATE))
      );
      for (let j = 0; j < batch.length; j++) {
        const { caseNum, caseName, filedDate } = batch[j];
        const properties = results[j];
        if (properties.length === 0) continue;
        for (const prop of properties) {
          leads.push({
            id: makeId(COUNTY, STATE, "Probate", `${caseNum}-${prop.address}`),
            county: COUNTY, state: STATE,
            lead_type: "Probate/Estate",
            owner_name: caseName || null,
            address: prop.address, city: prop.city || "Kansas City", zip: prop.zip || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: caseNum,
            filing_date: formatDate(filedDate),
            assessed_value: null, tax_year: null,
            lender: null, loan_amount: null, sale_date: null, sale_amount: null,
            description: `Jackson County MO Probate — ${caseName || caseNum}`,
            source_url: url,
            raw_data: JSON.stringify({ caseNum, caseName, filedDate, parcelId: prop.parcelId }),
          });
        }
      }
    }
  } catch (e) {
    console.error(`[Jackson MO] Probate error:`, e);
  }
  return leads;
}

// ─── CLAY COUNTY ─────────────────────────────────────────────────────────────
async function scrapeClayCounty(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Clay";
  try {
    // Clay County Sheriff civil process sales
    const sheriffUrl = `https://www.claycountymo.gov/sheriff/civil-process`;
    const res = await fetchWithRetry(sheriffUrl);
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      $("table tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const caseNum = $(cells[0]).text().trim();
        const address = $(cells[1]).text().trim();
        const saleDate = $(cells[2])?.text().trim();

        if (!caseNum || caseNum === "Case") return;

        leads.push({
          id: makeId(COUNTY, STATE, "Sheriff Sale", caseNum),
          county: COUNTY, state: STATE,
          lead_type: "Sheriff Sale",
          owner_name: null,
          address: address || null, city: "Liberty", zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: caseNum,
          filing_date: formatDate(fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null,
          sale_date: formatDate(saleDate), sale_amount: null,
          description: `Clay County Sheriff Sale — ${caseNum}`,
          source_url: sheriffUrl,
          raw_data: JSON.stringify({ caseNum, address, saleDate }),
        });
      });
    }

    // Clay County Collector tax delinquent
    const taxUrl = `https://www.claycountymo.gov/collector/delinquent-taxes`;
    const taxRes = await fetchWithRetry(taxUrl);
    if (taxRes.ok) {
      const html = await taxRes.text();
      const $ = cheerio.load(html);

      $("a[href*='.pdf'], a[href*='delinquent']").each((_, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().trim();
        if (!href) return;
        leads.push({
          id: makeId(COUNTY, STATE, "Tax Delinquent", href),
          county: COUNTY, state: STATE,
          lead_type: "Tax Delinquent",
          owner_name: null, address: null, city: null, zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: null,
          filing_date: formatDate(fromDate),
          assessed_value: null, tax_year: new Date().getFullYear().toString(),
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Clay County Tax Delinquent — ${text}`,
          source_url: href.startsWith("http") ? href : `https://www.claycountymo.gov${href}`,
          raw_data: JSON.stringify({ text }),
        });
      });
    }
  } catch (e) {
    console.error(`[Clay MO] error:`, e);
  }
  return leads;
}

// ─── PLATTE COUNTY ───────────────────────────────────────────────────────────
async function scrapePlatteCounty(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Platte";
  try {
    const url = `https://www.plattecountymo.gov/departments/sheriff/civil-process-sales`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    $("table tr, .sale-item").each((_, el) => {
      const cells = $(el).find("td");
      if (cells.length < 2) return;
      const caseNum = $(cells[0]).text().trim();
      const address = $(cells[1]).text().trim();
      const saleDate = $(cells[2])?.text().trim();

      if (!caseNum || caseNum === "Case") return;

      leads.push({
        id: makeId(COUNTY, STATE, "Sheriff Sale", caseNum),
        county: COUNTY, state: STATE,
        lead_type: "Sheriff Sale",
        owner_name: null,
        address: address || null, city: "Platte City", zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum,
        filing_date: formatDate(fromDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: formatDate(saleDate), sale_amount: null,
        description: `Platte County Sheriff Sale — ${caseNum}`,
        source_url: url,
        raw_data: JSON.stringify({ caseNum, address, saleDate }),
      });
    });
  } catch (e) {
    console.error(`[Platte MO] error:`, e);
  }
  return leads;
}

// ─── CASS COUNTY ─────────────────────────────────────────────────────────────
async function scrapeCassCounty(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Cass";
  try {
    const url = `https://www.casscounty.com/sheriff/civil-process`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    $("table tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const caseNum = $(cells[0]).text().trim();
      const address = $(cells[1]).text().trim();
      const saleDate = $(cells[2])?.text().trim();

      if (!caseNum || caseNum === "Case") return;

      leads.push({
        id: makeId(COUNTY, STATE, "Sheriff Sale", caseNum),
        county: COUNTY, state: STATE,
        lead_type: "Sheriff Sale",
        owner_name: null,
        address: address || null, city: "Harrisonville", zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum,
        filing_date: formatDate(fromDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: formatDate(saleDate), sale_amount: null,
        description: `Cass County Sheriff Sale — ${caseNum}`,
        source_url: url,
        raw_data: JSON.stringify({ caseNum, address, saleDate }),
      });
    });
  } catch (e) {
    console.error(`[Cass MO] error:`, e);
  }
  return leads;
}

// ─── KC Code Violations via Kansas City Open Data ────────────────────────────
async function scrapeKCCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Kansas City Open Data — 311 service requests (code violations)
    const url = `https://data.kcmo.org/resource/7at3-sxhp.json?$where=creation_date>='${fromDate}'&case_type=Code%20Violation&$limit=200&$order=creation_date DESC`;
    const res = await fetchWithRetry(url, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return leads;

    const data = await res.json() as Record<string, string>[];
    for (const item of data) {
      const address = item.address || item.incident_address || "";
      const type = item.case_type || item.violation_type || "Code Violation";
      const date = item.creation_date || fromDate;
      const caseNum = item.case_id || item.service_request_num || "";

      if (!address && !caseNum) continue;

      // Determine county from address
      let county = "Jackson";
      const addrLower = address.toLowerCase();
      if (addrLower.includes("liberty") || addrLower.includes("kearney")) county = "Clay";
      else if (addrLower.includes("parkville") || addrLower.includes("platte city")) county = "Platte";

      leads.push({
        id: makeId("CV", caseNum || address, "MO", "kcmo"),
        county, state: STATE,
        lead_type: "Code Violation",
        owner_name: null,
        address: address || null, city: "Kansas City", zip: item.zipcode || null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum || null,
        filing_date: formatDate(date),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        description: `Code Violation — ${type} — ${address}`,
        source_url: "https://data.kcmo.org/Housing/311-Call-Center-Service-Requests/7at3-sxhp",
        raw_data: JSON.stringify(item),
      });
    }
  } catch (e) {
    console.error("[MO] KC Code Violations error:", e);
  }
  return leads;
}

// ─── KC Craigslist FSBO ───────────────────────────────────────────────────────
async function scrapeKCCraigslistFSBO(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://kansascity.craigslist.org/search/rea?query=for+sale+by+owner&srchType=A`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    $("li.result-row, .cl-search-result").each((_, el) => {
      const title = $(el).find(".result-title, .title-anchor, a.posting-title").text().trim();
      const price = $(el).find(".result-price, .priceinfo").text().trim();
      const date = $(el).find("time").attr("datetime");
      const link = $(el).find("a.result-title, a.posting-title").attr("href");
      const location = $(el).find(".result-hood, .supertitle").text().trim().replace(/[()]/g, "");

      if (!title) return;

      const locLower = location.toLowerCase();
      let county = "Jackson";
      if (locLower.includes("liberty") || locLower.includes("kearney") || locLower.includes("clay")) county = "Clay";
      else if (locLower.includes("platte") || locLower.includes("parkville")) county = "Platte";
      else if (locLower.includes("cass") || locLower.includes("harrisonville") || locLower.includes("belton")) county = "Cass";

      leads.push({
        id: makeId(county, STATE, "FSBO", link || title),
        county, state: STATE,
        lead_type: "FSBO",
        owner_name: null,
        address: location || null, city: location || null, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null,
        filing_date: formatDate(date || fromDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: price || null,
        description: title,
        source_url: link?.startsWith("http") ? link : `https://kansascity.craigslist.org${link}`,
        raw_data: JSON.stringify({ title, price, location }),
      });
    });
  } catch (e) {
    console.error(`[MO] Craigslist FSBO error:`, e);
  }
  return leads;
}

// ─── BANKRUPTCY — Western District of MO (PACER RSS) ─────────────────────────
export async function scrapeBankruptcy(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rss = await fetchWithRetry("https://ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl");
    if (!rss.ok) return leads;
    const xml = await rss.text();
    const COUNTY = "Jackson"; // Western MO district covers KC/Jackson area
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    // Parse all items first
    type BkItem = { title: string; link: string; pubDate: string; caseNum: string; caseName: string };
    const bkItems: BkItem[] = [];
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
        batch.map(b => lookupOwnerProperties(b.caseName, COUNTY, STATE))
      );
      for (let j = 0; j < batch.length; j++) {
        const { title, link, pubDate, caseNum, caseName } = batch[j];
        const properties = results[j];
        if (properties.length === 0) continue;
        for (const prop of properties) {
          leads.push({
            id: makeId("MO", STATE, "Bankruptcy", `${caseNum}-${prop.address}`),
            county: COUNTY,
            state: STATE,
            lead_type: "Bankruptcy",
            owner_name: caseName || caseNum,
            address: prop.address, city: prop.city || "", zip: prop.zip || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: caseNum,
            filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0, 10)) : formatDate(fromDate),
            assessed_value: null, tax_year: null,
            lender: null, loan_amount: null, sale_date: null, sale_amount: null,
            source_url: link || "https://ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl",
            description: `MO Bankruptcy — ${caseName || caseNum}`,
            raw_data: JSON.stringify({ title, caseNum, caseName, pubDate, parcelId: prop.parcelId }),
          });
        }
      }
    }
  } catch (e) {
    console.error("[MO] Bankruptcy RSS error:", e);
  }
  return leads;
}

// ─── PROBATE — Missouri Case.net statewide (exported for scraper index) ───────
export async function scrapeProbate(fromDate: string, toDate: string): Promise<Lead[]> {
  // Delegated to per-county function above
  return scrapeJacksonProbate(fromDate, toDate);
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export async function scrapeAll(fromDate: string, toDate: string): Promise<Lead[]> {
  const results = await Promise.allSettled([
    scrapeJacksonPreForeclosure(fromDate, toDate),
    scrapeJacksonTaxDelinquent(fromDate, toDate),
    scrapeJacksonSheriffSales(fromDate, toDate),
    scrapeJacksonProbate(fromDate, toDate),
    scrapeClayCounty(fromDate, toDate),
    scrapePlatteCounty(fromDate, toDate),
    scrapeCassCounty(fromDate, toDate),
    scrapeKCCraigslistFSBO(fromDate, toDate),
    scrapeKCCodeViolations(fromDate, toDate),
    scrapeBankruptcy(fromDate, toDate),
  ]);

  return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}
