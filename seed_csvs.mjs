/**
 * seed_csvs.mjs — Import all historical CSV data into the Atlas SQLite database
 *
 * Usage: node seed_csvs.mjs
 *
 * Maps each CSV's column layout to the leads table schema, generates stable IDs,
 * and uses INSERT OR IGNORE so it's safe to re-run without creating duplicates.
 */

import Database from "better-sqlite3";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Open DB ──────────────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "atlas.db");
console.log(`[seed] Opening database: ${DB_PATH}`);
const db = new Database(DB_PATH);

// Ensure schema exists (mirrors server/db.ts)
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id            TEXT PRIMARY KEY,
    county        TEXT NOT NULL,
    state         TEXT NOT NULL,
    lead_type     TEXT NOT NULL,
    owner_name    TEXT,
    address       TEXT,
    city          TEXT,
    zip           TEXT,
    mailing_address TEXT,
    mailing_city  TEXT,
    mailing_state TEXT,
    mailing_zip   TEXT,
    case_number   TEXT,
    filing_date   TEXT,
    assessed_value TEXT,
    tax_year      TEXT,
    lender        TEXT,
    loan_amount   TEXT,
    sale_date     TEXT,
    sale_amount   TEXT,
    description   TEXT,
    source_url    TEXT,
    raw_data      TEXT,
    status        TEXT NOT NULL DEFAULT 'new',
    notes         TEXT,
    skip_traced   INTEGER NOT NULL DEFAULT 0,
    st_phone      TEXT,
    st_email      TEXT,
    st_mailing    TEXT,
    scraped_at    TEXT NOT NULL DEFAULT (datetime('now')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insert = db.prepare(`
  INSERT OR IGNORE INTO leads
    (id, county, state, lead_type, owner_name, address, city, zip,
     mailing_address, mailing_city, mailing_state, mailing_zip,
     case_number, filing_date, assessed_value, tax_year,
     lender, loan_amount, sale_date, sale_amount,
     description, source_url, raw_data, status, scraped_at)
  VALUES
    (@id, @county, @state, @lead_type, @owner_name, @address, @city, @zip,
     @mailing_address, @mailing_city, @mailing_state, @mailing_zip,
     @case_number, @filing_date, @assessed_value, @tax_year,
     @lender, @loan_amount, @sale_date, @sale_amount,
     @description, @source_url, @raw_data, @status, @scraped_at)
`);

// ─── 90-day cutoff ───────────────────────────────────────────────────────────
const CUTOFF = new Date();
CUTOFF.setDate(CUTOFF.getDate() - 90);
const CUTOFF_STR = CUTOFF.toISOString().split("T")[0]; // YYYY-MM-DD
console.log(`[seed] Only importing leads on or after ${CUTOFF_STR}`);

// Returns true if the date string is within the last 90 days (or null/empty — include by default)
function isRecent(dateStr) {
  if (!dateStr || dateStr.trim() === "") return true; // no date = include
  // Try to parse various formats
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true; // unparseable = include
  return d >= CUTOFF;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stableId(prefix, ...parts) {
  const hash = crypto.createHash("md5").update(parts.join("|")).digest("hex").slice(0, 8);
  return `${prefix}-${hash}`.toUpperCase();
}

function clean(v) {
  if (!v) return null;
  const s = String(v).trim();
  return s === "" || s === "NULL" || s === "null" || s === "N/A" ? null : s;
}

function parseAddress(fullAddr) {
  if (!fullAddr) return { address: null, city: null, zip: null };
  // "300 W 34th St, Kansas City, MO 64111"
  const m = fullAddr.match(/^(.*?),\s*([^,]+),\s*[A-Z]{2}\s*(\d{5}(?:-\d{4})?)\s*$/);
  if (m) return { address: clean(m[1]), city: clean(m[2]), zip: clean(m[3]) };
  // "8818 E ANDERSON AVE INDEPENDENCE MO 64053"
  const m2 = fullAddr.match(/^(.*?)\s+([A-Z][A-Z\s]+)\s+[A-Z]{2}\s+(\d{5})\s*$/);
  if (m2) return { address: clean(m2[1]), city: clean(m2[2].trim()), zip: clean(m2[3]) };
  return { address: clean(fullAddr), city: null, zip: null };
}

async function readCsv(filePath) {
  const rows = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    // Simple CSV parse (handles quoted fields)
    const cols = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { cols.push(cur); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur);
    if (!headers) { headers = cols.map(h => h.trim().replace(/^"|"$/g, "")); continue; }
    const row = {};
    headers.forEach((h, i) => { row[h] = (cols[i] || "").trim().replace(/^"|"$/g, ""); });
    rows.push(row);
  }
  return rows;
}

function insertBatch(records) {
  const insertMany = db.transaction((recs) => {
    let inserted = 0;
    let skippedOld = 0;
    for (const r of recs) {
      // Skip records missing both address and owner
      if ((!r.address || r.address.length < 5) && (!r.owner_name || r.owner_name.length < 2)) continue;
      // Skip records older than 90 days (check filing_date first, then scraped_at)
      const dateToCheck = r.filing_date || r.scraped_at;
      if (!isRecent(dateToCheck)) { skippedOld++; continue; }
      const result = insert.run(r);
      if (result.changes > 0) inserted++;
    }
    if (skippedOld > 0) console.log(`  (skipped ${skippedOld} records older than 90 days)`);
    return inserted;
  });
  return insertMany(records);
}

// ─── CSV Importers ────────────────────────────────────────────────────────────

// 1. tina_leads_week.csv — already in exact schema format
async function importTinaLeads(filePath) {
  const rows = await readCsv(filePath);
  const records = rows.map(r => ({
    id: clean(r.id) || stableId("TINA", r.county, r.lead_type, r.owner_name, r.address),
    county: clean(r.county) || "Unknown",
    state: clean(r.state) || "XX",
    lead_type: clean(r.lead_type) || "Unknown",
    owner_name: clean(r.owner_name),
    address: clean(r.address),
    city: clean(r.city),
    zip: clean(r.zip),
    mailing_address: clean(r.mailing_address),
    mailing_city: clean(r.mailing_city),
    mailing_state: clean(r.mailing_state),
    mailing_zip: clean(r.mailing_zip),
    case_number: clean(r.case_number),
    filing_date: clean(r.filing_date),
    assessed_value: clean(r.assessed_value),
    tax_year: clean(r.tax_year),
    lender: clean(r.lender),
    loan_amount: clean(r.loan_amount),
    sale_date: clean(r.sale_date),
    sale_amount: clean(r.sale_amount),
    description: clean(r.description),
    source_url: clean(r.source_url),
    raw_data: null,
    status: clean(r.status) || "new",
    scraped_at: new Date().toISOString(),
  }));
  return insertBatch(records);
}

// 2. jackson_code_violations.csv
// Cols: lead_type,county,state,source,source_url,scraped_date,final_address,final_owner,
//       source_address,zip_code,case_number,case_status,vio_status,chapter,ordinance,
//       violation_description,violation_detail,date_found,date_to_comply,pin,note
async function importJacksonCodeViolations(filePath) {
  const rows = await readCsv(filePath);
  const records = rows.map(r => {
    const parsed = parseAddress(clean(r.final_address) || clean(r.source_address));
    return {
      id: stableId("MO-JAC-CV", r.case_number || r.pin || r.final_address),
      county: "Jackson",
      state: "MO",
      lead_type: "Code Violation",
      owner_name: clean(r.final_owner),
      address: parsed.address || clean(r.source_address),
      city: parsed.city,
      zip: clean(r.zip_code) || parsed.zip,
      mailing_address: null,
      mailing_city: null,
      mailing_state: null,
      mailing_zip: null,
      case_number: clean(r.case_number),
      filing_date: clean(r.date_found) || clean(r.scraped_date),
      assessed_value: null,
      tax_year: null,
      lender: null,
      loan_amount: null,
      sale_date: null,
      sale_amount: null,
      description: clean(r.violation_description) || clean(r.ordinance),
      source_url: clean(r.source_url),
      raw_data: JSON.stringify({ vio_status: r.vio_status, chapter: r.chapter, detail: r.violation_detail }),
      status: "new",
      scraped_at: clean(r.scraped_date) ? new Date(r.scraped_date).toISOString() : new Date().toISOString(),
    };
  });
  return insertBatch(records);
}

// 3. jackson_foreclosure_auctions.csv
// Cols: lead_type,county,state,source,source_url,scraped_date,hearing_date,suit_number,
//       owner_name,source_address,parcel_number,judgment_amount,date_sold,purchaser,
//       final_address,final_owner,parcel_id,year_built,sqft,market_value,land_use,cross_ref
async function importJacksonForeclosures(filePath) {
  const rows = await readCsv(filePath);
  const records = rows.map(r => {
    const parsed = parseAddress(clean(r.final_address) || clean(r.source_address));
    return {
      id: stableId("MO-JAC-FC", r.suit_number || r.parcel_number || r.owner_name),
      county: "Jackson",
      state: "MO",
      lead_type: clean(r.lead_type) || "Foreclosure Auction",
      owner_name: clean(r.final_owner) || clean(r.owner_name),
      address: parsed.address || clean(r.source_address),
      city: parsed.city,
      zip: parsed.zip,
      mailing_address: null,
      mailing_city: null,
      mailing_state: null,
      mailing_zip: null,
      case_number: clean(r.suit_number),
      filing_date: clean(r.hearing_date) || clean(r.scraped_date),
      assessed_value: clean(r.market_value),
      tax_year: null,
      lender: null,
      loan_amount: clean(r.judgment_amount),
      sale_date: clean(r.date_sold),
      sale_amount: null,
      description: `Jackson County Foreclosure Auction — ${r.suit_number || ""}`,
      source_url: clean(r.source_url),
      raw_data: JSON.stringify({ parcel: r.parcel_number, purchaser: r.purchaser, sqft: r.sqft }),
      status: "new",
      scraped_at: clean(r.scraped_date) ? new Date(r.scraped_date).toISOString() : new Date().toISOString(),
    };
  });
  return insertBatch(records);
}

// 4. jackson_tax_delinquent.csv
// Cols: lead_type,county,state,source,source_url,scraped_date,owner_name,co_owner,
//       suit_number,parcel_number,source_address,legal_description,judgment_amount,
//       purchase_price,date_sold,purchaser,verified_owner,verified_address,parcel_id,
//       year_built,sqft,market_value,land_use,cross_ref,final_address,final_owner
async function importJacksonTaxDelinquent(filePath) {
  const rows = await readCsv(filePath);
  const records = rows.map(r => {
    const parsed = parseAddress(clean(r.final_address) || clean(r.verified_address) || clean(r.source_address));
    return {
      id: stableId("MO-JAC-DLT", r.suit_number || r.parcel_number || r.owner_name),
      county: "Jackson",
      state: "MO",
      lead_type: "Tax Delinquent",
      owner_name: clean(r.final_owner) || clean(r.verified_owner) || clean(r.owner_name),
      address: parsed.address || clean(r.source_address),
      city: parsed.city,
      zip: parsed.zip,
      mailing_address: null,
      mailing_city: null,
      mailing_state: null,
      mailing_zip: null,
      case_number: clean(r.suit_number),
      filing_date: clean(r.scraped_date),
      assessed_value: clean(r.market_value),
      tax_year: null,
      lender: null,
      loan_amount: clean(r.judgment_amount),
      sale_date: clean(r.date_sold),
      sale_amount: clean(r.purchase_price),
      description: `Jackson County Tax Delinquent — ${r.suit_number || r.parcel_number || ""}`,
      source_url: clean(r.source_url),
      raw_data: JSON.stringify({ parcel: r.parcel_number, legal: r.legal_description }),
      status: "new",
      scraped_at: clean(r.scraped_date) ? new Date(r.scraped_date).toISOString() : new Date().toISOString(),
    };
  });
  return insertBatch(records);
}

// 5. hamilton_tax_delinquent.csv
// Cols: county,state,parcel_id,owner_name,property_address,property_city,property_state,
//       property_zip,property_class,unpaid_amount,lead_type,source,scraped_date
async function importHamiltonTaxDelinquent(filePath) {
  const rows = await readCsv(filePath);
  const records = rows.map(r => ({
    id: stableId("OH-HAM-DLT", r.parcel_id || r.owner_name + r.property_address),
    county: "Hamilton",
    state: "OH",
    lead_type: "Tax Delinquent",
    owner_name: clean(r.owner_name),
    address: clean(r.property_address),
    city: clean(r.property_city),
    zip: clean(r.property_zip),
    mailing_address: null,
    mailing_city: null,
    mailing_state: null,
    mailing_zip: null,
    case_number: clean(r.parcel_id),
    filing_date: clean(r.scraped_date),
    assessed_value: null,
    tax_year: null,
    lender: null,
    loan_amount: clean(r.unpaid_amount),
    sale_date: null,
    sale_amount: null,
    description: `Hamilton County OH Tax Delinquent — Parcel ${r.parcel_id || ""}`,
    source_url: null,
    raw_data: JSON.stringify({ property_class: r.property_class }),
    status: "new",
    scraped_at: clean(r.scraped_date) ? new Date(r.scraped_date).toISOString() : new Date().toISOString(),
  }));
  return insertBatch(records);
}

// 6. cass_tax_delinquent.csv
// Cols: county,state,parcel_id,account_number,owner_name,property_address,property_city,
//       property_state,property_zip,legal_description,subdivision,assessment_status,
//       lead_type,source,scraped_date
async function importCassTaxDelinquent(filePath) {
  const rows = await readCsv(filePath);
  const records = rows.map(r => ({
    id: stableId("MO-CAS-DLT", r.parcel_id || r.account_number || r.owner_name + r.property_address),
    county: "Cass",
    state: "MO",
    lead_type: "Tax Delinquent",
    owner_name: clean(r.owner_name),
    address: clean(r.property_address),
    city: clean(r.property_city),
    zip: clean(r.property_zip),
    mailing_address: null,
    mailing_city: null,
    mailing_state: null,
    mailing_zip: null,
    case_number: clean(r.account_number),
    filing_date: clean(r.scraped_date),
    assessed_value: null,
    tax_year: null,
    lender: null,
    loan_amount: null,
    sale_date: null,
    sale_amount: null,
    description: `Cass County MO Tax Delinquent — ${r.parcel_id || r.account_number || ""}`,
    source_url: null,
    raw_data: JSON.stringify({ parcel_id: r.parcel_id, legal: r.legal_description, subdivision: r.subdivision }),
    status: "new",
    scraped_at: clean(r.scraped_date) ? new Date(r.scraped_date).toISOString() : new Date().toISOString(),
  }));
  return insertBatch(records);
}

// 7. clay_tax_delinquent.csv (same format as cass)
async function importClayTaxDelinquent(filePath) {
  const rows = await readCsv(filePath);
  const records = rows.map(r => ({
    id: stableId("MO-CLY-DLT", r.parcel_id || r.account_number || r.owner_name + r.property_address),
    county: "Clay",
    state: "MO",
    lead_type: "Tax Delinquent",
    owner_name: clean(r.owner_name),
    address: clean(r.property_address),
    city: clean(r.property_city),
    zip: clean(r.property_zip),
    mailing_address: null,
    mailing_city: null,
    mailing_state: null,
    mailing_zip: null,
    case_number: clean(r.account_number),
    filing_date: clean(r.scraped_date),
    assessed_value: null,
    tax_year: null,
    lender: null,
    loan_amount: null,
    sale_date: null,
    sale_amount: null,
    description: `Clay County MO Tax Delinquent — ${r.parcel_id || r.account_number || ""}`,
    source_url: null,
    raw_data: JSON.stringify({ parcel_id: r.parcel_id, legal: r.legal_description }),
    status: "new",
    scraped_at: clean(r.scraped_date) ? new Date(r.scraped_date).toISOString() : new Date().toISOString(),
  }));
  return insertBatch(records);
}

// 8. alabama_jefferson_birmingham_tax_delinquent.csv
// Cols: county,state,parcel_id,parcel_id_raw,year,owner_name,legal_description,
//       delinquent_amount,lead_type,source,scraped_date,address_lookup_required,address_lookup_url
async function importAlabamaJeffersonTaxDelinquent(filePath, subCounty) {
  const rows = await readCsv(filePath);
  const records = rows.map(r => ({
    id: stableId(`AL-JEF-DLT-${subCounty.toUpperCase().slice(0, 3)}`, r.parcel_id || r.owner_name),
    county: "Jefferson",
    state: "AL",
    lead_type: "Tax Delinquent",
    owner_name: clean(r.owner_name),
    address: null, // Address lookup required via JCCAL ArcGIS
    city: subCounty === "birmingham" ? "Birmingham" : "Bessemer",
    zip: null,
    mailing_address: null,
    mailing_city: null,
    mailing_state: null,
    mailing_zip: null,
    case_number: clean(r.parcel_id),
    filing_date: clean(r.scraped_date),
    assessed_value: null,
    tax_year: clean(r.year),
    lender: null,
    loan_amount: clean(r.delinquent_amount),
    sale_date: null,
    sale_amount: null,
    description: `Jefferson County AL Tax Delinquent (${subCounty}) — ${r.parcel_id || ""} — Address lookup required`,
    source_url: clean(r.address_lookup_url),
    raw_data: JSON.stringify({ parcel_id_raw: r.parcel_id_raw, legal: r.legal_description }),
    status: "new",
    scraped_at: clean(r.scraped_date) ? new Date(r.scraped_date).toISOString() : new Date().toISOString(),
  }));
  return insertBatch(records);
}

// 9. Generic Alabama county tax delinquent (madison, morgan, montgomery, shelby, limestone)
// Cols vary — handle gracefully
async function importAlabamaCountyTaxDelinquent(filePath, county) {
  const rows = await readCsv(filePath);
  if (rows.length === 0) return 0;
  const records = rows.map(r => {
    const ownerName = clean(r.owner_name) || clean(r.Owner) || clean(r.NAME);
    const address = clean(r.property_address) || clean(r.address) || clean(r.Address) || clean(r.SITUS);
    const city = clean(r.property_city) || clean(r.city) || clean(r.City);
    const zip = clean(r.property_zip) || clean(r.zip) || clean(r.ZIP);
    const parcel = clean(r.parcel_id) || clean(r.parcel) || clean(r.PARCEL);
    const amount = clean(r.delinquent_amount) || clean(r.unpaid_amount) || clean(r.amount);
    return {
      id: stableId(`AL-${county.toUpperCase().slice(0, 3)}-DLT`, parcel || ownerName + address),
      county: county,
      state: "AL",
      lead_type: "Tax Delinquent",
      owner_name: ownerName,
      address: address,
      city: city,
      zip: zip,
      mailing_address: null,
      mailing_city: null,
      mailing_state: null,
      mailing_zip: null,
      case_number: parcel,
      filing_date: clean(r.scraped_date),
      assessed_value: null,
      tax_year: clean(r.year) || clean(r.tax_year),
      lender: null,
      loan_amount: amount,
      sale_date: null,
      sale_amount: null,
      description: `${county} County AL Tax Delinquent — ${parcel || ""}`,
      source_url: null,
      raw_data: JSON.stringify(r),
      status: "new",
      scraped_at: clean(r.scraped_date) ? new Date(r.scraped_date).toISOString() : new Date().toISOString(),
    };
  });
  return insertBatch(records);
}

// 10. jackson_dangerous_buildings.csv / jackson_water_issues.csv
// Cols: lead_type,county,state,source,source_url,scraped_date,final_address,final_owner,...
async function importJacksonDangerousBuildings(filePath) {
  const rows = await readCsv(filePath);
  const records = rows.map(r => {
    const parsed = parseAddress(clean(r.final_address) || clean(r.source_address));
    return {
      id: stableId("MO-JAC-DB", r.case_number || r.pin || r.final_address),
      county: "Jackson",
      state: "MO",
      lead_type: clean(r.lead_type) || "Dangerous Building",
      owner_name: clean(r.final_owner),
      address: parsed.address || clean(r.source_address),
      city: parsed.city,
      zip: clean(r.zip_code) || parsed.zip,
      mailing_address: null,
      mailing_city: null,
      mailing_state: null,
      mailing_zip: null,
      case_number: clean(r.case_number),
      filing_date: clean(r.date_found) || clean(r.scraped_date),
      assessed_value: null,
      tax_year: null,
      lender: null,
      loan_amount: null,
      sale_date: null,
      sale_amount: null,
      description: clean(r.violation_description) || clean(r.lead_type),
      source_url: clean(r.source_url),
      raw_data: null,
      status: "new",
      scraped_at: clean(r.scraped_date) ? new Date(r.scraped_date).toISOString() : new Date().toISOString(),
    };
  });
  return insertBatch(records);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const HOME = "/home/ubuntu";

const jobs = [
  // Tina's formatted leads (exact schema)
  { name: "tina_leads_week", fn: () => importTinaLeads(`${HOME}/atlas_csvs/tina_leads_week.csv`) },

  // Jackson MO
  { name: "jackson_code_violations", fn: () => importJacksonCodeViolations(`${HOME}/jackson_code_violations.csv`) },
  { name: "jackson_code_violations_recent", fn: () => importJacksonCodeViolations(`${HOME}/jackson_code_violations_recent.csv`) },
  { name: "jackson_foreclosure_auctions", fn: () => importJacksonForeclosures(`${HOME}/jackson_foreclosure_auctions.csv`) },
  { name: "jackson_tax_delinquent", fn: () => importJacksonTaxDelinquent(`${HOME}/jackson_tax_delinquent.csv`) },
  { name: "jackson_dangerous_buildings", fn: () => importJacksonDangerousBuildings(`${HOME}/jackson_dangerous_buildings.csv`) },
  { name: "jackson_water_issues", fn: () => importJacksonDangerousBuildings(`${HOME}/jackson_water_issues.csv`) },

  // Hamilton OH
  { name: "hamilton_tax_delinquent", fn: () => importHamiltonTaxDelinquent(`${HOME}/hamilton_tax_delinquent.csv`) },
  { name: "hamilton_foreclosure_auctions", fn: () => importJacksonForeclosures(`${HOME}/hamilton_foreclosure_auctions.csv`) },

  // Cass + Clay MO
  { name: "cass_tax_delinquent", fn: () => importCassTaxDelinquent(`${HOME}/cass_tax_delinquent.csv`) },
  { name: "clay_tax_delinquent", fn: () => importClayTaxDelinquent(`${HOME}/clay_tax_delinquent.csv`) },

  // Alabama
  { name: "al_jefferson_birmingham", fn: () => importAlabamaJeffersonTaxDelinquent(`${HOME}/alabama_jefferson_birmingham_tax_delinquent.csv`, "birmingham") },
  { name: "al_jefferson_bessemer", fn: () => importAlabamaJeffersonTaxDelinquent(`${HOME}/alabama_jefferson_bessemer_tax_delinquent.csv`, "bessemer") },
  { name: "al_madison", fn: () => importAlabamaCountyTaxDelinquent(`${HOME}/alabama_madison_tax_delinquent.csv`, "Madison") },
  { name: "al_morgan", fn: () => importAlabamaCountyTaxDelinquent(`${HOME}/alabama_morgan_tax_delinquent.csv`, "Morgan") },
  { name: "al_montgomery", fn: () => importAlabamaCountyTaxDelinquent(`${HOME}/alabama_montgomery_tax_delinquent.csv`, "Montgomery") },
  { name: "al_shelby", fn: () => importAlabamaCountyTaxDelinquent(`${HOME}/alabama_shelby_tax_delinquent.csv`, "Shelby") },
  { name: "al_limestone", fn: () => importAlabamaCountyTaxDelinquent(`${HOME}/alabama_limestone_tax_delinquent.csv`, "Limestone") },
];

let totalInserted = 0;
for (const job of jobs) {
  try {
    const n = await job.fn();
    console.log(`[seed] ${job.name}: +${n} inserted`);
    totalInserted += n;
  } catch (e) {
    console.error(`[seed] ${job.name}: ERROR — ${e.message}`);
  }
}

// Final count
const total = db.prepare("SELECT COUNT(*) as c FROM leads").get();
console.log(`\n[seed] Done. Inserted ${totalInserted} new records. Total leads in DB: ${total.c}`);

// Breakdown by county + lead type
const breakdown = db.prepare("SELECT county, state, lead_type, COUNT(*) as n FROM leads GROUP BY county, state, lead_type ORDER BY county, lead_type").all();
console.log("\n[seed] Breakdown:");
for (const row of breakdown) {
  console.log(`  ${row.county}, ${row.state} | ${row.lead_type}: ${row.n}`);
}

db.close();
