// Social Distress Signal — Real-time social platform monitoring for seller signals
import { useState } from "react";

const MOCK_SIGNALS = [
  { platform: "Reddit", subreddit: "r/MyrtleBeach", user: "u/stressed_landlord_sc", snippet: "\"Anyone dealt with selling a rental property fast in Horry County? Insurance just went up 80% and I can't afford to keep it...\"", keywords: ["sell fast", "can't afford", "insurance"], address: "1847 Waterway Blvd, Little River SC", owner: "Thomas Nguyen", skipTraced: true, posted: "2h ago", score: 94 },
  { platform: "Facebook", subreddit: "Myrtle Beach Real Estate Group", user: "Sara Fisher", snippet: "\"Need to sell my house ASAP. Going through a divorce and we need to close quickly. Price reduced. DM me.\"", keywords: ["sell ASAP", "divorce", "price reduced"], address: "7720 Kings Hwy, Myrtle Beach SC", owner: "Sara Lynn Fisher", skipTraced: true, posted: "5h ago", score: 98 },
  { platform: "Craigslist", subreddit: "Myrtle Beach Housing", user: "Anonymous", snippet: "\"Must sell — facing foreclosure. Motivated seller. 3BR/2BA in Conway. Will consider all offers. Call anytime.\"", keywords: ["must sell", "foreclosure", "motivated"], address: "908 Waccamaw Pines Dr, Conway SC", owner: "Harold Greene Estate", skipTraced: false, posted: "1d ago", score: 91 },
  { platform: "Nextdoor", subreddit: "Surfside Beach Neighborhood", user: "David P.", snippet: "\"Thinking about selling our rental on Glenns Bay. Tired of the maintenance and the insurance costs are killing us. Any local investors?\"", keywords: ["selling rental", "insurance costs", "investors"], address: "2204 Glenns Bay Rd, Surfside Beach SC", owner: "David & Ann Prescott", skipTraced: true, posted: "3d ago", score: 76 },
];

const PLATFORM_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
  "Reddit": { bg: "oklch(0.60 0.20 28 / 0.1)", color: "oklch(0.55 0.22 25)", icon: "🔴" },
  "Facebook": { bg: "oklch(0.55 0.18 240 / 0.1)", color: "oklch(0.60 0.18 240)", icon: "🔵" },
  "Craigslist": { bg: "oklch(0.65 0.18 145 / 0.1)", color: "oklch(0.65 0.18 145)", icon: "🟢" },
  "Nextdoor": { bg: "oklch(0.65 0.18 145 / 0.1)", color: "oklch(0.65 0.18 145)", icon: "🏘️" },
};

export default function SocialDistress() {
  const [activeFilter, setActiveFilter] = useState("All");

  const platforms = ["All", "Reddit", "Facebook", "Craigslist", "Nextdoor"];
  const filtered = activeFilter === "All" ? MOCK_SIGNALS : MOCK_SIGNALS.filter(s => s.platform === activeFilter);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 className="atlas-section-title" style={{ marginBottom: 6 }}>Social Distress Signal</h1>
          <p style={{ fontSize: 14, color: "oklch(0.45 0.02 40)" }}>
            Daily monitoring of Reddit, Facebook, Nextdoor, Craigslist & local forums for motivated seller signals
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="atlas-btn-ghost">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
          <button className="atlas-btn">
            <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }}/>
            Live Monitoring ON
          </button>
        </div>
      </div>

      {/* Platform stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Signals", value: "23", color: "oklch(0.95 0.01 60)" },
          { label: "Reddit", value: "8", color: "oklch(0.55 0.22 25)" },
          { label: "Facebook", value: "6", color: "oklch(0.60 0.18 240)" },
          { label: "Craigslist", value: "5", color: "oklch(0.65 0.18 145)" },
          { label: "Nextdoor", value: "4", color: "oklch(0.65 0.18 300)" },
        ].map(s => (
          <div key={s.label} className="atlas-stat-card" style={{ padding: 16 }}>
            <div className="atlas-label" style={{ marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Keyword config */}
      <div className="atlas-card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="atlas-label" style={{ marginBottom: 14 }}>Monitoring Configuration</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Target Keywords</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["sell fast", "motivated seller", "divorce", "foreclosure", "behind on payments", "can't afford", "must sell", "price reduced", "need to sell", "insurance spike"].map(kw => (
                <span key={kw} style={{ padding: "4px 8px", background: "oklch(0.60 0.20 28 / 0.1)", border: "1px solid oklch(0.55 0.22 25 / 0.2)", borderRadius: 4, fontSize: 11, color: "oklch(0.55 0.22 25)", fontFamily: "'JetBrains Mono', monospace" }}>{kw}</span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Target Locations</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {["Horry County, SC", "Georgetown County, SC", "Marion County, SC", "Myrtle Beach area"].map(loc => (
                <div key={loc} style={{ fontSize: 12, color: "oklch(0.60 0.01 60)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "oklch(0.65 0.18 145)" }}>✓</span> {loc}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", marginBottom: 6 }}>Platforms Active</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {["Reddit", "Facebook Groups", "Nextdoor", "Craigslist", "Local Forums"].map(p => (
                <div key={p} style={{ fontSize: 12, color: "oklch(0.60 0.01 60)", display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="pulse-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "oklch(0.65 0.18 145)", flexShrink: 0 }}/>
                  {p}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {platforms.map(p => (
          <button key={p} onClick={() => setActiveFilter(p)} style={{
            padding: "6px 14px", borderRadius: 6, border: "1px solid",
            fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
            background: activeFilter === p ? "oklch(0.55 0.22 25)" : "transparent",
            borderColor: activeFilter === p ? "oklch(0.55 0.22 25)" : "oklch(0.22 0.015 30)",
            color: activeFilter === p ? "white" : "oklch(0.50 0.02 40)",
          }}>{p}</button>
        ))}
      </div>

      {/* Signal cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((sig, i) => {
          const pc = PLATFORM_COLORS[sig.platform];
          return (
            <div key={i} className="atlas-card" style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 16 }}>
                {/* Score */}
                <div style={{
                  width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                  background: sig.score >= 90 ? "oklch(0.60 0.22 25 / 0.1)" : "oklch(0.75 0.18 65 / 0.1)",
                  border: `2px solid ${sig.score >= 90 ? "oklch(0.60 0.22 25)" : "oklch(0.75 0.18 65)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16,
                  color: sig.score >= 90 ? "oklch(0.60 0.22 25)" : "oklch(0.75 0.18 65)",
                }}>{sig.score}</div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ padding: "3px 10px", borderRadius: 4, background: pc.bg, color: pc.color, fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                      {pc.icon} {sig.platform}
                    </span>
                    <span style={{ fontSize: 12, color: "oklch(0.40 0.02 40)" }}>{sig.subreddit}</span>
                    <span style={{ fontSize: 11, color: "oklch(0.35 0.02 40)", marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace" }}>{sig.posted}</span>
                  </div>

                  <div style={{ fontSize: 13, color: "oklch(0.40 0.02 40)", marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                    {sig.user}
                  </div>

                  <div style={{
                    fontSize: 14, color: "oklch(0.80 0.01 60)", lineHeight: 1.6,
                    background: "oklch(0.12 0.01 30)", borderRadius: 6, padding: "10px 14px",
                    borderLeft: `3px solid ${pc.color}`, marginBottom: 12,
                    fontStyle: "italic",
                  }}>
                    {sig.snippet}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "oklch(0.40 0.02 40)" }}>Keywords matched:</span>
                    {sig.keywords.map(kw => (
                      <span key={kw} style={{ padding: "2px 8px", background: "oklch(0.60 0.20 28 / 0.1)", border: "1px solid oklch(0.55 0.22 25 / 0.2)", borderRadius: 4, fontSize: 11, color: "oklch(0.55 0.22 25)" }}>{kw}</span>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "oklch(0.40 0.02 40)", marginBottom: 2 }}>Matched Address</div>
                        <div style={{ fontSize: 13, color: "oklch(0.75 0.01 60)", fontWeight: 500 }}>{sig.address}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "oklch(0.40 0.02 40)", marginBottom: 2 }}>Owner</div>
                        <div style={{ fontSize: 13, color: "oklch(0.75 0.01 60)", fontWeight: 500 }}>{sig.owner}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "oklch(0.40 0.02 40)", marginBottom: 2 }}>Skip Trace</div>
                        {sig.skipTraced
                          ? <span className="atlas-badge atlas-badge-green">Complete</span>
                          : <span className="atlas-badge atlas-badge-amber">Pending</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {!sig.skipTraced && <button className="atlas-btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Skip Trace</button>}
                      <button className="atlas-btn" style={{ padding: "6px 14px", fontSize: 12 }}>Contact Now →</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
