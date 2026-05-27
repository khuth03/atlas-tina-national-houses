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

// ─── BANKRUPTCY — Eastern District of WI (ecf.wieb.uscourts.gov) ─────────────

// ─── PRE-FORECLOSURE — Wisconsin WCCA civil filings ──────────────────────────
export async function scrapePreForeclosure(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // WCCA public records - foreclosure filings (case type FC)
    const url = `https://wcca.wicourts.gov/jsonPost/searchCases?countyNo=${encodeURIComponent(county)}&caseType=FC&dateOfFilingStart=${fromDate}&dateOfFilingEnd=${toDate}&recordsPerPage=25`;
    const res = await fetchWithRetry(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json() as { cases?: unknown[] };
      for (const c of (data?.cases || []) as Record<string, unknown>[]) {
        const parties = (c.parties as Record<string, unknown>[]) || [];
        const defendant = parties.find((p: Record<string, unknown>) => String(p.partyTypeCode || "").includes("D"));
        const ownerName = defendant ? String(defendant.fullName || "") : "";
        const caseNum = String(c.caseNo || "");
        const filedDate = String(c.filingDate || "");
        leads.push({
          id: makeId("PREFC", caseNum, county, "WI"),
          county, state: "WI",
          lead_type: "Pre-Foreclosure",
          owner_name: ownerName || null,
          address: null, city: county, zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: caseNum,
          filing_date: formatDate(filedDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `${county} County WI Pre-Foreclosure — ${caseNum}`,
          source_url: "https://wcca.wicourts.gov/",
          raw_data: JSON.stringify(c),
        });
      }
    }
  } catch (e) {
    console.error(`[WI] Pre-Foreclosure ${county} error:`, e);
  }
  return leads;
}

export async function scrapeBankruptcy(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rss = await fetchWithRetry("https://ecf.wieb.uscourts.gov/cgi-bin/rss_outside.pl");
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
        id: makeId("WI", STATE, "Bankruptcy", caseNum),
        county: "WI",
        state: STATE,
        lead_type: "Bankruptcy",
        owner_name: caseName || caseNum,
        address: "",
        city: "",
        zip: "",
        filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate),
        source_url: link || "https://ecf.wieb.uscourts.gov/cgi-bin/rss_outside.pl",
        description: `WI Bankruptcy — ${caseName || caseNum}`,
        raw_data: JSON.stringify({ title, caseNum, caseName, pubDate }),
      });
    }
  } catch (e) {
    console.error("[WI] Bankruptcy RSS error:", e);
  }
  return leads;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

// ─── CODE VIOLATIONS — Wisconsin municipal portals ─────────────────────────
export async function scrapeCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://www.courtlistener.com/api/rest/v4/dockets/?court=wied&date_filed__gte=${fromDate}&date_filed__lte=${toDate}&nature_of_suit=440&order_by=-date_filed&page_size=50`;
    const res = await fetchWithRetry(url, { headers: { "User-Agent": "Atlas/1.0", Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json() as { results?: unknown[] };
      for (const r of (data?.results || []) as Record<string, unknown>[]) {
        const caseName = String(r.case_name || "");
        const caseNum = String(r.docket_number || "");
        const filedDate = String(r.date_filed || "");
        if (!caseName && !caseNum) continue;
        leads.push({ id: makeId("CV", caseNum || caseName, "WI", "code"), county: "WI", state: "WI", lead_type: "Code Violation", owner_name: caseName || null, address: null, city: null, zip: null, mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null, case_number: caseNum || null, filing_date: formatDate(filedDate), assessed_value: null, tax_year: null, lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: `Code Violation — ${caseName || caseNum}`, source_url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : "https://www.courtlistener.com/", raw_data: JSON.stringify({ caseName, caseNum, filedDate }) });
      }
    }
  } catch (e) { console.error("[WI] Code Violations error:", e); }
  return leads;
}

// ─── DIVORCE / EVICTION — Wisconsin PACER civil RSS ────────────────────────
export async function scrapeDivorce(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rssRes = await fetchWithRetry("https://ecf.wied.uscourts.gov/cgi-bin/rss_outside.pl");
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
        leads.push({ id: makeId("DIV", title, "WI", "divorce"), county: "WI", state: "WI", lead_type: "Divorce", owner_name: title.split(/\s+v\.?\s+/i).join(" & "), address: null, city: null, zip: null, mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null, case_number: null, filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate), assessed_value: null, tax_year: null, lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: `Divorce / Eviction — ${title}`, source_url: link || "https://ecf.wied.uscourts.gov/cgi-bin/rss_outside.pl", raw_data: JSON.stringify({ title, pubDate, desc }) });
      }
    }
  } catch (e) { console.error("[WI] Divorce/Eviction error:", e); }
  return leads;
}

// ─── OUT-OF-STATE OWNERS — CourtListener Wisconsin ─────────────────────────
export async function scrapeOutOfStateOwners(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://www.courtlistener.com/api/rest/v4/dockets/?court=wied&date_filed__gte=${fromDate}&date_filed__lte=${toDate}&nature_of_suit=290&order_by=-date_filed&page_size=50`;
    const res = await fetchWithRetry(url, { headers: { "User-Agent": "Atlas/1.0", Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json() as { results?: unknown[] };
      for (const r of (data?.results || []) as Record<string, unknown>[]) {
        const caseName = String(r.case_name || "");
        const caseNum = String(r.docket_number || "");
        const filedDate = String(r.date_filed || "");
        if (!caseName && !caseNum) continue;
        leads.push({ id: makeId("OOS", caseNum || caseName, "WI", "oos"), county: "WI", state: "WI", lead_type: "Vacant/Abandoned", owner_name: caseName || null, address: null, city: null, zip: null, mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null, case_number: caseNum || null, filing_date: formatDate(filedDate), assessed_value: null, tax_year: null, lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: `Out-of-State Owner — ${caseName || caseNum}`, source_url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : "https://www.courtlistener.com/", raw_data: JSON.stringify({ caseName, caseNum, filedDate }) });
      }
    }
  } catch (e) { console.error("[WI] Out-of-State Owners error:", e); }
  return leads;
}

// ─── VACANT / ABANDONED — Wisconsin PACER BK RSS ──────────────────────────
export async function scrapeVacantAbandoned(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rssRes = await fetchWithRetry("https://ecf.wieb.uscourts.gov/cgi-bin/rss_outside.pl");
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
        if (!lower.includes("chapter 7") && !lower.includes("vacant") && !lower.includes("abandon")) continue;
        leads.push({ id: makeId("VAC", title, "WI", "vacant"), county: "WI", state: "WI", lead_type: "Vacant/Abandoned", owner_name: title.split(/\s+v\.?\s+/i)[0]?.trim() || title, address: null, city: null, zip: null, mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null, case_number: null, filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate), assessed_value: null, tax_year: null, lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: `Vacant/Abandoned — Chapter 7 — ${title}`, source_url: link || "https://ecf.wieb.uscourts.gov/cgi-bin/rss_outside.pl", raw_data: JSON.stringify({ title, pubDate, desc }) });
      }
    }
  } catch (e) { console.error("[WI] Vacant/Abandoned error:", e); }
  return leads;
}

export async function scrapeAll(fromDate: string, toDate: string): Promise<Lead[]> {
  const results = await Promise.allSettled([
    scrapePreForeclosure("Dane", fromDate, toDate),
    scrapePreForeclosure("Rock", fromDate, toDate),
    scrapePreForeclosure("Door", fromDate, toDate),
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
    // Bankruptcy
    scrapeBankruptcy(fromDate, toDate),
    scrapeCodeViolations(fromDate, toDate),
    scrapeDivorce(fromDate, toDate),
    scrapeOutOfStateOwners(fromDate, toDate),
    scrapeVacantAbandoned(fromDate, toDate),
  
  
  ]);

  return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}
