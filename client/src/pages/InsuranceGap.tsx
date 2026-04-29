// Insurance Gap Finder — Properties with spiking premiums in risky areas
import { useState } from "react";

const MOCK_RESULTS = [
  { address: "4821 Palmetto Dunes Dr, Myrtle Beach SC", owner: "Eugene F. Butler", femaZone: "AE", floodRisk: "High", climateScore: 82, premiumSpike: "+67%", landlord: true, insuranceCost: "$8,400/yr", equity: "$142K" },
  { address: "1103 Ocean Blvd Unit 4B, North Myrtle Beach SC", owner: "Marcus & Linda Webb", femaZone: "VE", floodRisk: "Very High", climateScore: 91, premiumSpike: "+112%", landlord: true, insuranceCost: "$14,200/yr", equity: "$89K" },
  { address: "7720 Kings Hwy, Myrtle Beach SC", owner: "Sara Lynn Fisher", femaZone: "X", floodRisk: "Moderate", climateScore: 64, premiumSpike: "+38%", landlord: false, insuranceCost: "$4,100/yr", equity: "$210K" },
  { address: "312 Front St, Georgetown SC", owner: "David & Ann Prescott", femaZone: "AE", floodRisk: "High", climateScore: 78, premiumSpike: "+54%", landlord: true, insuranceCost: "$6,800/yr", equity: "$54K" },
  { address: "908 Waccamaw Pines Dr, Conway SC", owner: "Estate of Harold Greene", femaZone: "X", floodRisk: "Low", climateScore: 45, premiumSpike: "+31%", landlord: false, insuranceCost: "$2,900/yr", equity: "$312K" },
];

const FEMA_COLOR: Record<string, string> = {
  "VE": "oklch(0.55 0.22 25)",
  "AE": "oklch(0.55 0.22 25)",
  "X": "oklch(0.75 0.18 65)",
};

export default function InsuranceGap() {
  const [uploaded, setUploaded] = useState(false);
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);

  const handleRun = () => {
    setRunning(true);
    setTimeout(() => { setRunning(false); setRan(true); }, 2000);
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 className="atlas-section-title" style={{ marginBottom: 6 }}>Insurance Gap Finder</h1>
          <p style={{ fontSize: 14, color: "oklch(0.45 0.02 40)" }}>
            Identify landlords facing 30%+ premium spikes in high-risk zones — motivated to exit before it gets worse
          </p>
        </div>
        {ran && (
          <button className="atlas-btn-ghost">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
        )}
      </div>

      {/* API sources */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { name: "OpenFEMA API", desc: "Flood zone mapping & NFIP data", status: "Connected", color: "oklch(0.65 0.18 145)" },
          { name: "ClimateCheck API", desc: "Climate risk scoring by address", status: "Connected", color: "oklch(0.65 0.18 145)" },
          { name: "Treasury.io API", desc: "Insurance premium trend data", status: "Connected", color: "oklch(0.65 0.18 145)" },
        ].map(api => (
          <div key={api.name} className="atlas-card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: api.color, flexShrink: 0 }}/>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: "oklch(0.85 0.01 60)" }}>{api.name}</div>
              <div style={{ fontSize: 11, color: "oklch(0.40 0.02 40)" }}>{api.desc}</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <span className="atlas-badge atlas-badge-green">{api.status}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter config */}
      <div className="atlas-card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="atlas-label" style={{ marginBottom: 14 }}>Analysis Configuration</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Min Premium Spike</div>
            <select className="atlas-input" style={{ fontSize: 13 }}>
              <option>30% or more</option>
              <option>50% or more</option>
              <option>100% or more</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Owner Type</div>
            <select className="atlas-input" style={{ fontSize: 13 }}>
              <option>Landlords Only</option>
              <option>All Owners</option>
              <option>Absentee Only</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>FEMA Zone</div>
            <select className="atlas-input" style={{ fontSize: 13 }}>
              <option>All Zones</option>
              <option>High Risk (AE, VE)</option>
              <option>Very High (VE Only)</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>ClimateCheck Score</div>
            <select className="atlas-input" style={{ fontSize: 13 }}>
              <option>60+ (Elevated Risk)</option>
              <option>75+ (High Risk)</option>
              <option>90+ (Critical Risk)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Upload */}
      {!ran && (
        <div style={{ marginBottom: 24 }}>
          {!uploaded ? (
            <div className="atlas-upload-zone" onClick={() => setUploaded(true)}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: "oklch(0.85 0.01 60)", marginBottom: 6 }}>
                Upload your property list
              </div>
              <div style={{ fontSize: 13, color: "oklch(0.40 0.02 40)" }}>
                CSV with addresses — Atlas will cross-reference all 3 APIs automatically
              </div>
            </div>
          ) : (
            <div className="atlas-card" style={{ padding: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 24 }}>📋</div>
                <div>
                  <div style={{ fontWeight: 600, color: "oklch(0.90 0.01 60)", marginBottom: 2 }}>horry_county_leads_apr2026.csv</div>
                  <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "oklch(0.65 0.18 145)" }}>2,847 properties</span> · Ready to analyze
                  </div>
                </div>
              </div>
              <button className="atlas-btn" onClick={handleRun} style={{ opacity: running ? 0.7 : 1 }}>
                {running ? "Analyzing..." : "Run Insurance Analysis →"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {ran && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(0.65 0.18 145)" }}/>
              <span style={{ fontSize: 14, color: "oklch(0.65 0.18 145)", fontWeight: 600 }}>Analysis complete</span>
            </div>
            <span style={{ fontSize: 13, color: "oklch(0.45 0.02 40)" }}>Found <strong style={{ color: "oklch(0.90 0.01 60)" }}>312 properties</strong> with 30%+ premium spikes · <strong style={{ color: "oklch(0.75 0.18 65)" }}>187 landlord-owned</strong></span>
          </div>
          <div className="atlas-card" style={{ overflow: "hidden" }}>
            <table className="atlas-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Owner</th>
                  <th>FEMA Zone</th>
                  <th>Climate Score</th>
                  <th>Premium Spike</th>
                  <th>Annual Cost</th>
                  <th>Landlord</th>
                  <th>Est. Equity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {MOCK_RESULTS.map(r => (
                  <tr key={r.address}>
                    <td style={{ fontWeight: 500, color: "oklch(0.85 0.01 60)", fontSize: 13 }}>{r.address}</td>
                    <td style={{ fontSize: 13 }}>{r.owner}</td>
                    <td>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700,
                        color: FEMA_COLOR[r.femaZone] || "oklch(0.75 0.18 65)",
                        background: `${FEMA_COLOR[r.femaZone] || "oklch(0.75 0.18 65)"} / 0.1`,
                        padding: "3px 8px", borderRadius: 4,
                      }}>{r.femaZone} — {r.floodRisk}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: "oklch(0.22 0.015 30)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${r.climateScore}%`, height: "100%", background: r.climateScore > 75 ? "oklch(0.60 0.22 25)" : "oklch(0.75 0.18 65)", borderRadius: 2 }}/>
                        </div>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: r.climateScore > 75 ? "oklch(0.60 0.22 25)" : "oklch(0.75 0.18 65)" }}>{r.climateScore}</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: "oklch(0.60 0.22 25)" }}>{r.premiumSpike}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "oklch(0.55 0.02 40)" }}>{r.insuranceCost}</td>
                    <td>{r.landlord ? <span className="atlas-badge atlas-badge-amber">Landlord</span> : <span className="atlas-badge" style={{ background: "oklch(0.22 0.015 30)", color: "oklch(0.45 0.02 40)" }}>Owner-Occ</span>}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "oklch(0.65 0.18 145)", fontWeight: 600 }}>{r.equity}</td>
                    <td><button className="atlas-btn" style={{ padding: "6px 12px", fontSize: 12 }}>Contact →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
