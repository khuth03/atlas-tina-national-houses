// Obituary Monitor — Probate leads from local obituaries cross-referenced to county
import { useState } from "react";

const MOCK_OBITS = [
  { name: "Harold Eugene Greene", age: 78, published: "04/07/2026", source: "Myrtle Beach Sun News", city: "Conway, SC", properties: 2, totalValue: "$487K", heirs: ["Michael Greene", "Patricia Greene-Walsh"], skipTraced: true, probateFiled: true, caseNum: "2026-PB-26-00078", lead: { address: "908 Waccamaw Pines Dr, Conway SC", equity: "$312K" } },
  { name: "Dorothy Mae Simmons", age: 84, published: "04/06/2026", source: "Horry County Tribune", city: "Myrtle Beach, SC", properties: 1, totalValue: "$195K", heirs: ["Robert T. Simmons"], skipTraced: true, probateFiled: false, caseNum: null, lead: { address: "2204 Glenns Bay Rd, Surfside Beach SC", equity: "$67K" } },
  { name: "James William Kowalski", age: 71, published: "04/05/2026", source: "Conway Online Obituaries", city: "Myrtle Beach, SC", properties: 3, totalValue: "$820K", heirs: ["Jennifer Kowalski", "Brian Kowalski"], skipTraced: false, probateFiled: false, caseNum: null, lead: { address: "5512 Socastee Blvd, Myrtle Beach SC", equity: "$178K" } },
  { name: "Ruth Ann Butler", age: 69, published: "04/04/2026", source: "Georgetown Times", city: "Georgetown, SC", properties: 1, totalValue: "$142K", heirs: ["Eugene F. Butler"], skipTraced: true, probateFiled: true, caseNum: "2026-PB-22-00041", lead: { address: "4821 Palmetto Dunes Dr, Myrtle Beach SC", equity: "$142K" } },
];

export default function ObituaryMonitor() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 className="atlas-section-title" style={{ marginBottom: 6 }}>Obituary Monitor</h1>
          <p style={{ fontSize: 14, color: "oklch(0.45 0.02 40)" }}>
            Daily obituary scan → county record cross-reference → heir skip-trace → probate lead delivery
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="atlas-btn-ghost">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
          <button className="atlas-btn">
            <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }}/>
            Daily Scan Active
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Obituaries Scanned Today", value: "47", color: "oklch(0.95 0.01 60)" },
          { label: "Property Matches", value: "12", color: "oklch(0.55 0.22 25)" },
          { label: "Probate Filed", value: "5", color: "oklch(0.75 0.18 65)" },
          { label: "Skip Traced", value: "9", color: "oklch(0.65 0.18 145)" },
        ].map(s => (
          <div key={s.label} className="atlas-stat-card" style={{ padding: 16 }}>
            <div className="atlas-label" style={{ marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <div className="atlas-card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="atlas-label" style={{ marginBottom: 14 }}>How the Pipeline Works</div>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {[
            { step: "1", label: "Scan Obituaries", desc: "Local papers, online sources", icon: "📰" },
            { step: "2", label: "Cross-Reference", desc: "County records + PropStream", icon: "🔍" },
            { step: "3", label: "Verify Ownership", desc: "Confirm property ownership", icon: "✅" },
            { step: "4", label: "Skip Trace Heirs", desc: "Find heir contact info", icon: "📞" },
            { step: "5", label: "Daily CSV", desc: "Delivered every morning", icon: "📊" },
          ].map((s, i, arr) => (
            <div key={s.step} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "oklch(0.55 0.22 25)", marginBottom: 4 }}>STEP {s.step}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.85 0.01 60)", marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: "oklch(0.40 0.02 40)" }}>{s.desc}</div>
              </div>
              {i < arr.length - 1 && (
                <div style={{ color: "oklch(0.30 0.02 40)", padding: "0 4px" }}>→</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Config */}
      <div className="atlas-card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="atlas-label" style={{ marginBottom: 14 }}>Scan Configuration</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Obituary Sources</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {["Myrtle Beach Sun News", "Horry County Tribune", "Conway Online", "Georgetown Times", "Legacy.com (Horry/Georgetown)"].map(s => (
                <div key={s} style={{ fontSize: 12, color: "oklch(0.60 0.01 60)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "oklch(0.65 0.18 145)" }}>✓</span> {s}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Cross-Reference Sources</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {["Horry County Records", "Georgetown County Records", "PropStream API", "SC Probate Court"].map(s => (
                <div key={s} style={{ fontSize: 12, color: "oklch(0.60 0.01 60)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "oklch(0.65 0.18 145)" }}>✓</span> {s}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Schedule</div>
            <select className="atlas-input" style={{ fontSize: 13, marginBottom: 10 }}>
              <option>Daily at 6:00 AM</option>
              <option>Daily at 7:00 AM</option>
            </select>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Min Property Value</div>
            <select className="atlas-input" style={{ fontSize: 13 }}>
              <option>$50,000+</option>
              <option>$100,000+</option>
              <option>$200,000+</option>
            </select>
          </div>
        </div>
      </div>

      {/* Leads */}
      <div className="atlas-label" style={{ marginBottom: 12 }}>Today's Probate Leads</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {MOCK_OBITS.map((obit, i) => (
          <div key={i} className="atlas-card" style={{ overflow: "hidden" }}>
            <div
              style={{ padding: 20, cursor: "pointer", display: "flex", alignItems: "center", gap: 16 }}
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              {/* Icon */}
              <div style={{
                width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                background: "oklch(0.60 0.01 60 / 0.08)",
                border: "1px solid oklch(0.30 0.01 60 / 0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
              }}>📜</div>

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: "oklch(0.90 0.01 60)" }}>{obit.name}</span>
                  <span style={{ fontSize: 12, color: "oklch(0.40 0.02 40)" }}>Age {obit.age} · {obit.city}</span>
                  {obit.probateFiled && <span className="atlas-badge atlas-badge-amber">Probate Filed</span>}
                  {obit.skipTraced && <span className="atlas-badge atlas-badge-green">Skip Traced</span>}
                </div>
                <div style={{ display: "flex", gap: 20 }}>
                  <span style={{ fontSize: 12, color: "oklch(0.45 0.02 40)" }}>Source: <span style={{ color: "oklch(0.60 0.01 60)" }}>{obit.source}</span></span>
                  <span style={{ fontSize: 12, color: "oklch(0.45 0.02 40)" }}>Published: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "oklch(0.60 0.01 60)" }}>{obit.published}</span></span>
                  <span style={{ fontSize: 12, color: "oklch(0.45 0.02 40)" }}>Properties: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "oklch(0.75 0.18 65)" }}>{obit.properties} ({obit.totalValue})</span></span>
                </div>
              </div>

              <div style={{ color: "oklch(0.35 0.02 40)", transition: "transform 0.2s", transform: expanded === i ? "rotate(90deg)" : "rotate(0deg)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            </div>

            {expanded === i && (
              <div style={{ padding: "0 20px 20px", borderTop: "1px solid oklch(0.20 0.015 30)" }}>
                <div style={{ paddingTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                  <div>
                    <div className="atlas-label" style={{ marginBottom: 8 }}>Property Lead</div>
                    <div style={{ fontSize: 13, color: "oklch(0.80 0.01 60)", marginBottom: 4 }}>{obit.lead.address}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "oklch(0.65 0.18 145)", fontWeight: 700 }}>Est. Equity: {obit.lead.equity}</div>
                    {obit.caseNum && <div style={{ fontSize: 11, color: "oklch(0.40 0.02 40)", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>Case: {obit.caseNum}</div>}
                  </div>
                  <div>
                    <div className="atlas-label" style={{ marginBottom: 8 }}>Heirs Identified</div>
                    {obit.heirs.map(h => (
                      <div key={h} style={{ fontSize: 13, color: "oklch(0.75 0.01 60)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "oklch(0.65 0.18 145)" }}>→</span> {h}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "flex-end" }}>
                    {!obit.skipTraced && <button className="atlas-btn-ghost" style={{ fontSize: 12 }}>Skip Trace Heirs</button>}
                    <button className="atlas-btn" style={{ fontSize: 13, justifyContent: "center" }}>Contact Heirs →</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
