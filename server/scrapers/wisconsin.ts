/**
 * Wisconsin County Scrapers
 * Counties: Dane, Rock, Door
 *
 * Lead Sources (all public, no login required):
 * - Sheriff Sales (Foreclosure):
 *     Dane:  https://www.danesheriff.com/Sales
 *     Rock:  https://www.co.rock.wi.us/departments/sheriff/civil-process/foreclosure-sales
 *     Door:  https://www.co.door.wi.gov/sheriff/foreclosure-sales
 * - Tax Delinquent:
 *     Dane:  https://treasurer.danecounty.gov/ (delinquent list)
 *     Rock:  https://www.co.rock.wi.us/departments/treasurer/delinquent-tax-list
 *     Door:  https://www.co.door.wi.gov/treasurer/delinquent-taxes
 * - Probate (WCCA):
 *     POST https://wcca.wicourts.gov/jsonPost/advancedCaseSearch
 *     caseType=PR, countyNo=13/56/15, caseNoFrom/To by year
 * - Obituaries: legacy.com (WI region)
 * - FSBO: Craigslist Madison
 */

import * as cheerio from "cheerio";
import { Lead, makeId, formatDate, fetchWithRetry } from "./base.js";

const STATE = "WI";

const COUNTY_CODES: Record<string, string> = {
  Dane: "13",
  Rock: "56",
  Door: "15",
};

// ─── SHERIFF SALES (Foreclosure) ─────────────────────────────────────────────
async function scrapeSheriffSales(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];

  const urls: Record<string, string> = {
    Dane: "https://www.danesheriff.com/Sales",
    Rock: "https://www.co.rock.wi.us/departments/sheriff/civil-process/foreclosure-sales",
    Door: "https://www.co.door.wi.gov/sheriff/foreclosure-sales",
  };

  const url = urls[county];
  if (!url) return leads;

  try {
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Detect table header to determine column order
    let colMap = { caseNum: 0, address: 1, saleDate: 2, amount: 3, plaintiff: 4 };
    $("table tr").first().find("th, td").each((i, el) => {
      const h = $(el).text().trim().toLowerCase();
      if (h.includes("case")) colMap.caseNum = i;
      else if (h.includes("address") || h.includes("property")) colMap.address = i;
      else if (h.includes("sale date") || h.includes("date")) colMap.saleDate = i;
      else if (h.includes("amount") || h.includes("price")) colMap.amount = i;
      else if (h.includes("plaintiff") || h.includes("lender") || h.includes("status")) colMap.plaintiff = i;
    });

    // Most WI county sheriff sale pages list properties in tables or definition lists
    $("table tr, .sale-item, .property-row, article, .listing").each((_, el) => {
      const text = $(el).text().trim();
      if (!text || text.length < 10) return;

      const cells = $(el).find("td");
      if (cells.length >= 2) {
        const caseNum = $(cells[colMap.caseNum]).text().trim();
        const address = $(cells[colMap.address]).text().trim();
        const saleDate = $(cells[colMap.saleDate])?.text().trim() || "";
        const amount = $(cells[colMap.amount])?.text().trim() || "";
        const plaintiff = $(cells[colMap.plaintiff])?.text().trim() || "";

        if (!caseNum || /^(case|#|no\.|details|view)/i.test(caseNum)) return;

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
          description: `${county} County Sheriff Sale — Case ${caseNum}`,
          source_url: url,
          raw_data: JSON.stringify({ caseNum, address, saleDate, amount, plaintiff }),
        });
      }
    });

    // Also grab any linked PDFs or CSV files with sale listings
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const linkText = $(el).text().trim();
      if (
        (href.includes(".pdf") || href.includes(".csv") || href.includes("sale")) &&
        (linkText.toLowerCase().includes("sale") || linkText.toLowerCase().includes("foreclosure") || linkText.toLowerCase().includes("list"))
      ) {
        const fullHref = href.startsWith("http") ? href : `https://www.danesheriff.com${href}`;
        leads.push({
          id: makeId(county, STATE, "Sheriff Sale", href),
          county,
          state: STATE,
          lead_type: "Sheriff Sale",
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
          tax_year: null,
          lender: null,
          loan_amount: null,
          sale_date: null,
          sale_amount: null,
          description: `${county} County Sheriff Sale List — ${linkText}`,
          source_url: fullHref,
          raw_data: JSON.stringify({ linkText, href }),
        });
      }
    });
  } catch (e) {
    console.error(`[${county} WI] Sheriff Sales error:`, e);
  }
  return leads;
}

// ─── TAX DELINQUENT ───────────────────────────────────────────────────────────
async function scrapeTaxDelinquent(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];

  const urls: Record<string, string> = {
    Dane: "https://treasurer.danecounty.gov/delinquent",
    Rock: "https://www.co.rock.wi.us/departments/treasurer/delinquent-tax-list",
    Door: "https://www.co.door.wi.gov/treasurer/delinquent-taxes",
  };

  const fallbackUrls: Record<string, string> = {
    Dane: "https://www.countyofdane.com/treasurer/delinquent-taxes",
    Rock: "https://www.co.rock.wi.us/departments/treasurer",
    Door: "https://www.co.door.wi.gov/treasurer",
  };

  for (const url of [urls[county], fallbackUrls[county]].filter(Boolean)) {
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      // Parse table rows
      $("table tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const parcel = $(cells[0]).text().trim();
        const owner = $(cells[1]).text().trim();
        const address = $(cells[2])?.text().trim() || "";
        const amount = $(cells[3])?.text().trim() || "";

        if (!parcel || /^(parcel|id|#)/i.test(parcel) || !owner) return;

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
          description: `Tax Delinquent — ${owner}, Parcel ${parcel}`,
          source_url: url,
          raw_data: JSON.stringify({ parcel, owner, address, amount }),
        });
      });

      // Grab downloadable delinquent list links
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        const linkText = $(el).text().trim();
        if (
          (href.includes(".pdf") || href.includes(".csv") || href.includes(".xlsx")) &&
          (linkText.toLowerCase().includes("delinquent") || linkText.toLowerCase().includes("tax") || linkText.toLowerCase().includes("list"))
        ) {
          const fullHref = href.startsWith("http") ? href : `${url}${href}`;
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
            description: `${county} County Tax Delinquent List — ${linkText}`,
            source_url: fullHref,
            raw_data: JSON.stringify({ linkText, href }),
          });
        }
      });

      if (leads.length > 0) break; // got data, no need to try fallback
    } catch { /* try next URL */ }
  }
  return leads;
}

// ─── PROBATE (WCCA) ───────────────────────────────────────────────────────────
// WCCA probate cases can be pulled by case number range (year + PR + sequence)
async function scrapeProbate(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const countyCode = COUNTY_CODES[county];
  if (!countyCode) return leads;

  const year = new Date().getFullYear();

  try {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Referer": "https://wcca.wicourts.gov/advanced.html",
      "Origin": "https://wcca.wicourts.gov",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    // WCCA requires a non-empty lastName (min 2 chars combined with firstName = 3).
    // Using a common last name returns ALL probate cases via WCCA's broad party search.
    const payload = {
      countyNo: parseInt(countyCode),
      caseType: "PR",
      lastName: "Johnson",
      firstName: "",
      filingDateFrom: fromDate.substring(0, 10),
      filingDateTo: toDate.substring(0, 10),
      recordsPerPage: 500,
      offset: 0,
      includeMissingDob: true,
      includeMissingMiddleName: true,
    };

    const res = await fetchWithRetry("https://wcca.wicourts.gov/jsonPost/advancedCaseSearch", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) return leads;

    const data = await res.json() as { result?: { cases?: Array<Record<string, string>> }; cases?: Array<Record<string, string>> };
    const cases = data?.result?.cases || data?.cases || [];
    for (const c of cases) {
      // Skip if no case number
      if (!c.caseNo) continue;

      leads.push({
        id: makeId(county, STATE, "Probate", c.caseNo),
        county,
        state: STATE,
        lead_type: "Probate",
        owner_name: c.partyName || c.caption || null,
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
        lender: null,
        loan_amount: null,
        sale_date: null,
        sale_amount: null,
        description: `Probate — ${c.caption || c.partyName || c.caseNo}`,
        source_url: `https://wcca.wicourts.gov/caseDetail.html?caseNo=${c.caseNo}&countyNo=${countyCode}`,
        raw_data: JSON.stringify(c),
      });
    }
  } catch (e) {
    console.error(`[${county} WI] Probate error:`, e);
  }
  return leads;
}

// ─── OBITUARIES (legacy.com) ─────────────────────────────────────────────────
async function scrapeObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // legacy.com Wisconsin obituaries
    const url = "https://www.legacy.com/us/obituaries/madison/browse?dateRange=last30Days&countryId=1&regionId=50";
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    $("li[data-obit-id], .obit-listing, article.obit, .Obituary").each((_, el) => {
      const name = $(el).find("h3, .name, .obit-name, [class*='Name']").first().text().trim();
      const location = $(el).find(".location, .city, [class*='Location']").first().text().trim();
      const date = $(el).find("time").attr("datetime") || $(el).find(".date, [class*='Date']").first().text().trim();
      const link = $(el).find("a").first().attr("href");

      if (!name) return;

      const county = location.toLowerCase().includes("janesville") || location.toLowerCase().includes("beloit") ? "Rock"
        : location.toLowerCase().includes("door") || location.toLowerCase().includes("sturgeon bay") ? "Door"
        : "Dane";

      leads.push({
        id: makeId(county, STATE, "Obituary", name + (date || "")),
        county,
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
        description: `Obituary — ${name}${location ? `, ${location}` : ""}. Potential estate/probate lead.`,
        source_url: link?.startsWith("http") ? link : `https://www.legacy.com${link || ""}`,
        raw_data: JSON.stringify({ name, location, date }),
      });
    });
  } catch (e) {
    console.error(`[WI] Obituaries error:`, e);
  }
  return leads;
}

// ─── FSBO (Craigslist Madison) ────────────────────────────────────────────────
async function scrapeFSBO(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = "https://madison.craigslist.org/search/rea?query=for+sale+by+owner&srchType=A";
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    $("li.result-row, .cl-search-result, .result").each((_, el) => {
      const title = $(el).find(".result-title, .title-anchor, a.posting-title").first().text().trim();
      const price = $(el).find(".result-price, .priceinfo").first().text().trim();
      const date = $(el).find("time").attr("datetime") || "";
      const link = $(el).find("a").first().attr("href") || "";
      const location = $(el).find(".result-hood, .supertitle").first().text().trim().replace(/[()]/g, "");

      if (!title) return;

      const county = location.toLowerCase().includes("janesville") || location.toLowerCase().includes("beloit") ? "Rock"
        : location.toLowerCase().includes("door") || location.toLowerCase().includes("sturgeon bay") ? "Door"
        : "Dane";

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
        source_url: link.startsWith("http") ? link : `https://madison.craigslist.org${link}`,
        raw_data: JSON.stringify({ title, price, location }),
      });
    });
  } catch (e) {
    console.error(`[WI] FSBO error:`, e);
  }
  return leads;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export async function scrapeAll(fromDate: string, toDate: string): Promise<Lead[]> {
  const results = await Promise.allSettled([
    // Sheriff Sales (Foreclosure) — all 3 counties
    scrapeSheriffSales("Dane", fromDate, toDate),
    scrapeSheriffSales("Rock", fromDate, toDate),
    scrapeSheriffSales("Door", fromDate, toDate),
    // Tax Delinquent — all 3 counties
    scrapeTaxDelinquent("Dane", fromDate, toDate),
    scrapeTaxDelinquent("Rock", fromDate, toDate),
    scrapeTaxDelinquent("Door", fromDate, toDate),
    // Probate (WCCA) — all 3 counties
    scrapeProbate("Dane", fromDate, toDate),
    scrapeProbate("Rock", fromDate, toDate),
    scrapeProbate("Door", fromDate, toDate),
    // Obituaries
    scrapeObituaries(fromDate, toDate),
    // FSBO
    scrapeFSBO(fromDate, toDate),
  ]);

  return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}
