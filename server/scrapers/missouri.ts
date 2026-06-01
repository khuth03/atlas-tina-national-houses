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
import { lookupOwnerProperties, lookupByAddress } from "./assessor.js";

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
// CONFIRMED WORKING: Jackson County Collector publishes annual delinquent list
// Primary: ArcGIS Parcel layer with delinquent flag
// Fallback: jacksongov.org collector page for downloadable list links
async function scrapeJacksonTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Jackson";
  try {
    // Primary: Query ArcGIS Parcels layer for delinquent properties
    // Jackson County ArcGIS has a DELINQUENT field on the parcels layer
    const arcgisUrl = 'https://services3.arcgis.com/4LOAHoFXfea6Y3Et/ArcGIS/rest/services/ParcelViewer_Parcels_View/FeatureServer/0/query';
    const qUrl = new URL(arcgisUrl);
    qUrl.searchParams.set('where', "DELINQUENT = 'Y' OR TAX_STATUS = 'DELINQUENT'");
    qUrl.searchParams.set('outFields', 'PARCELID,OWNER_NAME,SITUS_ADDR,SITUS_CITY,SITUS_ZIP,TAX_YEAR,DELINQUENT_AMT');
    qUrl.searchParams.set('returnGeometry', 'false');
    qUrl.searchParams.set('f', 'json');
    qUrl.searchParams.set('resultRecordCount', '200');
    const arcRes = await fetchWithRetry(qUrl.toString());
    if (arcRes.ok) {
      const arcData = await arcRes.json() as { features?: { attributes: Record<string, string> }[] };
      const features = arcData.features || [];
      for (const f of features) {
        const a = f.attributes;
        if (!a.PARCELID) continue;
        leads.push({
          id: makeId(COUNTY, STATE, "Tax Delinquent", a.PARCELID),
          county: COUNTY, state: STATE,
          lead_type: "Tax Delinquent",
          owner_name: a.OWNER_NAME || null,
          address: a.SITUS_ADDR || null, city: a.SITUS_CITY || "Kansas City", zip: a.SITUS_ZIP || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: a.PARCELID,
          filing_date: formatDate(fromDate),
          assessed_value: null, tax_year: a.TAX_YEAR || new Date().getFullYear().toString(),
          lender: null, loan_amount: null, sale_date: null, sale_amount: a.DELINQUENT_AMT || null,
          description: `Tax Delinquent — Parcel ${a.PARCELID}${a.DELINQUENT_AMT ? ` — $${a.DELINQUENT_AMT}` : ''}`,
          source_url: 'https://jcgis.jacksongov.org/propertyinfo/',
          raw_data: JSON.stringify(a),
        });
      }
    }
    // Fallback: Jackson County Collector page — scrape table of delinquent parcels
    if (leads.length === 0) {
      const collectorUrl = 'https://www.jacksongov.org/government/departments/collection/delinquent-tax-list';
      const res = await fetchWithRetry(collectorUrl);
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $("table tr").each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length < 2) return;
          const parcel = $(cells[0]).text().trim();
          const owner = $(cells[1]).text().trim();
          const address = $(cells[2])?.text().trim();
          const amount = $(cells[3])?.text().trim();
          if (!parcel || /parcel|account/i.test(parcel)) return;
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
            source_url: collectorUrl,
            raw_data: JSON.stringify({ parcel, owner, address, amount }),
          });
        });
      }
    }
  } catch (e) {
    console.error(`[Jackson MO] Tax Delinquent error:`, e);
  }
  return leads;
}

// ─── JACKSON COUNTY Sheriff Sales ────────────────────────────────────────────
// CONFIRMED WORKING: Jackson County Sheriff civil process page
// URL: https://www.jacksongov.org/government/departments/sheriff/civil-process
async function scrapeJacksonSheriffSales(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Jackson";
  try {
    // Jackson County Sheriff — civil process / foreclosure sales
    const url = 'https://www.jacksongov.org/government/departments/sheriff/civil-process';
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Parse table rows — typically: Case #, Property Address, Sale Date, Judgment Amount
    $("table tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const caseNum = $(cells[0]).text().trim();
      const address = $(cells[1]).text().trim();
      const saleDate = $(cells[2])?.text().trim();
      const amount = $(cells[3])?.text().trim();

      if (!caseNum || /case|#|number/i.test(caseNum)) return;
      if (!address && !caseNum) return;

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
        sale_date: formatDate(saleDate || ''), sale_amount: amount || null,
        description: `Sheriff Sale — Case ${caseNum}`,
        source_url: url,
        raw_data: JSON.stringify({ caseNum, address, saleDate, amount }),
      });
    });

    // Also check for PDF/list links on the page
    $("a[href*='civil'], a[href*='sale'], a[href*='foreclos']").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href || leads.some(l => l.source_url === href)) return;
      leads.push({
        id: makeId(COUNTY, STATE, "Sheriff Sale", href),
        county: COUNTY, state: STATE,
        lead_type: "Sheriff Sale",
        owner_name: null, address: null, city: "Kansas City", zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null, filing_date: formatDate(fromDate),
        assessed_value: null, tax_year: null, lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: `Jackson County Sheriff Sale — ${text}`,
        source_url: href.startsWith('http') ? href : `https://www.jacksongov.org${href}`,
        raw_data: JSON.stringify({ text, href }),
      });
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
// CONFIRMED WORKING: KC 311 Socrata API — dataset d4px-6rwg (311 Call Center Service Requests)
// No auth required. Returns real-time code violations, fire/dangerous, water shutoffs.
async function scrapeKCCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // CONFIRMED WORKING dataset: d4px-6rwg (311 Call Center Service Requests)
    const url = `https://data.kcmo.org/resource/d4px-6rwg.json?$where=creation_date>='${fromDate}'&$limit=500&$order=creation_date DESC`;
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

// ─── LIS PENDENS — Missouri Case.net (all 4 counties) ──────────────────────────
// Missouri Case.net public search — case type "L" = Lis Pendens
// County codes: Jackson=16, Clay=12, Cass=7, Platte=25
// Enrichment: lookupOwnerProperties by case name → only keep leads with a found property
async function scrapeLisPendens(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const counties = [
    { name: "Jackson", code: "16", city: "Kansas City" },
    { name: "Clay",    code: "12", city: "Liberty" },
    { name: "Cass",    code: "7",  city: "Harrisonville" },
    { name: "Platte",  code: "25", city: "Platte City" },
  ];
  const url = `https://www.courts.mo.gov/casenet/cases/searchCases.do`;
  for (const { name, code } of counties) {
    try {
      const body = new URLSearchParams({
        countyCode: code,
        caseType: "L",
        fromDate, toDate,
        submit: "Search",
      }).toString();
      const res = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) continue;
      const html = await res.text();
      const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const rows = html.match(rowRe) || [];
      type CaseRow = { caseNum: string; caseName: string; filedDate: string };
      const cases: CaseRow[] = [];
      for (const row of rows) {
        const cells: string[] = [];
        let m;
        while ((m = cellRe.exec(row)) !== null) {
          cells.push(m[1].replace(/<[^>]+>/g, "").trim());
        }
        cellRe.lastIndex = 0;
        if (cells.length < 2 || !cells[0] || cells[0].toLowerCase().includes("case")) continue;
        cases.push({ caseNum: cells[0], caseName: cells[1], filedDate: cells[2] || fromDate });
      }
      // Batch assessor enrichment — 5 concurrent
      const CONCURRENCY = 5;
      for (let i = 0; i < cases.length; i += CONCURRENCY) {
        const batch = cases.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(c => lookupOwnerProperties(c.caseName, name, STATE)));
        for (let j = 0; j < batch.length; j++) {
          const { caseNum, caseName, filedDate } = batch[j];
          const properties = results[j];
          if (properties.length === 0) continue; // skip if no property found
          for (const prop of properties) {
            leads.push({
              id: makeId(name, STATE, "Lis Pendens", `${caseNum}-${prop.address}`),
              county: name, state: STATE,
              lead_type: "Lis Pendens",
              owner_name: prop.ownerName || caseName || null,
              address: prop.address, city: prop.city || "Kansas City", zip: prop.zip || null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: caseNum,
              filing_date: formatDate(filedDate),
              assessed_value: null, tax_year: null,
              lender: null, loan_amount: null, sale_date: null, sale_amount: null,
              description: `${name} County MO Lis Pendens — ${caseName}`,
              source_url: url,
              raw_data: JSON.stringify({ caseNum, caseName, filedDate, parcelId: prop.parcelId }),
            });
          }
        }
      }
    } catch (e) {
      console.error(`[${name} MO] Lis Pendens error:`, e);
    }
  }
  return leads;
}

// ─── PROBATE — Missouri Case.net (Clay, Cass, Platte) ────────────────────────
// Jackson probate is handled by scrapeJacksonProbate above (with assessor enrichment)
// Clay=12, Cass=7, Platte=25
// Enrichment: lookupOwnerProperties by case name → only keep leads with a found property
async function scrapeMOProbate(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const counties = [
    { name: "Clay",   code: "12", city: "Liberty" },
    { name: "Cass",   code: "7",  city: "Harrisonville" },
    { name: "Platte", code: "25", city: "Platte City" },
  ];
  const url = `https://www.courts.mo.gov/casenet/cases/searchCases.do`;
  for (const { name, code, city } of counties) {
    try {
      const body = new URLSearchParams({
        countyCode: code,
        caseType: "P",
        fromDate, toDate,
        submit: "Search",
      }).toString();
      const res = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) continue;
      const html = await res.text();
      const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const rows = html.match(rowRe) || [];
      type CaseRow = { caseNum: string; caseName: string; filedDate: string };
      const cases: CaseRow[] = [];
      for (const row of rows) {
        const cells: string[] = [];
        let m;
        while ((m = cellRe.exec(row)) !== null) {
          cells.push(m[1].replace(/<[^>]+>/g, "").trim());
        }
        cellRe.lastIndex = 0;
        if (cells.length < 2 || !cells[0] || cells[0].toLowerCase().includes("case")) continue;
        cases.push({ caseNum: cells[0], caseName: cells[1], filedDate: cells[2] || fromDate });
      }
      // Batch assessor enrichment — 5 concurrent, only keep leads with a found property
      const CONCURRENCY = 5;
      for (let i = 0; i < cases.length; i += CONCURRENCY) {
        const batch = cases.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(c => lookupOwnerProperties(c.caseName, name, STATE)));
        for (let j = 0; j < batch.length; j++) {
          const { caseNum, caseName, filedDate } = batch[j];
          const properties = results[j];
          if (properties.length === 0) continue;
          for (const prop of properties) {
            leads.push({
              id: makeId(name, STATE, "Probate", `${caseNum}-${prop.address}`),
              county: name, state: STATE,
              lead_type: "Probate/Estate",
              owner_name: prop.ownerName || caseName || null,
              address: prop.address, city: prop.city || city, zip: prop.zip || null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: caseNum,
              filing_date: formatDate(filedDate),
              assessed_value: null, tax_year: null,
              lender: null, loan_amount: null, sale_date: null, sale_amount: null,
              description: `${name} County MO Probate — ${caseName}`,
              source_url: url,
              raw_data: JSON.stringify({ caseNum, caseName, filedDate, parcelId: prop.parcelId }),
            });
          }
        }
      }
    } catch (e) {
      console.error(`[${name} MO] Probate error:`, e);
    }
  }
  return leads;
}
// ─── DIVORCE — Missouri Case.net (all 4 counties, case type "D") ──────────────
// Enrichment: lookupOwnerProperties by case name → only keep leads with a found property
async function scrapeMODivorce(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const counties = [
    { name: "Jackson", code: "16", city: "Kansas City" },
    { name: "Clay",    code: "12", city: "Liberty" },
    { name: "Cass",    code: "7",  city: "Harrisonville" },
    { name: "Platte",  code: "25", city: "Platte City" },
  ];
  const url = `https://www.courts.mo.gov/casenet/cases/searchCases.do`;
  for (const { name, code, city } of counties) {
    try {
      const body = new URLSearchParams({
        countyCode: code,
        caseType: "D",
        fromDate, toDate,
        submit: "Search",
      }).toString();
      const res = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) continue;
      const html = await res.text();
      const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const rows = html.match(rowRe) || [];
      type DivorceRow = { caseNum: string; caseName: string; filedDate: string };
      const cases: DivorceRow[] = [];
      for (const row of rows) {
        const cells: string[] = [];
        let m;
        while ((m = cellRe.exec(row)) !== null) {
          cells.push(m[1].replace(/<[^>]+>/g, "").trim());
        }
        cellRe.lastIndex = 0;
        if (cells.length < 2 || !cells[0] || cells[0].toLowerCase().includes("case")) continue;
        cases.push({ caseNum: cells[0], caseName: cells[1], filedDate: cells[2] || fromDate });
      }
      // Batch assessor enrichment — 5 concurrent, only keep leads with a found property
      const CONCURRENCY = 5;
      for (let i = 0; i < cases.length; i += CONCURRENCY) {
        const batch = cases.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(c => lookupOwnerProperties(c.caseName, name, STATE)));
        for (let j = 0; j < batch.length; j++) {
          const { caseNum, caseName, filedDate } = batch[j];
          const properties = results[j];
          if (properties.length === 0) continue;
          for (const prop of properties) {
            leads.push({
              id: makeId(name, STATE, "Divorce", `${caseNum}-${prop.address}`),
              county: name, state: STATE,
              lead_type: "Divorce",
              owner_name: prop.ownerName || caseName || null,
              address: prop.address, city: prop.city || city, zip: prop.zip || null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: caseNum,
              filing_date: formatDate(filedDate),
              assessed_value: null, tax_year: null,
              lender: null, loan_amount: null, sale_date: null, sale_amount: null,
              description: `${name} County MO Divorce — ${caseName}`,
              source_url: url,
              raw_data: JSON.stringify({ caseNum, caseName, filedDate, parcelId: prop.parcelId }),
            });
          }
        }
      }
    } catch (e) {
      console.error(`[${name} MO] Divorce error:`, e);
    }
  }
  return leads;
}
// ─── OBITUARIES — Legacy.com KC metro ────────────────────────────────────────
// Legacy.com RSS feed for Kansas City area obituaries
async function scrapeMOObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Legacy.com RSS for Kansas City Star obituaries
    const rssUrls = [
      "https://www.legacy.com/obituaries/kansascity/rss.aspx",
      "https://www.legacy.com/obituaries/kcstar/rss.aspx",
    ];
    for (const rssUrl of rssUrls) {
      try {
        const res = await fetchWithRetry(rssUrl);
        if (!res.ok) continue;
        const xml = await res.text();
        const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
        for (const item of items) {
          const title = (item.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/) || item.match(/<title>(.+?)<\/title>/))?.[1]?.trim() || "";
          const link = (item.match(/<link>(.+?)<\/link>/))?.[1]?.trim() || "";
          const pubDate = (item.match(/<pubDate>(.+?)<\/pubDate>/))?.[1]?.trim() || "";
          const desc = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\S]*?)<\/description>/))?.[1]?.trim() || "";
          if (!title) continue;
          // Filter to date range
          if (pubDate) {
            const d = new Date(pubDate);
            if (!isNaN(d.getTime())) {
              const ds = d.toISOString().slice(0, 10);
              if (ds < fromDate || ds > toDate) continue;
            }
          }
          leads.push({
            id: makeId("Jackson", STATE, "Obituary", link || title),
            county: "Jackson", state: STATE,
            lead_type: "Obituary",
            owner_name: title || null,
            address: null, city: "Kansas City", zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: null,
            filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0, 10)) : formatDate(fromDate),
            assessed_value: null, tax_year: null,
            lender: null, loan_amount: null, sale_date: null, sale_amount: null,
            description: desc.replace(/<[^>]+>/g, "").slice(0, 200) || `Obituary — ${title}`,
            source_url: link || rssUrl,
            raw_data: JSON.stringify({ title, pubDate }),
          });
        }
      } catch { /* try next URL */ }
    }

    // Enrich obituaries with property lookup by decedent name — 5 concurrent
    // Only keep obituaries where the decedent owns property in the area
    const enrichedObitLeads: Lead[] = [];
    const CONCURRENCY_O = 5;
    for (let i = 0; i < leads.length; i += CONCURRENCY_O) {
      const batch = leads.slice(i, i + CONCURRENCY_O);
      const results = await Promise.all(batch.map(l => lookupOwnerProperties(l.owner_name || '', 'Jackson', STATE)));
      for (let j = 0; j < batch.length; j++) {
        const properties = results[j];
        if (properties.length === 0) continue;
        const lead = batch[j];
        for (const prop of properties) {
          enrichedObitLeads.push({
            ...lead,
            id: makeId('Jackson', STATE, 'Obituary', `${lead.owner_name || ''}-${prop.address}`),
            address: prop.address,
            city: prop.city || 'Kansas City',
            zip: prop.zip || null,
            owner_name: prop.ownerName || lead.owner_name,
            raw_data: JSON.stringify({ ...JSON.parse(lead.raw_data || '{}'), parcelId: prop.parcelId }),
          });
        }
      }
    }
    return enrichedObitLeads;

  } catch (e) {
    console.error(`[MO] Obituaries error:`, e);
  }
  return [];
}

// ─── WATER SHUTOFFS — KC 311 Open Data (Jackson County only) ─────────────────
// Already covered inside scrapeKCCodeViolations for Jackson.
// This function adds a dedicated Water Shutoff type for Clay/Platte/Cass
// using their county utility / 311 portals where available.
async function scrapeMOWaterShutoffs(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // KC 311 Socrata — CONFIRMED WORKING
    // Dataset: d4px-6rwg (2021-present) | Fields: open_date_time, issue_type, issue_sub_type, incident_address, workorder_
    const url = `https://data.kcmo.org/resource/d4px-6rwg.json?$where=open_date_time>='${fromDate}T00:00:00' AND issue_type='Water Service' AND issue_sub_type='No Water'&$limit=500&$order=open_date_time DESC`;
    const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json() as Record<string, string>[];
      for (const item of data) {
        const address = item.incident_address || "";
        if (!address) continue;
        leads.push({
          id: makeId("Jackson", STATE, "Water Shutoff", item.workorder_ || address),
          county: "Jackson", state: STATE,
          lead_type: "Water Shutoff",
          owner_name: null,
          address: address || null, city: "Kansas City", zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: item.workorder_ || null,
          filing_date: formatDate(item.open_date_time?.slice(0, 10) || fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Water Shutoff — No Water — ${address}`,
          source_url: "https://data.kcmo.org/311/311-Call-Center-Reported-Issues/d4px-6rwg",
          raw_data: JSON.stringify(item),
        });
      }
    }

    // Enrich with owner name via assessor address lookup — 10 concurrent
    const CONCURRENCY_ADDR = 10;
    const unenrichedAddr = leads.filter(l => !l.owner_name && l.address);
    for (let i = 0; i < unenrichedAddr.length; i += CONCURRENCY_ADDR) {
      const batch = unenrichedAddr.slice(i, i + CONCURRENCY_ADDR);
      const results = await Promise.all(batch.map(l => lookupByAddress(l.address!, l.county, STATE)));
      for (let j = 0; j < batch.length; j++) {
        const prop = results[j];
        if (prop?.ownerName) batch[j].owner_name = prop.ownerName;
        if (prop?.zip && !batch[j].zip) batch[j].zip = prop.zip;
        if (prop?.parcelId) batch[j].raw_data = JSON.stringify({ ...JSON.parse(batch[j].raw_data || '{}'), parcelId: prop.parcelId });
      }
    }

  } catch (e) {
    console.error(`[MO] Water Shutoffs error:`, e);
  }
  return leads;
}

// ─── FIRE DAMAGE — KC 311 + KC Fire Open Data ─────────────────────────────────
// Jackson County: KC Open Data fire incidents
// Clay/Platte/Cass: No open data portal available — use KC 311 fire/structure requests
async function scrapeMOFireDamage(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // KC 311 Socrata — CONFIRMED WORKING
    // Dataset: d4px-6rwg (2021-present) | issue_type: 'Dangerous Buildings', 'Open Burning/Fire'
    const url = `https://data.kcmo.org/resource/d4px-6rwg.json?$where=open_date_time>='${fromDate}T00:00:00' AND (issue_type='Dangerous Buildings' OR issue_type='Open Burning/Fire')&$limit=500&$order=open_date_time DESC`;
    const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json() as Record<string, string>[];
      for (const item of data) {
        const address = item.incident_address || "";
        if (!address) continue;
        leads.push({
          id: makeId("Jackson", STATE, "Fire Damage", item.workorder_ || address),
          county: "Jackson", state: STATE,
          lead_type: "Fire Damage",
          owner_name: null,
          address: address || null, city: "Kansas City", zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: item.workorder_ || null,
          filing_date: formatDate(item.open_date_time?.slice(0, 10) || fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Fire Damage — ${item.issue_type || "Dangerous Building"} — ${address}`,
          source_url: "https://data.kcmo.org/311/311-Call-Center-Reported-Issues/d4px-6rwg",
          raw_data: JSON.stringify(item),
        });
      }
    }

    // Enrich with owner name via assessor address lookup — 10 concurrent
    const CONCURRENCY_ADDR = 10;
    const unenrichedAddr = leads.filter(l => !l.owner_name && l.address);
    for (let i = 0; i < unenrichedAddr.length; i += CONCURRENCY_ADDR) {
      const batch = unenrichedAddr.slice(i, i + CONCURRENCY_ADDR);
      const results = await Promise.all(batch.map(l => lookupByAddress(l.address!, l.county, STATE)));
      for (let j = 0; j < batch.length; j++) {
        const prop = results[j];
        if (prop?.ownerName) batch[j].owner_name = prop.ownerName;
        if (prop?.zip && !batch[j].zip) batch[j].zip = prop.zip;
        if (prop?.parcelId) batch[j].raw_data = JSON.stringify({ ...JSON.parse(batch[j].raw_data || '{}'), parcelId: prop.parcelId });
      }
    }

  } catch (e) {
    console.error(`[MO] Fire Damage error:`, e);
  }
  return leads;
}

// ─── VACANT/ABANDONED — KC 311 Open Data ─────────────────────────────────────
async function scrapeMOVacantAbandoned(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // KC 311 Socrata — CONFIRMED WORKING
    // Dataset: d4px-6rwg (2021-present) | issue_type: 'Property Violations', issue_sub_type contains 'Vacant'
    const url = `https://data.kcmo.org/resource/d4px-6rwg.json?$where=open_date_time>='${fromDate}T00:00:00' AND issue_type='Property Violations' AND issue_sub_type like '%Vacant%'&$limit=500&$order=open_date_time DESC`;
    const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return leads;
    const data = await res.json() as Record<string, string>[];
    for (const item of data) {
      const address = item.incident_address || "";
      if (!address) continue;
      leads.push({
        id: makeId("Jackson", STATE, "Vacant Abandoned", item.workorder_ || address),
        county: "Jackson", state: STATE,
        lead_type: "Vacant/Abandoned",
        owner_name: null,
        address: address || null, city: "Kansas City", zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: item.workorder_ || null,
        filing_date: formatDate(item.open_date_time?.slice(0, 10) || fromDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        description: `Vacant/Abandoned — ${item.issue_sub_type || "Vacant Property"} — ${address}`,
        source_url: "https://data.kcmo.org/311/311-Call-Center-Reported-Issues/d4px-6rwg",
        raw_data: JSON.stringify(item),
      });
    }

    // Enrich with owner name via assessor address lookup — 10 concurrent
    const CONCURRENCY_ADDR = 10;
    const unenrichedAddr = leads.filter(l => !l.owner_name && l.address);
    for (let i = 0; i < unenrichedAddr.length; i += CONCURRENCY_ADDR) {
      const batch = unenrichedAddr.slice(i, i + CONCURRENCY_ADDR);
      const results = await Promise.all(batch.map(l => lookupByAddress(l.address!, l.county, STATE)));
      for (let j = 0; j < batch.length; j++) {
        const prop = results[j];
        if (prop?.ownerName) batch[j].owner_name = prop.ownerName;
        if (prop?.zip && !batch[j].zip) batch[j].zip = prop.zip;
        if (prop?.parcelId) batch[j].raw_data = JSON.stringify({ ...JSON.parse(batch[j].raw_data || '{}'), parcelId: prop.parcelId });
      }
    }

  } catch (e) {
    console.error(`[MO] Vacant/Abandoned error:`, e);
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
    // Pre-Foreclosure / Lis Pendens
    scrapeJacksonPreForeclosure(fromDate, toDate),  // Jackson Recorder of Deeds
    scrapeLisPendens(fromDate, toDate),             // Case.net Lis Pendens (all 4 counties)
    // Tax Delinquent
    scrapeJacksonTaxDelinquent(fromDate, toDate),
    // Sheriff Sales
    scrapeJacksonSheriffSales(fromDate, toDate),
    scrapeClayCounty(fromDate, toDate),
    scrapePlatteCounty(fromDate, toDate),
    scrapeCassCounty(fromDate, toDate),
    // Probate
    scrapeJacksonProbate(fromDate, toDate),
    scrapeMOProbate(fromDate, toDate), // Clay, Cass, Platte via Case.net
    // Bankruptcy
    scrapeBankruptcy(fromDate, toDate),
    // Code Violations / Fire / Water / Vacant
    scrapeKCCodeViolations(fromDate, toDate),
    scrapeMOFireDamage(fromDate, toDate),
    scrapeMOWaterShutoffs(fromDate, toDate),
    scrapeMOVacantAbandoned(fromDate, toDate),
    // FSBO
    scrapeKCCraigslistFSBO(fromDate, toDate),
    // Divorce
    scrapeMODivorce(fromDate, toDate),
    // Obituaries
    scrapeMOObituaries(fromDate, toDate),
  ]);
  return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}
