// Property Condition Scoring — AI-powered visual distress ranking via satellite + GPT-4 Vision
import { useState } from "react";

const MOCK_RESULTS = [
  { rank: 1, address: "4821 Palmetto Dunes Dr, Myrtle Beach SC", score: 2, condition: "Severe Distress", issues: ["Roof damage visible", "Overgrown vegetation", "Broken windows detected"], satellite: "🛰️", streetview: "📷" },
  { rank: 2, address: "1103 Ocean Blvd Unit 4B, North Myrtle Beach SC", score: 3, condition: "Heavy Distress", issues: ["Structural damage", "Deferred maintenance", "Debris in yard"], satellite: "🛰️", streetview: "📷" },
  { rank: 3, address: "7720 Kings Hwy, Myrtle Beach SC", score: 4, condition: "Moderate Distress", issues: ["Paint peeling", "Driveway cracked", "Gutters damaged"], satellite: "🛰️", streetview: "📷" },
  { rank: 4, address: "2204 Glenns Bay Rd, Surfside Beach SC", score: 5, condition: "Moderate", issues: ["Minor deferred maintenance", "Landscaping neglected"], satellite: "🛰️", streetview: "📷" },
  { rank: 5, address: "5512 Socastee Blvd, Myrtle Beach SC", score: 6, condition: "Light Distress", issues: ["Cosmetic issues only", "Fence damaged"], satellite: "🛰️", streetview: "📷" },
];

const SCORE_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: "Critical", color: "oklch(0.50 0.25 25)" },
  2: { label: "Severe", color: "oklch(0.55 0.22 25)" },
  3: { label: "Heavy", color: "oklch(0.55 0.22 25)" },
  4: { label: "Moderate-High", color: "oklch(0.65 0.18 40)" },
  5: { label: "Moderate", color: "oklch(0.70 0.18 55)" },
  6: { label: "Light", color: "oklch(0.75 0.18 65)" },
  7: { label: "Fair", color: "oklch(0.70 0.15 100)" },
  8: { label: "Good", color: "oklch(0.65 0.18 145)" },
  9: { label: "Very Good", color: "oklch(0.60 0.18 145)" },
  10: { label: "Excellent", color: "oklch(0.55 0.18 145)" },
};

export default function PropertyCondition() {
  const [uploaded, setUploaded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState("");

  const handleUpload = () => {
    setUploaded(true);
    setFilename("horry_county_leads_apr2026.csv");
  };

  const handleRun = () => {
    setProcessing(true);
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 8 + 2;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setTimeout(() => { setProcessing(false); setDone(true); }, 400);
      }
      setProgress(Math.min(p, 100));
    }, 200);
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 className="atlas-section-title" style={{ marginBottom: 6 }}>Property Condition Scoring</h1>
          <p style={{ fontSize: 14, color: "oklch(0.45 0.02 40)" }}>
            Upload any CSV · AI scores each property 1–10 via satellite + street view · Ranked worst to best
          </p>
        </div>
        {done && (
          <button className="atlas-btn-ghost">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Ranked CSV
          </button>
        )}
      </div>

      {/* Cost info */}
      <div className="atlas-card" style={{ padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(0.75 0.18 65)" }}/>
          <span style={{ fontSize: 13, color: "oklch(0.60 0.01 60)" }}>Pricing: <strong style={{ color: "oklch(0.75 0.18 65)", fontFamily: "'JetBrains Mono', monospace" }}>$10 / 1,000 properties</strong></span>
        </div>
        <div style={{ width: 1, height: 20, background: "oklch(0.22 0.015 30)" }}/>
        <div style={{ fontSize: 13, color: "oklch(0.45 0.02 40)" }}>Powered by: <span style={{ color: "oklch(0.60 0.01 60)" }}>Google Cloud Satellite API + Google Street View + GPT-4 Vision</span></div>
        <div style={{ width: 1, height: 20, background: "oklch(0.22 0.015 30)" }}/>
        <div style={{ fontSize: 13, color: "oklch(0.45 0.02 40)" }}>Max list size: <span style={{ color: "oklch(0.60 0.01 60)", fontFamily: "'JetBrains Mono', monospace" }}>10,000+ properties</span></div>
      </div>

      {/* How it works */}
      <div className="atlas-card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="atlas-label" style={{ marginBottom: 16 }}>How It Works</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {[
            { step: "01", title: "Upload CSV", desc: "Any list with addresses — PropStream export, county leads, custom list", icon: "📋" },
            { step: "02", title: "Satellite Pull", desc: "Google Cloud fetches current satellite + street view images for each address", icon: "🛰️" },
            { step: "03", title: "AI Scoring", desc: "GPT-4 Vision analyzes each image and scores physical distress 1–10", icon: "🤖" },
            { step: "04", title: "Ranked Output", desc: "Full CSV ranked worst to best condition — ready to prioritize outreach", icon: "📊" },
          ].map(s => (
            <div key={s.step} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
                  color: "oklch(0.55 0.22 25)", background: "oklch(0.60 0.20 28 / 0.1)",
                  padding: "3px 8px", borderRadius: 4,
                }}>{s.step}</div>
                <div style={{ fontSize: 18 }}>{s.icon}</div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "oklch(0.85 0.01 60)" }}>{s.title}</div>
              <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Upload zone */}
      {!done && (
        <div style={{ marginBottom: 24 }}>
          {!uploaded ? (
            <div
              className="atlas-upload-zone"
              onClick={handleUpload}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: "oklch(0.85 0.01 60)", marginBottom: 6 }}>
                Drop your CSV here or click to upload
              </div>
              <div style={{ fontSize: 13, color: "oklch(0.40 0.02 40)", marginBottom: 16 }}>
                Supports CSV files up to 10,000+ rows · Must include address column
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {["PropStream Export", "BatchLeads CSV", "Custom List", "County Records"].map(f => (
                  <span key={f} style={{ padding: "4px 10px", background: "oklch(0.18 0.01 30)", border: "1px solid oklch(0.25 0.015 30)", borderRadius: 4, fontSize: 11, color: "oklch(0.50 0.02 40)" }}>{f}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="atlas-card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: processing ? 16 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 24 }}>📋</div>
                  <div>
                    <div style={{ fontWeight: 600, color: "oklch(0.90 0.01 60)", marginBottom: 2 }}>{filename}</div>
                    <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "oklch(0.65 0.18 145)" }}>2,847 properties</span> · Estimated cost: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "oklch(0.75 0.18 65)" }}>$28.47</span>
                    </div>
                  </div>
                </div>
                {!processing && (
                  <button className="atlas-btn" onClick={handleRun}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Start Scoring
                  </button>
                )}
              </div>
              {processing && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: "oklch(0.55 0.02 40)" }}>Processing properties...</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "oklch(0.75 0.18 65)" }}>{Math.round(progress)}%</span>
                  </div>
                  <div className="atlas-progress">
                    <div className="atlas-progress-fill" style={{ width: `${progress}%` }}/>
                  </div>
                  <div style={{ fontSize: 11, color: "oklch(0.40 0.02 40)", marginTop: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                    Fetching satellite images → Running GPT-4 Vision → Scoring...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {done && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(0.65 0.18 145)" }}/>
            <span style={{ fontSize: 14, color: "oklch(0.65 0.18 145)", fontWeight: 600 }}>Scoring complete — 2,847 properties ranked</span>
          </div>
          <div className="atlas-card" style={{ overflow: "hidden" }}>
            <table className="atlas-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Score</th>
                  <th>Condition</th>
                  <th>Address</th>
                  <th>AI Findings</th>
                  <th>Images</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {MOCK_RESULTS.map(r => {
                  const sc = SCORE_LABEL[r.score];
                  return (
                    <tr key={r.rank}>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "oklch(0.40 0.02 40)" }}>#{r.rank}</td>
                      <td>
                        <div style={{
                          width: 40, height: 40, borderRadius: "50%",
                          background: `${sc.color} / 0.1`,
                          border: `2px solid ${sc.color}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 700, fontSize: 14,
                          color: sc.color,
                        }}>{r.score}</div>
                      </td>
                      <td><span style={{ fontSize: 12, fontWeight: 600, color: sc.color }}>{sc.label}</span></td>
                      <td style={{ fontWeight: 500, color: "oklch(0.85 0.01 60)", fontSize: 13 }}>{r.address}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {r.issues.map(i => (
                            <div key={i} style={{ fontSize: 11, color: "oklch(0.50 0.02 40)", display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ color: "oklch(0.60 0.22 25)" }}>·</span> {i}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="atlas-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>Satellite</button>
                          <button className="atlas-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>Street View</button>
                        </div>
                      </td>
                      <td>
                        <button className="atlas-btn" style={{ padding: "6px 12px", fontSize: 12 }}>Contact →</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
