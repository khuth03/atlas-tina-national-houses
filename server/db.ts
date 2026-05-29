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
    skip_traced   INTEGER NOT NULL DEFAULT 0,
    st_phone      TEXT,
    st_email      TEXT,
    st_mailing    TEXT,
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
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ─── MIGRATIONS (safe for SQLite < 3.35) ─────────────────────────────────────
const migrations = [
  "ALTER TABLE leads ADD COLUMN skip_traced INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE leads ADD COLUMN st_phone TEXT",
  "ALTER TABLE leads ADD COLUMN st_email TEXT",
  "ALTER TABLE leads ADD COLUMN st_mailing TEXT",
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists — safe to ignore */ }
}

// ─── ONE-TIME CLEANUP: delete leads missing address or owner name ─────────────
// Leads saved before address+name enforcement was added may lack these fields.
// Remove them so the DB only contains fully actionable leads.
try {
  const deleted = db.prepare(
    `DELETE FROM leads WHERE
      (address IS NULL OR trim(address) = '' OR length(trim(address)) < 5)
      OR
      (owner_name IS NULL OR trim(owner_name) = '' OR length(trim(owner_name)) < 2)`
  ).run();
  if (deleted.changes > 0) {
    console.log(`[db] Cleaned up ${deleted.changes} leads missing address or owner name`);
  }
} catch (e) {
  console.error('[db] Cleanup migration error:', e);
}

// ─── LEAD TYPE NORMALIZATION ──────────────────────────────────────────────────
const LEAD_TYPE_MAP: Record<string, string> = {
  "CV": "Code Violation",
  "code": "Code Violation",
  "DIV": "Divorce",
  "divorce": "Divorce",
  "VAC": "Vacant/Abandoned",
  "vacant": "Vacant/Abandoned",
  "OOS": "Out-of-State Owner",
  "oos": "Out-of-State Owner",
  "Probate/Estate": "Probate",
  "Estate/Inherited": "Probate",
  "Obituary/Estate": "Obituary",
  "Fire Damaged": "Fire Damage",
  "Foreclosure": "Pre-Foreclosure",
};
export function normalizeLeadType(raw: string | null | undefined): string {
  if (!raw) return "Other";
  return LEAD_TYPE_MAP[raw] ?? raw;
}

// ─── COUNTY NAME NORMALIZATION ────────────────────────────────────────────────
const STATE_COUNTY_MAP: Record<string, string> = {
  "AL": "Alabama (Statewide)",
  "MO": "Missouri (Statewide)",
  "OH": "Ohio (Statewide)",
  "TX": "Texas (Statewide)",
  "WI": "Wisconsin (Statewide)",
  "SC": "South Carolina (Statewide)",
  "NY": "New York (Statewide)",
  "GA": "Georgia (Statewide)",
  "FL": "Florida (Statewide)",
};
export function normalizeCounty(county: string | null | undefined): string {
  if (!county) return "Unknown";
  return STATE_COUNTY_MAP[county] ?? county;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
export function upsertLead(lead: Record<string, string | null>) {
  // Reject leads missing a usable property address OR owner name
  const addr = (lead.address || '').trim();
  if (!addr || addr.length < 5) return false;
  const name = (lead.owner_name || '').trim();
  if (!name || name.length < 2) return false;
  const existing = db.prepare("SELECT id FROM leads WHERE id = ?").get(lead.id);
  if (existing) return false; // already have it, skip
  // Sanitize: ensure all named params exist (SQLite throws RangeError if missing)
  const fields = [
    'id','county','state','lead_type','owner_name','address','city','zip',
    'mailing_address','mailing_city','mailing_state','mailing_zip',
    'case_number','filing_date','assessed_value','tax_year','lender',
    'loan_amount','sale_date','sale_amount','description','source_url','raw_data'
  ];
  const normalized: Record<string, string | null> = { ...lead };
  normalized.lead_type = normalizeLeadType(lead.lead_type);
  normalized.county = normalizeCounty(lead.county);
  const safeLead: Record<string, string | null> = {};
  for (const f of fields) safeLead[f] = (normalized[f] !== undefined ? normalized[f] : null);
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
  `).run(safeLead);
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

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
export interface AppSettings {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  email_recipients: string; // comma-separated
  scraper_api_key:  string;
  skip_trace_key:   string;
  auto_skip_trace:  string; // "true" | "false"
}

export function getSettings(): AppSettings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const stored: Record<string, string> = {};
  for (const row of rows) stored[row.key] = row.value;
  return {
    smtp_host:        stored.smtp_host        ?? process.env.SMTP_HOST        ?? "",
    smtp_port:        stored.smtp_port        ?? process.env.SMTP_PORT        ?? "587",
    smtp_user:        stored.smtp_user        ?? process.env.SMTP_USER        ?? "",
    smtp_pass:        stored.smtp_pass        ?? process.env.SMTP_PASS        ?? "",
    smtp_from:        stored.smtp_from        ?? process.env.SMTP_FROM        ?? "",
    email_recipients: stored.email_recipients ?? process.env.CLIENT_EMAIL     ?? "",
    scraper_api_key:  stored.scraper_api_key  ?? process.env.SCRAPER_API_KEY  ?? "",
    skip_trace_key:   stored.skip_trace_key   ?? "",
    auto_skip_trace:  stored.auto_skip_trace  ?? "false",
  };
}

export function updateLeadSkipTrace(
  id: string,
  data: { phone?: string; email?: string; mailing?: string }
): void {
  db.prepare(`
    UPDATE leads SET
      skip_traced = 1,
      st_phone    = COALESCE(?, st_phone),
      st_email    = COALESCE(?, st_email),
      st_mailing  = COALESCE(?, st_mailing),
      updated_at  = datetime('now')
    WHERE id = ?
  `).run(data.phone ?? null, data.email ?? null, data.mailing ?? null, id);
}

export function saveSettings(partial: Partial<AppSettings>): void {
  const upsert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const saveMany = db.transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) upsert.run(k, v);
  });
  saveMany(Object.entries(partial) as [string, string][]);
}
