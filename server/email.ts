import nodemailer from "nodemailer";

interface Lead {
  id: string;
  county: string;
  state: string;
  lead_type: string;
  owner_name: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  mailing_address: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  case_number: string | null;
  filing_date: string | null;
  assessed_value: string | null;
  tax_year: string | null;
  lender: string | null;
  loan_amount: string | null;
  sale_date: string | null;
  sale_amount: string | null;
  description: string | null;
  source_url: string | null;
}

export interface SmtpSettings {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
}

function leadsToCSV(leads: Lead[]): string {
  const headers = [
    "Lead Type", "County", "State", "Owner Name", "Property Address", "City", "Zip",
    "Mailing Address", "Mailing City", "Mailing State", "Mailing Zip",
    "Case Number", "Filing Date", "Assessed Value", "Tax Year",
    "Lender", "Loan Amount", "Sale Date", "Sale Amount", "Description", "Source URL"
  ];
  const escape = (v: string | null | undefined) => {
    if (!v) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const rows = leads.map(l => [
    l.lead_type, l.county, l.state, l.owner_name, l.address, l.city, l.zip,
    l.mailing_address, l.mailing_city, l.mailing_state, l.mailing_zip,
    l.case_number, l.filing_date, l.assessed_value, l.tax_year,
    l.lender, l.loan_amount, l.sale_date, l.sale_amount, l.description, l.source_url
  ].map(escape).join(","));
  return [headers.join(","), ...rows].join("\n");
}

export async function sendDailyReport(
  toEmail: string,
  companyName: string,
  leads: Lead[],
  date: string,
  settings?: Partial<SmtpSettings>,
  isTest = false
): Promise<void> {
  // Settings DB values take priority over env vars
  const smtpHost = settings?.smtp_host || process.env.SMTP_HOST;
  const smtpPort = parseInt(settings?.smtp_port || process.env.SMTP_PORT || "587");
  const smtpUser = settings?.smtp_user || process.env.SMTP_USER;
  const smtpPass = settings?.smtp_pass || process.env.SMTP_PASS;
  const fromEmail = settings?.smtp_from || process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("[Email] SMTP not configured — skipping daily report email");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const byType = leads.reduce((acc, l) => {
    acc[l.lead_type] = (acc[l.lead_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const summaryRows = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `<tr><td style="padding:4px 12px">${type}</td><td style="padding:4px 12px;text-align:right"><strong>${count}</strong></td></tr>`)
    .join("");

  const subject = isTest
    ? `✅ Atlas Email Test — ${companyName}`
    : `🏠 Atlas Daily Leads — ${leads.length} new leads for ${date}`;

  const bodyHtml = isTest
    ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1a1a2e;color:white;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">Atlas Lead Engine</h2>
          <p style="margin:4px 0 0;opacity:0.7">${companyName} — Email Test</p>
        </div>
        <div style="background:#f8f9fa;padding:24px;border-radius:0 0 8px 8px">
          <h3 style="margin-top:0;color:#28a745">✅ Your email is configured correctly!</h3>
          <p>This is a test message from Atlas. Your daily lead reports will be delivered to this address every morning at 6:00 AM EST.</p>
          <p style="color:#666;font-size:12px">Sent from Atlas Lead Engine</p>
        </div>
      </div>`
    : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1a1a2e;color:white;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">Atlas Lead Engine</h2>
          <p style="margin:4px 0 0;opacity:0.7">${companyName} — Daily Report</p>
        </div>
        <div style="background:#f8f9fa;padding:24px;border-radius:0 0 8px 8px">
          <h3 style="margin-top:0">📊 Today's Summary — ${date}</h3>
          <p><strong>${leads.length} total new leads</strong> found across your target counties.</p>
          <table style="border-collapse:collapse;width:100%;background:white;border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
            <thead>
              <tr style="background:#e9ecef">
                <th style="padding:8px 12px;text-align:left">Lead Type</th>
                <th style="padding:8px 12px;text-align:right">Count</th>
              </tr>
            </thead>
            <tbody>${summaryRows || '<tr><td colspan="2" style="padding:8px 12px;color:#999">No leads today</td></tr>'}</tbody>
          </table>
          <p style="margin-top:20px">The full lead list is attached as a CSV file, ready for skip-tracing.</p>
          <p style="color:#666;font-size:12px">Log in to your Atlas dashboard to view, filter, and manage all leads.</p>
        </div>
      </div>`;

  const csvContent = leadsToCSV(leads);
  const filename = `atlas-leads-${date}.csv`;

  await transporter.sendMail({
    from: `Atlas Lead Engine <${fromEmail}>`,
    to: toEmail,
    subject,
    html: bodyHtml,
    attachments: isTest ? [] : [{ filename, content: csvContent, contentType: "text/csv" }],
  });

  console.log(`[Email] ${isTest ? "Test email" : "Daily report"} sent to ${toEmail}${isTest ? "" : `: ${leads.length} leads`}`);
}
