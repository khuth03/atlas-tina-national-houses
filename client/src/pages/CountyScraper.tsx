// County Scraper — full-stack live data version
import { useState, useEffect, useCallback } from "react";
import { MapPin, Clock, Download, RefreshCw, Filter, Search, Calendar, ChevronDown, ChevronUp, Database, Zap, History, UserSearch, Phone, Mail, CheckCircle2, AlertCircle } from "lucide-react";

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
  status: "new" | "reviewed" | "contacted" | "skip";
  notes: string | null;
  scraped_at: string;
  skip_traced: boolean;
  st_phone: string | null;
  st_email: string | null;
  st_mailing: string | null;
}

interface Stats {
  total: number;
  today: number;
  byType: Array<{ lead_type: string; count: number }>;
  byCounty: Array<{ county: string; count: number }>;
  lastRun: string | null;
}

const STATUS_CONFIG = {
  new: { label: "New", className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" },
  reviewed: { label: "Reviewed", className: "bg-amber-500/15 text-amber-400 border border-amber-500/20" },
  contacted: { label: "Contacted", className: "bg-blue-500/15 text-blue-400 border border-blue-500/20" },
  skip: { label: "Skip", className: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20" },
};

const TYPE_COLORS: Record<string, string> = {
  "Pre-Foreclosure": "bg-red-500/15 text-red-400 border border-red-500/20",
  "Tax Delinquent": "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  "Probate": "bg-violet-500/15 text-violet-400 border border-violet-500/20",
  "Sheriff Sale": "bg-pink-500/15 text-pink-400 border border-pink-500/20",
  "Lis Pendens": "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20",
  "FSBO": "bg-teal-500/15 text-teal-400 border border-teal-500/20",
  "Obituary": "bg-slate-500/15 text-slate-300 border border-slate-500/20",
  "Code Violation": "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  "Divorce": "bg-rose-500/15 text-rose-400 border border-rose-500/20",
  "Fire Damage": "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  "Water Shutoff": "bg-sky-500/15 text-sky-400 border border-sky-500/20",
  "Vacant": "bg-lime-500/15 text-lime-400 border border-lime-500/20",
};

interface CountyScraperProps {
  counties: Array<{ name: string; state: string; leadTypes: string[] }>;
  accentColor: string;
}

export default function CountyScraper({ counties, accentColor }: CountyScraperProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeLog, setScrapeLog] = useState<string[]>([]);
  const [selectedCounty, setSelectedCounty] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [showHistorical, setShowHistorical] = useState(false);
  const [historicalDays, setHistoricalDays] = useState(30);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const PAGE_SIZE = 50;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCounty !== "all") params.set("county", selectedCounty);
      if (selectedType !== "all") params.set("lead_type", selectedType);
      if (selectedStatus !== "all") params.set("status", selectedStatus);
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      params.set("limit", "500");
      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      setLeads(data.leads || []);
    } catch (e) {
      console.error("Failed to fetch leads:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedCounty, selectedType, selectedStatus, fromDate, toDate]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      setStats(data);
    } catch {}
  }, []);

  useEffect(() => { fetchLeads(); fetchStats(); }, [fetchLeads, fetchStats]);

  useEffect(() => {
    if (!scraping) return;
    const interval = setInterval(async () => {
      const res = await fetch("/api/scrape/status");
      const data = await res.json();
      setScrapeLog(data.log || []);
      if (!data.in_progress) {
        setScraping(false);
        fetchLeads();
        fetchStats();
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [scraping, fetchLeads, fetchStats]);

  const triggerScrape = async () => {
    setScraping(true);
    setScrapeLog(["Starting scrape..."]);
    await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_date: fromDate, to_date: toDate }),
    });
  };

  const triggerHistorical = async () => {
    setScraping(true);
    setShowHistorical(false);
    setScrapeLog([`Starting historical scrape (${historicalDays} days)...`]);
    await fetch("/api/scrape/historical", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days_back: historicalDays }),
    });
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: status as Lead["status"] } : l));
  };

  const skipTrace = async (id: string) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, _tracing: true } as any : l));
    try {
      const r = await fetch(`/api/leads/${id}/skip-trace`, { method: "POST" });
      const data = await r.json();
      if (data.success) {
        setLeads(prev => prev.map(l => l.id === id ? {
          ...l, skip_traced: true,
          st_phone: data.phone || l.st_phone,
          st_email: data.email || l.st_email,
          st_mailing: data.mailing || l.st_mailing,
          _tracing: false,
        } as any : l));
      } else {
        setLeads(prev => prev.map(l => l.id === id ? { ...l, _tracing: false } as any : l));
        alert(data.error || "Skip trace failed — check your API key in Settings.");
      }
    } catch {
      setLeads(prev => prev.map(l => l.id === id ? { ...l, _tracing: false } as any : l));
    }
  };

  const exportAll = () => {
    window.open("/api/leads/export", "_blank");
    setShowExportMenu(false);
  };
  const exportFiltered = () => {
    const params = new URLSearchParams();
    if (selectedCounty !== "all") params.set("county", selectedCounty);
    if (selectedType !== "all") params.set("lead_type", selectedType);
    if (selectedStatus !== "all") params.set("status", selectedStatus);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    window.open(`/api/leads/export?${params}`, "_blank");
    setShowExportMenu(false);
  };

  const filtered = leads.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.owner_name?.toLowerCase().includes(q) ||
      l.address?.toLowerCase().includes(q) ||
      l.case_number?.toLowerCase().includes(q) ||
      l.description?.toLowerCase().includes(q)
    );
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  // Full hardcoded list so all lead types are always available as filter options,
  // regardless of what has been scraped so far. Merge with any DB types not in this list.
  const KNOWN_TYPES = [
    "Bankruptcy",
    "Code Violation",
    "Divorce",
    "Fire Damage",
    "FSBO",
    "Lis Pendens",
    "Obituary",
    "Pre-Foreclosure",
    "Probate",
    "Sheriff Sale",
    "Tax Delinquent",
    "Vacant",
    "Water Shutoff",
  ];
  const dbTypes = stats ? stats.byType.map(t => t.lead_type) : leads.map(l => l.lead_type);
  const allTypes = Array.from(new Set([...KNOWN_TYPES, ...dbTypes])).sort();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
            County Scraper
          </h1>
          <p className="text-white/40 text-sm mt-1">Live motivated seller leads — updated daily at 6:00 AM.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowHistorical(!showHistorical)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/60 border border-white/10 hover:border-white/20 transition-colors">
            <History className="w-3.5 h-3.5" />
            Historical Pull
          </button>
          <div className="relative">
            <button onClick={() => setShowExportMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/60 border border-white/10 hover:border-white/20 transition-colors">
              <Download className="w-3.5 h-3.5" />
              Export CSV
              {showExportMenu ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-[#13131f] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden">
                <button onClick={exportAll}
                  className="w-full flex items-center gap-2 px-4 py-3 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-colors text-left">
                  <Download className="w-3.5 h-3.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold">Export All Leads</div>
                    <div className="text-white/35 text-[11px]">Every lead in the database</div>
                  </div>
                </button>
                <div className="border-t border-white/[0.06]" />
                <button onClick={exportFiltered}
                  className="w-full flex items-center gap-2 px-4 py-3 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-colors text-left">
                  <Filter className="w-3.5 h-3.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold">Export Current View</div>
                    <div className="text-white/35 text-[11px]">Filtered by county, type &amp; date</div>
                  </div>
                </button>
              </div>
            )}
          </div>
          <button onClick={triggerScrape} disabled={scraping}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: accentColor }}>
            <RefreshCw className={`w-3.5 h-3.5 ${scraping ? "animate-spin" : ""}`} />
            {scraping ? "Scraping..." : "Run Now"}
          </button>
        </div>
      </div>

      {showHistorical && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-white/60" />
            <h3 className="text-sm font-semibold text-white">Historical Lead Pull</h3>
            <span className="text-xs text-white/40">Pull up to 90 days of past leads to get started</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <label className="text-xs text-white/50">Days back:</label>
              <input type="range" min={1} max={90} value={historicalDays}
                onChange={e => setHistoricalDays(parseInt(e.target.value))} className="w-40" />
              <span className="text-sm font-bold text-white w-8">{historicalDays}</span>
            </div>
            <button onClick={triggerHistorical} disabled={scraping}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: accentColor }}>
              Pull {historicalDays} Days
            </button>
          </div>
        </div>
      )}

      {scraping && scrapeLog.length > 0 && (
        <div className="bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
          {scrapeLog.map((line, i) => (
            <div key={i} className={line.startsWith("\u2713") ? "text-emerald-400" : line.startsWith("\u2717") ? "text-red-400" : line.startsWith("\u26a0") ? "text-amber-400" : "text-white/60"}>
              {line}
            </div>
          ))}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Leads", value: stats.total.toLocaleString(), icon: Database },
            { label: "Added Today", value: stats.today.toLocaleString(), icon: Zap },
            { label: "Lead Types", value: stats.byType.length.toString(), icon: Filter },
            { label: "Last Scrape", value: stats.lastRun ? new Date(stats.lastRun).toLocaleDateString() : (stats.total > 0 ? new Date().toLocaleDateString() : "Never"), icon: Clock },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 text-white/40 text-xs mb-1"><Icon className="w-3.5 h-3.5" />{label}</div>
              <div className="text-xl font-black text-white">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input type="text" placeholder="Search owner, address, case #..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full bg-transparent border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30" />
        </div>
        <select value={selectedCounty} onChange={e => { setSelectedCounty(e.target.value); setPage(0); }}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
          <option value="all">All Counties</option>
          {counties.map(c => <option key={c.name} value={c.name}>{c.name}, {c.state}</option>)}
        </select>
        <select value={selectedType} onChange={e => { setSelectedType(e.target.value); setPage(0); }}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
          <option value="all">All Types</option>
          {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={selectedStatus} onChange={e => { setSelectedStatus(e.target.value); setPage(0); }}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="contacted">Contacted</option>
          <option value="skip">Skip</option>
        </select>
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-white/40" />
          <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(0); }}
            className="bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none" />
          <span className="text-white/30 text-xs">to</span>
          <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(0); }}
            className="bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none" />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-white/40">
        <span>{filtered.length.toLocaleString()} leads{search ? ` matching "${search}"` : ""}</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-2 py-1 rounded border border-white/10 disabled:opacity-30 hover:border-white/20 text-xs">&larr;</button>
            <span className="text-xs">Page {page + 1} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded border border-white/10 disabled:opacity-30 hover:border-white/20 text-xs">&rarr;</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-white/30">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading leads...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-white/30 space-y-3">
          <Database className="w-10 h-10 opacity-30" />
          <p className="text-sm">No leads yet. Run a scrape or pull historical data to get started.</p>
          <div className="flex gap-2">
            <button onClick={triggerScrape} disabled={scraping}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: accentColor }}>Run Scrape Now</button>
            <button onClick={() => setShowHistorical(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white/60 border border-white/10">
              Pull Historical</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map(lead => (
            <div key={lead.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors">
              <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[lead.lead_type] || "bg-white/10 text-white/60"}`}>
                      {lead.lead_type}
                    </span>
                    <span className="text-xs text-white/30">{lead.county}, {lead.state}</span>
                    {lead.filing_date && <span className="text-xs text-white/30">{lead.filing_date}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-semibold text-white">{lead.owner_name || "Unknown Owner"}</span>
                    {lead.address && (
                      <span className="text-xs text-white/50">
                        <MapPin className="inline w-3 h-3 mr-0.5" />
                        {lead.address}{lead.city ? `, ${lead.city}` : ""}{lead.zip ? ` ${lead.zip}` : ""}
                      </span>
                    )}
                  </div>
                  {lead.case_number && <div className="text-xs text-white/30 mt-0.5 font-mono">Case: {lead.case_number}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[lead.status]?.className || STATUS_CONFIG.new.className}`}>
                    {STATUS_CONFIG[lead.status]?.label || "New"}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${expandedLead === lead.id ? "rotate-180" : ""}`} />
                </div>
              </div>

              {expandedLead === lead.id && (
                <div className="border-t border-white/10 p-4 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    {[
                      { label: "Mailing Address", value: [lead.mailing_address, lead.mailing_city, lead.mailing_state, lead.mailing_zip].filter(Boolean).join(", ") },
                      { label: "Assessed Value", value: lead.assessed_value },
                      { label: "Lender", value: lead.lender },
                      { label: "Loan Amount", value: lead.loan_amount },
                      { label: "Sale Date", value: lead.sale_date },
                      { label: "Sale Amount", value: lead.sale_amount },
                      { label: "Tax Year", value: lead.tax_year },
                      { label: "Description", value: lead.description },
                    ].filter(f => f.value).map(({ label, value }) => (
                      <div key={label}>
                        <div className="text-white/30 mb-0.5">{label}</div>
                        <div className="text-white/80">{value}</div>
                      </div>
                    ))}
                  </div>
                  {lead.source_url && (
                    <a href={lead.source_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline break-all">View Source &rarr;</a>
                  )}
                  {/* Skip Trace Results */}
                  {lead.skip_traced && (lead.st_phone || lead.st_email || lead.st_mailing) && (
                    <div className="rounded-xl p-3 space-y-1.5" style={{background:"rgba(16,185,129,0.07)",border:"1px solid rgba(16,185,129,0.2)"}}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-semibold text-emerald-400">Skip Traced</span>
                      </div>
                      {lead.st_phone && <div className="flex items-center gap-2 text-xs text-white/70"><Phone className="w-3 h-3 text-emerald-400/70" />{lead.st_phone}</div>}
                      {lead.st_email && <div className="flex items-center gap-2 text-xs text-white/70"><Mail className="w-3 h-3 text-emerald-400/70" />{lead.st_email}</div>}
                      {lead.st_mailing && <div className="flex items-center gap-2 text-xs text-white/70"><MapPin className="w-3 h-3 text-emerald-400/70" />{lead.st_mailing}</div>}
                    </div>
                  )}
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-white/30">Mark as:</span>
                      {(["new", "reviewed", "contacted", "skip"] as const).map(s => (
                        <button key={s} onClick={() => updateStatus(lead.id, s)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${lead.status === s ? STATUS_CONFIG[s].className : "bg-white/5 text-white/40 border border-white/10 hover:border-white/20"}`}>
                          {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                    {!lead.skip_traced ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); skipTrace(lead.id); }}
                        disabled={(lead as any)._tracing}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-50"
                        style={{background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.3)",color:"#a5b4fc"}}>
                        <UserSearch className="w-3.5 h-3.5" />
                        {(lead as any)._tracing ? "Tracing..." : "Skip Trace"}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-emerald-400/70">
                        <CheckCircle2 className="w-3 h-3" />Traced
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1.5 rounded-lg border border-white/10 disabled:opacity-30 hover:border-white/20 text-sm text-white/60">&larr; Prev</button>
          <span className="text-sm text-white/40">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg border border-white/10 disabled:opacity-30 hover:border-white/20 text-sm text-white/60">Next &rarr;</button>
        </div>
      )}
    </div>
  );
}
