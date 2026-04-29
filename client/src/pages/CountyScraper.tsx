// County Scraper — Daily motivated lead feed from county records
import { useState } from "react";

const MOCK_LEADS = [
  { id: "HOR-FC-01118", type: "Foreclosure", owner: "Eugene F. Butler", address: "4821 Palmetto Dunes Dr", city: "Myrtle Beach", county: "Horry", case: "2026-CP-26-01118", filed: "04/09/2026", equity: "$142K", score: 87 },
  { id: "HOR-TX-00892", type: "Tax Delinquent", owner: "Marcus & Linda Webb", address: "1103 Ocean Blvd Unit 4B", city: "North Myrtle Beach", county: "Horry", case: "2026-TX-26-00892", filed: "04/08/2026", equity: "$89K", score: 74 },
  { id: "HOR-SS-00341", type: "Sheriff Sale", owner: "Sara Lynn Fisher", address: "7720 Kings Hwy", city: "Myrtle Beach", county: "Horry", case: "2025-CP-26-01534", filed: "04/07/2026", equity: "$210K", score: 91 },
  { id: "HOR-LP-00204", type: "Lis Pendens", owner: "Robert T. Simmons", address: "2204 Glenns Bay Rd", city: "Surfside Beach", county: "Horry", case: "2026-CP-26-00204", filed: "04/06/2026", equity: "$67K", score: 62 },
  { id: "HOR-FC-00987", type: "Foreclosure", owner: "Jennifer Kowalski", address: "5512 Socastee Blvd", city: "Myrtle Beach", county: "Horry", case: "2026-CP-26-00987", filed: "04/05/2026", equity: "$178K", score: 83 },
  { id: "GEO-TX-00112", type: "Tax Delinquent", owner: "David & Ann Prescott", address: "312 Front St", city: "Georgetown", county: "Georgetown", case: "2026-TX-22-00112", filed: "04/09/2026", equity: "$54K", score: 69 },
  { id: "HOR-PR-00078", type: "Probate", owner: "Estate of Harold Greene", address: "908 Waccamaw Pines Dr", city: "Conway", county: "Horry", case: "2026-PB-26-00078", filed: "04/04/2026", equity: "$312K", score: 95 },
  { id: "HOR-DV-00056", type: "Divorce", owner: "Thomas & Rachel Nguyen", address: "1847 Waterway Blvd", city: "Little River", county: "Horry", case: "2026-DR-26-00056", filed: "04/03/2026", equity: "$195K", score: 78 },
];

const TYPE_COLORS: Record<string, string> = {
  "Foreclosure": "atlas-badge-red",
  "Tax Delinquent": "atlas-badge-amber",
  "Sheriff Sale": "atlas-badge-red",
  "Lis Pendens": "atlas-badge-orange",
  "Probate": "atlas-badge-blue",
  "Divorce": "atlas-badge-blue",
};

const SCORE_COLOR = (s: number) =>
  s >= 85 ? "oklch(0.60 0.22 25)" : s >= 70 ? "oklch(0.75 0.18 65)" : "oklch(0.65 0.18 145)";

export default function CountyScraper() {
  const [filter, setFilter] = useState("All");
  const [running, setRunning] = useState(false);
  const [lastRun] = useState("Today at 6:02 AM");

  const types = ["All", "Foreclosure", "Tax Delinquent", "Sheriff Sale", "Lis Pendens", "Probate", "Divorce"];
  const filtered = filter === "All" ? MOCK_LEADS : MOCK_LEADS.filter(l => l.type === filter);

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 className="atlas-section-title" style={{ marginBottom: 6 }}>County Scraper</h1>
          <p style={{ fontSize: 14, color: "oklch(0.45 0.02 40)" }}>
            Daily motivated seller leads from county records · Last run: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "oklch(0.65 0.18 145)" }}>{lastRun}</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="atlas-btn-ghost">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
          <button
            className="atlas-btn"
            onClick={() => { setRunning(true); setTimeout(() => setRunning(false), 2500); }}
            style={{ opacity: running ? 0.7 : 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: running ? "spin 1s linear infinite" : "none" }}>
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {running ? "Scraping..." : "Run Now"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Today", value: "47", color: "oklch(0.95 0.01 60)" },
          { label: "Foreclosures", value: "18", color: "oklch(0.60 0.22 25)" },
          { label: "Tax Delinquent", value: "12", color: "oklch(0.75 0.18 65)" },
          { label: "Probate/Divorce", value: "9", color: "oklch(0.60 0.18 240)" },
          { label: "High Score (85+)", value: "11", color: "oklch(0.55 0.22 25)" },
        ].map(s => (
          <div key={s.label} className="atlas-stat-card" style={{ padding: 16 }}>
            <div className="atlas-label" style={{ marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Config panel */}
      <div className="atlas-card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="atlas-label" style={{ marginBottom: 14 }}>Scraper Configuration</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Target Counties</div>
            <select className="atlas-input" style={{ fontSize: 13 }}>
              <option>Jackson County, MO</option>
              <option>Clay County, MO</option>
              <option>Platte County, MO</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Lead Types</div>
            <select className="atlas-input" style={{ fontSize: 13 }}>
              <option>All Types</option>
              <option>Foreclosure Only</option>
              <option>Tax Delinquent Only</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Days Back</div>
            <select className="atlas-input" style={{ fontSize: 13 }}>
              <option>1 day</option>
              <option>7 days</option>
              <option>30 days</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Schedule</div>
            <select className="atlas-input" style={{ fontSize: 13 }}>
              <option>Daily at 6:00 AM</option>
              <option>Daily at 7:00 AM</option>
              <option>Manual Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {types.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
              background: filter === t ? "oklch(0.55 0.22 25)" : "transparent",
              borderColor: filter === t ? "oklch(0.55 0.22 25)" : "oklch(0.22 0.015 30)",
              color: filter === t ? "white" : "oklch(0.50 0.02 40)",
            }}
          >{t}</button>
        ))}
      </div>

      {/* Leads table */}
      <div className="atlas-card" style={{ overflow: "hidden" }}>
        <table className="atlas-table">
          <thead>
            <tr>
              <th>Score</th>
              <th>Type</th>
              <th>Owner</th>
              <th>Address</th>
              <th>County</th>
              <th>Case #</th>
              <th>Filed</th>
              <th>Est. Equity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(lead => (
              <tr key={lead.id}>
                <td>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: `${SCORE_COLOR(lead.score)} / 0.1`,
                    border: `2px solid ${SCORE_COLOR(lead.score)}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700, fontSize: 13,
                    color: SCORE_COLOR(lead.score),
                  }}>{lead.score}</div>
                </td>
                <td><span className={`atlas-badge ${TYPE_COLORS[lead.type] || "atlas-badge-orange"}`}>{lead.type}</span></td>
                <td style={{ fontWeight: 500, color: "oklch(0.90 0.01 60)" }}>{lead.owner}</td>
                <td style={{ color: "oklch(0.70 0.01 60)" }}>{lead.address}</td>
                <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{lead.county}</td>
                <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "oklch(0.55 0.02 40)" }}>{lead.case}</td>
                <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{lead.filed}</td>
                <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "oklch(0.65 0.18 145)", fontWeight: 600 }}>{lead.equity}</td>
                <td>
                  <button className="atlas-btn" style={{ padding: "6px 12px", fontSize: 12 }}>
                    Skip Trace →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
