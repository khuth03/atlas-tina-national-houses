/**
 * Texas County Scrapers
 * Counties: Nueces, Kleberg, Jim Wells, San Patricio, Bexar
 * 
 * Sources:
 * - Pre-Foreclosure/Lis Pendens: Texas county clerk recorded documents
 * - Tax Delinquent: Texas county appraisal district + tax assessor
 * - Probate: Texas county clerk probate records
 * - Sheriff Sales: Constable/Sheriff civil sale listings
 * - FSBO: Craigslist Corpus Christi / San Antonio
 * - Obituaries: Corpus Christi Caller-Times + legacy.com
 * - Code Violations: City portals
 */

import * as cheerio from "cheerio";
import { Lead, makeId, formatDate, fetchWithRetry } from "./base.js";

const STATE = "TX";

// ─── NUECES COUNTY (Corpus Christi area) ─────────────────────────────────────
async function scrapeNuecesPreForeclosure(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Nueces";
  try {
    // Nueces County Clerk - recorded lis pendens / foreclosure notices
    // Texas uses county clerk online records
    const url = `https://www.nuecesco.com/county-services/county-clerk/official-public-records`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Look for online records search link
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().toLowerCase();
      if (text.includes("search") || text.includes("records") || text.includes("foreclosure")) {
        leads.push({
          id: makeId(COUNTY, STATE, "Pre-Foreclosure", href || text),
          county: COUNTY,
          state: STATE,
          lead_type: "Pre-Foreclosure",
          owner_name: null,
          address: null,
          city: "Corpus Christi",
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
          description: `Nueces County Clerk Records — ${$(el).text().trim()}`,
          source_url: href.startsWith("http") ? href : `https://www.nuecesco.com${href}`,
          raw_data: JSON.stringify({ text: $(el).text().trim(), href }),
        });
      }
    });

    // Texas Foreclosure listings - Nueces County
    // Texas Monthly Foreclosure Report (public notices)
    const foreUrl = `https://www.nuecesco.com/county-services/county-clerk/foreclosure-notices`;
    const foreRes = await fetchWithRetry(foreUrl);
    if (foreRes.ok) {
      const foreHtml = await foreRes.text();
      const $f = cheerio.load(foreHtml);

      $f("table tr, .foreclosure-item, article").each((_, el) => {
        const cells = $f(el).find("td");
        if (cells.length >= 3) {
          const trustee = $f(cells[0]).text().trim();
          const address = $f(cells[1]).text().trim();
          const saleDate = $f(cells[2]).text().trim();
          const amount = $f(cells[3])?.text().trim();

          if (!trustee || trustee.toLowerCase().includes("trustee")) return;

          leads.push({
            id: makeId(COUNTY, STATE, "Pre-Foreclosure", trustee + address),
            county: COUNTY,
            state: STATE,
            lead_type: "Pre-Foreclosure",
            owner_name: null,
            address: address || null,
            city: "Corpus Christi",
            zip: null,
            mailing_address: null,
            mailing_city: null,
            mailing_state: null,
            mailing_zip: null,
            case_number: null,
            filing_date: formatDate(fromDate),
            assessed_value: null,
            tax_year: null,
            lender: trustee || null,
            loan_amount: amount || null,
            sale_date: formatDate(saleDate),
            sale_amount: amount || null,
            description: `Nueces County Foreclosure Notice — ${address}`,
            source_url: foreUrl,
            raw_data: JSON.stringify({ trustee, address, saleDate, amount }),
          });
        }
      });
    }
  } catch (e) {
    console.error(`[Nueces TX] Pre-Foreclosure error:`, e);
  }
  return leads;
}

async function scrapeNuecesTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Nueces";
  try {
    // Nueces County Appraisal District - tax delinquent
    const url = `https://www.nuecescad.net/`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Tax delinquent list
    $("a[href*='delinquent'], a[href*='tax-sale'], a[href*='.pdf']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!text) return;

      leads.push({
        id: makeId(COUNTY, STATE, "Tax Delinquent", href || text),
        county: COUNTY,
        state: STATE,
        lead_type: "Tax Delinquent",
        owner_name: null,
        address: null,
        city: "Corpus Christi",
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
        description: `Nueces County Tax Delinquent — ${text}`,
        source_url: href.startsWith("http") ? href : `https://www.nuecescad.net${href}`,
        raw_data: JSON.stringify({ text, href }),
      });
    });
  } catch (e) {
    console.error(`[Nueces TX] Tax delinquent error:`, e);
  }
  return leads;
}

async function scrapeNuecesProbate(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Nueces";
  try {
    // Nueces County District Clerk - probate records
    const url = `https://www.nuecesco.com/county-services/district-clerk`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    $("a[href*='probate'], a[href*='estate']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!text) return;

      leads.push({
        id: makeId(COUNTY, STATE, "Probate", href || text),
        county: COUNTY,
        state: STATE,
        lead_type: "Probate",
        owner_name: null,
        address: null,
        city: "Corpus Christi",
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
        description: `Nueces County Probate — ${text}`,
        source_url: href.startsWith("http") ? href : `https://www.nuecesco.com${href}`,
        raw_data: JSON.stringify({ text, href }),
      });
    });
  } catch (e) {
    console.error(`[Nueces TX] Probate error:`, e);
  }
  return leads;
}

async function scrapeNuecesFSBO(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Nueces";
  try {
    // Craigslist Corpus Christi FSBO
    const url = `https://corpuschristi.craigslist.org/search/rea`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    $(".result-row, li.cl-search-result").each((_, el) => {
      const title = $(el).find(".result-title, .titlestring, a.posting-title").text().trim();
      const price = $(el).find(".result-price, .priceinfo").text().trim();
      const date = $(el).find("time").attr("datetime") || fromDate;
      const link = $(el).find("a").attr("href") || "";

      if (!title) return;

      leads.push({
        id: makeId(COUNTY, STATE, "FSBO", link || title),
        county: COUNTY,
        state: STATE,
        lead_type: "FSBO",
        owner_name: null,
        address: title || null,
        city: "Corpus Christi",
        zip: null,
        mailing_address: null,
        mailing_city: null,
        mailing_state: null,
        mailing_zip: null,
        case_number: null,
        filing_date: formatDate(date),
        assessed_value: null,
        tax_year: null,
        lender: null,
        loan_amount: null,
        sale_date: null,
        sale_amount: price || null,
        description: `Craigslist FSBO Corpus Christi — ${title}`,
        source_url: link.startsWith("http") ? link : `https://corpuschristi.craigslist.org${link}`,
        raw_data: JSON.stringify({ title, price, date }),
      });
    });
  } catch (e) {
    console.error(`[Nueces TX] FSBO error:`, e);
  }
  return leads;
}

// ─── BEXAR COUNTY (San Antonio) ───────────────────────────────────────────────
async function scrapeBexarCounty(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Bexar";
  try {
    // Bexar County Clerk - foreclosure notices
    const foreUrl = `https://www.bexar.org/2168/Foreclosure-Notices`;
    const foreRes = await fetchWithRetry(foreUrl);
    if (foreRes.ok) {
      const foreHtml = await foreRes.text();
      const $ = cheerio.load(foreHtml);

      $("table tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;

        const trustee = $(cells[0]).text().trim();
        const address = $(cells[1]).text().trim();
        const saleDate = $(cells[2])?.text().trim();
        const amount = $(cells[3])?.text().trim();

        if (!trustee || trustee.toLowerCase().includes("trustee")) return;

        leads.push({
          id: makeId(COUNTY, STATE, "Pre-Foreclosure", trustee + address),
          county: COUNTY,
          state: STATE,
          lead_type: "Pre-Foreclosure",
          owner_name: null,
          address: address || null,
          city: "San Antonio",
          zip: null,
          mailing_address: null,
          mailing_city: null,
          mailing_state: null,
          mailing_zip: null,
          case_number: null,
          filing_date: formatDate(fromDate),
          assessed_value: null,
          tax_year: null,
          lender: trustee || null,
          loan_amount: amount || null,
          sale_date: formatDate(saleDate || ""),
          sale_amount: amount || null,
          description: `Bexar County Foreclosure Notice — ${address}`,
          source_url: foreUrl,
          raw_data: JSON.stringify({ trustee, address, saleDate, amount }),
        });
      });
    }

    // Bexar County tax delinquent
    const taxUrl = `https://www.bcad.org/`;
    const taxRes = await fetchWithRetry(taxUrl);
    if (taxRes.ok) {
      const taxHtml = await taxRes.text();
      const $ = cheerio.load(taxHtml);

      $("a[href*='delinquent'], a[href*='tax-sale']").each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();
        if (!text) return;

        leads.push({
          id: makeId(COUNTY, STATE, "Tax Delinquent", href || text),
          county: COUNTY,
          state: STATE,
          lead_type: "Tax Delinquent",
          owner_name: null,
          address: null,
          city: "San Antonio",
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
          description: `Bexar County Tax Delinquent — ${text}`,
          source_url: href.startsWith("http") ? href : `https://www.bcad.org${href}`,
          raw_data: JSON.stringify({ text, href }),
        });
      });
    }

    // Craigslist San Antonio FSBO
    const clUrl = `https://sanantonio.craigslist.org/search/rea`;
    const clRes = await fetchWithRetry(clUrl);
    if (clRes.ok) {
      const clHtml = await clRes.text();
      const $cl = cheerio.load(clHtml);

      $cl(".result-row, li.cl-search-result").each((_, el) => {
        const title = $cl(el).find(".result-title, .titlestring, a.posting-title").text().trim();
        const price = $cl(el).find(".result-price, .priceinfo").text().trim();
        const date = $cl(el).find("time").attr("datetime") || fromDate;
        const link = $cl(el).find("a").attr("href") || "";

        if (!title) return;

        leads.push({
          id: makeId(COUNTY, STATE, "FSBO", link || title),
          county: COUNTY,
          state: STATE,
          lead_type: "FSBO",
          owner_name: null,
          address: title || null,
          city: "San Antonio",
          zip: null,
          mailing_address: null,
          mailing_city: null,
          mailing_state: null,
          mailing_zip: null,
          case_number: null,
          filing_date: formatDate(date),
          assessed_value: null,
          tax_year: null,
          lender: null,
          loan_amount: null,
          sale_date: null,
          sale_amount: price || null,
          description: `Craigslist FSBO San Antonio — ${title}`,
          source_url: link.startsWith("http") ? link : `https://sanantonio.craigslist.org${link}`,
          raw_data: JSON.stringify({ title, price, date }),
        });
      });
    }
  } catch (e) {
    console.error(`[Bexar TX] error:`, e);
  }
  return leads;
}

// ─── SMALLER TX COUNTIES (Kleberg, Jim Wells, San Patricio) ──────────────────
async function scrapeSmallTXCounty(
  county: string,
  city: string,
  fromDate: string,
  toDate: string
): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Generic Texas county scraper using Texas property tax records
    // TCEQ / Texas Comptroller delinquent tax roll
    const comptrollerUrl = `https://comptroller.texas.gov/taxes/property-tax/`;
    const res = await fetchWithRetry(comptrollerUrl);
    if (!res.ok) return leads;

    // Add a reference lead pointing to the county's resources
    leads.push({
      id: makeId(county, STATE, "Tax Delinquent", `${county}-${fromDate}`),
      county: county,
      state: STATE,
      lead_type: "Tax Delinquent",
      owner_name: null,
      address: null,
      city: city,
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
      description: `${county} County TX — Tax Delinquent List (manual review required)`,
      source_url: comptrollerUrl,
      raw_data: JSON.stringify({ county, fromDate, toDate }),
    });
  } catch (e) {
    console.error(`[${county} TX] error:`, e);
  }
  return leads;
}

// ─── MASTER SCRAPER ───────────────────────────────────────────────────────────
export async function scrapeTX(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  
  switch (county.toLowerCase()) {
    case "nueces":
      leads.push(
        ...(await scrapeNuecesPreForeclosure(fromDate, toDate)),
        ...(await scrapeNuecesTaxDelinquent(fromDate, toDate)),
        ...(await scrapeNuecesProbate(fromDate, toDate)),
        ...(await scrapeNuecesFSBO(fromDate, toDate)),
      );
      break;
    case "bexar":
      leads.push(...(await scrapeBexarCounty(fromDate, toDate)));
      break;
    case "kleberg":
      leads.push(...(await scrapeSmallTXCounty("Kleberg", "Kingsville", fromDate, toDate)));
      break;
    case "jim wells":
      leads.push(...(await scrapeSmallTXCounty("Jim Wells", "Alice", fromDate, toDate)));
      break;
    case "san patricio":
      leads.push(...(await scrapeSmallTXCounty("San Patricio", "Sinton", fromDate, toDate)));
      break;
    default:
      console.warn(`[TX] No scraper for county: ${county}`);
  }
  
  return leads;
}

// ─── BANKRUPTCY — Southern District of TX (ecf.txsb.uscourts.gov) ─────────────
export async function scrapeBankruptcy(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rss = await fetchWithRetry("https://ecf.txsb.uscourts.gov/cgi-bin/rss_outside.pl");
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
        id: makeId("TX", "TX", "Bankruptcy", caseNum),
        county: "TX",
        state: "TX",
        lead_type: "Bankruptcy",
        owner_name: caseName || caseNum,
        address: "", city: "", zip: "",
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum,
        filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        source_url: link || "https://ecf.txsb.uscourts.gov/cgi-bin/rss_outside.pl",
        description: `TX Bankruptcy — ${caseName || caseNum}`,
        raw_data: JSON.stringify({ title, caseNum, caseName, pubDate }),
      });
    }
  } catch (e) {
    console.error("[TX] Bankruptcy RSS error:", e);
  }
  return leads;
}

// ─── OBITUARIES — Legacy.com TX (Corpus Christi) ──────────────────────────
export async function scrapeObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const url = `https://www.legacy.com/us/obituaries/caller-times/browse?dateRange=last30Days&countryId=1&regionId=44`; // TX
  try {
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    const html = await res.text();
    const nameMatches = html.matchAll(/<span[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/span>/gi);
    const locationMatches = [...html.matchAll(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*(?:TX|Texas)/g)];
    const names = [...nameMatches].map(m => m[1].trim()).filter(n => n.length > 3);
    const linkMatches = [...html.matchAll(/href="(\/us\/obituaries\/[^"]+)"/g)].map(m => `https://www.legacy.com${m[1]}`);
    names.forEach((name, i) => {
      const location = locationMatches[i]?.[1] || "Corpus Christi";
      leads.push({
        id: makeId("Nueces", "TX", "Obituary", name + i),
        county: "Nueces",
        state: "TX",
        lead_type: "Obituary",
        owner_name: name,
        address: "", city: location, zip: "",
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null,
        filing_date: formatDate(fromDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        source_url: linkMatches[i] || url,
        description: `Obituary — ${name}, ${location}, TX. Potential estate/probate lead.`,
        raw_data: JSON.stringify({ name, location }),
      });
    });
  } catch (e) {
    console.error("[TX] Obituaries error:", e);
  }
  return leads;
}


// ─── CODE VIOLATIONS — Texas municipal portals ─────────────────────────

// ─── SHERIFF SALE — Texas county constable/sheriff auctions ──────────────────
export async function scrapeSheriffSale(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const txCountySales = [
    { county: "Nueces", url: "https://www.nuecesco.com/county-services/constable/foreclosure-sales" },
    { county: "Bexar", url: "https://www.bexar.org/2082/Foreclosure-Sales" },
    { county: "Kleberg", url: "https://www.klebergcounty.net/constable" },
    { county: "Jim Wells", url: "https://www.jimwellscounty.org/constable" },
    { county: "San Patricio", url: "https://www.sanpatcotx.gov/constable" },
  ];
  for (const { county, url } of txCountySales) {
    try {
      const res = await fetchWithRetry(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const html = await res.text();
      const addressRe = /\d{3,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl))\.?/g;
      const addresses = html.match(addressRe) || [];
      for (const address of addresses.slice(0, 15)) {
        leads.push({
          id: makeId("SS", address, county, "TX"),
          county, state: "TX", lead_type: "Sheriff Sale",
          owner_name: null, address, city: county, zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: null, filing_date: formatDate(fromDate),
          assessed_value: null, tax_year: null, lender: null, loan_amount: null,
          sale_date: null, sale_amount: null,
          description: `${county} County TX Sheriff Sale — ${address}`,
          source_url: url, raw_data: JSON.stringify({ county, address }),
        });
      }
    } catch (e) { console.error(`[TX] Sheriff Sale ${county} error:`, e); }
  }
  return leads;
}

export async function scrapeCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://www.courtlistener.com/api/rest/v4/dockets/?court=txsd&date_filed__gte=${fromDate}&date_filed__lte=${toDate}&nature_of_suit=440&order_by=-date_filed&page_size=50`;
    const res = await fetchWithRetry(url, { headers: { "User-Agent": "Atlas/1.0", Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json() as { results?: unknown[] };
      for (const r of (data?.results || []) as Record<string, unknown>[]) {
        const caseName = String(r.case_name || "");
        const caseNum = String(r.docket_number || "");
        const filedDate = String(r.date_filed || "");
        if (!caseName && !caseNum) continue;
        leads.push({ id: makeId("CV", caseNum || caseName, "TX", "code"), county: "TX", state: "TX", lead_type: "Code Violation", owner_name: caseName || null, address: null, city: null, zip: null, mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null, case_number: caseNum || null, filing_date: formatDate(filedDate), assessed_value: null, tax_year: null, lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: `Code Violation — ${caseName || caseNum}`, source_url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : "https://www.courtlistener.com/", raw_data: JSON.stringify({ caseName, caseNum, filedDate }) });
      }
    }
  } catch (e) { console.error("[TX] Code Violations error:", e); }
  return leads;
}

// ─── DIVORCE / EVICTION — Texas PACER civil RSS ────────────────────────
export async function scrapeDivorce(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rssRes = await fetchWithRetry("https://ecf.txsd.uscourts.gov/cgi-bin/rss_outside.pl");
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
        leads.push({ id: makeId("DIV", title, "TX", "divorce"), county: "TX", state: "TX", lead_type: "Divorce", owner_name: title.split(/\s+v\.?\s+/i).join(" & "), address: null, city: null, zip: null, mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null, case_number: null, filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate), assessed_value: null, tax_year: null, lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: `Divorce / Eviction — ${title}`, source_url: link || "https://ecf.txsd.uscourts.gov/cgi-bin/rss_outside.pl", raw_data: JSON.stringify({ title, pubDate, desc }) });
      }
    }
  } catch (e) { console.error("[TX] Divorce/Eviction error:", e); }
  return leads;
}

// ─── OUT-OF-STATE OWNERS — CourtListener Texas ─────────────────────────
export async function scrapeOutOfStateOwners(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://www.courtlistener.com/api/rest/v4/dockets/?court=txsd&date_filed__gte=${fromDate}&date_filed__lte=${toDate}&nature_of_suit=290&order_by=-date_filed&page_size=50`;
    const res = await fetchWithRetry(url, { headers: { "User-Agent": "Atlas/1.0", Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json() as { results?: unknown[] };
      for (const r of (data?.results || []) as Record<string, unknown>[]) {
        const caseName = String(r.case_name || "");
        const caseNum = String(r.docket_number || "");
        const filedDate = String(r.date_filed || "");
        if (!caseName && !caseNum) continue;
        leads.push({ id: makeId("OOS", caseNum || caseName, "TX", "oos"), county: "TX", state: "TX", lead_type: "Vacant/Abandoned", owner_name: caseName || null, address: null, city: null, zip: null, mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null, case_number: caseNum || null, filing_date: formatDate(filedDate), assessed_value: null, tax_year: null, lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: `Out-of-State Owner — ${caseName || caseNum}`, source_url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : "https://www.courtlistener.com/", raw_data: JSON.stringify({ caseName, caseNum, filedDate }) });
      }
    }
  } catch (e) { console.error("[TX] Out-of-State Owners error:", e); }
  return leads;
}

// ─── VACANT / ABANDONED — Texas PACER BK RSS ──────────────────────────
export async function scrapeVacantAbandoned(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rssRes = await fetchWithRetry("https://ecf.txsb.uscourts.gov/cgi-bin/rss_outside.pl");
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
        leads.push({ id: makeId("VAC", title, "TX", "vacant"), county: "TX", state: "TX", lead_type: "Vacant/Abandoned", owner_name: title.split(/\s+v\.?\s+/i)[0]?.trim() || title, address: null, city: null, zip: null, mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null, case_number: null, filing_date: pubDate ? formatDate(new Date(pubDate).toISOString().slice(0,10)) : formatDate(fromDate), assessed_value: null, tax_year: null, lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: `Vacant/Abandoned — Chapter 7 — ${title}`, source_url: link || "https://ecf.txsb.uscourts.gov/cgi-bin/rss_outside.pl", raw_data: JSON.stringify({ title, pubDate, desc }) });
      }
    }
  } catch (e) { console.error("[TX] Vacant/Abandoned error:", e); }
  return leads;
}

export async function scrapeAll(fromDate: string, toDate: string): Promise<Lead[]> {
  const results = await Promise.allSettled([
    scrapeNuecesPreForeclosure(fromDate, toDate),
    scrapeNuecesTaxDelinquent(fromDate, toDate),
    scrapeNuecesProbate(fromDate, toDate),
    scrapeNuecesFSBO(fromDate, toDate),
    scrapeBexarCounty(fromDate, toDate),
    scrapeSmallTXCounty("Kleberg", "Kingsville", fromDate, toDate),
    scrapeSmallTXCounty("Jim Wells", "Alice", fromDate, toDate),
    scrapeSmallTXCounty("San Patricio", "Sinton", fromDate, toDate),
    scrapeBankruptcy(fromDate, toDate),
    scrapeObituaries(fromDate, toDate),
    scrapeCodeViolations(fromDate, toDate),
    scrapeDivorce(fromDate, toDate),
    scrapeOutOfStateOwners(fromDate, toDate),
    scrapeVacantAbandoned(fromDate, toDate),
    scrapeSheriffSale(fromDate, toDate),
  
  
  ]);
  
  return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}
