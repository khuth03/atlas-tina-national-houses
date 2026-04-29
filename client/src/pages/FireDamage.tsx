// Fire Damage Monitor — Daily fire report tracking with owner skip-trace
import { useState } from "react";

const MOCK_INCIDENTS = [
  { id: "FD-2026-0428-001", date: "04/28/2026", time: "2:14 AM", address: "3812 Oleander Dr, Myrtle Beach SC", type: "Structure Fire", severity: "Major", units: 6, owner: "Patricia Ann Holloway", skipTraced: true, phone: "(843) 555-0182", equity: "$167K", status: "Owner Contacted", source: "Myrtle Beach Fire Dept" },
  { id: "FD-2026-0427-003", date: "04/27/2026", time: "11:42 PM", address: "1205 Hwy 17 Business, Surfside Beach SC", type: "Structure Fire", severity: "Total Loss", units: 8, owner: "Raymond & Donna Castillo", skipTraced: true, phone: "(843) 555-0247", equity: "$89K", status: "New Lead", source: "Horry County Fire Rescue" },
  { id: "FD-2026-0427-001", date: "04/27/2026", time: "3:55 PM", address: "724 Pawleys Island Rd, Georgetown SC", type: "Partial Fire", severity: "Moderate", units: 4, owner: "Estate of Thomas Wren", skipTraced: false, phone: null, equity: "$234K", status: "Skip Trace Needed", source: "Georgetown County Fire" },
  { id: "FD-2026-0426-002", date: "04/26/2026", time: "7:22 AM", address: "5501 N Kings Hwy, Myrtle Beach SC", type: "Structure Fire", severity: "Major", units: 5, owner: "Coastal Properties LLC", skipTraced: true, phone: "(843) 555-0391", equity: "$312K", status: "Offer Made", source: "Myrtle Beach Fire Dept" },
];

const SEVERITY_STYLE: Record<string, { color: string; bg: string }> = {
  "Total Loss": { color: "oklch(0.55 0.22 25)", bg: "oklch(0.55 0.22 25 / 0.1)" },
  "Major": { color: "oklch(0.55 0.22 25)", bg: "oklch(0.60 0.20 28 / 0.1)" },
  "Moderate": { color: "oklch(0.75 0.18 65)", bg: "oklch(0.75 0.18 65 / 0.1)" },
  "Minor": { color: "oklch(0.65 0.18 145)", bg: "oklch(0.65 0.18 145 / 0.1)" },
};

const STATUS_STYLE: Record<string, string> = {
  "New Lead": "atlas-badge-red",
  "Skip Trace Needed": "atlas-badge-amber",
  "Owner Contacted": "atlas-badge-blue",
  "Offer Made": "atlas-badge-green",
};

export default function FireDamage() {
  const [filter, setFilter] = useState("All");

  const severities = ["All", "Total Loss", "Major", "Moderate"];
  const filtered = filter === "All" ? MOCK_INCIDENTS : MOCK_INCIDENTS.filter(i => i.severity === filter);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h1 className="atlas-section-title">Fire Damage Monitor</h1>
            <span className="atlas-badge atlas-badge-red">NEW MODULE</span>
          </div>
          <p style={{ fontSize: 14, color: "oklch(0.45 0.02 40)" }}>
            Daily fire report monitoring · Owner verification · Skip-trace · Daily CSV delivery
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="atlas-btn-ghost">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
          <button className="atlas-btn">
            <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }}/>
            Monitoring Active
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Incidents This Week", value: "11", color: "oklch(0.95 0.01 60)" },
          { label: "Total Loss", value: "2", color: "oklch(0.55 0.22 25)" },
          { label: "Major Fires", value: "4", color: "oklch(0.55 0.22 25)" },
          { label: "Skip Traced", value: "8", color: "oklch(0.65 0.18 145)" },
          { label: "Offers Made", value: "1", color: "oklch(0.75 0.18 65)" },
        ].map(s => (
          <div key={s.label} className="atlas-stat-card" style={{ padding: 16 }}>
            <div className="atlas-label" style={{ marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Sources */}
      <div className="atlas-card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="atlas-label" style={{ marginBottom: 14 }}>Monitored Sources</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 8 }}>Fire Department Reports</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {["Myrtle Beach Fire Department", "Horry County Fire Rescue", "Georgetown County Fire", "Conway Fire Department", "North Myrtle Beach Fire"].map(s => (
                <div key={s} style={{ fontSize: 12, color: "oklch(0.60 0.01 60)", display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="pulse-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "oklch(0.60 0.22 25)", flexShrink: 0 }}/>
                  {s}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 8 }}>News & Data Sources</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {["Myrtle Beach Sun News", "WMBF News Fire Reports", "Local Scanner Feeds", "County Records Cross-Reference", "Skip Trace API (BatchSkipTracing)"].map(s => (
                <div key={s} style={{ fontSize: 12, color: "oklch(0.60 0.01 60)", display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="pulse-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "oklch(0.65 0.18 145)", flexShrink: 0 }}/>
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {severities.map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: "6px 14px", borderRadius: 6, border: "1px solid",
            fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
            background: filter === s ? "oklch(0.55 0.22 25)" : "transparent",
            borderColor: filter === s ? "oklch(0.55 0.22 25)" : "oklch(0.22 0.015 30)",
            color: filter === s ? "white" : "oklch(0.50 0.02 40)",
          }}>{s}</button>
        ))}
      </div>

      {/* Incidents table */}
      <div className="atlas-card" style={{ overflow: "hidden" }}>
        <table className="atlas-table">
          <thead>
            <tr>
              <th>Date/Time</th>
              <th>Severity</th>
              <th>Address</th>
              <th>Type</th>
              <th>Owner</th>
              <th>Est. Equity</th>
              <th>Status</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(inc => {
              const sev = SEVERITY_STYLE[inc.severity] || SEVERITY_STYLE["Minor"];
              return (
                <tr key={inc.id}>
                  <td>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "oklch(0.70 0.01 60)" }}>{inc.date}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "oklch(0.40 0.02 40)" }}>{inc.time}</div>
                  </td>
                  <td>
                    <span style={{ padding: "4px 8px", borderRadius: 4, background: sev.bg, color: sev.color, fontSize: 11, fontWeight: 700 }}>
                      {inc.severity}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500, color: "oklch(0.85 0.01 60)", fontSize: 13 }}>{inc.address}</td>
                  <td style={{ fontSize: 12, color: "oklch(0.55 0.02 40)" }}>{inc.type}</td>
                  <td>
                    <div style={{ fontSize: 13, color: "oklch(0.80 0.01 60)" }}>{inc.owner}</div>
                    {inc.phone && <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "oklch(0.50 0.02 40)" }}>{inc.phone}</div>}
                  </td>
                  <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "oklch(0.65 0.18 145)", fontWeight: 600 }}>{inc.equity}</td>
                  <td><span className={`atlas-badge ${STATUS_STYLE[inc.status] || "atlas-badge-orange"}`}>{inc.status}</span></td>
                  <td style={{ fontSize: 11, color: "oklch(0.40 0.02 40)" }}>{inc.source}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!inc.skipTraced && <button className="atlas-btn-ghost" style={{ padding: "5px 10px", fontSize: 11 }}>Skip Trace</button>}
                      <button className="atlas-btn" style={{ padding: "6px 12px", fontSize: 12 }}>Contact →</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
