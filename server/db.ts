import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "..", "data");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, "atlas.db");
export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── SCHEMA ──────────────────────────────────────────────────────────────────
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
    scraped_at    TEXT NOT NULL DEFAULT (datetime('now')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_leads_county ON leads(county);
  CREATE INDEX IF NOT EXISTS idx_leads_lead_type ON leads(lead_type);
  CREATE INDEX IF NOT EXISTS idx_leads_filing_date ON leads(filing_date);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_scraped_at ON leads(scraped_at);

  CREATE TABLE IF NOT EXISTS scrape_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    county      TEXT NOT NULL,
    state       TEXT NOT NULL,
    lead_type   TEXT NOT NULL,
    started_at  TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    status      TEXT NOT NULL DEFAULT 'running',
    leads_found INTEGER DEFAULT 0,
    error       TEXT
  );
`);

// ─── HELPERS ─────────────────────────────────────────────────────────────────
export function upsertLead(lead: Record<string, string | null>) {
  const existing = db.prepare("SELECT id FROM leads WHERE id = ?").get(lead.id);
  if (existing) return false; // already have it, skip
  db.prepare(`
    INSERT INTO leads (
      id, county, state, lead_type, owner_name, address, city, zip,
      mailing_address, mailing_city, mailing_state, mailing_zip,
      case_number, filing_date, assessed_value, tax_year, lender,
      loan_amount, sale_date, sale_amount, description, source_url, raw_data
    ) VALUES (
      @id, @county, @state, @lead_type, @owner_name, @address, @city, @zip,
      @mailing_address, @mailing_city, @mailing_state, @mailing_zip,
      @case_number, @filing_date, @assessed_value, @tax_year, @lender,
      @loan_amount, @sale_date, @sale_amount, @description, @source_url, @raw_data
    )
  `).run(lead);
  return true;
}

export function getLeads(filters: {
  county?: string;
  lead_type?: string;
  status?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}) {
  let query = "SELECT * FROM leads WHERE 1=1";
  const params: Record<string, string | number> = {};
  if (filters.county) { query += " AND county = @county"; params.county = filters.county; }
  if (filters.lead_type) { query += " AND lead_type = @lead_type"; params.lead_type = filters.lead_type; }
  if (filters.status) { query += " AND status = @status"; params.status = filters.status; }
  if (filters.from_date) { query += " AND filing_date >= @from_date"; params.from_date = filters.from_date; }
  if (filters.to_date) { query += " AND filing_date <= @to_date"; params.to_date = filters.to_date; }
  query += " ORDER BY filing_date DESC, scraped_at DESC";
  if (filters.limit) { query += " LIMIT @limit OFFSET @offset"; params.limit = filters.limit; params.offset = filters.offset || 0; }
  return db.prepare(query).all(params);
}

export function updateLeadStatus(id: string, status: string, notes?: string) {
  db.prepare("UPDATE leads SET status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, notes || null, id);
}

export function getStats() {
  const total = (db.prepare("SELECT COUNT(*) as c FROM leads").get() as { c: number }).c;
  const byType = db.prepare("SELECT lead_type, COUNT(*) as count FROM leads GROUP BY lead_type ORDER BY count DESC").all();
  const byCounty = db.prepare("SELECT county, COUNT(*) as count FROM leads GROUP BY county ORDER BY count DESC").all();
  const today = db.prepare("SELECT COUNT(*) as c FROM leads WHERE date(scraped_at) = date('now')").get() as { c: number };
  const lastRun = db.prepare("SELECT MAX(finished_at) as t FROM scrape_runs WHERE status = 'success'").get() as { t: string | null };
  return { total, byType, byCounty, today: today.c, lastRun: lastRun?.t };
}

export function logScrapeRun(county: string, state: string, leadType: string) {
  const result = db.prepare("INSERT INTO scrape_runs (county, state, lead_type) VALUES (?, ?, ?)").run(county, state, leadType);
  return result.lastInsertRowid as number;
}

export function finishScrapeRun(id: number, leadsFound: number, error?: string) {
  db.prepare("UPDATE scrape_runs SET finished_at = datetime('now'), status = ?, leads_found = ?, error = ? WHERE id = ?")
    .run(error ? "error" : "success", leadsFound, error || null, id);
}
