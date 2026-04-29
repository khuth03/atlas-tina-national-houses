// Atlas Login — Dark split layout matching existing Atlas branding
import { useState } from "react";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setTimeout(() => {
      if (email === "tina@nationalhouses.com" && password === "Tina1074$") {
        onLogin();
      } else {
        setError("Invalid credentials. Please try again.");
        setLoading(false);
      }
    }, 600);
  };

  return (
    <div style={{
      display: "flex", height: "100vh",
      background: "oklch(0.10 0.01 30)",
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Left panel */}
      <div style={{
        flex: 1,
        background: "oklch(0.09 0.01 30)",
        borderRight: "1px solid oklch(0.20 0.015 30)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", top: "20%", left: "-10%",
          width: 400, height: 400, borderRadius: "50%",
          background: "oklch(0.60 0.20 28 / 0.06)",
          filter: "blur(80px)",
          pointerEvents: "none",
        }}/>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "oklch(0.55 0.22 25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: "oklch(0.95 0.01 60)", letterSpacing: "-0.02em" }}>EasyButton</div>
            <div style={{ fontSize: 10, color: "oklch(0.45 0.02 40)", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace" }}>REAL ESTATE</div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: "oklch(0.55 0.22 25)", letterSpacing: "0.12em", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", marginBottom: 16 }}>
          Meet Atlas
        </div>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 48,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: "-0.03em",
          color: "oklch(0.95 0.01 60)",
          marginBottom: 20,
        }}>
          Your <span style={{ color: "oklch(0.55 0.22 25)", fontStyle: "italic" }}>full-time</span><br/>
          data team,<br/>
          built into one app.
        </h1>
        <p style={{ fontSize: 15, color: "oklch(0.50 0.02 40)", lineHeight: 1.6, maxWidth: 380 }}>
          Atlas by National Houses connects to dozens of property databases, satellites, and softwares to bring you{" "}
          <strong style={{ color: "oklch(0.70 0.01 60)", fontWeight: 600 }}>sellers ready to sell in your buy box, today.</strong>
        </p>

        {/* Feature pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 36 }}>
          {["County Scraper", "AI Condition Scoring", "Insurance Gap", "Social Distress", "Obituary Monitor", "Fire Damage"].map(f => (
            <div key={f} style={{
              padding: "6px 12px",
              background: "oklch(0.15 0.01 30)",
              border: "1px solid oklch(0.22 0.015 30)",
              borderRadius: 20,
              fontSize: 12,
              color: "oklch(0.60 0.01 60)",
            }}>{f}</div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{
        width: 460,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 48px",
      }}>
        {/* Atlas icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: "oklch(0.55 0.22 25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 24,
          boxShadow: "0 8px 32px oklch(0.60 0.20 28 / 0.3)",
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>

        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 700, color: "oklch(0.95 0.01 60)", marginBottom: 6, letterSpacing: "-0.02em" }}>
          Welcome back.
        </h2>
        <p style={{ fontSize: 14, color: "oklch(0.45 0.02 40)", marginBottom: 32 }}>
          I'm Atlas — <span style={{ color: "oklch(0.55 0.22 25)", fontWeight: 600 }}>your full-time data agent.</span><br/>
          We Buy Houses As-Is Across the U.S.
        </p>

        {error && (
          <div style={{
            background: "oklch(0.60 0.22 25 / 0.1)",
            border: "1px solid oklch(0.60 0.22 25 / 0.3)",
            borderRadius: 6, padding: "10px 14px",
            fontSize: 13, color: "oklch(0.70 0.15 25)",
            marginBottom: 20,
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="atlas-label" style={{ marginBottom: 6 }}>Email Address</div>
            <input
              className="atlas-input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <div className="atlas-label" style={{ marginBottom: 6 }}>Password</div>
            <input
              className="atlas-input"
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="atlas-btn"
            style={{ marginTop: 8, padding: "12px 20px", fontSize: 15, justifyContent: "center", opacity: loading ? 0.7 : 1 }}
            disabled={loading}
          >
            {loading ? "Authenticating..." : "Access Atlas →"}
          </button>
        </form>

        <div style={{ marginTop: 32, fontSize: 11, color: "oklch(0.35 0.02 40)", textAlign: "center", fontFamily: "'JetBrains Mono', monospace" }}>
          Atlas by National Houses · Private Access Only · Multi-State Real Estate Intelligence
        </div>
      </div>
    </div>
  );
}
