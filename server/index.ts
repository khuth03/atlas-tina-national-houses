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
  counties: JSON.parse(process.env.CLIENT_COUNTIES || "[]") as Array<{ name: string; state: string }>,
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
    const leads = getLeads({
      county: county || undefined,
      lead_type: lead_type || undefined,
      status: status || undefined,
      from_date: from_date || undefined,
      to_date: to_date || undefined,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0,
    });
    res.json({ leads, total: leads.length });
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
    res.json(getStats());
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
