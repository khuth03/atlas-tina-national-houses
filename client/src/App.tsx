// Atlas by National Houses
// Design: Dark Intelligence Terminal — Bloomberg meets modern SaaS
// Colors: Near-black base (#0D0B0A), EBRE orange-red accent (#E8521A), amber data highlights (#F5A623)
// Typography: Syne (display) + Inter (body) + JetBrains Mono (data)

import { Switch, Route, useLocation } from "wouter";
import { useState } from "react";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import CountyScraper from "@/pages/CountyScraper";
import PropertyCondition from "@/pages/PropertyCondition";
import InsuranceGap from "@/pages/InsuranceGap";
import SocialDistress from "@/pages/SocialDistress";
import ObituaryMonitor from "@/pages/ObituaryMonitor";
import FireDamage from "@/pages/FireDamage";
import AppLayout from "@/components/AppLayout";

export default function App() {
  const [authed, setAuthed] = useState(() => {
    return localStorage.getItem("atlas_authed") === "true";
  });
  const [location, setLocation] = useLocation();

  if (!authed) {
    return <Login onLogin={() => { localStorage.setItem("atlas_authed", "true"); setAuthed(true); setLocation("/"); }} />;
  }

  return (
    <AppLayout onLogout={() => { localStorage.removeItem("atlas_authed"); setAuthed(false); }}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/county-scraper" component={CountyScraper} />
        <Route path="/property-condition" component={PropertyCondition} />
        <Route path="/insurance-gap" component={InsuranceGap} />
        <Route path="/social-distress" component={SocialDistress} />
        <Route path="/obituary" component={ObituaryMonitor} />
        <Route path="/fire-damage" component={FireDamage} />
        <Route>
          <div className="flex items-center justify-center h-full text-atlas-muted">
            Page not found
          </div>
        </Route>
      </Switch>
    </AppLayout>
  );
}
