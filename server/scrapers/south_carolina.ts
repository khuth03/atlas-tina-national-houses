/**
 * South Carolina County Scrapers
 * Counties: Horry, Georgetown, Marion
 * 
 * Sources:
 * - Pre-Foreclosure/Lis Pendens: SC Judicial Department (JCMS) + county clerk of court
 * - Tax Delinquent: SC SCDOR + county treasurer portals
 * - Probate: SC Probate Court records
 * - Sheriff Sales: County Sheriff civil sale listings
 * - FSBO: Craigslist Myrtle Beach / Florence
 * - Obituaries: Myrtle Beach Sun News + legacy.com
 * - Code Violations: City/county portals
 */

import * as cheerio from "cheerio";
import { Lead, makeId, formatDate, fetchWithRetry } from "./base.js";

const STATE = "SC";

// ─── HORRY COUNTY (Myrtle Beach area) ────────────────────────────────────────
async function scrapeHorryPreForeclosure(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Horry";
  try {
    // Horry County Clerk of Court - Lis Pendens / Foreclosure filings
    // SC uses JCMS (Judicial Case Management System) - public access
    const url = `https://www.horrycountysc.gov/Departments/Clerk-of-Court`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Look for foreclosure/lis pendens links
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().toLowerCase();
      if (text.includes("foreclosure") || text.includes("lis pendens") || text.includes("civil")) {
        const fullUrl = href.startsWith("http") ? href : `https://www.horrycountysc.gov${href}`;
        leads.push({
          id: makeId(COUNTY, STATE, "Pre-Foreclosure", fullUrl),
          county: COUNTY,
          state: STATE,
          lead_type: "Pre-Foreclosure",
          owner_name: null,
          address: null,
          city: "Myrtle Beach",
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
          description: `Horry County Foreclosure Filing — ${$(el).text().trim()}`,
          source_url: fullUrl,
          raw_data: JSON.stringify({ text: $(el).text().trim(), href }),
        });
      }
    });

    // SC Public Index - search for lis pendens
    const scUrl = `https://publicindex.sccourts.org/Horry/PublicIndex/PISearch.aspx`;
    const scRes = await fetchWithRetry(scUrl);
    if (scRes.ok) {
      const scHtml = await scRes.text();
      const $sc = cheerio.load(scHtml);
      const viewstate = $sc("input[name='__VIEWSTATE']").val() as string;
      const eventvalidation = $sc("input[name='__EVENTVALIDATION']").val() as string;

      if (viewstate) {
        const searchRes = await fetchWithRetry(scUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            "__VIEWSTATE": viewstate,
            "__EVENTVALIDATION": eventvalidation || "",
            "ctl00$ContentPlaceHolder1$ddlCaseType": "FORECLOSURE",
            "ctl00$ContentPlaceHolder1$txtFiledDateFrom": fromDate,
            "ctl00$ContentPlaceHolder1$txtFiledDateTo": toDate,
            "ctl00$ContentPlaceHolder1$btnSearch": "Search",
          }).toString(),
        });

        if (searchRes.ok) {
          const resultHtml = await searchRes.text();
          const $r = cheerio.load(resultHtml);

          $r("table#ctl00_ContentPlaceHolder1_gvResults tr, table.rgMasterTable tr").each((_, row) => {
            const cells = $r(row).find("td");
            if (cells.length < 4) return;

            const caseNum = $r(cells[0]).text().trim();
            const caption = $r(cells[1]).text().trim();
            const filedDate = $r(cells[2]).text().trim();
            const caseType = $r(cells[3]).text().trim();

            if (!caseNum || caseNum === "Case Number") return;

            leads.push({
              id: makeId(COUNTY, STATE, "Pre-Foreclosure", caseNum),
              county: COUNTY,
              state: STATE,
              lead_type: "Pre-Foreclosure",
              owner_name: caption || null,
              address: null,
              city: "Myrtle Beach",
              zip: null,
              mailing_address: null,
              mailing_city: null,
              mailing_state: null,
              mailing_zip: null,
              case_number: caseNum,
              filing_date: formatDate(filedDate),
              assessed_value: null,
              tax_year: null,
              lender: null,
              loan_amount: null,
              sale_date: null,
              sale_amount: null,
              description: `SC Foreclosure — ${caseType} — ${caption}`,
              source_url: scUrl,
              raw_data: JSON.stringify({ caseNum, caption, filedDate, caseType }),
            });
          });
        }
      }
    }
  } catch (e) {
    console.error(`[Horry SC] Pre-Foreclosure error:`, e);
  }
  return leads;
}

async function scrapeHorryTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Horry";
  try {
    // Horry County Treasurer - delinquent tax list
    const url = `https://www.horrycountysc.gov/Departments/Treasurer/Delinquent-Tax`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Look for delinquent tax list download or table
    $("a[href*='delinquent'], a[href*='tax-sale'], a[href*='.pdf'], a[href*='.csv'], a[href*='.xls']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!href) return;

      leads.push({
        id: makeId(COUNTY, STATE, "Tax Delinquent", href),
        county: COUNTY,
        state: STATE,
        lead_type: "Tax Delinquent",
        owner_name: null,
        address: null,
        city: "Myrtle Beach",
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
        description: `Horry County Tax Delinquent — ${text}`,
        source_url: href.startsWith("http") ? href : `https://www.horrycountysc.gov${href}`,
        raw_data: JSON.stringify({ text, href }),
      });
    });

    // Also check the tax sale listing
    $("table tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;
      const parcel = $(cells[0]).text().trim();
      const owner = $(cells[1]).text().trim();
      const address = $(cells[2]).text().trim();
      const amount = $(cells[3])?.text().trim();

      if (!parcel || parcel.toLowerCase().includes("parcel") || parcel.toLowerCase().includes("account")) return;

      leads.push({
        id: makeId(COUNTY, STATE, "Tax Delinquent", parcel),
        county: COUNTY,
        state: STATE,
        lead_type: "Tax Delinquent",
        owner_name: owner || null,
        address: address || null,
        city: "Myrtle Beach",
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
        description: `Horry County Tax Delinquent — Parcel ${parcel}`,
        source_url: url,
        raw_data: JSON.stringify({ parcel, owner, address, amount }),
      });
    });
  } catch (e) {
    console.error(`[Horry SC] Tax delinquent error:`, e);
  }
  return leads;
}

async function scrapeHorryProbate(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Horry";
  try {
    // Horry County Probate Court
    const url = `https://www.horrycountysc.gov/Departments/Probate-Court`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    // SC Public Index - probate cases
    const scUrl = `https://publicindex.sccourts.org/Horry/PublicIndex/PISearch.aspx`;
    const scRes = await fetchWithRetry(scUrl);
    if (scRes.ok) {
      const scHtml = await scRes.text();
      const $sc = cheerio.load(scHtml);
      const viewstate = $sc("input[name='__VIEWSTATE']").val() as string;
      const eventvalidation = $sc("input[name='__EVENTVALIDATION']").val() as string;

      if (viewstate) {
        const searchRes = await fetchWithRetry(scUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            "__VIEWSTATE": viewstate,
            "__EVENTVALIDATION": eventvalidation || "",
            "ctl00$ContentPlaceHolder1$ddlCaseType": "ESTATE",
            "ctl00$ContentPlaceHolder1$txtFiledDateFrom": fromDate,
            "ctl00$ContentPlaceHolder1$txtFiledDateTo": toDate,
            "ctl00$ContentPlaceHolder1$btnSearch": "Search",
          }).toString(),
        });

        if (searchRes.ok) {
          const resultHtml = await searchRes.text();
          const $r = cheerio.load(resultHtml);

          $r("table tr").each((_, row) => {
            const cells = $r(row).find("td");
            if (cells.length < 3) return;

            const caseNum = $r(cells[0]).text().trim();
            const caption = $r(cells[1]).text().trim();
            const filedDate = $r(cells[2]).text().trim();

            if (!caseNum || caseNum === "Case Number") return;

            leads.push({
              id: makeId(COUNTY, STATE, "Probate", caseNum),
              county: COUNTY,
              state: STATE,
              lead_type: "Probate",
              owner_name: caption || null,
              address: null,
              city: "Myrtle Beach",
              zip: null,
              mailing_address: null,
              mailing_city: null,
              mailing_state: null,
              mailing_zip: null,
              case_number: caseNum,
              filing_date: formatDate(filedDate),
              assessed_value: null,
              tax_year: null,
              lender: null,
              loan_amount: null,
              sale_date: null,
              sale_amount: null,
              description: `Horry County Probate/Estate — ${caption}`,
              source_url: scUrl,
              raw_data: JSON.stringify({ caseNum, caption, filedDate }),
            });
          });
        }
      }
    }
  } catch (e) {
    console.error(`[Horry SC] Probate error:`, e);
  }
  return leads;
}

async function scrapeHorrySheriffSales(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Horry";
  try {
    const url = `https://www.horrycountysc.gov/Departments/Sheriff/Civil-Division`;
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
      const amount = $(cells[3])?.text().trim();

      if (!caseNum || caseNum.toLowerCase().includes("case")) return;

      leads.push({
        id: makeId(COUNTY, STATE, "Sheriff Sale", caseNum),
        county: COUNTY,
        state: STATE,
        lead_type: "Sheriff Sale",
        owner_name: null,
        address: address || null,
        city: "Myrtle Beach",
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
        sale_date: formatDate(saleDate || ""),
        sale_amount: amount || null,
        description: `Horry County Sheriff Sale — ${caseNum}`,
        source_url: url,
        raw_data: JSON.stringify({ caseNum, address, saleDate, amount }),
      });
    });
  } catch (e) {
    console.error(`[Horry SC] Sheriff sales error:`, e);
  }
  return leads;
}

async function scrapeHorryFSBO(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Horry";
  try {
    // Craigslist Myrtle Beach FSBO
    const url = `https://myrtlebeach.craigslist.org/search/rea?sale_date_from=${fromDate}&sale_date_to=${toDate}#search=1~gallery~0~0`;
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
        city: "Myrtle Beach",
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
        description: `Craigslist FSBO — ${title}`,
        source_url: link.startsWith("http") ? link : `https://myrtlebeach.craigslist.org${link}`,
        raw_data: JSON.stringify({ title, price, date }),
      });
    });
  } catch (e) {
    console.error(`[Horry SC] FSBO error:`, e);
  }
  return leads;
}

async function scrapeHorryObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Horry";
  try {
    // Myrtle Beach Sun News obituaries
    const url = `https://www.myrtlebeachonline.com/obituaries/`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;

    const html = await res.text();
    const $ = cheerio.load(html);

    $(".obituary-listing, .obit-item, article.obituary, .obit").each((_, el) => {
      const name = $(el).find("h2, h3, .name, .obit-name").text().trim();
      const date = $(el).find("time, .date, .obit-date").text().trim();
      const link = $(el).find("a").attr("href") || "";

      if (!name) return;

      leads.push({
        id: makeId(COUNTY, STATE, "Obituary/Estate", name + date),
        county: COUNTY,
        state: STATE,
        lead_type: "Obituary/Estate",
        owner_name: name || null,
        address: null,
        city: "Myrtle Beach",
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
        description: `Obituary — ${name} — potential estate property`,
        source_url: link.startsWith("http") ? link : `https://www.myrtlebeachonline.com${link}`,
        raw_data: JSON.stringify({ name, date }),
      });
    });
  } catch (e) {
    console.error(`[Horry SC] Obituaries error:`, e);
  }
  return leads;
}

// ─── GEORGETOWN COUNTY ────────────────────────────────────────────────────────
async function scrapeGeorgetownCounty(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Georgetown";
  try {
    // Georgetown County Clerk of Court
    const scUrl = `https://publicindex.sccourts.org/Georgetown/PublicIndex/PISearch.aspx`;
    const scRes = await fetchWithRetry(scUrl);
    if (scRes.ok) {
      const scHtml = await scRes.text();
      const $sc = cheerio.load(scHtml);
      const viewstate = $sc("input[name='__VIEWSTATE']").val() as string;
      const eventvalidation = $sc("input[name='__EVENTVALIDATION']").val() as string;

      for (const caseType of ["FORECLOSURE", "ESTATE"]) {
        if (!viewstate) break;
        try {
          const searchRes = await fetchWithRetry(scUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              "__VIEWSTATE": viewstate,
              "__EVENTVALIDATION": eventvalidation || "",
              "ctl00$ContentPlaceHolder1$ddlCaseType": caseType,
              "ctl00$ContentPlaceHolder1$txtFiledDateFrom": fromDate,
              "ctl00$ContentPlaceHolder1$txtFiledDateTo": toDate,
              "ctl00$ContentPlaceHolder1$btnSearch": "Search",
            }).toString(),
          });

          if (searchRes.ok) {
            const resultHtml = await searchRes.text();
            const $r = cheerio.load(resultHtml);
            const leadType = caseType === "FORECLOSURE" ? "Pre-Foreclosure" : "Probate";

            $r("table tr").each((_, row) => {
              const cells = $r(row).find("td");
              if (cells.length < 3) return;

              const caseNum = $r(cells[0]).text().trim();
              const caption = $r(cells[1]).text().trim();
              const filedDate = $r(cells[2]).text().trim();

              if (!caseNum || caseNum === "Case Number") return;

              leads.push({
                id: makeId(COUNTY, STATE, leadType, caseNum),
                county: COUNTY,
                state: STATE,
                lead_type: leadType,
                owner_name: caption || null,
                address: null,
                city: "Georgetown",
                zip: null,
                mailing_address: null,
                mailing_city: null,
                mailing_state: null,
                mailing_zip: null,
                case_number: caseNum,
                filing_date: formatDate(filedDate),
                assessed_value: null,
                tax_year: null,
                lender: null,
                loan_amount: null,
                sale_date: null,
                sale_amount: null,
                description: `Georgetown County ${leadType} — ${caption}`,
                source_url: scUrl,
                raw_data: JSON.stringify({ caseNum, caption, filedDate, caseType }),
              });
            });
          }
        } catch (e) {
          console.error(`[Georgetown SC] ${caseType} error:`, e);
        }
      }
    }

    // Georgetown County tax delinquent
    const taxUrl = `https://www.gtcounty.org/departments/treasurer/delinquent-taxes`;
    const taxRes = await fetchWithRetry(taxUrl);
    if (taxRes.ok) {
      const taxHtml = await taxRes.text();
      const $ = cheerio.load(taxHtml);

      $("table tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const parcel = $(cells[0]).text().trim();
        const owner = $(cells[1]).text().trim();
        const address = $(cells[2])?.text().trim();
        const amount = $(cells[3])?.text().trim();

        if (!parcel || parcel.toLowerCase().includes("parcel")) return;

        leads.push({
          id: makeId(COUNTY, STATE, "Tax Delinquent", parcel),
          county: COUNTY,
          state: STATE,
          lead_type: "Tax Delinquent",
          owner_name: owner || null,
          address: address || null,
          city: "Georgetown",
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
          description: `Georgetown County Tax Delinquent — ${parcel}`,
          source_url: taxUrl,
          raw_data: JSON.stringify({ parcel, owner, address, amount }),
        });
      });
    }
  } catch (e) {
    console.error(`[Georgetown SC] error:`, e);
  }
  return leads;
}

// ─── MARION COUNTY ────────────────────────────────────────────────────────────
async function scrapeMarionCounty(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Marion";
  try {
    // Marion County SC Public Index
    const scUrl = `https://publicindex.sccourts.org/Marion/PublicIndex/PISearch.aspx`;
    const scRes = await fetchWithRetry(scUrl);
    if (scRes.ok) {
      const scHtml = await scRes.text();
      const $sc = cheerio.load(scHtml);
      const viewstate = $sc("input[name='__VIEWSTATE']").val() as string;
      const eventvalidation = $sc("input[name='__EVENTVALIDATION']").val() as string;

      for (const caseType of ["FORECLOSURE", "ESTATE"]) {
        if (!viewstate) break;
        try {
          const searchRes = await fetchWithRetry(scUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              "__VIEWSTATE": viewstate,
              "__EVENTVALIDATION": eventvalidation || "",
              "ctl00$ContentPlaceHolder1$ddlCaseType": caseType,
              "ctl00$ContentPlaceHolder1$txtFiledDateFrom": fromDate,
              "ctl00$ContentPlaceHolder1$txtFiledDateTo": toDate,
              "ctl00$ContentPlaceHolder1$btnSearch": "Search",
            }).toString(),
          });

          if (searchRes.ok) {
            const resultHtml = await searchRes.text();
            const $r = cheerio.load(resultHtml);
            const leadType = caseType === "FORECLOSURE" ? "Pre-Foreclosure" : "Probate";

            $r("table tr").each((_, row) => {
              const cells = $r(row).find("td");
              if (cells.length < 3) return;

              const caseNum = $r(cells[0]).text().trim();
              const caption = $r(cells[1]).text().trim();
              const filedDate = $r(cells[2]).text().trim();

              if (!caseNum || caseNum === "Case Number") return;

              leads.push({
                id: makeId(COUNTY, STATE, leadType, caseNum),
                county: COUNTY,
                state: STATE,
                lead_type: leadType,
                owner_name: caption || null,
                address: null,
                city: "Marion",
                zip: null,
                mailing_address: null,
                mailing_city: null,
                mailing_state: null,
                mailing_zip: null,
                case_number: caseNum,
                filing_date: formatDate(filedDate),
                assessed_value: null,
                tax_year: null,
                lender: null,
                loan_amount: null,
                sale_date: null,
                sale_amount: null,
                description: `Marion County ${leadType} — ${caption}`,
                source_url: scUrl,
                raw_data: JSON.stringify({ caseNum, caption, filedDate, caseType }),
              });
            });
          }
        } catch (e) {
          console.error(`[Marion SC] ${caseType} error:`, e);
        }
      }
    }
  } catch (e) {
    console.error(`[Marion SC] error:`, e);
  }
  return leads;
}

// ─── MASTER SCRAPER ───────────────────────────────────────────────────────────
export async function scrapeSC(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  
  switch (county.toLowerCase()) {
    case "horry":
      leads.push(
        ...(await scrapeHorryPreForeclosure(fromDate, toDate)),
        ...(await scrapeHorryTaxDelinquent(fromDate, toDate)),
        ...(await scrapeHorryProbate(fromDate, toDate)),
        ...(await scrapeHorrySheriffSales(fromDate, toDate)),
        ...(await scrapeHorryFSBO(fromDate, toDate)),
        ...(await scrapeHorryObituaries(fromDate, toDate)),
      );
      break;
    case "georgetown":
      leads.push(...(await scrapeGeorgetownCounty(fromDate, toDate)));
      break;
    case "marion":
      leads.push(...(await scrapeMarionCounty(fromDate, toDate)));
      break;
    default:
      console.warn(`[SC] No scraper for county: ${county}`);
  }
  
  return leads;
}

export async function scrapeAll(fromDate: string, toDate: string): Promise<Lead[]> {
  const results = await Promise.allSettled([
    scrapeHorryPreForeclosure(fromDate, toDate),
    scrapeHorryTaxDelinquent(fromDate, toDate),
    scrapeHorryProbate(fromDate, toDate),
    scrapeHorrySheriffSales(fromDate, toDate),
    scrapeHorryFSBO(fromDate, toDate),
    scrapeHorryObituaries(fromDate, toDate),
    scrapeGeorgetownCounty(fromDate, toDate),
    scrapeMarionCounty(fromDate, toDate),
  ]);
  
  return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}
