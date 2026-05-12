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

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
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
  ]);
  
  return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}
