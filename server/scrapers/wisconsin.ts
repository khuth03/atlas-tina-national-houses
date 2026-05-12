/**
 * Wisconsin County Scrapers
 * Counties: Dane, Rock, Door
 * 
 * Sources:
 * - Pre-Foreclosure/Lis Pendens: Wisconsin Circuit Court Access (WCCA) - public, no CAPTCHA
 * - Tax Delinquent: Wisconsin DOR + county treasurer portals
 * - Probate: WCCA probate division
 * - Sheriff Sales: gray-law.com (WI sheriff sales aggregator) + county sheriff sites
 * - FSBO: Craigslist Madison
 * - Obituaries: Wisconsin State Journal + legacy.com
 * - Code Violations: City of Madison + Janesville portals
 */

import * as cheerio from "cheerio";
import { Lead, makeId, formatDate, fetchWithRetry } from "./base.js";

const STATE = "WI";

// ─── WCCA (Wisconsin Circuit Court Access) ───────────────────────────────────
// WCCA is fully public and doesn't require login or CAPTCHA
async function scrapeWCCA(county: string, caseType: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const countyCode: Record<string, string> = {
      "Dane": "13",
      "Rock": "56",
      "Door": "15",
    };
    
    const code = countyCode[county];
    if (!code) return leads;
    
    // WCCA public search URL
    const url = `https://wcca.wicourts.gov/jsonPost/advancedCaseSearch`;
    const body = {
      countyNo: code,
      caseType: caseType, // "FC" for foreclosure, "PR" for probate, "CV" for civil
      filingDateFrom: fromDate,
      filingDateTo: toDate,
      recordsPerPage: 250,
      offset: 0,
    };
    
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
    });
    
    if (!res.ok) return leads;
    
    const data = await res.json() as { cases?: Array<Record<string, string>> };
    const cases = data?.cases || [];
    
    const leadType = caseType === "FC" ? "Pre-Foreclosure" : caseType === "PR" ? "Probate" : "Civil";
    
    for (const c of cases) {
      leads.push({
        id: makeId(county, STATE, leadType, c.caseNo),
        county,
        state: STATE,
        lead_type: leadType,
        owner_name: c.parties || c.defendant || null,
        address: null,
        city: null,
        zip: null,
        mailing_address: null,
        mailing_city: null,
        mailing_state: null,
        mailing_zip: null,
        case_number: c.caseNo || null,
        filing_date: formatDate(c.filingDate),
        assessed_value: null,
        tax_year: null,
        lender: c.plaintiff || null,
        loan_amount: null,
        sale_date: null,
        sale_amount: null,
        description: `${leadType} — ${c.caption || c.parties || c.caseNo}`,
        source_url: `https://wcca.wicourts.gov/caseDetail.html?caseNo=${c.caseNo}&countyNo=${code}`,
        raw_data: JSON.stringify(c),
      });
    }
  } catch (e) {
    console.error(`[${county} WI] WCCA ${caseType} error:`, e);
  }
  return leads;
}

// ─── SHERIFF SALES (gray-law.com aggregator) ─────────────────────────────────
async function scrapeWISheriffSales(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const counties = ["Dane", "Rock", "Door"];
  
  try {
    for (const county of counties) {
      const url = `https://www.gray-law.com/wi/${county.toLowerCase()}-county-sheriff-sales`;
      const res = await fetchWithRetry(url);
      if (!res.ok) continue;
      
      const html = await res.text();
      const $ = cheerio.load(html);
      
      $("table tr, .property-listing, .sale-item").each((_, el) => {
        const cells = $(el).find("td");
        if (cells.length >= 3) {
          const caseNum = $(cells[0]).text().trim();
          const address = $(cells[1]).text().trim();
          const saleDate = $(cells[2]).text().trim();
          const amount = $(cells[3])?.text().trim();
          const plaintiff = $(cells[4])?.text().trim();
          
          if (!caseNum || caseNum === "Case #" || caseNum === "Case Number") return;
          
          leads.push({
            id: makeId(county, STATE, "Sheriff Sale", caseNum),
            county,
            state: STATE,
            lead_type: "Sheriff Sale",
            owner_name: null,
            address: address || null,
            city: null,
            zip: null,
            mailing_address: null,
            mailing_city: null,
            mailing_state: null,
            mailing_zip: null,
            case_number: caseNum,
            filing_date: formatDate(fromDate),
            assessed_value: null,
            tax_year: null,
            lender: plaintiff || null,
            loan_amount: null,
            sale_date: formatDate(saleDate),
            sale_amount: amount || null,
            description: `${county} County Sheriff Sale — ${caseNum}`,
            source_url: url,
            raw_data: JSON.stringify({ caseNum, address, saleDate, amount, plaintiff }),
          });
        }
      });
    }
    
    // Also check county sheriff sites directly
    const sheriffUrls: Record<string, string> = {
      "Dane": "https://www.danesheriff.com/civil-process/sheriff-sales",
      "Rock": "https://www.co.rock.wi.us/departments/sheriff/civil-process",
      "Door": "https://www.co.door.wi.gov/sheriff/civil-process",
    };
    
    for (const [county, url] of Object.entries(sheriffUrls)) {
      try {
        const res = await fetchWithRetry(url);
        if (!res.ok) continue;
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
            id: makeId(county, STATE, "Sheriff Sale", caseNum + "-direct"),
            county,
            state: STATE,
            lead_type: "Sheriff Sale",
            owner_name: null,
            address: address || null,
            city: null,
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
            description: `${county} County Sheriff Sale`,
            source_url: url,
            raw_data: JSON.stringify({ caseNum, address, saleDate }),
          });
        });
      } catch { /* skip */ }
    }
  } catch (e) {
    console.error(`[WI] Sheriff sales error:`, e);
  }
  return leads;
}

// ─── TAX DELINQUENT ───────────────────────────────────────────────────────────
async function scrapeWITaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  
  const taxUrls: Record<string, string> = {
    "Dane": "https://www.countyofdane.com/treasurer/delinquent-taxes",
    "Rock": "https://www.co.rock.wi.us/departments/treasurer/delinquent-tax-list",
    "Door": "https://www.co.door.wi.gov/treasurer/delinquent-taxes",
  };
  
  for (const [county, url] of Object.entries(taxUrls)) {
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      
      // Look for table data or downloadable lists
      $("table tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const parcel = $(cells[0]).text().trim();
        const owner = $(cells[1]).text().trim();
        const address = $(cells[2])?.text().trim();
        const amount = $(cells[3])?.text().trim();
        
        if (!parcel || parcel === "Parcel" || !owner) return;
        
        leads.push({
          id: makeId(county, STATE, "Tax Delinquent", parcel),
          county,
          state: STATE,
          lead_type: "Tax Delinquent",
          owner_name: owner || null,
          address: address || null,
          city: null,
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
      
      // Also grab any downloadable PDF/CSV links
      $("a[href*='delinquent'], a[href*='.pdf'], a[href*='.csv']").each((_, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().trim();
        if (!href) return;
        leads.push({
          id: makeId(county, STATE, "Tax Delinquent", href),
          county,
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
          description: `${county} County Tax Delinquent List — ${text}`,
          source_url: href.startsWith("http") ? href : `https://www.countyofdane.com${href}`,
          raw_data: JSON.stringify({ text }),
        });
      });
    } catch { /* skip */ }
  }
  return leads;
}

// ─── MADISON CRAIGSLIST FSBO ──────────────────────────────────────────────────
async function scrapeMadisonFSBO(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://madison.craigslist.org/search/rea?query=for+sale+by+owner&srchType=A`;
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
      let county = "Dane";
      if (locLower.includes("janesville") || locLower.includes("beloit") || locLower.includes("rock")) county = "Rock";
      else if (locLower.includes("door") || locLower.includes("sturgeon bay")) county = "Door";
      
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
        source_url: link?.startsWith("http") ? link : `https://madison.craigslist.org${link}`,
        raw_data: JSON.stringify({ title, price, location }),
      });
    });
  } catch (e) {
    console.error(`[WI] Craigslist FSBO error:`, e);
  }
  return leads;
}

// ─── OBITUARIES ──────────────────────────────────────────────────────────────
async function scrapeWIObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://www.legacy.com/us/obituaries/madison/browse?dateRange=last30Days&countryId=1&regionId=50`; // WI
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
        id: makeId("Dane", STATE, "Obituary", name, date),
        county: "Dane",
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
    console.error(`[WI] Obituaries error:`, e);
  }
  return leads;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export async function scrapeAll(fromDate: string, toDate: string): Promise<Lead[]> {
  const results = await Promise.allSettled([
    // Dane County WCCA
    scrapeWCCA("Dane", "FC", fromDate, toDate),
    scrapeWCCA("Dane", "PR", fromDate, toDate),
    // Rock County WCCA
    scrapeWCCA("Rock", "FC", fromDate, toDate),
    scrapeWCCA("Rock", "PR", fromDate, toDate),
    // Door County WCCA
    scrapeWCCA("Door", "FC", fromDate, toDate),
    scrapeWCCA("Door", "PR", fromDate, toDate),
    // Sheriff sales all counties
    scrapeWISheriffSales(fromDate, toDate),
    // Tax delinquent all counties
    scrapeWITaxDelinquent(fromDate, toDate),
    // FSBO
    scrapeMadisonFSBO(fromDate, toDate),
    // Obituaries
    scrapeWIObituaries(fromDate, toDate),
  ]);
  
  return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}
