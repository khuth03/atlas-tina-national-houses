import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { db, upsertLead, getLeads, updateLeadStatus, getStats, logScrapeRun, finishScrapeRun } from "./db.js";
import { runAllScrapers, getDateRange } from "./scrapers/index.js";
import { sendDailyReport } from "./email.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CLIENT CONFIG (injected per client via env vars) ─────────────────────────
const CLIENT_CONFIG = {
  name: process.env.CLIENT_NAME || "Atlas",
  email: process.env.CLIENT_EMAIL || "",
  counties: (JSON.parse(process.env.CLIENT_COUNTIES || "[]") as Array<Record<string, string>>).map(c => ({ name: c.name || c.county || "", county: c.name || c.county || "", state: c.state || "" })),
};

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
function leadsToCSV(leads: Record<string, string | null>[]): string {
  const headers = [
    "Lead Type", "County", "State", "Owner Name", "Property Address", "City", "Zip",
    "Mailing Address", "Mailing City", "Mailing State", "Mailing Zip",
    "Case Number", "Filing Date", "Assessed Value", "Tax Year",
    "Lender", "Loan Amount", "Sale Date", "Sale Amount", "Description", "Source URL", "Status"
  ];
  const fields = [
    "lead_type", "county", "state", "owner_name", "address", "city", "zip",
    "mailing_address", "mailing_city", "mailing_state", "mailing_zip",
    "case_number", "filing_date", "assessed_value", "tax_year",
    "lender", "loan_amount", "sale_date", "sale_amount", "description", "source_url", "status"
  ];
  const escape = (v: string | null | undefined) => {
    if (!v) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const rows = leads.map(l => fields.map(f => escape(l[f] as string)).join(","));
  return [headers.join(","), ...rows].join("\n");
}

// ─── SCRAPE JOB STATE ─────────────────────────────────────────────────────────
let scrapeInProgress = false;
let lastScrapeLog: string[] = [];
let lastScrapeTime: string | null = null;

async function runScrapeJob(fromDate: string, toDate: string): Promise<number> {
  if (scrapeInProgress) throw new Error("Scrape already in progress");
  scrapeInProgress = true;
  lastScrapeLog = [];
  let totalNew = 0;

  try {
    const counties = CLIENT_CONFIG.counties.map(c => ({
      name: c.name,
      state: c.state,
      leadTypes: ["Pre-Foreclosure", "Tax Delinquent", "Probate", "Sheriff Sale", "FSBO", "Obituary", "Code Violation", "Divorce", "Fire Damage"],
    }));

    const { leads, errors } = await runAllScrapers(counties, fromDate, toDate, (msg) => {
      lastScrapeLog.push(msg);
      console.log(`[Scrape] ${msg}`);
    });

    for (const lead of leads) {
      const isNew = upsertLead(lead as unknown as Record<string, string | null>);
      if (isNew) totalNew++;
    }

    if (errors.length) lastScrapeLog.push(`⚠ ${errors.length} errors: ${errors.join("; ")}`);
    lastScrapeLog.push(`✓ Done: ${totalNew} new leads saved`);
    lastScrapeTime = new Date().toISOString();
    console.log(`[Scrape] Complete: ${totalNew} new leads`);
  } finally {
    scrapeInProgress = false;
  }
  return totalNew;
}

// ─── DAILY CRON (6 AM local) ──────────────────────────────────────────────────
function scheduleDailyScrape() {
  const now = new Date();
  const next6am = new Date(now);
  next6am.setHours(6, 0, 0, 0);
  if (next6am <= now) next6am.setDate(next6am.getDate() + 1);
  const msUntil = next6am.getTime() - now.getTime();

  setTimeout(async () => {
    console.log("[Cron] Running daily scrape...");
    const { fromDate, toDate } = getDateRange(1); // last 24 hours
    try {
      const newLeads = await runScrapeJob(fromDate, toDate);
      if (CLIENT_CONFIG.email && newLeads > 0) {
        const allLeads = getLeads({ from_date: toDate, to_date: toDate }) as Record<string, string | null>[];
        await sendDailyReport(CLIENT_CONFIG.email, CLIENT_CONFIG.name, allLeads as any, toDate);
      }
    } catch (e) {
      console.error("[Cron] Daily scrape failed:", e);
    }
    scheduleDailyScrape(); // reschedule for next day
  }, msUntil);

  console.log(`[Cron] Next scrape scheduled for ${next6am.toISOString()}`);
}

// ─── EXPRESS APP ──────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json());

  // ── API Routes ──────────────────────────────────────────────────────────────

  // GET /api/leads — list leads with filters
   app.get("/api/leads", (req, res) => {
    const { county, lead_type, status, from_date, to_date, limit, offset } = req.query as Record<string, string>;
    const filters = {
      county: county || undefined,
      lead_type: lead_type || undefined,
      status: status || undefined,
      from_date: from_date || undefined,
      to_date: to_date || undefined,
    };
    const allLeads = getLeads(filters);
    const total = allLeads.length;
    const pageLimit = limit ? parseInt(limit) : 100;
    const pageOffset = offset ? parseInt(offset) : 0;
    const leads = allLeads.slice(pageOffset, pageOffset + pageLimit);
    res.json({ leads, total });
  });
  // GET /api/leads/export — download CSV
  app.get("/api/leads/export", (req, res) => {
    const { county, lead_type, status, from_date, to_date } = req.query as Record<string, string>;
    const leads = getLeads({
      county: county || undefined,
      lead_type: lead_type || undefined,
      status: status || undefined,
      from_date: from_date || undefined,
      to_date: to_date || undefined,
    }) as Record<string, string | null>[];
    const csv = leadsToCSV(leads);
    const date = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="atlas-leads-${date}.csv"`);
    res.send(csv);
  });

  // PATCH /api/leads/:id — update status/notes
  app.patch("/api/leads/:id", (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;
    updateLeadStatus(id, status, notes);
    res.json({ ok: true });
  });

  // GET /api/stats — dashboard stats
  app.get("/api/stats", (_req, res) => {
    res.json({ ...getStats(), lastScrapeTime });
  });

  // GET /api/config — client config (counties, name)
  app.get("/api/config", (_req, res) => {
    res.json({ name: CLIENT_CONFIG.name, counties: CLIENT_CONFIG.counties });
  });

  // POST /api/scrape — trigger manual scrape
  app.post("/api/scrape", async (req, res) => {
    if (scrapeInProgress) {
      return res.status(409).json({ error: "Scrape already in progress" });
    }
    const { from_date, to_date } = req.body;
    const fromDate = from_date || getDateRange(1).fromDate;
    const toDate = to_date || getDateRange(0).toDate;

    // Run in background
    runScrapeJob(fromDate, toDate).catch(console.error);
    res.json({ ok: true, message: "Scrape started", from_date: fromDate, to_date: toDate });
  });

  // GET /api/scrape/status — check if scrape is running
  app.get("/api/scrape/status", (_req, res) => {
    res.json({ in_progress: scrapeInProgress, log: lastScrapeLog });
  });

  // POST /api/scrape/historical — pull last N days (up to 90)
  app.post("/api/scrape/historical", async (req, res) => {
    if (scrapeInProgress) {
      return res.status(409).json({ error: "Scrape already in progress" });
    }
    const { days_back } = req.body;
    const daysBack = Math.min(parseInt(days_back) || 30, 90);
    const { fromDate, toDate } = getDateRange(daysBack);

    runScrapeJob(fromDate, toDate).catch(console.error);
    res.json({ ok: true, message: `Historical scrape started (${daysBack} days)`, from_date: fromDate, to_date: toDate });
  });

  // POST /api/seed — inject demo leads (temporary, for dashboard screenshots)
  app.post("/api/seed", (_req, res) => {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0];
    const seedLeads = [
      { id: "MO-JACKSON-PREFC-001", county: "Jackson", state: "MO", lead_type: "Pre-Foreclosure", owner_name: "Darnell & Keisha Washington", address: "3812 Prospect Ave", city: "Kansas City", zip: "64128", mailing_address: "3812 Prospect Ave", mailing_city: "Kansas City", mailing_state: "MO", mailing_zip: "64128", case_number: "2026CV-04821", filing_date: twoDaysAgo, assessed_value: "142000", tax_year: "2025", lender: "Ocwen Loan Servicing", loan_amount: "118000", sale_date: null, sale_amount: null, description: "Jackson County Pre-Foreclosure — Case 2026CV-04821", source_url: "https://www.jacksongov.org/sheriff", status: "New", notes: null, scraped_at: today },
      { id: "MO-JACKSON-PREFC-002", county: "Jackson", state: "MO", lead_type: "Pre-Foreclosure", owner_name: "Sandra Okafor", address: "7701 Troost Ave", city: "Kansas City", zip: "64131", mailing_address: "PO Box 3312", mailing_city: "Overland Park", mailing_state: "KS", mailing_zip: "66210", case_number: "2026CV-04955", filing_date: yesterday, assessed_value: "168000", tax_year: "2025", lender: "SPS Servicing", loan_amount: "139000", sale_date: null, sale_amount: null, description: "Jackson County Pre-Foreclosure — Case 2026CV-04955", source_url: "https://www.jacksongov.org/sheriff", status: "New", notes: null, scraped_at: today },
      { id: "MO-JACKSON-TAXDEL-001", county: "Jackson", state: "MO", lead_type: "Tax Delinquent", owner_name: "Midwest Properties Group LLC", address: "1144 E 31st St", city: "Kansas City", zip: "64109", mailing_address: "PO Box 7712", mailing_city: "Dallas", mailing_state: "TX", mailing_zip: "75201", case_number: null, filing_date: twoDaysAgo, assessed_value: "89000", tax_year: "2022", lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: "Jackson County Tax Delinquent — LLC, 3 years unpaid", source_url: "https://www.jacksoncountytax.org/", status: "New", notes: null, scraped_at: today },
      { id: "MO-CLAY-PREFC-001", county: "Clay", state: "MO", lead_type: "Pre-Foreclosure", owner_name: "Timothy & Rose Hendricks", address: "2209 NE 72nd St", city: "Kansas City", zip: "64119", mailing_address: "2209 NE 72nd St", mailing_city: "Kansas City", mailing_state: "MO", mailing_zip: "64119", case_number: "2026CV-01234", filing_date: yesterday, assessed_value: "211000", tax_year: "2025", lender: "Carrington Mortgage", loan_amount: "178000", sale_date: null, sale_amount: null, description: "Clay County Pre-Foreclosure — Case 2026CV-01234", source_url: "https://www.claycountymo.gov/sheriff", status: "Reviewed", notes: "Motivated seller — behind 4 months", scraped_at: today },
      { id: "MO-CLAY-PROBATE-001", county: "Clay", state: "MO", lead_type: "Probate", owner_name: "Estate of William R. Chambers", address: "5501 N Oak Trafficway", city: "Gladstone", zip: "64118", mailing_address: "c/o Rebecca Chambers, 5501 N Oak Trafficway", mailing_city: "Gladstone", mailing_state: "MO", mailing_zip: "64118", case_number: "2026PR-00312", filing_date: twoDaysAgo, assessed_value: "254000", tax_year: "2025", lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: "Clay County Probate — Estate of William R. Chambers", source_url: "https://www.courts.mo.gov/", status: "New", notes: null, scraped_at: today },
      { id: "AL-MADISON-PREFC-001", county: "Madison", state: "AL", lead_type: "Pre-Foreclosure", owner_name: "Anthony & Brenda Simmons", address: "4401 Whitesburg Dr S", city: "Huntsville", zip: "35802", mailing_address: "4401 Whitesburg Dr S", mailing_city: "Huntsville", mailing_state: "AL", mailing_zip: "35802", case_number: "CV-2026-000891", filing_date: today, assessed_value: "198000", tax_year: "2025", lender: "Freedom Mortgage", loan_amount: "164000", sale_date: null, sale_amount: null, description: "Madison County Pre-Foreclosure — CV-2026-000891", source_url: "https://www.madisoncountyal.gov/sheriff", status: "New", notes: null, scraped_at: today },
      { id: "AL-MADISON-TAXDEL-001", county: "Madison", state: "AL", lead_type: "Tax Delinquent", owner_name: "Reginald Booker", address: "7823 Pulaski Pike", city: "Huntsville", zip: "35810", mailing_address: "PO Box 1122", mailing_city: "Nashville", mailing_state: "TN", mailing_zip: "37201", case_number: null, filing_date: yesterday, assessed_value: "112000", tax_year: "2023", lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: "Madison County Tax Delinquent — Out-of-state owner", source_url: "https://www.madisoncountyal.gov/revenue", status: "New", notes: null, scraped_at: today },
      { id: "AL-JEFFERSON-PREFC-001", county: "Jefferson", state: "AL", lead_type: "Pre-Foreclosure", owner_name: "Latoya & Marcus Green", address: "1822 Ensley Ave", city: "Birmingham", zip: "35218", mailing_address: "1822 Ensley Ave", mailing_city: "Birmingham", mailing_state: "AL", mailing_zip: "35218", case_number: "CV-2026-002341", filing_date: twoDaysAgo, assessed_value: "87000", tax_year: "2025", lender: "Ditech Financial", loan_amount: "71000", sale_date: null, sale_amount: null, description: "Jefferson County Pre-Foreclosure — CV-2026-002341", source_url: "https://www.jeffcosheriff.net/", status: "Contacted", notes: "Spoke with owner 5/13 — wants $95k", scraped_at: today },
      { id: "AL-MONTGOMERY-SHERIFF-001", county: "Montgomery", state: "AL", lead_type: "Sheriff Sale", owner_name: "Harold Pittman", address: "3304 Mobile Hwy", city: "Montgomery", zip: "36108", mailing_address: "3304 Mobile Hwy", mailing_city: "Montgomery", mailing_state: "AL", mailing_zip: "36108", case_number: "CV-2025-004412", filing_date: yesterday, assessed_value: "134000", tax_year: "2025", lender: "Selene Finance", loan_amount: "109000", sale_date: "2026-06-03", sale_amount: "109000", description: "Montgomery County Sheriff Sale — June 3, 2026", source_url: "https://www.montgomerysheriff.org/", status: "New", notes: null, scraped_at: today },
      { id: "OH-HAMILTON-PREFC-001", county: "Hamilton", state: "OH", lead_type: "Pre-Foreclosure", owner_name: "David & Connie Reardon", address: "5512 Glenway Ave", city: "Cincinnati", zip: "45238", mailing_address: "5512 Glenway Ave", mailing_city: "Cincinnati", mailing_state: "OH", mailing_zip: "45238", case_number: "A2600891", filing_date: today, assessed_value: "178000", tax_year: "2025", lender: "Lakeview Loan Servicing", loan_amount: "149000", sale_date: null, sale_amount: null, description: "Hamilton County Pre-Foreclosure — A2600891", source_url: "https://www.hamiltoncountyohio.gov/sheriff", status: "New", notes: null, scraped_at: today },
      { id: "OH-HAMILTON-TAXDEL-001", county: "Hamilton", state: "OH", lead_type: "Tax Delinquent", owner_name: "Westside Holdings LLC", address: "2201 W McMicken Ave", city: "Cincinnati", zip: "45214", mailing_address: "PO Box 44901", mailing_city: "Columbus", mailing_state: "OH", mailing_zip: "43215", case_number: null, filing_date: twoDaysAgo, assessed_value: "203000", tax_year: "2022", lender: null, loan_amount: null, sale_date: null, sale_amount: null, description: "Hamilton County Tax Delinquent — LLC, 3 years unpaid", source_url: "https://www.hamiltoncountyohio.gov/treasurer", status: "New", notes: null, scraped_at: today },
      { id: "MO-PLATTE-PREFC-001", county: "Platte", state: "MO", lead_type: "Pre-Foreclosure", owner_name: "Cynthia Moorehouse", address: "9012 NW Prairie View Rd", city: "Kansas City", zip: "64153", mailing_address: "9012 NW Prairie View Rd", mailing_city: "Kansas City", mailing_state: "MO", mailing_zip: "64153", case_number: "2026CV-00441", filing_date: yesterday, assessed_value: "287000", tax_year: "2025", lender: "Rocket Mortgage", loan_amount: "241000", sale_date: null, sale_amount: null, description: "Platte County Pre-Foreclosure — Case 2026CV-00441", source_url: "https://www.plattecountymo.gov/sheriff", status: "New", notes: null, scraped_at: today },
    ];
    let inserted = 0;
    for (const lead of seedLeads) {
      const isNew = upsertLead(lead as unknown as Record<string, string | null>);
      if (isNew) inserted++;
    }
    res.json({ ok: true, inserted, total: seedLeads.length });
  });

  // ── Static Frontend ──────────────────────────────────────────────────────────
  const staticPath = path.resolve(__dirname, "public");
  app.use(express.static(staticPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`[Atlas] Server running on http://localhost:${port}/`);
    console.log(`[Atlas] Client: ${CLIENT_CONFIG.name}`);
    console.log(`[Atlas] Counties: ${CLIENT_CONFIG.counties.map(c => `${c.name} ${c.state}`).join(", ")}`);
    scheduleDailyScrape();
  });
}

startServer().catch(console.error);
