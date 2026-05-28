// Settings — Email delivery, ScraperAPI key, county overview
import { useState, useEffect } from "react";
import {
  Mail, Key, CheckCircle2, Eye, EyeOff, Save, AlertCircle,
  Send, Plus, X, RefreshCw, Info, MapPin
} from "lucide-react";

interface SettingsData {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  email_recipients: string;
  scraper_api_key: string;
  smtp_configured: boolean;
  scraper_api_configured: boolean;
}

interface County {
  name: string;
  state: string;
  leadTypes?: string[];
}

interface SettingsProps {
  counties?: County[];
  accentColor?: string;
  onSaveKeys?: (keys: { googleMaps: string; openAi: string }) => void;
  savedKeys?: { googleMaps: string; openAi: string };
}

export default function Settings({ counties = [], accentColor = "#3b82f6" }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testMsg, setTestMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [recipients, setRecipients] = useState<string[]>([""]);
  const [scraperKey, setScraperKey] = useState("");
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [showScraperKey, setShowScraperKey] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: SettingsData) => {
        setSettings(data);
        setSmtpHost(data.smtp_host || "smtp.gmail.com");
        setSmtpPort(data.smtp_port || "587");
        setSmtpUser(data.smtp_user || "");
        setSmtpPass(data.smtp_pass || "");
        setSmtpFrom(data.smtp_from || "");
        const recs = data.email_recipients
          ? data.email_recipients.split(",").map(e => e.trim()).filter(Boolean)
          : [""];
        setRecipients(recs.length > 0 ? recs : [""]);
        setScraperKey(data.scraper_api_key || "");
        setTestEmail(data.email_recipients?.split(",")[0]?.trim() || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    const cleanRecipients = recipients.filter(e => e.trim()).join(",");
    const body: Record<string, string> = {
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_user: smtpUser,
      smtp_from: smtpFrom,
      email_recipients: cleanRecipients,
    };
    if (smtpPass && smtpPass !== "••••••••••••••••") body.smtp_pass = smtpPass;
    if (scraperKey && scraperKey !== "••••••••••••••••") body.scraper_api_key = scraperKey;
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setSaveMsg({ type: "success", text: "Settings saved successfully." });
        const updated: SettingsData = await fetch("/api/settings").then(r => r.json());
        setSettings(updated);
        setSmtpPass(updated.smtp_pass || "");
        setScraperKey(updated.scraper_api_key || "");
      } else {
        setSaveMsg({ type: "error", text: "Failed to save settings." });
      }
    } catch {
      setSaveMsg({ type: "error", text: "Network error saving settings." });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  const handleTestEmail = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await fetch("/api/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail }),
      });
      const data = await r.json();
      if (r.ok) {
        setTestMsg({ type: "success", text: `Test email sent to ${testEmail}` });
      } else {
        setTestMsg({ type: "error", text: data.error || "Failed to send test email." });
      }
    } catch {
      setTestMsg({ type: "error", text: "Network error sending test email." });
    } finally {
      setTesting(false);
      setTimeout(() => setTestMsg(null), 5000);
    }
  };

  const addRecipient = () => setRecipients(prev => [...prev, ""]);
  const removeRecipient = (i: number) => setRecipients(prev => prev.filter((_, idx) => idx !== i));
  const updateRecipient = (i: number, val: string) =>
    setRecipients(prev => prev.map((e, idx) => (idx === i ? val : e)));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-400" size={28} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1 text-sm">Configure daily email delivery and scraper credentials.</p>
      </div>

      {/* ── Email Delivery ─────────────────────────────────────────────────── */}
      <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700">
          <Mail className="text-blue-400" size={20} />
          <div>
            <h2 className="text-white font-semibold">Email Delivery</h2>
            <p className="text-slate-400 text-xs mt-0.5">Daily leads report sent every morning at 6:00 AM EST</p>
          </div>
          {settings?.smtp_configured ? (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={12} /> Configured
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full">
              <AlertCircle size={12} /> Not configured
            </span>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Recipient list */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Report Recipients
              <span className="text-slate-500 font-normal ml-2">— who receives the daily email</span>
            </label>
            <div className="space-y-2">
              {recipients.map((email, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={e => updateRecipient(i, e.target.value)}
                    placeholder="email@example.com"
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  {recipients.length > 1 && (
                    <button onClick={() => removeRecipient(i)} className="p-2 text-slate-500 hover:text-red-400 transition-colors">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addRecipient} className="mt-2 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
              <Plus size={14} /> Add recipient
            </button>
          </div>

          {/* SMTP config */}
          <div className="border-t border-slate-700 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium text-slate-300">SMTP Configuration</h3>
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                <Info size={12} /> Gmail App Password
              </a>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-slate-400 mb-1">SMTP Host</label>
                <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Port</label>
                <input type="text" value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                  placeholder="587"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Gmail Address</label>
                <input type="email" value={smtpUser} onChange={e => setSmtpUser(e.target.value)}
                  placeholder="you@gmail.com"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">App Password</label>
                <div className="relative">
                  <input type={showSmtpPass ? "text" : "password"} value={smtpPass} onChange={e => setSmtpPass(e.target.value)}
                    placeholder="16-character app password"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 pr-9 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500" />
                  <button type="button" onClick={() => setShowSmtpPass(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showSmtpPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">From Name / Address <span className="text-slate-600">(optional)</span></label>
                <input type="text" value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)}
                  placeholder="Atlas Lead Engine <you@gmail.com>"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>

          {/* Test email */}
          <div className="border-t border-slate-700 pt-4">
            <div className="flex gap-2">
              <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                placeholder="Send test to..."
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <button onClick={handleTestEmail} disabled={testing || !testEmail}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
                {testing ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                {testing ? "Sending..." : "Send Test"}
              </button>
            </div>
            {testMsg && (
              <p className={`mt-2 text-xs flex items-center gap-1.5 ${testMsg.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                {testMsg.type === "success" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                {testMsg.text}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── ScraperAPI Key ─────────────────────────────────────────────────── */}
      <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700">
          <Key className="text-purple-400" size={20} />
          <div>
            <h2 className="text-white font-semibold">ScraperAPI Key</h2>
            <p className="text-slate-400 text-xs mt-0.5">Used to bypass bot protection on county portals</p>
          </div>
          {settings?.scraper_api_configured && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={12} /> Active
            </span>
          )}
        </div>
        <div className="px-6 py-5">
          <label className="block text-xs text-slate-400 mb-1">API Key</label>
          <div className="relative">
            <input type={showScraperKey ? "text" : "password"} value={scraperKey} onChange={e => setScraperKey(e.target.value)}
              placeholder="Your ScraperAPI key"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 pr-9 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500" />
            <button type="button" onClick={() => setShowScraperKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showScraperKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Get your key at{" "}
            <a href="https://www.scraperapi.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
              scraperapi.com
            </a>. Free tier: 1,000 requests/month.
          </p>
        </div>
      </section>

      {/* ── Save Button ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors">
          {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {saveMsg && (
          <p className={`text-sm flex items-center gap-1.5 ${saveMsg.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
            {saveMsg.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {saveMsg.text}
          </p>
        )}
      </div>

      {/* ── County Overview ────────────────────────────────────────────────── */}
      {counties.length > 0 && (
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700">
            <h2 className="text-white font-semibold">Active Counties</h2>
            <p className="text-slate-400 text-xs mt-0.5">Configured by your Atlas administrator</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex flex-wrap gap-2">
              {counties.map((c, i) => (
                <span key={i} className="px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded-full">
                  {c.name}, {c.state}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
