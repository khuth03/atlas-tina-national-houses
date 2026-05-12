/**
 * Suffolk County, NY Scrapers
 * 
 * Sources:
 * - Pre-Foreclosure/Lis Pendens: NYSCEF (NY State Courts Electronic Filing) + Suffolk County Clerk recorded documents
 * - Tax Delinquent: Suffolk County Property Tax Portal (Tyler Portico)
 * - Probate: NY WebSurrogate (surrogate court records)
 * - Sheriff Sales: Suffolk County Sheriff Civil Bureau + newspaper legal notices
 * - FSBO: Craigslist Long Island housing
 * - Code Violations: Suffolk County Building Department
 * - Obituaries: Newsday + local funeral home RSS feeds
 */

import * as cheerio from "cheerio";
import { Lead, makeId, formatDate, fetchWithRetry } from "./base.js";

const COUNTY = "Suffolk";
const STATE = "NY";

// ─── LIS PENDENS (Pre-Foreclosure) ───────────────────────────────────────────
// Suffolk County Clerk records lis pendens as recorded instruments
// We scrape the public records search for document type "LIS PENDENS"
export async function scrapeLisPendens(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Suffolk County uses iGovServices for recorded documents
    // Document type code for Lis Pendens is "LP"
    const url = `https://suffolkcountyny.gov/Elected-Officials/County-Clerk/Judgments-Liens-and-UCCs`;
    
    // Primary approach: scrape the NYSCEF RSS/search for Suffolk County foreclosure filings
    // NYSCEF has a public case search that doesn't require CAPTCHA for basic queries
    const nyscefUrl = `https://iapps.courts.state.ny.us/nyscef/CaseSearch?IndexNumber=&courtType=Supreme+Court&county=Suffolk&efiling=Y&casetype=Foreclosure+%28Residential+Mortgage%29&dateFrom=${fromDate}&dateTo=${toDate}`;
    
    const res = await fetchWithRetry(nyscefUrl, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Referer": "https://iapps.courts.state.ny.us/nyscef/CaseSearch",
      }
    });
    
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      
      // Parse case rows from NYSCEF results table
      $("table.NewSearchResults tr, table tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 3) return;
        
        const caseNum = $(cells[0]).text().trim();
        const parties = $(cells[1]).text().trim();
        const filingDate = $(cells[2]).text().trim();
        
        if (!caseNum || caseNum === "Index Number") return;
        
        // Parse plaintiff (lender) and defendant (owner) from parties
        const parts = parties.split(/\s+v\.?\s+/i);
        const plaintiff = parts[0]?.trim() || null;
        const defendant = parts[1]?.trim() || null;
        
        leads.push({
          id: makeId(COUNTY, STATE, "Pre-Foreclosure", caseNum),
          county: COUNTY,
          state: STATE,
          lead_type: "Pre-Foreclosure",
          owner_name: defendant,
          address: null,
          city: null,
          zip: null,
          mailing_address: null,
          mailing_city: null,
          mailing_state: null,
          mailing_zip: null,
          case_number: caseNum,
          filing_date: formatDate(filingDate),
          assessed_value: null,
          tax_year: null,
          lender: plaintiff,
          loan_amount: null,
          sale_date: null,
          sale_amount: null,
          description: `Residential Mortgage Foreclosure — ${parties}`,
          source_url: nyscefUrl,
          raw_data: JSON.stringify({ caseNum, parties, filingDate }),
        });
      });
    }
    
    // Fallback: scrape legal notices from Newsday (required by NY law to publish foreclosure notices)
    if (leads.length === 0) {
      const newsLeads = await scrapeLegalNotices(fromDate, toDate);
      leads.push(...newsLeads);
    }
    
  } catch (e) {
    console.error(`[Suffolk NY] Pre-Foreclosure scrape error:`, e);
  }
  return leads;
}

// ─── LEGAL NOTICES (Foreclosure Notices) ─────────────────────────────────────
async function scrapeLegalNotices(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Suffolk County legal notices are published in Newsday and the Long Island Business News
    // We also check the Suffolk County Bar Association foreclosure list
    const url = `https://www.suffolkcountyny.gov/Departments/County-Clerk/Foreclosure-Assistance`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Parse any foreclosure listing tables
    $("table tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const text = $(row).text().trim();
      if (text.toLowerCase().includes("foreclosure") || text.toLowerCase().includes("lis pendens")) {
        leads.push({
          id: makeId(COUNTY, STATE, "Pre-Foreclosure", text.slice(0, 50)),
          county: COUNTY,
          state: STATE,
          lead_type: "Pre-Foreclosure",
          owner_name: $(cells[0]).text().trim() || null,
          address: $(cells[1]).text().trim() || null,
          city: "Suffolk County",
          zip: null,
          mailing_address: null,
          mailing_city: null,
          mailing_state: null,
          mailing_zip: null,
          case_number: $(cells[2])?.text().trim() || null,
          filing_date: formatDate($(cells[3])?.text().trim()),
          assessed_value: null,
          tax_year: null,
          lender: null,
          loan_amount: null,
          sale_date: null,
          sale_amount: null,
          description: "Pre-Foreclosure / Lis Pendens",
          source_url: url,
          raw_data: JSON.stringify({ text }),
        });
      }
    });
  } catch (e) {
    console.error(`[Suffolk NY] Legal notices error:`, e);
  }
  return leads;
}

// ─── TAX DELINQUENT ───────────────────────────────────────────────────────────
export async function scrapeTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Suffolk County publishes annual tax lien sale lists
    // Also check individual town tax delinquent lists (Suffolk has 10 towns)
    const towns = ["Babylon", "Brookhaven", "East Hampton", "Huntington", "Islip", "Riverhead", "Shelter Island", "Smithtown", "Southampton", "Southold"];
    
    for (const town of towns.slice(0, 3)) { // Start with top 3 towns
      const url = `https://www.suffolkcountyny.gov/Departments/Real-Property-Tax-Service-Agency`;
      const res = await fetchWithRetry(url);
      if (!res.ok) continue;
      
      const html = await res.text();
      const $ = cheerio.load(html);
      
      // Look for downloadable tax lien/delinquent lists
      $("a[href*='delinquent'], a[href*='tax-lien'], a[href*='lien-sale']").each((_, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().trim();
        if (href && (text.toLowerCase().includes("delinquent") || text.toLowerCase().includes("lien"))) {
          leads.push({
            id: makeId(COUNTY, STATE, "Tax Delinquent", town, href),
            county: COUNTY,
            state: STATE,
            lead_type: "Tax Delinquent",
            owner_name: null,
            address: null,
            city: town,
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
            description: `Tax Delinquent — ${town}, Suffolk County NY`,
            source_url: href?.startsWith("http") ? href : `https://www.suffolkcountyny.gov${href}`,
            raw_data: JSON.stringify({ town, text }),
          });
        }
      });
    }
    
    // Also scrape the Tyler Portico tax portal for delinquent properties
    const taxUrl = `https://suffolkcountyny.tylerportico.com/css/citizen-selfservice/real-estate/home`;
    // Tyler Portico requires form submission — we'll note it as a source
    if (leads.length === 0) {
      leads.push({
        id: makeId(COUNTY, STATE, "Tax Delinquent", fromDate),
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
        description: "Suffolk County Tax Delinquent — see Tyler Portico portal for full list",
        source_url: taxUrl,
        raw_data: null,
      });
    }
  } catch (e) {
    console.error(`[Suffolk NY] Tax delinquent error:`, e);
  }
  return leads;
}

// ─── PROBATE ─────────────────────────────────────────────────────────────────
export async function scrapeProbate(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // NY WebSurrogate for probate records
    const url = `https://websurrogates.nycourts.gov/`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // WebSurrogate has a search form — we need to POST to search by date range
    // The form action and fields
    const formAction = $("form").attr("action") || "/";
    
    // Try to search for recent Suffolk County probate filings
    const searchRes = await fetchWithRetry(`https://websurrogates.nycourts.gov/search`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `county=Suffolk&dateFrom=${fromDate}&dateTo=${toDate}&caseType=probate`,
    });
    
    if (searchRes.ok) {
      const searchHtml = await searchRes.text();
      const $s = cheerio.load(searchHtml);
      
      $s("table tr").each((_, row) => {
        const cells = $s(row).find("td");
        if (cells.length < 3) return;
        
        const decedent = $s(cells[0]).text().trim();
        const caseNum = $s(cells[1]).text().trim();
        const filingDate = $s(cells[2]).text().trim();
        
        if (!decedent || decedent === "Decedent") return;
        
        leads.push({
          id: makeId(COUNTY, STATE, "Probate", caseNum || decedent),
          county: COUNTY,
          state: STATE,
          lead_type: "Probate",
          owner_name: decedent,
          address: null,
          city: null,
          zip: null,
          mailing_address: null,
          mailing_city: null,
          mailing_state: null,
          mailing_zip: null,
          case_number: caseNum,
          filing_date: formatDate(filingDate),
          assessed_value: null,
          tax_year: null,
          lender: null,
          loan_amount: null,
          sale_date: null,
          sale_amount: null,
          description: `Probate Estate — ${decedent}`,
          source_url: url,
          raw_data: JSON.stringify({ decedent, caseNum, filingDate }),
        });
      });
    }
  } catch (e) {
    console.error(`[Suffolk NY] Probate error:`, e);
  }
  return leads;
}

// ─── CRAIGSLIST FSBO ─────────────────────────────────────────────────────────
export async function scrapeCraigslistFSBO(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Craigslist Long Island - For Sale By Owner
    const url = `https://longisland.craigslist.org/search/rea?sale_date_from=${fromDate}&sale_date_to=${toDate}&query=for+sale+by+owner&srchType=A`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    $("li.result-row, .cl-search-result").each((_, el) => {
      const title = $(el).find(".result-title, .title-anchor, a.posting-title").text().trim();
      const price = $(el).find(".result-price, .priceinfo").text().trim();
      const date = $(el).find("time").attr("datetime") || $(el).find(".result-date").attr("datetime");
      const link = $(el).find("a.result-title, a.posting-title").attr("href");
      const location = $(el).find(".result-hood, .supertitle").text().trim().replace(/[()]/g, "");
      
      if (!title) return;
      
      leads.push({
        id: makeId(COUNTY, STATE, "FSBO", link || title),
        county: COUNTY,
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
        source_url: link?.startsWith("http") ? link : `https://longisland.craigslist.org${link}`,
        raw_data: JSON.stringify({ title, price, location }),
      });
    });
  } catch (e) {
    console.error(`[Suffolk NY] Craigslist FSBO error:`, e);
  }
  return leads;
}

// ─── OBITUARIES ──────────────────────────────────────────────────────────────
export async function scrapeObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Newsday obituaries for Suffolk County
    const url = `https://www.legacy.com/us/obituaries/newsday/browse?dateRange=last30Days&countryId=1&regionId=35`; // NY state
    const res = await fetchWithRetry(url, {
      headers: { "Accept": "application/json, text/html" }
    });
    
    if (!res.ok) return leads;
    const html = await res.text();
    const $ = cheerio.load(html);
    
    $(".Obituary, .obit-listing, article.obit").each((_, el) => {
      const name = $(el).find(".name, h3, .obit-name").text().trim();
      const location = $(el).find(".location, .city").text().trim();
      const date = $(el).find("time, .date").attr("datetime") || $(el).find(".date").text().trim();
      const link = $(el).find("a").attr("href");
      
      if (!name) return;
      if (!location.toLowerCase().includes("suffolk") && !location.toLowerCase().includes("long island") &&
          !location.toLowerCase().includes("ny")) return;
      
      leads.push({
        id: makeId(COUNTY, STATE, "Obituary", name, date),
        county: COUNTY,
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
    console.error(`[Suffolk NY] Obituaries error:`, e);
  }
  return leads;
}

// ─── CODE VIOLATIONS ─────────────────────────────────────────────────────────
export async function scrapeCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Suffolk County Building Department code violations
    // Individual towns publish their own violation lists
    const townUrls = [
      { town: "Babylon", url: "https://www.townofbabylon.com/code-enforcement" },
      { town: "Islip", url: "https://www.townofislip-ny.gov/departments/code-enforcement" },
      { town: "Huntington", url: "https://www.huntingtonny.gov/code-enforcement" },
    ];
    
    for (const { town, url } of townUrls) {
      try {
        const res = await fetchWithRetry(url);
        if (!res.ok) continue;
        const html = await res.text();
        const $ = cheerio.load(html);
        
        $("table tr, .violation-row").each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length < 2) return;
          const address = $(cells[0]).text().trim();
          const violation = $(cells[1]).text().trim();
          const date = $(cells[2])?.text().trim();
          
          if (!address || address.toLowerCase() === "address") return;
          
          leads.push({
            id: makeId(COUNTY, STATE, "Code Violation", town, address),
            county: COUNTY,
            state: STATE,
            lead_type: "Code Violation",
            owner_name: null,
            address,
            city: town,
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
            description: violation || "Code Violation",
            source_url: url,
            raw_data: JSON.stringify({ town, address, violation }),
          });
        });
      } catch { /* skip this town */ }
    }
  } catch (e) {
    console.error(`[Suffolk NY] Code violations error:`, e);
  }
  return leads;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export async function scrapeAll(fromDate: string, toDate: string): Promise<Lead[]> {
  const [lisPendens, taxDelinquent, probate, fsbo, obituaries, codeViolations] = await Promise.allSettled([
    scrapeLisPendens(fromDate, toDate),
    scrapeTaxDelinquent(fromDate, toDate),
    scrapeProbate(fromDate, toDate),
    scrapeCraigslistFSBO(fromDate, toDate),
    scrapeObituaries(fromDate, toDate),
    scrapeCodeViolations(fromDate, toDate),
  ]);
  
  return [
    ...(lisPendens.status === "fulfilled" ? lisPendens.value : []),
    ...(taxDelinquent.status === "fulfilled" ? taxDelinquent.value : []),
    ...(probate.status === "fulfilled" ? probate.value : []),
    ...(fsbo.status === "fulfilled" ? fsbo.value : []),
    ...(obituaries.status === "fulfilled" ? obituaries.value : []),
    ...(codeViolations.status === "fulfilled" ? codeViolations.value : []),
  ];
}
