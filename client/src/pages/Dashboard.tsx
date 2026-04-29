// Atlas Dashboard — Overview of all 6 modules with live stats
import { Link } from "wouter";

const MODULES = [
  {
    path: "/county-scraper",
    title: "County Scraper",
    subtitle: "Daily motivated lead feed from county records",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
    color: "oklch(0.65 0.18 145)",
    colorBg: "oklch(0.65 0.18 145 / 0.1)",
    colorBorder: "oklch(0.65 0.18 145 / 0.2)",
    stat: "47",
    statLabel: "New leads today",
    badge: "LIVE",
    badgeColor: "atlas-badge-green",
    description: "Scrapes foreclosures, tax delinquencies, probate, divorce, lis pendens, and sheriff sales from county records every morning. Cross-references ownership. Delivers 10–50 motivated sellers daily.",
    sources: ["SC Public Notices", "County Courthouse", "Tax Records", "Probate Court"],
  },
  {
    path: "/property-condition",
    title: "Property Condition Scoring",
    subtitle: "AI-powered visual distress ranking via satellite",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
    color: "oklch(0.75 0.18 65)",
    colorBg: "oklch(0.75 0.18 65 / 0.1)",
    colorBorder: "oklch(0.75 0.18 65 / 0.2)",
    stat: "$10",
    statLabel: "Per 1,000 properties",
    badge: "AI",
    badgeColor: "atlas-badge-amber",
    description: "Upload a CSV of any size. Atlas pulls satellite + street view images via Google Cloud, runs them through GPT-4 Vision, and scores each property 1–10 based on physical distress. Ranked worst to best.",
    sources: ["Google Satellite API", "Google Street View", "GPT-4 Vision", "NearMap (optional)"],
  },
  {
    path: "/insurance-gap",
    title: "Insurance Gap Finder",
    subtitle: "Properties with spiking premiums in risky areas",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    color: "oklch(0.60 0.18 240)",
    colorBg: "oklch(0.60 0.18 240 / 0.1)",
    colorBorder: "oklch(0.60 0.18 240 / 0.2)",
    stat: "30%+",
    statLabel: "Premium spike threshold",
    badge: "API",
    badgeColor: "atlas-badge-blue",
    description: "Upload any property list. Atlas cross-references FEMA flood zones, ClimateCheck risk scores, and insurance premium data to flag landlords facing 30%+ premium spikes — motivated to exit before it gets worse.",
    sources: ["OpenFEMA API", "ClimateCheck API", "Treasury.io API"],
  },
  {
    path: "/social-distress",
    title: "Social Distress Signal",
    subtitle: "Real-time monitoring of social platforms for seller signals",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    color: "oklch(0.65 0.18 300)",
    colorBg: "oklch(0.65 0.18 300 / 0.1)",
    colorBorder: "oklch(0.65 0.18 300 / 0.2)",
    stat: "6",
    statLabel: "Platforms monitored",
    badge: "LIVE",
    badgeColor: "atlas-badge-green",
    description: "Daily agent monitors Reddit, Facebook Groups, Nextdoor, Craigslist, and local forums for distress keywords. Enhances records, skip-traces owners, and delivers a daily CSV of social-signal leads.",
    sources: ["Reddit API", "Facebook Groups", "Nextdoor", "Craigslist", "Local Forums"],
  },
  {
    path: "/obituary",
    title: "Obituary Monitor",
    subtitle: "Probate leads from local obituaries cross-referenced to county",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
    color: "oklch(0.60 0.01 60)",
    colorBg: "oklch(0.60 0.01 60 / 0.08)",
    colorBorder: "oklch(0.60 0.01 60 / 0.15)",
    stat: "Daily",
    statLabel: "New obituary scan",
    description: "Monitors local obituaries daily. Cross-references names against county property records and PropStream to verify ownership. Skip-traces heirs. Delivers a daily CSV of properties set to be inherited.",
    sources: ["Local Obituaries", "County Records", "PropStream", "Skip Trace APIs"],
  },
  {
    path: "/fire-damage",
    title: "Fire Damage Monitor",
    subtitle: "Daily fire report tracking with owner skip-trace",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
      </svg>
    ),
    color: "oklch(0.60 0.22 25)",
    colorBg: "oklch(0.60 0.22 25 / 0.1)",
    colorBorder: "oklch(0.60 0.22 25 / 0.2)",
    stat: "NEW",
    statLabel: "Module launching soon",
    badge: "NEW",
    badgeColor: "atlas-badge-red",
    description: "Monitors local fire department reports and news sources for residential fire incidents. Cleans addresses, verifies ownership via county records, skip-traces sellers, and delivers a daily CSV of fire-damaged properties.",
    sources: ["Fire Dept Reports", "Local News APIs", "County Records", "Skip Trace APIs"],
  },
];

const TOP_STATS = [
  { label: "Total Leads Today", value: "147", delta: "+23 vs yesterday", color: "oklch(0.65 0.18 145)" },
  { label: "Active Modules", value: "6/6", delta: "All systems live", color: "oklch(0.55 0.22 25)" },
  { label: "Properties Scored", value: "12,847", delta: "This month", color: "oklch(0.75 0.18 65)" },
  { label: "Avg Distress Score", value: "6.8", delta: "Out of 10", color: "oklch(0.60 0.22 25)" },
];

export default function Dashboard() {
  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 className="atlas-section-title" style={{ marginBottom: 6 }}>Intelligence Overview</h1>
        <p style={{ fontSize: 14, color: "oklch(0.45 0.02 40)" }}>
          All 6 Atlas modules running. Last sync: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "oklch(0.55 0.02 40)" }}>Today at 6:02 AM</span>
        </p>
      </div>

      {/* Top stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {TOP_STATS.map((stat) => (
          <div key={stat.label} className="atlas-stat-card">
            <div className="atlas-label" style={{ marginBottom: 10 }}>{stat.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 700, color: stat.color, marginBottom: 4 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 12, color: "oklch(0.40 0.02 40)" }}>{stat.delta}</div>
          </div>
        ))}
      </div>

      {/* Module grid */}
      <div style={{ marginBottom: 16 }}>
        <div className="atlas-label" style={{ marginBottom: 16 }}>Active Modules</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {MODULES.map((mod) => (
            <Link key={mod.path} href={mod.path}>
              <a style={{ textDecoration: "none" }}>
                <div className="atlas-card" style={{
                  padding: 20,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  borderColor: "oklch(0.22 0.015 30)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = mod.colorBorder;
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${mod.color.replace(")", " / 0.08)")}`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = "oklch(0.22 0.015 30)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                }}>
                  {/* Icon + badge */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: mod.colorBg,
                      border: `1px solid ${mod.colorBorder}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: mod.color,
                    }}>
                      {mod.icon}
                    </div>
                    {mod.badge && (
                      <span className={`atlas-badge ${mod.badgeColor}`}>{mod.badge}</span>
                    )}
                  </div>

                  {/* Title */}
                  <div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: "oklch(0.92 0.01 60)", marginBottom: 4, letterSpacing: "-0.01em" }}>
                      {mod.title}
                    </div>
                    <div style={{ fontSize: 12, color: "oklch(0.45 0.02 40)", lineHeight: 1.5 }}>
                      {mod.subtitle}
                    </div>
                  </div>

                  {/* Stat */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid oklch(0.20 0.015 30)" }}>
                    <div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: mod.color }}>
                        {mod.stat}
                      </div>
                      <div style={{ fontSize: 11, color: "oklch(0.40 0.02 40)" }}>{mod.statLabel}</div>
                    </div>
                    <div style={{ color: "oklch(0.35 0.02 40)" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </a>
            </Link>
          ))}
        </div>
      </div>

      {/* Data sources footer */}
      <div className="atlas-card" style={{ padding: 20, marginTop: 24 }}>
        <div className="atlas-label" style={{ marginBottom: 14 }}>Connected Data Sources</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["SC Public Notices", "County Courthouse", "Tax Records", "Probate Court", "Google Satellite API", "Google Street View", "GPT-4 Vision", "OpenFEMA API", "ClimateCheck API", "Treasury.io API", "Reddit API", "Facebook Groups", "Nextdoor", "Craigslist", "PropStream", "Skip Trace APIs", "Fire Dept Reports", "Local News APIs"].map(src => (
            <div key={src} style={{
              padding: "5px 10px",
              background: "oklch(0.16 0.01 30)",
              border: "1px solid oklch(0.22 0.015 30)",
              borderRadius: 4,
              fontSize: 11,
              color: "oklch(0.55 0.02 40)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>{src}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
