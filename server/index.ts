import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { db, upsertLead, getLeads, updateLeadStatus, getStats, logScrapeRun, finishScrapeRun, getSettings, saveSettings } from "./db.js";
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
      name: c.name || (c as any).county || "",
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

// ─── DAILY CRON — 6:00 AM EST every day (restart-safe via node-cron) ─────────
function startDailyCron() {
  // 0 11 * * * = 11:00 UTC = 6:00 AM EST / 7:00 AM EDT
  cron.schedule("0 11 * * *", async () => {
    console.log("[Cron] Running daily scrape at 6am EST...");
    const { fromDate, toDate } = getDateRange(1);
    try {
      const newLeads = await runScrapeJob(fromDate, toDate);
      const settings = getSettings();
      const recipients = settings.email_recipients
        ? settings.email_recipients.split(",").map(e => e.trim()).filter(Boolean)
        : CLIENT_CONFIG.email ? [CLIENT_CONFIG.email] : [];
      const smtpReady = settings.smtp_host && settings.smtp_user && settings.smtp_pass
        && !settings.smtp_pass.startsWith("placeholder");
      if (recipients.length > 0 && newLeads > 0 && smtpReady) {
        const allLeads = getLeads({ from_date: toDate, to_date: toDate }) as Record<string, string | null>[];
        for (const recipient of recipients) {
          await sendDailyReport(recipient, CLIENT_CONFIG.name, allLeads as any, toDate, settings).catch(e =>
            console.error(`[Cron] Email to ${recipient} failed:`, e)
          );
        }
        console.log(`[Cron] Daily report sent to ${recipients.length} recipient(s)`);
      } else if (!smtpReady) {
        console.log("[Cron] Email skipped — SMTP not configured in Settings");
      }
    } catch (e) {
      console.error("[Cron] Daily scrape failed:", e);
    }
  }, { timezone: "America/New_York" });

  console.log("[Cron] Daily scrape scheduled for 6:00 AM EST (node-cron, restart-safe)");
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

  // GET /api/settings — get current settings (masks smtp_pass)
  app.get("/api/settings", (_req, res) => {
    const s = getSettings();
    res.json({
      smtp_host: s.smtp_host,
      smtp_port: s.smtp_port,
      smtp_user: s.smtp_user,
      smtp_pass: s.smtp_pass && !s.smtp_pass.startsWith("placeholder") ? "••••••••••••••••" : "",
      smtp_from: s.smtp_from,
      email_recipients: s.email_recipients,
      scraper_api_key: s.scraper_api_key ? "••••••••••••••••" : "",
      smtp_configured: !!(s.smtp_host && s.smtp_user && s.smtp_pass && !s.smtp_pass.startsWith("placeholder")),
      scraper_api_configured: !!s.scraper_api_key,
    });
  });

  // POST /api/settings — save settings
  app.post("/api/settings", (req, res) => {
    const allowed = ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "email_recipients", "scraper_api_key"];
    const partial: Record<string, string> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined && req.body[key] !== "••••••••••••••••") {
        partial[key] = String(req.body[key]);
      }
    }
    saveSettings(partial);
    res.json({ ok: true });
  });

  // POST /api/settings/test-email — send a test email
  app.post("/api/settings/test-email", async (req, res) => {
    const settings = getSettings();
    const testRecipient = req.body.email || settings.email_recipients?.split(",")[0]?.trim();
    if (!testRecipient) return res.status(400).json({ error: "No recipient email" });
    if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass || settings.smtp_pass.startsWith("placeholder")) {
      return res.status(400).json({ error: "SMTP not configured" });
    }
    try {
      await sendDailyReport(testRecipient, CLIENT_CONFIG.name, [], new Date().toISOString().split("T")[0], settings, true);
      res.json({ ok: true, message: `Test email sent to ${testRecipient}` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/scrape — trigger manual scrape
  app.post("/api/scrape", async (req, res) => {
    if (scrapeInProgress) {
      return res.status(409).json({ error: "Scrape already in progress" });
    }
    const { from_date, to_date } = req.body;
    const fromDate = from_date || getDateRange(1).fromDate;
    const toDate = to_date || getDateRange(0).toDate;
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

  // POST /api/seed — inject demo leads
  app.post("/api/seed", (_req, res) => {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0];
    const seedLeads = [
      { id: "MO-JACKSON-PREFC-001", county: "Jackson", state: "MO", lead_type: "Pre-Foreclosure", owner_name: "Darnell & Keisha Washington", address: "3812 Prospect Ave", city: "Kansas City", zip: "64128", mailing_address: "3812 Prospect Ave", mailing_city: "Kansas City", mailing_state: "MO", mailing_zip: "64128", case_number: "2026CV-04821", filing_date: twoDaysAgo, assessed_value: "142000", tax_year: "2025", lender: "Ocwen Loan Servicing", loan_amount: "118000", sale_date: null, sale_amount: null, description: "Jackson County Pre-Foreclosure — Case 2026CV-04821", source_url: "https://www.jacksongov.org/sheriff", status: "New", notes: null, scraped_at: today },
      { id: "AL-MADISON-PREFC-001", county: "Madison", state: "AL", lead_type: "Pre-Foreclosure", owner_name: "Anthony & Brenda Simmons", address: "4401 Whitesburg Dr S", city: "Huntsville", zip: "35802", mailing_address: "4401 Whitesburg Dr S", mailing_city: "Huntsville", mailing_state: "AL", mailing_zip: "35802", case_number: "CV-2026-000891", filing_date: today, assessed_value: "198000", tax_year: "2025", lender: "Freedom Mortgage", loan_amount: "164000", sale_date: null, sale_amount: null, description: "Madison County Pre-Foreclosure — CV-2026-000891", source_url: "https://www.madisoncountyal.gov/sheriff", status: "New", notes: null, scraped_at: today },
      { id: "OH-HAMILTON-PREFC-001", county: "Hamilton", state: "OH", lead_type: "Pre-Foreclosure", owner_name: "David & Connie Reardon", address: "5512 Glenway Ave", city: "Cincinnati", zip: "45238", mailing_address: "5512 Glenway Ave", mailing_city: "Cincinnati", mailing_state: "OH", mailing_zip: "45238", case_number: "A2600891", filing_date: today, assessed_value: "178000", tax_year: "2025", lender: "Lakeview Loan Servicing", loan_amount: "149000", sale_date: null, sale_amount: null, description: "Hamilton County Pre-Foreclosure — A2600891", source_url: "https://www.hamiltoncountyohio.gov/sheriff", status: "New", notes: null, scraped_at: today },
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
    startDailyCron();
  });
}

startServer().catch(console.error);
// force rebuild Thu May 28 2026
