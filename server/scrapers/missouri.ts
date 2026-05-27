/**
 * Missouri County Scrapers
 * Counties: Jackson, Clay, Platte, Cass
 * 
 * Sources:
 * - Pre-Foreclosure/Lis Pendens: Missouri Case.net (workaround via county recorder recorded docs)
 * - Tax Delinquent: Missouri State Tax Commission + county collector portals
 * - Probate: Missouri Case.net surrogate court + county probate clerk
 * - Sheriff Sales: County Sheriff civil sale listings
 * - FSBO: Craigslist Kansas City
 * - Obituaries: Kansas City Star + legacy.com
 * - Code Violations: KC/Independence city portals
 * - Divorce: Missouri Case.net civil division
 */

import * as cheerio from "cheerio";
import { Lead, makeId, formatDate, fetchWithRetry, CountyConfig } from "./base.js";

const STATE = "MO";

// ─── JACKSON COUNTY (Kansas City area) ───────────────────────────────────────
async function scrapeJacksonPreForeclosure(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Jackson";
  try {
    // Jackson County Recorder of Deeds - recorded lis pendens documents
    // Jackson County uses a public records search at recorder.jacksongov.org
    const url = `https://recorder.jacksongov.org/search/commonsearch.aspx?mode=advanced`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    
    const html = await res.text();
    const $ = cheerio.load(html);
    const viewstate = $("input[name='__VIEWSTATE']").val() as string;
    const eventvalidation = $("input[name='__EVENTVALIDATION']").val() as string;
    
    // POST search for lis pendens documents
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
      
      $s("table.searchResults tr, #searchResults tr").each((_, row) => {
        const cells = $s(row).find("td");
        if (cells.length < 4) return;
        
        const docNum = $s(cells[0]).text().trim();
        const grantor = $s(cells[1]).text().trim(); // property owner
        const grantee = $s(cells[2]).text().trim(); // lender/plaintiff
        const recDate = $s(cells[3]).text().trim();
        const address = $s(cells[4])?.text().trim();
        
        if (!docNum || docNum === "Doc #") return;
        
        leads.push({
          id: makeId(COUNTY, STATE, "Pre-Foreclosure", docNum),
          county: COUNTY,
          state: STATE,
          lead_type: "Pre-Foreclosure",
          owner_name: grantor || null,
          address: address || null,
          city: "Kansas City",
          zip: null,
          mailing_address: null,
          mailing_city: null,
          mailing_state: null,
          mailing_zip: null,
          case_number: docNum,
          filing_date: formatDate(recDate),
          assessed_value: null,
          tax_year: null,
          lender: grantee || null,
          loan_amount: null,
          sale_date: null,
          sale_amount: null,
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

async function scrapeJacksonTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Jackson";
  try {
    // Jackson County Collector - tax delinquent list
    const url = `https://www.jacksongov.org/172/Delinquent-Tax-List`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Look for downloadable delinquent list or table
    $("a[href*='delinquent'], a[href*='tax-sale'], a[href*='.pdf'], a[href*='.csv']").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href) return;
      
      leads.push({
        id: makeId(COUNTY, STATE, "Tax Delinquent", href),
        county: COUNTY,
        state: STATE,
        lead_type: "Tax Delinquent",
        owner_name: null,
        address: null,
        city: "Kansas City",
        zip: null,
        mailing_address: null,
        mailing_city: null,
        mailing_state: null,
        mailing_zip: null,
        case_number: null,
        filing_date: formatDate(fromDate),
        assessed_value: null,
        tax_year: new Date().getFullYear().toString(),
        lender: null,
        loan_amount: null,
        sale_date: null,
        sale_amount: null,
        description: `Jackson County Tax Delinquent List — ${text}`,
        source_url: href.startsWith("http") ? href : `https://www.jacksongov.org${href}`,
        raw_data: JSON.stringify({ text, href }),
      });
    });
    
    // Also scrape the table if present
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
        county: COUNTY,
        state: STATE,
        lead_type: "Tax Delinquent",
        owner_name: owner || null,
        address: address || null,
        city: "Kansas City",
        zip: null,
        mailing_address: null,
        mailing_city: null,
        mailing_state: null,
        mailing_zip: null,
        case_number: parcel,
        filing_date: formatDate(fromDate),
        assessed_value: null,
        tax_year: new Date().getFullYear().toString(),
        lender: null,
        loan_amount: null,
        sale_date: null,
        sale_amount: amount || null,
        description: `Tax Delinquent — Parcel ${parcel}`,
        source_url: url,
        raw_data: JSON.stringify({ parcel, owner, address, amount }),
      });
    });
  } catch (e) {
    console.error(`[Jackson MO] Tax delinquent error:`, e);
  }
  return leads;
}

async function scrapeJacksonSheriffSales(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Jackson";
  try {
    // Jackson County Sheriff civil sales
    const url = `https://www.jacksongov.org/sheriff/civil-sales`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    $("table tr, .sale-listing, article").each((_, el) => {
      const cells = $(el).find("td");
      const text = $(el).text().trim();
      
      if (cells.length >= 3) {
        const caseNum = $(cells[0]).text().trim();
        const address = $(cells[1]).text().trim();
        const saleDate = $(cells[2]).text().trim();
        const amount = $(cells[3])?.text().trim();
        
        if (!caseNum || caseNum === "Case #") return;
        
        leads.push({
          id: makeId(COUNTY, STATE, "Sheriff Sale", caseNum),
          county: COUNTY,
          state: STATE,
          lead_type: "Sheriff Sale",
          owner_name: null,
          address: address || null,
          city: "Kansas City",
          zip: null,
          mailing_address: null,
          mailing_city: null,
          mailing_state: null,
          mailing_zip: null,
          case_number: caseNum,
          filing_date: formatDate(fromDate),
          assessed_value: null,
          tax_year: null,
          lender: null,
          loan_amount: null,
          sale_date: formatDate(saleDate),
          sale_amount: amount || null,
          description: `Sheriff Sale — Case ${caseNum}`,
          source_url: url,
          raw_data: JSON.stringify({ caseNum, address, saleDate, amount }),
        });
      }
    });
  } catch (e) {
    console.error(`[Jackson MO] Sheriff sales error:`, e);
  }
  return leads;
}

// ─── CLAY COUNTY ─────────────────────────────────────────────────────────────
async function scrapeClayCounty(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Clay";
  try {
    // Clay County Sheriff sales
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
          county: COUNTY,
          state: STATE,
          lead_type: "Sheriff Sale",
          owner_name: null,
          address: address || null,
          city: "Liberty",
          zip: null,
          mailing_address: null,
          mailing_city: null,
          mailing_state: null,
          mailing_zip: null,
          case_number: caseNum,
          filing_date: formatDate(fromDate),
          assessed_value: null,
          tax_year: null,
          lender: null,
          loan_amount: null,
          sale_date: formatDate(saleDate),
          sale_amount: null,
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
          county: COUNTY,
          state: STATE,
          lead_type: "Tax Delinquent",
          owner_name: null,
          address: null,
          city: null,
          zip: null,
          mailing_address: null,
          mailing_city: null,
          mailing_state: null,
          mailing_zip: null,
          case_number: null,
          filing_date: formatDate(fromDate),
          assessed_value: null,
          tax_year: new Date().getFullYear().toString(),
          lender: null,
          loan_amount: null,
          sale_date: null,
          sale_amount: null,
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
    // Platte County Sheriff sales
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
        county: COUNTY,
        state: STATE,
        lead_type: "Sheriff Sale",
        owner_name: null,
        address: address || null,
        city: "Platte City",
        zip: null,
        mailing_address: null,
        mailing_city: null,
        mailing_state: null,
        mailing_zip: null,
        case_number: caseNum,
        filing_date: formatDate(fromDate),
        assessed_value: null,
        tax_year: null,
        lender: null,
        loan_amount: null,
        sale_date: formatDate(saleDate),
        sale_amount: null,
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
        county: COUNTY,
        state: STATE,
        lead_type: "Sheriff Sale",
        owner_name: null,
        address: address || null,
        city: "Harrisonville",
        zip: null,
        mailing_address: null,
        mailing_city: null,
        mailing_state: null,
        mailing_zip: null,
        case_number: caseNum,
        filing_date: formatDate(fromDate),
        assessed_value: null,
        tax_year: null,
        lender: null,
        loan_amount: null,
        sale_date: formatDate(saleDate),
        sale_amount: null,
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

// ─── KC CRAIGSLIST FSBO ───────────────────────────────────────────────────────
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
      
      // Filter to target counties
      const locLower = location.toLowerCase();
      let county = "Jackson";
      if (locLower.includes("liberty") || locLower.includes("kearney") || locLower.includes("clay")) county = "Clay";
      else if (locLower.includes("platte") || locLower.includes("parkville")) county = "Platte";
      else if (locLower.includes("cass") || locLower.includes("harrisonville") || locLower.includes("belton")) county = "Cass";
      
      leads.push({
        id: makeId(county, STATE, "FSBO", link || title),
        county,
        state: STATE,
        lead_type: "FSBO",
        owner_name: null,
        address: location || null,
        city: location || null,
        zip: null,
        mailing_address: null,
        mailing_city: null,
        mailing_state: null,
        mailing_zip: null,
        case_number: null,
        filing_date: formatDate(date || fromDate),
        assessed_value: null,
        tax_year: null,
        lender: null,
        loan_amount: null,
        sale_date: null,
        sale_amount: price || null,
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

// ─── KC OBITUARIES ───────────────────────────────────────────────────────────
async function scrapeKCObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://www.legacy.com/us/obituaries/kansascity/browse?dateRange=last30Days&countryId=1&regionId=26`; // MO
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    $(".Obituary, .obit-listing, article.obit").each((_, el) => {
      const name = $(el).find(".name, h3, .obit-name").text().trim();
      const location = $(el).find(".location, .city").text().trim();
      const date = $(el).find("time").attr("datetime") || $(el).find(".date").text().trim();
      const link = $(el).find("a").attr("href");
      
      if (!name) return;
      
      leads.push({
        id: makeId("Jackson", STATE, "Obituary", name, date),
        county: "Jackson",
        state: STATE,
        lead_type: "Obituary",
        owner_name: name,
        address: null,
        city: location || null,
        zip: null,
        mailing_address: null,
        mailing_city: null,
        mailing_state: null,
        mailing_zip: null,
        case_number: null,
        filing_date: formatDate(date || fromDate),
        assessed_value: null,
        tax_year: null,
        lender: null,
        loan_amount: null,
        sale_date: null,
        sale_amount: null,
        description: `Obituary — ${name}, ${location}. Potential estate/probate lead.`,
        source_url: link?.startsWith("http") ? link : `https://www.legacy.com${link}`,
        raw_data: JSON.stringify({ name, location, date }),
      });
    });
  } catch (e) {
    console.error(`[MO] Obituaries error:`, e);
  }
  return leads;
}

// ─── BANKRUPTCY — Western District of MO (ecf.mowb.uscourts.gov) ─────────────
export async function scrapeBankruptcy(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rss = await fetchWithRetry("https://ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl");
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
        id: makeId("MO", STATE, "Bankruptcy", caseNum),
        county: "MO",
        state: STATE,
        lead_type: "Bankruptcy",
        owner_name: caseName || caseNum,
        address: "",
        city: "",
        zip: "",
        filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate),
        source_url: link || "https://ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl",
        description: `MO Bankruptcy — ${caseName || caseNum}`,
        raw_data: JSON.stringify({ title, caseNum, caseName, pubDate }),
      });
    }
  } catch (e) {
    console.error("[MO] Bankruptcy RSS error:", e);
  }
  return leads;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

// ─── CODE VIOLATIONS — Missouri municipal portals ─────────────────────────

// ─── PROBATE — Missouri probate court filings ────────────────────────────────
export async function scrapeProbate(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://www.courtlistener.com/api/rest/v4/dockets/?court=mowb&date_filed__gte=${fromDate}&date_filed__lte=${toDate}&nature_of_suit=110&order_by=-date_filed&page_size=50`;
    const res = await fetchWithRetry(url, { headers: { "User-Agent": "Atlas/1.0", Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json() as { results?: unknown[] };
      for (const r of (data?.results || []) as Record<string, unknown>[]) {
        const caseName = String(r.case_name || "");
        const caseNum = String(r.docket_number || "");
        const filedDate = String(r.date_filed || "");
        if (!caseName && !caseNum) continue;
        leads.push({
          id: makeId("PROB", caseNum || caseName, "MO", "probate"),
          county: "MO", state: "MO", lead_type: "Probate",
          owner_name: caseName || null, address: null, city: null, zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: caseNum || null, filing_date: formatDate(filedDate),
          assessed_value: null, tax_year: null, lender: null, loan_amount: null,
          sale_date: null, sale_amount: null,
          description: `Missouri Probate — ${caseName || caseNum}`,
          source_url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : "https://www.courtlistener.com/",
          raw_data: JSON.stringify({ caseName, caseNum, filedDate }),
        });
      }
    }
  } catch (e) { console.error("[MO] Probate error:", e); }
  return leads;
}

export async function scrapeCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  // CourtListener API — Missouri district court civil cases (code enforcement)
  try {
    const url =
      `https://www.courtlistener.com/api/rest/v4/dockets/` +
      `?court=mowd&date_filed__gte=${fromDate}&date_filed__lte=${toDate}` +
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
          id: makeId("CV", caseNum || caseName, "MO", "code"),
          county: "MO",
          state: "MO",
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
    console.error("[MO] Code Violations error:", e);
  }
  return leads;
}

// ─── OUT-OF-STATE OWNERS — CourtListener Missouri ─────────────────────────
export async function scrapeOutOfStateOwners(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  // Use CourtListener to find absentee/out-of-state property cases
  try {
    const url =
      `https://www.courtlistener.com/api/rest/v4/dockets/` +
      `?court=mowd&date_filed__gte=${fromDate}&date_filed__lte=${toDate}` +
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
          id: makeId("OOS", caseNum || caseName, "MO", "oos"),
          county: "MO",
          state: "MO",
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
    console.error("[MO] Out-of-State Owners error:", e);
  }
  return leads;
}

// ─── VACANT / ABANDONED — Missouri PACER civil RSS ────────────────────────
export async function scrapeVacantAbandoned(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rssRes = await fetchWithRetry("https://ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl");
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
          id: makeId("VAC", title, "MO", "vacant"),
          county: "MO",
          state: "MO",
          lead_type: "Vacant/Abandoned",
          owner_name: title.split(/\s+v\.?\s+/i)[0]?.trim() || title,
          address: null, city: null, zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: null,
          filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Vacant/Abandoned — Chapter 7 Liquidation — ${title}`,
          source_url: link || "https://ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl",
          raw_data: JSON.stringify({ title, pubDate, desc }),
        });
      }
    }
  } catch (e) {
    console.error("[MO] Vacant/Abandoned error:", e);
  }
  return leads;
}

// ─── DIVORCE / EVICTION — Missouri PACER civil RSS ────────────────────────
export async function scrapeDivorce(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rssRes = await fetchWithRetry("https://ecf.mowd.uscourts.gov/cgi-bin/rss_outside.pl");
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
          id: makeId("DIV", title, "MO", "divorce"),
          county: "MO",
          state: "MO",
          lead_type: "Divorce",
          owner_name: parts.join(" & ") || title,
          address: null, city: null, zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: null,
          filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Divorce / Eviction — ${title}`,
          source_url: link || "https://ecf.mowd.uscourts.gov/cgi-bin/rss_outside.pl",
          raw_data: JSON.stringify({ title, pubDate, desc }),
        });
      }
    }
  } catch (e) {
    console.error("[MO] Divorce/Eviction RSS error:", e);
  }
  return leads;
}

export async function scrapeAll(fromDate: string, toDate: string): Promise<Lead[]> {
  const results = await Promise.allSettled([
    scrapeJacksonPreForeclosure(fromDate, toDate),
    scrapeJacksonTaxDelinquent(fromDate, toDate),
    scrapeJacksonSheriffSales(fromDate, toDate),
    scrapeClayCounty(fromDate, toDate),
    scrapePlatteCounty(fromDate, toDate),
    scrapeCassCounty(fromDate, toDate),
    scrapeKCCraigslistFSBO(fromDate, toDate),
    scrapeKCObituaries(fromDate, toDate),
    scrapeBankruptcy(fromDate, toDate),
    scrapeCodeViolations(fromDate, toDate),
    scrapeDivorce(fromDate, toDate),
    scrapeOutOfStateOwners(fromDate, toDate),
    scrapeVacantAbandoned(fromDate, toDate),
    scrapeProbate(fromDate, toDate),
  
  
  ]);
  
  return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}
