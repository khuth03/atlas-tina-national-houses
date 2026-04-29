// Atlas AppLayout — Dark sidebar with 6 module navigation
import { useState } from "react";
import { Link, useLocation } from "wouter";

const NAV_ITEMS = [
  {
    path: "/",
    label: "Overview",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    path: "/county-scraper",
    label: "County Scraper",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
    badge: "LIVE",
    badgeColor: "atlas-badge-green",
  },
  {
    path: "/property-condition",
    label: "Property Condition",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
    badge: "AI",
    badgeColor: "atlas-badge-amber",
  },
  {
    path: "/insurance-gap",
    label: "Insurance Gap",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    badge: "API",
    badgeColor: "atlas-badge-blue",
  },
  {
    path: "/social-distress",
    label: "Social Distress",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    badge: "LIVE",
    badgeColor: "atlas-badge-green",
  },
  {
    path: "/obituary",
    label: "Obituary Monitor",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    path: "/fire-damage",
    label: "Fire Damage",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
      </svg>
    ),
    badge: "NEW",
    badgeColor: "atlas-badge-red",
  },
];

interface AppLayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

export default function AppLayout({ children, onLogout }: AppLayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "oklch(0.10 0.01 30)" }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 64 : 240,
        minWidth: collapsed ? 64 : 240,
        height: "100vh",
        background: "oklch(0.11 0.01 30)",
        borderRight: "1px solid oklch(0.20 0.015 30)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease, min-width 0.2s ease",
        overflow: "hidden",
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{
          padding: collapsed ? "18px 0" : "18px 16px",
          borderBottom: "1px solid oklch(0.20 0.015 30)",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          gap: 10,
        }}>
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "oklch(0.55 0.22 25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: "oklch(0.95 0.01 60)", letterSpacing: "-0.02em" }}>Atlas</div>
                <div style={{ fontSize: 10, color: "oklch(0.45 0.02 40)", letterSpacing: "0.06em", fontFamily: "'JetBrains Mono', monospace" }}>NATIONAL HOUSES</div>
              </div>
            </div>
          )}
          {collapsed && (
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "oklch(0.55 0.22 25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "oklch(0.40 0.02 40)", padding: 4, borderRadius: 4,
              display: "flex", alignItems: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}
        </div>

        {/* Live status */}
        {!collapsed && (
          <div style={{ padding: "10px 16px", borderBottom: "1px solid oklch(0.20 0.015 30)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "oklch(0.65 0.18 145)", fontFamily: "'JetBrains Mono', monospace" }}>
              <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(0.65 0.18 145)" }}/>
              All systems operational
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {!collapsed && (
            <div style={{ padding: "6px 8px 4px", fontSize: 10, color: "oklch(0.35 0.02 40)", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>
              Modules
            </div>
          )}
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <a className={`nav-item ${isActive ? "active" : ""}`} style={{
                  justifyContent: collapsed ? "center" : "flex-start",
                  padding: collapsed ? "10px" : "9px 12px",
                  position: "relative",
                }}>
                  <span style={{ flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.badge && (
                        <span className={`atlas-badge ${item.badgeColor}`} style={{ fontSize: 9, padding: "2px 5px" }}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: "12px 8px", borderTop: "1px solid oklch(0.20 0.015 30)" }}>
          {collapsed ? (
            <button onClick={() => setCollapsed(false)} style={{
              width: "100%", background: "none", border: "none", cursor: "pointer",
              color: "oklch(0.40 0.02 40)", padding: "8px", borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "oklch(0.55 0.22 25 / 0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, color: "oklch(0.55 0.22 25)",
                }}>C</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.85 0.01 60)" }}>Tina</div>
                  <div style={{ fontSize: 10, color: "oklch(0.40 0.02 40)" }}>Admin</div>
                </div>
              </div>
              <button onClick={onLogout} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "oklch(0.40 0.02 40)", padding: 4, borderRadius: 4,
              }} title="Logout">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{
          height: 52,
          borderBottom: "1px solid oklch(0.20 0.015 30)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          background: "oklch(0.10 0.01 30)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "oklch(0.45 0.02 40)" }}>
            <span>Atlas</span>
            <span>/</span>
            <span style={{ color: "oklch(0.85 0.01 60)" }}>
              {NAV_ITEMS.find(n => n.path === location)?.label || "Overview"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 12, color: "oklch(0.40 0.02 40)", fontFamily: "'JetBrains Mono', monospace" }}>
              {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "oklch(0.65 0.18 145 / 0.1)",
              border: "1px solid oklch(0.65 0.18 145 / 0.2)",
              borderRadius: 20, padding: "4px 10px",
              fontSize: 11, color: "oklch(0.65 0.18 145)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              <div className="pulse-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "oklch(0.65 0.18 145)" }}/>
              LIVE
            </div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: "auto", padding: "28px 28px" }} className="fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
