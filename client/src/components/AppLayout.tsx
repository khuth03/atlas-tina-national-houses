// Atlas AppLayout — Premium dark intelligence dashboard
// Sidebar: County Scraper + Property Condition AI only
import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Map,
  Building2,
  Settings,
  LogOut,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "County Scraper", icon: Map, href: "/county-scraper" },
  { label: "Property Condition AI", icon: Building2, href: "/property-condition" },
];

interface AppLayoutProps {
  children: React.ReactNode;
  companyName: string;
  userEmail: string;
  accentColor: string;
}

export default function AppLayout({ children, companyName, userEmail, accentColor }: AppLayoutProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("atlas_auth");
    window.location.href = "/";
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo area */}
      <div className="px-5 py-5 border-b border-white/[0.07]">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-lg flex-shrink-0"
            style={{ backgroundColor: accentColor, boxShadow: `0 2px 12px ${accentColor}50` }}
          >
            A
          </div>
          <div className="min-w-0">
            <div className="text-white font-bold text-sm leading-tight tracking-wide">Atlas</div>
            <div className="text-white/35 text-[11px] leading-tight truncate">{companyName}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        <div className="text-white/25 text-[10px] font-bold uppercase tracking-[0.18em] px-3 mb-3">
          Active Modules
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <a
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group relative ${
                  isActive ? "text-white" : "text-white/45 hover:text-white/80 hover:bg-white/[0.04]"
                }`}
                style={isActive ? {
                  backgroundColor: accentColor + "1a",
                  color: accentColor,
                  boxShadow: `inset 0 0 0 1px ${accentColor}25`,
                } : {}}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 opacity-60" />}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-white/[0.07] space-y-0.5">
        <Link href="/settings">
          <a
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              location === "/settings"
                ? "text-white"
                : "text-white/45 hover:text-white/80 hover:bg-white/[0.04]"
            }`}
            style={location === "/settings" ? {
              backgroundColor: accentColor + "1a",
              color: accentColor,
              boxShadow: `inset 0 0 0 1px ${accentColor}25`,
            } : {}}
          >
            <Settings className="w-4 h-4" />
            <span>Settings & API Keys</span>
          </a>
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/35 hover:text-red-400 hover:bg-red-400/[0.06] transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
        <div className="px-3 pt-3">
          <div className="text-white/20 text-[11px] truncate">{userEmail}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#080810] overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col" style={{ background: "#0c0c18", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 flex flex-col" style={{ background: "#0c0c18", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <span className="text-white font-bold text-sm">Atlas</span>
              <button onClick={() => setMobileOpen(false)} className="text-white/40 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.07]" style={{ background: "#0c0c18" }}>
          <button onClick={() => setMobileOpen(true)} className="text-white/50 hover:text-white transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs"
            style={{ backgroundColor: accentColor }}
          >
            A
          </div>
          <span className="text-white font-bold text-sm">Atlas</span>
        </div>
        <main className="flex-1 overflow-y-auto bg-[#080810]">
          {children}
        </main>
      </div>
    </div>
  );
}
