/**
 * Settings.tsx — Atlas Settings & Configuration
 * Sections:
 * 1. How Atlas Works — full rebuild guide, architecture, Manus setup
 * 2. Lead Source Matrix — all counties × all lead types with status, source, notes
 * 3. API Keys — Bright Data, ATTOM, Skip Trace, ScraperAPI
 * 4. Email Delivery — SMTP + recipient list
 */
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, AlertCircle, Clock,
  ChevronDown, ChevronRight, Save, Eye, EyeOff,
  Mail, Key, Database, BookOpen, RefreshCw, Zap, Info,
  Terminal, GitBranch, Server, Code2, MapPin, FileText,
  AlertTriangle, Wrench, Cpu, Globe, Lock, Unlock
} from "lucide-react";

interface Settings {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  email_recipients: string;
  scraper_api_key: string;
  skip_trace_key: string;
  auto_skip_trace: string;
  bright_data_user: string;
  bright_data_pass: string;
  attom_api_key: string;
  smtp_configured: boolean;
  scraper_api_configured: boolean;
  skip_trace_configured: boolean;
  bright_data_configured: boolean;
  attom_configured: boolean;
}

type LeadStatus = "live" | "possible" | "needs_attom" | "needs_brightdata" | "blocked" | "na" | "stale";

interface LeadSource {
  type: string;
  status: LeadStatus;
  source: string;
  endpoint?: string;
  notes: string;
}

interface CountyMatrix {
  county: string;
  state: string;
  region: string;
  sources: LeadSource[];
}

const LEAD_MATRIX: CountyMatrix[] = [
  // ── MISSOURI ──────────────────────────────────────────────────────────────
  {
    county: "Jackson", state: "MO", region: "Kansas City Metro",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "Jackson County Recorder + MO Case.net", endpoint: "recorder.jacksongov.org + courts.mo.gov", notes: "LP documents from recorder; LP court cases from Case.net (court code 16). Enriched via Jackson County ArcGIS parcel layer." },
      { type: "Tax Delinquent", status: "live", source: "Jackson County ArcGIS Parcels", endpoint: "maps.jacksongov.org/arcgis/rest/services", notes: "FeatureServer query with DELINQUENT='Y' filter. No auth required. Returns owner name, address, parcel ID directly from assessor." },
      { type: "Sheriff Sales", status: "live", source: "Jackson County Sheriff Civil Process", endpoint: "jacksongov.org/civil-process", notes: "HTML scrape of civil process page. Enriched with owner name via assessor parcel lookup." },
      { type: "Code Violations", status: "live", source: "KC 311 Open Data", endpoint: "data.kcmo.org/resource/d4px-6rwg.json", notes: "Socrata API, no auth. Filter: issue_type='Property Violations'. Enriched via assessor ArcGIS." },
      { type: "Fire Damage", status: "live", source: "KC 311 Open Data", endpoint: "data.kcmo.org/resource/d4px-6rwg.json", notes: "Same dataset. Filter: issue_type='Dangerous Buildings' OR 'Open Burning/Fire'. 94 records in last 90 days." },
      { type: "Water Shutoff", status: "live", source: "KC 311 Open Data", endpoint: "data.kcmo.org/resource/d4px-6rwg.json", notes: "Same dataset. Filter: issue_type='Water Service' AND issue_sub_type='No Water'. 234 records in last 90 days." },
      { type: "Vacant / Abandoned", status: "live", source: "KC 311 Open Data", endpoint: "data.kcmo.org/resource/d4px-6rwg.json", notes: "Same dataset. Filter: issue_sub_type LIKE '%Vacant%'. 36 records in last 90 days." },
      { type: "Bankruptcy", status: "live", source: "PACER Western District MO RSS", endpoint: "ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Public RSS feed, no auth. Covers all MO Western District counties. Enriched: only saved when filer owns property in county." },
      { type: "Probate / Estate", status: "live", source: "MO Case.net", endpoint: "courts.mo.gov/casenet/cases/searchCases.do", notes: "Case type PR, court code 16. Enriched via Jackson County assessor ArcGIS — only saved when decedent owns property." },
      { type: "Divorce", status: "live", source: "MO Case.net", endpoint: "courts.mo.gov/casenet/cases/searchCases.do", notes: "Case type D, court code 16. Only saved when respondent owns property in Jackson County." },
      { type: "Obituaries", status: "live", source: "Legacy.com KC RSS", endpoint: "legacy.com/obituaries/kansascity/rss.aspx", notes: "Estate lead proxy. Enriched via assessor — only saved when decedent owns property in county." },
      { type: "FSBO", status: "live", source: "Craigslist Kansas City", endpoint: "kansascity.craigslist.org/search/reo", notes: "JSON API, no auth. Filtered by FSBO/motivated seller keywords." },
    ]
  },
  {
    county: "Clay", state: "MO", region: "Kansas City Metro (North)",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "MO Case.net", endpoint: "courts.mo.gov/casenet — court code 12", notes: "LP cases for Clay County. Enriched via Clay County assessor." },
      { type: "Tax Delinquent", status: "possible", source: "Clay County Collector", endpoint: "claycountymo.gov/collector", notes: "HTML scrape. Works but may need periodic updates if site structure changes. Ask Manus to verify if 0 results appear." },
      { type: "Sheriff Sales", status: "possible", source: "Clay County Sheriff", endpoint: "claycountysheriff.net/civil-process", notes: "HTML scrape. Verify URL is current before each deployment." },
      { type: "Code Violations", status: "live", source: "KC 311 Open Data", endpoint: "data.kcmo.org/resource/d4px-6rwg.json", notes: "Liberty/Kearney/Gladstone addresses auto-assigned to Clay County by ZIP code." },
      { type: "Fire Damage", status: "live", source: "KC 311 Open Data", endpoint: "data.kcmo.org/resource/d4px-6rwg.json", notes: "Same KC 311 feed — Clay County addresses included." },
      { type: "Water Shutoff", status: "live", source: "KC 311 Open Data", endpoint: "data.kcmo.org/resource/d4px-6rwg.json", notes: "Same KC 311 feed — Clay County addresses included." },
      { type: "Bankruptcy", status: "live", source: "PACER Western District MO RSS", endpoint: "ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Same feed as Jackson — covers all MO Western District." },
      { type: "Probate / Estate", status: "live", source: "MO Case.net", endpoint: "courts.mo.gov/casenet — court code 12", notes: "Case type PR. Enriched via Clay County assessor." },
      { type: "Divorce", status: "live", source: "MO Case.net", endpoint: "courts.mo.gov/casenet — court code 12", notes: "Case type D. Only saved when respondent owns property." },
      { type: "Obituaries", status: "live", source: "Legacy.com KC RSS", endpoint: "legacy.com/obituaries/kansascity/rss.aspx", notes: "Same KC metro feed — covers Clay County area." },
      { type: "FSBO", status: "live", source: "Craigslist Kansas City", endpoint: "kansascity.craigslist.org/search/reo", notes: "Same feed as Jackson." },
    ]
  },
  {
    county: "Cass", state: "MO", region: "Kansas City Metro (South)",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "MO Case.net", endpoint: "courts.mo.gov/casenet — court code 7", notes: "LP cases for Cass County. Enriched via Cass County assessor." },
      { type: "Tax Delinquent", status: "live", source: "Cass County Collector ArcGIS", endpoint: "casscounty.com/collector + ArcGIS fallback", notes: "Confirmed working HTML scrape with ArcGIS fallback. Harrisonville area." },
      { type: "Sheriff Sales", status: "live", source: "Cass County Sheriff", endpoint: "casscountysheriff.net/civil-process", notes: "HTML scrape of civil process page." },
      { type: "Code Violations", status: "na", source: "No open data portal", endpoint: "—", notes: "Cass County does not have a public code violation API. Would require direct court/county portal scraping." },
      { type: "Bankruptcy", status: "live", source: "PACER Western District MO RSS", endpoint: "ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Same feed as Jackson." },
      { type: "Probate / Estate", status: "live", source: "MO Case.net", endpoint: "courts.mo.gov/casenet — court code 7", notes: "Case type PR. Enriched via Cass County assessor." },
      { type: "Divorce", status: "live", source: "MO Case.net", endpoint: "courts.mo.gov/casenet — court code 7", notes: "Case type D. Only saved when respondent owns property." },
      { type: "Obituaries", status: "live", source: "Legacy.com KC RSS", endpoint: "legacy.com/obituaries/kansascity/rss.aspx", notes: "KC metro feed covers Cass County area." },
      { type: "FSBO", status: "live", source: "Craigslist Kansas City", endpoint: "kansascity.craigslist.org/search/reo", notes: "Same feed as Jackson." },
    ]
  },
  {
    county: "Platte", state: "MO", region: "Kansas City Metro (NW)",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "MO Case.net", endpoint: "courts.mo.gov/casenet — court code 25", notes: "LP cases for Platte County. Enriched via Platte County assessor." },
      { type: "Tax Delinquent", status: "possible", source: "Platte County Collector", endpoint: "plattecountymo.gov/collector", notes: "HTML scrape. Verify URL is current — ask Manus to check if 0 results appear." },
      { type: "Sheriff Sales", status: "live", source: "Platte County Sheriff", endpoint: "plattecountysheriff.org/civil-process", notes: "Civil process page scrape." },
      { type: "Code Violations", status: "na", source: "No open data portal", endpoint: "—", notes: "No public code violation API for Platte County." },
      { type: "Bankruptcy", status: "live", source: "PACER Western District MO RSS", endpoint: "ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Same feed as Jackson." },
      { type: "Probate / Estate", status: "live", source: "MO Case.net", endpoint: "courts.mo.gov/casenet — court code 25", notes: "Case type PR. Enriched via Platte County assessor." },
      { type: "Divorce", status: "live", source: "MO Case.net", endpoint: "courts.mo.gov/casenet — court code 25", notes: "Case type D. Only saved when respondent owns property." },
      { type: "Obituaries", status: "live", source: "Legacy.com KC RSS", endpoint: "legacy.com/obituaries/kansascity/rss.aspx", notes: "KC metro feed covers Platte County area." },
      { type: "FSBO", status: "live", source: "Craigslist Kansas City", endpoint: "kansascity.craigslist.org/search/reo", notes: "Same feed as Jackson." },
    ]
  },
  // ── OHIO ──────────────────────────────────────────────────────────────────
  {
    county: "Hamilton", state: "OH", region: "Cincinnati Metro",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "Hamilton County Clerk of Courts", endpoint: "courtclerk.org/records-search/case-search/?caseType=F", notes: "HTML scrape of foreclosure case search. Enriched via Hamilton County Auditor ArcGIS." },
      { type: "Tax Delinquent", status: "live", source: "Hamilton County Auditor", endpoint: "wedge1.hcauditor.org/search/re/delinquent/{year}/1", notes: "CONFIRMED WORKING. Returns owner name, address, city, zip, delinquent amount. Prior year fallback included." },
      { type: "Sheriff Sales", status: "live", source: "Hamilton County RealAuction", endpoint: "hamilton.sheriffsaleauction.ohio.gov", notes: "JS-rendered page — uses fetchRendered. Enriched with owner via auditor." },
      { type: "Code Violations", status: "live", source: "Cincinnati Open Data", endpoint: "data.cincinnati-oh.gov/resource/cncm-znd6.json", notes: "Socrata API, no auth. 500 records in last 90 days. Fields: entered_date, full_address, case_number, violation_description." },
      { type: "Fire Damage", status: "stale", source: "Cincinnati Fire CAD", endpoint: "data.cincinnati-oh.gov/resource/vnsz-a3wp.json", notes: "DATASET STALE: Cincinnati's open data portal last updated this dataset Sept 2023. Scraper is correctly coded (cfd_incident_type_group='STRUCTURE FIRE', address_x). Will pull automatically if Cincinnati resumes updates." },
      { type: "Vacant / Abandoned", status: "live", source: "Cincinnati Vacant Foreclosed Registry", endpoint: "data.cincinnati-oh.gov/resource/w3jp-dfxy.json", notes: "84 records in last 90 days. No street address in dataset — scraper uses Nominatim reverse geocoding from lat/lon. Enriched via Hamilton County Auditor." },
      { type: "Bankruptcy", status: "live", source: "PACER Southern + Northern District OH", endpoint: "ecf.ohsb.uscourts.gov + ecf.ohnb.uscourts.gov", notes: "Two RSS feeds — Southern (Cincinnati/Columbus/Dayton) and Northern (Cleveland/Akron). Enriched: only saved when filer owns property." },
      { type: "Probate / Estate", status: "live", source: "Hamilton County Probate Court", endpoint: "probatect.org/case-search?caseType=estate", notes: "HTML scrape. Enriched via auditor — only saved when decedent owns property." },
      { type: "Divorce", status: "live", source: "Hamilton County Clerk of Courts", endpoint: "courtclerk.org/records-search/case-search/?caseType=DR", notes: "POST search. Only saved when respondent owns property in Hamilton County." },
      { type: "Obituaries", status: "live", source: "Legacy.com Cincinnati RSS", endpoint: "legacy.com/obituaries/cincinnati/rss.aspx", notes: "Estate lead proxy. Enriched via auditor — only saved when decedent owns property." },
      { type: "FSBO", status: "live", source: "Craigslist Cincinnati", endpoint: "cincinnati.craigslist.org/search/reo", notes: "JSON API, filtered by FSBO/motivated seller keywords." },
    ]
  },
  // ── ALABAMA ───────────────────────────────────────────────────────────────
  {
    county: "Jefferson", state: "AL", region: "Birmingham Metro",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt Public Case Search", endpoint: "v2.alacourt.com — caseType=CV", notes: "AlaCourt public portal, foreclosure filter. Enriched via JCCAL ArcGIS." },
      { type: "Tax Delinquent", status: "needs_brightdata", source: "JCCAL ArcGIS (behind Imperva WAF)", endpoint: "gis.jccal.org/arcgis/rest/services", notes: "JCCAL ArcGIS is behind Imperva WAF — blocks all datacenter IPs. Bright Data residential proxy ($15–50/mo) is the only reliable bypass. Falls back to limited public endpoint without it." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin + jeffcosheriff.net", endpoint: "rubinlublin.com/sheriff-sales/alabama", notes: "Rubin Lublin covers all AL counties. County page as fallback. Enriched via JCCAL." },
      { type: "Code Violations", status: "live", source: "Jefferson County Code Enforcement", endpoint: "jeffcointouch.com/code-enforcement", notes: "Jefferson County portal scrape. Enriched with owner via JCCAL." },
      { type: "Vacant / Abandoned", status: "live", source: "Birmingham Open Data", endpoint: "data.birminghamal.gov — vacant/blight registry", notes: "City of Birmingham blight registry. Enriched via JCCAL assessor." },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", endpoint: "ecf.alnb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Covers Jefferson/Madison/Morgan/Shelby. Enriched: only saved when filer owns property." },
      { type: "Probate / Estate", status: "live", source: "AlaCourt caseType=PR + JCCAL enrichment", endpoint: "v2.alacourt.com — caseType=PR", notes: "AlaCourt public search. Enriched via JCCAL ArcGIS." },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", endpoint: "v2.alacourt.com — caseType=DR", notes: "Only saved when respondent owns property in Jefferson County." },
      { type: "Obituaries", status: "live", source: "al.com obituaries + Legacy.com", endpoint: "al.com/obituaries + legacy.com/obituaries/birmingham", notes: "Estate lead proxy. Enriched via JCCAL assessor lookup." },
      { type: "FSBO", status: "live", source: "Craigslist Birmingham", endpoint: "birmingham.craigslist.org/search/reo", notes: "JSON API, filtered by FSBO/motivated seller keywords." },
    ]
  },
  {
    county: "Madison", state: "AL", region: "Huntsville Metro",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt Public Case Search", endpoint: "v2.alacourt.com — caseType=CV", notes: "Same feed as Jefferson. Enriched via Madison County assessor." },
      { type: "Tax Delinquent", status: "live", source: "Madison County Property Tax Portal", endpoint: "madisonproperty.countygovservices.com", notes: "Accessible without proxy — POST search confirmed working. No WAF." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin + madisoncountyal.gov", endpoint: "rubinlublin.com/sheriff-sales/alabama", notes: "Rubin Lublin primary, county page fallback." },
      { type: "Code Violations", status: "live", source: "Huntsville Open Data", endpoint: "data.huntsvilleal.gov", notes: "City of Huntsville open data portal. Enriched via Madison County assessor." },
      { type: "Vacant / Abandoned", status: "possible", source: "Huntsville Code Enforcement", endpoint: "huntsvilleal.gov/code-enforcement", notes: "HTML scrape possible. Ask Manus to verify current URL structure." },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", endpoint: "ecf.alnb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Same feed as Jefferson." },
      { type: "Probate / Estate", status: "live", source: "AlaCourt caseType=PR", endpoint: "v2.alacourt.com — caseType=PR", notes: "AlaCourt public search. Enriched via Madison County assessor." },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", endpoint: "v2.alacourt.com — caseType=DR", notes: "Only saved when respondent owns property." },
      { type: "Obituaries", status: "live", source: "al.com + Legacy.com Huntsville", endpoint: "legacy.com/obituaries/huntsvilletimes", notes: "Estate lead proxy. Enriched via Madison County assessor." },
      { type: "FSBO", status: "live", source: "Craigslist Huntsville", endpoint: "huntsville.craigslist.org/search/reo", notes: "JSON API, filtered by FSBO/motivated seller keywords." },
    ]
  },
  {
    county: "Morgan", state: "AL", region: "Decatur Area",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt Public Case Search", endpoint: "v2.alacourt.com — caseType=CV", notes: "Same feed as Jefferson/Madison." },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", endpoint: "gis.revenue.alabama.gov", notes: "gis.revenue.alabama.gov blocks all datacenter IPs. ATTOM Data API (~$150/mo) unlocks full address + owner enrichment for this county." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", endpoint: "rubinlublin.com/sheriff-sales/alabama", notes: "Statewide coverage." },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", endpoint: "ecf.alnb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Same feed as Jefferson." },
      { type: "Probate / Estate", status: "live", source: "AlaCourt caseType=PR", endpoint: "v2.alacourt.com — caseType=PR", notes: "AlaCourt public search." },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", endpoint: "v2.alacourt.com — caseType=DR", notes: "Only saved when respondent owns property." },
      { type: "FSBO", status: "live", source: "Craigslist Huntsville", endpoint: "huntsville.craigslist.org/search/reo", notes: "Same feed as Madison." },
    ]
  },
  {
    county: "Montgomery", state: "AL", region: "Montgomery Metro",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt Public Case Search", endpoint: "v2.alacourt.com — caseType=CV", notes: "AlaCourt public search. Enriched via Montgomery County assessor." },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", endpoint: "gis.revenue.alabama.gov", notes: "Blocked by gis.revenue.alabama.gov. ATTOM Data API (~$150/mo) required." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", endpoint: "rubinlublin.com/sheriff-sales/alabama", notes: "Statewide coverage." },
      { type: "Bankruptcy", status: "live", source: "PACER Middle District AL RSS", endpoint: "ecf.almb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Middle District covers Montgomery/Autauga/Elmore." },
      { type: "Probate / Estate", status: "live", source: "AlaCourt caseType=PR", endpoint: "v2.alacourt.com — caseType=PR", notes: "AlaCourt public search." },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", endpoint: "v2.alacourt.com — caseType=DR", notes: "Only saved when respondent owns property." },
      { type: "FSBO", status: "live", source: "Craigslist Montgomery", endpoint: "montgomery.craigslist.org/search/reo", notes: "JSON API, filtered by FSBO/motivated seller keywords." },
    ]
  },
  {
    county: "Shelby", state: "AL", region: "Birmingham Suburbs",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt Public Case Search", endpoint: "v2.alacourt.com — caseType=CV", notes: "AlaCourt public search. Enriched via Shelby County assessor." },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", endpoint: "gis.revenue.alabama.gov", notes: "Blocked by gis.revenue.alabama.gov. ATTOM Data API (~$150/mo) required." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", endpoint: "rubinlublin.com/sheriff-sales/alabama", notes: "Statewide coverage." },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", endpoint: "ecf.alnb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Same feed as Jefferson." },
      { type: "Probate / Estate", status: "live", source: "AlaCourt caseType=PR", endpoint: "v2.alacourt.com — caseType=PR", notes: "AlaCourt public search." },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", endpoint: "v2.alacourt.com — caseType=DR", notes: "Only saved when respondent owns property." },
      { type: "FSBO", status: "live", source: "Craigslist Birmingham", endpoint: "birmingham.craigslist.org/search/reo", notes: "Same feed as Jefferson." },
    ]
  },
  {
    county: "Limestone", state: "AL", region: "Athens / North Alabama",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt Public Case Search", endpoint: "v2.alacourt.com — caseType=CV", notes: "AlaCourt public search. Enriched via Limestone County assessor." },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", endpoint: "gis.revenue.alabama.gov", notes: "Blocked by gis.revenue.alabama.gov. ATTOM Data API (~$150/mo) required." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", endpoint: "rubinlublin.com/sheriff-sales/alabama", notes: "Statewide coverage." },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", endpoint: "ecf.alnb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Same feed as Jefferson." },
      { type: "Probate / Estate", status: "live", source: "AlaCourt caseType=PR", endpoint: "v2.alacourt.com — caseType=PR", notes: "AlaCourt public search." },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", endpoint: "v2.alacourt.com — caseType=DR", notes: "Only saved when respondent owns property." },
      { type: "FSBO", status: "live", source: "Craigslist Huntsville", endpoint: "huntsville.craigslist.org/search/reo", notes: "Same feed as Madison." },
    ]
  },
  {
    county: "Autauga", state: "AL", region: "Montgomery Area",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt Public Case Search", endpoint: "v2.alacourt.com — caseType=CV", notes: "AlaCourt public search." },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", endpoint: "gis.revenue.alabama.gov", notes: "Blocked by gis.revenue.alabama.gov. ATTOM Data API (~$150/mo) required." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", endpoint: "rubinlublin.com/sheriff-sales/alabama", notes: "Statewide coverage." },
      { type: "Bankruptcy", status: "live", source: "PACER Middle District AL RSS", endpoint: "ecf.almb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Middle District covers Autauga/Elmore/Montgomery." },
      { type: "Probate / Estate", status: "live", source: "AlaCourt caseType=PR", endpoint: "v2.alacourt.com — caseType=PR", notes: "AlaCourt public search." },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", endpoint: "v2.alacourt.com — caseType=DR", notes: "Only saved when respondent owns property." },
      { type: "FSBO", status: "live", source: "Craigslist Montgomery", endpoint: "montgomery.craigslist.org/search/reo", notes: "Same feed as Montgomery." },
    ]
  },
  {
    county: "Elmore", state: "AL", region: "Montgomery Area",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt Public Case Search", endpoint: "v2.alacourt.com — caseType=CV", notes: "AlaCourt public search." },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", endpoint: "gis.revenue.alabama.gov", notes: "Blocked by gis.revenue.alabama.gov. ATTOM Data API (~$150/mo) required." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", endpoint: "rubinlublin.com/sheriff-sales/alabama", notes: "Statewide coverage." },
      { type: "Bankruptcy", status: "live", source: "PACER Middle District AL RSS", endpoint: "ecf.almb.uscourts.gov/cgi-bin/rss_outside.pl", notes: "Middle District covers Autauga/Elmore/Montgomery." },
      { type: "Probate / Estate", status: "live", source: "AlaCourt caseType=PR", endpoint: "v2.alacourt.com — caseType=PR", notes: "AlaCourt public search." },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", endpoint: "v2.alacourt.com — caseType=DR", notes: "Only saved when respondent owns property." },
      { type: "FSBO", status: "live", source: "Craigslist Montgomery", endpoint: "montgomery.craigslist.org/search/reo", notes: "Same feed as Montgomery." },
    ]
  },
];

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; icon: React.ReactNode }> = {
  live:             { label: "Live",              color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",  icon: <CheckCircle className="w-3 h-3" /> },
  possible:         { label: "Possible",          color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",    icon: <AlertCircle className="w-3 h-3" /> },
  needs_attom:      { label: "Needs ATTOM",       color: "bg-orange-500/20 text-orange-300 border-orange-500/30",    icon: <Key className="w-3 h-3" /> },
  needs_brightdata: { label: "Needs Bright Data", color: "bg-purple-500/20 text-purple-300 border-purple-500/30",    icon: <Zap className="w-3 h-3" /> },
  blocked:          { label: "Blocked",           color: "bg-red-500/20 text-red-300 border-red-500/30",              icon: <XCircle className="w-3 h-3" /> },
  stale:            { label: "Data Stale",        color: "bg-slate-500/20 text-slate-300 border-slate-500/30",        icon: <Clock className="w-3 h-3" /> },
  na:               { label: "N/A",               color: "bg-slate-700/30 text-slate-500 border-slate-600/20",        icon: <Clock className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: LeadStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function Section({ title, icon, children, defaultOpen = true, accent }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={accent || "text-blue-400"}>{icon}</span>
          <span className="font-semibold text-white">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-6 pb-6 pt-2">{children}</div>}
    </div>
  );
}

function SubSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-slate-700/40 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/40 border-b border-slate-700/40">
        {icon && <span className="text-blue-400">{icon}</span>}
        <span className="font-semibold text-white text-sm">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="bg-slate-900/80 rounded-lg p-3 text-xs text-slate-300 font-mono border border-slate-700/40 whitespace-pre-wrap break-all">
      {children}
    </div>
  );
}

function Step({ n, label, children }: { n: string | number; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
      <div className="flex-1">
        <p className="font-medium text-white text-sm mb-1">{label}</p>
        <div className="text-slate-400 text-xs space-y-1">{children}</div>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, hint, masked }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  masked?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={masked && !show ? "password" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-900/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-colors"
        />
        {masked && (
          <button type="button" onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [expandedCounty, setExpandedCounty] = useState<string | null>(null);
  const [showEndpoints, setShowEndpoints] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: Settings) => {
        setSettings(data);
        setForm({
          smtp_host: data.smtp_host || "",
          smtp_port: data.smtp_port || "587",
          smtp_user: data.smtp_user || "",
          smtp_from: data.smtp_from || "",
          email_recipients: data.email_recipients || "",
          auto_skip_trace: data.auto_skip_trace || "false",
          bright_data_user: data.bright_data_user || "",
        });
      })
      .catch(() => toast.error("Failed to load settings"));
  }, []);

  const set = (key: string) => (value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v !== undefined) payload[k] = v;
      }
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Settings saved successfully");
      const updated = await fetch("/api/settings").then(r => r.json());
      setSettings(updated);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await fetch("/api/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email_recipients?.split(",")[0]?.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      toast.success("Test email sent successfully");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send test email");
    } finally {
      setTestingEmail(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const allSources = LEAD_MATRIX.flatMap(c => c.sources);
  const liveCnt = allSources.filter(s => s.status === "live").length;
  const needsActionCnt = allSources.filter(s => ["needs_attom", "needs_brightdata", "possible"].includes(s.status)).length;
  const staleCnt = allSources.filter(s => s.status === "stale").length;
  const totalCounties = LEAD_MATRIX.length;

  const stateGroups = [
    { label: "Missouri", counties: LEAD_MATRIX.filter(c => c.state === "MO") },
    { label: "Ohio", counties: LEAD_MATRIX.filter(c => c.state === "OH") },
    { label: "Alabama", counties: LEAD_MATRIX.filter(c => c.state === "AL") },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Configure Atlas, manage lead sources, and set up API keys</p>
      </div>

      {/* SUMMARY BANNER */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-300">{liveCnt}</div>
          <div className="text-xs text-emerald-400 mt-1">Lead sources live</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-300">{totalCounties}</div>
          <div className="text-xs text-blue-400 mt-1">Counties active</div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-300">{needsActionCnt}</div>
          <div className="text-xs text-orange-400 mt-1">Need action</div>
        </div>
        <div className="bg-slate-700/30 border border-slate-600/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-slate-300">6:00 AM</div>
          <div className="text-xs text-slate-400 mt-1">Daily scrape (EST)</div>
        </div>
      </div>

      {/* HOW ATLAS WORKS — FULL REBUILD GUIDE */}
      <Section title="How Atlas Works — Full Setup & Rebuild Guide" icon={<BookOpen className="w-5 h-5" />} defaultOpen={false}>
        <div className="space-y-6 text-sm">

          {/* Overview */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <p className="font-semibold text-white text-base mb-2">What Atlas Is</p>
            <p className="text-slate-300 text-sm leading-relaxed">
              Atlas is a fully automated real estate lead generation system that runs on your own server 24/7. Every morning at 6:00 AM Eastern Time, it scrapes motivated seller leads from county court systems, open data portals, PACER bankruptcy feeds, Craigslist, and assessor databases across Missouri, Ohio, and Alabama. It enriches each lead with the property owner's name and address, deduplicates, stores everything in a permanent database, and emails you a fresh CSV. You own the code, the server, and the data — it runs forever with no monthly platform fees.
            </p>
          </div>

          {/* Daily Flow */}
          <SubSection title="Daily Automated Flow" icon={<Cpu className="w-4 h-4" />}>
            <div className="space-y-3">
              {[
                { n: 1, label: "Scrape (6:00 AM EST)", body: "The node-cron scheduler triggers runAllScrapers() in server/scrapers/index.ts. It loops through every configured county and calls the appropriate state scraper (scrapeOhio, scrapeMissouri, scrapeAlabama). Each scraper hits the county's public data source — court portals, open data APIs, PACER RSS feeds, Craigslist — and returns an array of raw Lead objects." },
                { n: 2, label: "Enrich", body: "Each lead is cross-referenced with the county assessor's ArcGIS or property portal to get the owner's full legal name and mailing address. Name-based leads (probate, divorce, obituaries, bankruptcy) are only saved if the person actually owns property in that county — this filters out non-property-owners automatically." },
                { n: 3, label: "Deduplicate & Store", body: "Every lead gets a stable ID generated from county + lead type + case/parcel number (makeId() in base.ts). The upsertLead() function in db.ts uses SQLite's INSERT OR IGNORE to skip duplicates silently. Leads without a usable address or owner name are also filtered out. The database is permanent — it persists across deployments and Railway restarts." },
                { n: 4, label: "Email Delivery", body: "After scraping, Atlas emails a CSV of all new leads from that day's run to your configured recipients. Configure SMTP credentials in the Email Delivery section below. Gmail works with an App Password; any SMTP provider works." },
              ].map(item => (
                <Step key={item.n} n={item.n} label={item.label}>
                  <p>{item.body}</p>
                </Step>
              ))}
            </div>
          </SubSection>

          {/* Architecture */}
          <SubSection title="Architecture & File Structure" icon={<Server className="w-4 h-4" />}>
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                {[
                  { icon: "🖥️", label: "Server Runtime", value: "Node.js + Express on Railway (your account). Handles API routes, the daily cron, and serves the React frontend as static files." },
                  { icon: "🗄️", label: "Database", value: "SQLite via node-sqlite3-wasm. Stored on Railway's persistent volume — survives deployments and restarts. All leads are permanent." },
                  { icon: "🔍", label: "Scrapers", value: "server/scrapers/ — one file per state: missouri.ts, ohio.ts, alabama.ts. Each exports scrapeXxx(county, fromDate, toDate) functions." },
                  { icon: "🏠", label: "Assessor Enrichment", value: "server/scrapers/assessor.ts — lookupByAddress() and lookupOwnerProperties() for all counties. Queries county ArcGIS FeatureServers and auditor portals." },
                  { icon: "⏰", label: "Cron Scheduler", value: "node-cron in server/index.ts — cron expression '0 11 * * *' with timezone America/New_York = 6:00 AM EST. Restart-safe." },
                  { icon: "🎨", label: "Frontend", value: "React 19 + Tailwind 4 + shadcn/ui in client/src/. Served by Express as static files. Routes: / (login), /leads (dashboard), /settings, /property-condition." },
                  { icon: "📦", label: "GitHub Repo", value: "dealsnh/atlas-national-houses — Railway auto-deploys on every push to main branch. Deploy takes 3–4 minutes." },
                  { icon: "🔑", label: "Settings Storage", value: "API keys and SMTP credentials are stored in the SQLite DB via the settings table. They persist across deployments." },
                ].map(item => (
                  <div key={item.label} className="flex gap-2 bg-slate-900/40 rounded-lg p-2.5">
                    <span className="text-base flex-shrink-0">{item.icon}</span>
                    <div>
                      <p className="font-medium text-slate-200">{item.label}</p>
                      <p className="text-slate-400 mt-0.5">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-slate-400 text-xs font-medium mb-1.5">Key Files</p>
                <CodeBlock>{`server/
  index.ts              ← Express server, API routes, daily cron at 6 AM EST
  db.ts                 ← SQLite schema, upsertLead(), getStats(), settings
  scrapers/
    index.ts            ← runAllScrapers() dispatcher — routes to state scrapers
    missouri.ts         ← MO scrapers: Jackson/Clay/Cass/Platte
    ohio.ts             ← OH scrapers: Hamilton County (Cincinnati)
    alabama.ts          ← AL scrapers: Jefferson/Madison/Morgan/Montgomery/Shelby/Limestone/Autauga/Elmore
    assessor.ts         ← lookupByAddress() + lookupOwnerProperties() for all counties
    base.ts             ← Lead interface, makeId(), formatDate(), fetchWithRetry()
client/src/
  App.tsx               ← Routes, CLIENT_CONFIG (counties, branding, login)
  pages/
    CountyScraper.tsx   ← Main leads dashboard
    Settings.tsx        ← This page
    PropertyCondition.tsx ← AI property scoring
  components/
    AppLayout.tsx       ← Sidebar navigation`}</CodeBlock>
              </div>
            </div>
          </SubSection>

          {/* How Scrapers Work */}
          <SubSection title="How Each Scraper Type Works" icon={<Code2 className="w-4 h-4" />}>
            <div className="space-y-3 text-xs">
              {[
                {
                  type: "Tax Delinquent",
                  how: "Queries county assessor ArcGIS FeatureServer with a delinquency filter (e.g. DELINQUENT='Y'). Returns parcel ID, owner name, address, and delinquent amount directly. No court filing needed — this is the most reliable lead type.",
                  example: "Jackson County: maps.jacksongov.org/arcgis/rest/services/Parcels/FeatureServer/0/query?where=DELINQUENT='Y'"
                },
                {
                  type: "Pre-Foreclosure / Lis Pendens",
                  how: "Scrapes county court case search portals (MO Case.net, Hamilton County Clerk, AlaCourt) for LP/foreclosure case filings. Extracts case number, filing date, and case name. Enriched via assessor to get property address.",
                  example: "MO: courts.mo.gov/casenet/cases/searchCases.do?caseType=LP&courtCode=16"
                },
                {
                  type: "Bankruptcy",
                  how: "Reads public PACER RSS feeds from federal court districts. Each feed item contains a case number and debtor name. Enriched via assessor — only saved if the debtor owns property in the target county.",
                  example: "Western MO: ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl (no auth required)"
                },
                {
                  type: "Probate / Estate",
                  how: "Searches county probate court or AlaCourt for estate case filings. Extracts decedent name. Enriched via assessor — only saved if the decedent owned property in the county. These are the highest-conversion leads.",
                  example: "Hamilton OH: probatect.org/case-search?caseType=estate"
                },
                {
                  type: "Divorce",
                  how: "Searches county clerk or AlaCourt for divorce filings. Extracts respondent name. Enriched via assessor — only saved if the respondent owns property. Captures motivated sellers going through life transitions.",
                  example: "MO: courts.mo.gov/casenet/cases/searchCases.do?caseType=D&courtCode=16"
                },
                {
                  type: "Code Violations / Fire / Water / Vacant",
                  how: "Queries city/county open data portals via Socrata API (no auth required). Filters by issue type. Enriched via assessor address lookup to get owner name. KC 311 dataset d4px-6rwg covers fire, water, and vacant for all four MO counties.",
                  example: "KC: data.kcmo.org/resource/d4px-6rwg.json?$where=issue_type='Dangerous Buildings'"
                },
                {
                  type: "Obituaries",
                  how: "Reads Legacy.com RSS feeds for the metro area. Extracts decedent name. Enriched via assessor — only saved if the decedent owned property. Similar to probate but captures deaths before estate filings appear in court.",
                  example: "KC: legacy.com/obituaries/kansascity/rss.aspx"
                },
                {
                  type: "FSBO",
                  how: "Queries Craigslist's JSON API for real estate listings. Filters titles by FSBO/motivated seller keywords (fsbo, for sale by owner, motivated, must sell, price reduced, cash only, as-is). No enrichment needed — seller is the owner.",
                  example: "KC: kansascity.craigslist.org/search/reo?format=json"
                },
                {
                  type: "Sheriff Sales",
                  how: "Scrapes county sheriff civil process pages or RealAuction portals. Extracts property address, case number, and sale date. Enriched via assessor for owner name.",
                  example: "Hamilton OH: hamilton.sheriffsaleauction.ohio.gov (JS-rendered, uses fetchRendered)"
                },
              ].map(item => (
                <div key={item.type} className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                  <p className="font-semibold text-white mb-1">{item.type}</p>
                  <p className="text-slate-400 mb-1.5">{item.how}</p>
                  <p className="text-slate-500 font-mono text-xs">{item.example}</p>
                </div>
              ))}
            </div>
          </SubSection>

          {/* How Enrichment Works */}
          <SubSection title="How Enrichment Works" icon={<MapPin className="w-4 h-4" />}>
            <div className="space-y-3 text-xs text-slate-400">
              <p>Every lead goes through two enrichment functions in <code className="text-blue-300 bg-slate-900/60 px-1 rounded">server/scrapers/assessor.ts</code>:</p>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                  <p className="font-semibold text-white mb-1">lookupByAddress(address, county, state)</p>
                  <p>Used when you have an address but need the owner name. Queries the county assessor's ArcGIS parcel layer with a spatial/text search. Returns: ownerName, address, city, zip, parcelId.</p>
                  <p className="mt-1.5 text-slate-500">Used by: code violations, fire damage, water shutoffs, vacant/abandoned, sheriff sales</p>
                </div>
                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                  <p className="font-semibold text-white mb-1">lookupOwnerProperties(name, county, state)</p>
                  <p>Used when you have a name but need the address. Queries the assessor by owner name. Returns an array of properties owned by that person. Lead is only saved if at least one property is found.</p>
                  <p className="mt-1.5 text-slate-500">Used by: probate, divorce, obituaries, bankruptcy</p>
                </div>
              </div>
              <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                <p className="font-semibold text-white mb-1">Assessor Endpoints by County</p>
                <div className="space-y-1 font-mono text-xs text-slate-500">
                  <p>Jackson MO: maps.jacksongov.org/arcgis/rest/services/Parcels/FeatureServer/0</p>
                  <p>Clay MO: gis.claycountymo.gov/arcgis/rest/services/Parcels/FeatureServer/0</p>
                  <p>Cass MO: gis.casscounty.com/arcgis/rest/services/Parcels/FeatureServer/0</p>
                  <p>Platte MO: gis.plattecountymo.gov/arcgis/rest/services/Parcels/FeatureServer/0</p>
                  <p>Hamilton OH: wedge1.hcauditor.org (property search) + ArcGIS parcel layer</p>
                  <p>Jefferson AL: gis.jccal.org/arcgis/rest/services (behind WAF — needs Bright Data)</p>
                  <p>Madison AL: gis.madisoncountyal.gov/arcgis/rest/services/Parcels/FeatureServer/0</p>
                  <p>AL (others): gis.revenue.alabama.gov (blocked — needs ATTOM)</p>
                </div>
              </div>
            </div>
          </SubSection>

          {/* Building Atlas From Scratch */}
          <SubSection title="How to Rebuild Atlas From Scratch" icon={<Wrench className="w-4 h-4" />}>
            <div className="space-y-4">
              <p className="text-xs text-slate-400">If you ever need to rebuild Atlas on a new server or for a new client, here is the complete process:</p>
              <div className="space-y-4">
                <Step n="1" label="Fork or Clone the GitHub Repo">
                  <p>The code lives at <span className="text-blue-300">github.com/dealsnh/atlas-national-houses</span>. Fork it to the new client's GitHub account or clone it to a new repo.</p>
                  <CodeBlock>{`git clone https://github.com/dealsnh/atlas-national-houses.git
cd atlas-national-houses
git remote set-url origin https://github.com/[new-client]/atlas-[name].git
git push -u origin main`}</CodeBlock>
                </Step>
                <Step n="2" label="Create a Railway Project">
                  <p>Go to <span className="text-blue-300">railway.app</span> → New Project → Deploy from GitHub repo. Connect to the new repo. Railway will auto-detect the Node.js project and deploy it.</p>
                  <p className="mt-1">Set these environment variables in Railway (Settings → Variables):</p>
                  <CodeBlock>{`NODE_ENV=production
PORT=3000
CLIENT_COUNTIES=Jackson,Clay,Cass,Platte,Hamilton,Jefferson,Madison,Morgan,Montgomery,Shelby,Limestone
# Optional — add if needed:
SCRAPER_API_KEY=your_key
BRIGHT_DATA_USER=brd-customer-xxx
BRIGHT_DATA_PASS=your_pass
ATTOM_API_KEY=your_key`}</CodeBlock>
                  <p className="mt-1">Add a Railway Volume for SQLite persistence: Settings → Volumes → Mount at <code className="text-blue-300">/data</code></p>
                </Step>
                <Step n="3" label="Customize CLIENT_CONFIG in App.tsx">
                  <p>Edit <code className="text-blue-300">client/src/App.tsx</code> — update the CLIENT_CONFIG object with the new client's company name, login credentials, accent color, and county list. This is the only file that needs to change per client.</p>
                  <CodeBlock>{`export const CLIENT_CONFIG = {
  companyName: "Client Name",
  userEmail: "client@email.com",
  userPassword: "Password123$",
  accentColor: "#DC2626",  // hex color for branding
  counties: [
    { name: "Jackson", state: "MO", leadTypes: ["Pre-Foreclosure", "Tax Delinquent", ...] },
    // ... add all counties
  ],
};`}</CodeBlock>
                </Step>
                <Step n="4" label="Configure Email Delivery">
                  <p>Go to Settings → Email Delivery in the Atlas UI. Enter SMTP credentials. For Gmail: use App Password (not your regular password). Enable 2FA first, then go to Google Account → Security → App Passwords → create one for "Mail".</p>
                  <p className="mt-1">Recommended SMTP settings for Gmail:</p>
                  <CodeBlock>{`Host: smtp.gmail.com
Port: 587
Username: your.email@gmail.com
Password: [16-char App Password — no spaces]
From: your.email@gmail.com
Recipients: tina@nationalhouses.com`}</CodeBlock>
                </Step>
                <Step n="5" label="Seed Historical Data (Optional)">
                  <p>To pre-populate the database with the last 90 days of leads, run the seed script from your local machine:</p>
                  <CodeBlock>{`# Set Railway DB URL or use the Railway CLI
python3 seed_csvs.py  # imports historical CSVs into Railway DB
# OR use the Atlas UI: County Scraper → Historical Pull → select date range`}</CodeBlock>
                </Step>
                <Step n="6" label="Add a New County">
                  <p>To add a county to an existing Atlas deployment, tell Manus:</p>
                  <CodeBlock>{`"Add [County] County [State] to my Atlas. 
The county's assessor ArcGIS is at [URL]. 
The court system is [Case.net / AlaCourt / courtclerk.org].
Add pre-foreclosure, tax delinquent, probate, and bankruptcy."`}</CodeBlock>
                  <p className="mt-1">Manus will: (1) add scraper functions to the state file, (2) add the county to assessor.ts LOOKUP_MAP, (3) add it to CLIENT_CONFIG in App.tsx, (4) push to GitHub, (5) Railway auto-deploys.</p>
                </Step>
                <Step n="7" label="Add a New Lead Type">
                  <p>To add a new lead type to an existing county:</p>
                  <CodeBlock>{`"Add [lead type] leads for [County] County [State].
The data source is [URL or description].
The API returns [field names if known]."

Example: "Add water shutoff leads for Jackson County MO. 
Use KC 311 dataset d4px-6rwg, filter issue_type='Water Service' 
AND issue_sub_type='No Water'."`}</CodeBlock>
                </Step>
              </div>
            </div>
          </SubSection>

          {/* Connecting Your Own Manus */}
          <SubSection title="Connecting Your Own Manus to Atlas" icon={<Globe className="w-4 h-4" />}>
            <div className="space-y-4 text-xs">
              <p className="text-slate-400">Atlas runs on your own Railway server and GitHub repo. To have your own Manus agent update it, give it write access to both. Takes about 5 minutes.</p>
              <div className="space-y-4">
                <Step n="1" label="Create a GitHub Personal Access Token">
                  <ol className="space-y-1 list-decimal list-inside">
                    <li>Go to <span className="text-blue-300">github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)</span></li>
                    <li>Click <strong className="text-white">Generate new token (classic)</strong></li>
                    <li>Name it "Manus Atlas" — set expiration to <strong className="text-white">No expiration</strong></li>
                    <li>Check only the <strong className="text-white">repo</strong> scope (full control of private repositories)</li>
                    <li>Click Generate — copy the token immediately (starts with <code className="text-blue-300">ghp_</code>)</li>
                  </ol>
                </Step>
                <Step n="2" label="Create a Railway API Token">
                  <ol className="space-y-1 list-decimal list-inside">
                    <li>Go to <span className="text-blue-300">railway.app → Account Settings → Tokens</span></li>
                    <li>Click <strong className="text-white">Create Token</strong> — name it "Manus"</li>
                    <li>Copy the token (shown once)</li>
                  </ol>
                </Step>
                <Step n="3" label="Start Every Manus Session With This Prompt">
                  <p className="text-slate-400 mb-1.5">Open a new Manus task and paste this at the start (fill in your values):</p>
                  <CodeBlock>{`I have an Atlas lead scraper running on Railway (project: atlas-national-houses).
The code is at github.com/dealsnh/atlas-national-houses.
My GitHub token is [ghp_...] (repo scope on dealsnh account).
My Railway token is [your Railway token].
The live URL is https://web-production-aa586.up.railway.app
Login: tina@nationalhouses.com / Tina1074$

I need you to: [describe what you want]`}</CodeBlock>
                </Step>
                <Step n="4" label="Review Changes Before They Go Live">
                  <ol className="space-y-1 list-decimal list-inside">
                    <li>Ask Manus: <em className="text-slate-300">"Show me exactly what you changed and why before you push"</em></li>
                    <li>After deployment (3–4 min), check the Atlas dashboard — run a scrape and look for the new lead type</li>
                    <li>If a scraper returns 0 leads: <em className="text-slate-300">"The [lead type] scraper returned 0 results — check the live endpoint and fix the field names"</em></li>
                    <li>Ask Manus to test the API endpoint directly and show you sample data before writing the scraper</li>
                  </ol>
                </Step>
              </div>
            </div>
          </SubSection>

          {/* Manus Prompt Examples */}
          <SubSection title="What to Ask Manus" icon={<Terminal className="w-4 h-4" />}>
            <div className="grid md:grid-cols-2 gap-2 text-xs">
              {[
                { label: "Add a new county", prompt: '"Add Cuyahoga County Ohio to my Atlas. Use the Cuyahoga County Auditor ArcGIS for enrichment and the Cleveland Municipal Court for pre-foreclosure."' },
                { label: "Add a new lead type", prompt: '"Add divorce filings from AlaCourt for Jefferson County AL. Only save leads where the respondent owns property in Jefferson County."' },
                { label: "Fix a broken scraper", prompt: '"The Jackson County sheriff sales scraper is returning 0 leads. Check the live endpoint at jacksongov.org/civil-process and fix the field names."' },
                { label: "Change delivery time", prompt: '"Change my daily CSV email from 6 AM to 7 AM Eastern Time."' },
                { label: "Add CRM integration", prompt: '"After each daily scrape, push all new leads to my RESimpli account via their API. My RESimpli API key is [key]."' },
                { label: "Custom filtering", prompt: '"Only save tax delinquent leads where the assessed value is under $200,000."' },
                { label: "Add skip tracing", prompt: '"After importing leads, automatically run them through Easy Button Skip Trace to append phone numbers. My API key is [key]."' },
                { label: "Historical pull", prompt: '"Pull all leads from the last 90 days for Hamilton County OH and import them into the database."' },
                { label: "Debug enrichment", prompt: '"The assessor enrichment for Madison County AL is returning null owner names. Check the ArcGIS endpoint and fix the field mapping."' },
                { label: "Add a new state", prompt: '"Add Georgia to my Atlas. Start with Fulton County (Atlanta). Use the Fulton County Superior Court for pre-foreclosure and the Fulton County Tax Commissioner for tax delinquent."' },
              ].map(item => (
                <div key={item.label} className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                  <p className="font-medium text-slate-200 mb-1">{item.label}</p>
                  <p className="text-slate-500 italic">{item.prompt}</p>
                </div>
              ))}
            </div>
          </SubSection>

          {/* Troubleshooting */}
          <SubSection title="Troubleshooting Common Issues" icon={<AlertTriangle className="w-4 h-4" />}>
            <div className="grid md:grid-cols-2 gap-2 text-xs">
              {[
                { issue: "Scraper returns 0 leads", fix: "The endpoint or field names changed. Tell Manus: \"The [county] [lead type] scraper returned 0 results — check the live API endpoint and fix the field names.\"" },
                { issue: "Railway not deploying", fix: "Check the Railway webhook. Go to Railway → your project → Deployments. If no build triggered, click \"Deploy\" manually or push a small commit to main." },
                { issue: "Duplicate leads appearing", fix: "The stable ID in makeId() may have changed. Tell Manus: \"Duplicate [lead type] leads are appearing — check the ID generation in base.ts and db.ts.\"" },
                { issue: "Enrichment returning null", fix: "The assessor ArcGIS endpoint changed. Tell Manus: \"lookupByAddress for [county] is returning null — check the ArcGIS endpoint URL and response field names.\"" },
                { issue: "County portal blocked", fix: "The county portal is blocking Railway's IP. Tell Manus: \"[County] portal is returning 403 — add ScraperAPI or Bright Data proxy routing for that scraper.\"" },
                { issue: "Email not sending", fix: "Check SMTP credentials below. For Gmail, use an App Password (not your login password). Make sure 2FA is enabled on your Google account first." },
                { issue: "Database not persisting", fix: "Railway volume may have been detached. Go to Railway → your project → Settings → Volumes and verify the /data mount is attached." },
                { issue: "Wrong data in leads", fix: "The field mapping is wrong. Tell Manus: \"Show me a sample raw API response from [source] and fix the field mapping in [state].ts.\"" },
              ].map(item => (
                <div key={item.issue} className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/30">
                  <p className="text-orange-300 font-medium mb-1">{item.issue}</p>
                  <p className="text-slate-500">{item.fix}</p>
                </div>
              ))}
            </div>
          </SubSection>

          {/* Paid Subscriptions */}
          <SubSection title="Paid Subscriptions Required" icon={<Lock className="w-4 h-4" />}>
            <div className="space-y-3 text-xs">
              {[
                {
                  name: "Railway (~$5–20/mo)", color: "text-blue-300",
                  desc: "Your server hosting. The Hobby plan ($5/mo) is sufficient for Atlas. Includes 512MB RAM, 1GB storage, and auto-deploy from GitHub. Upgrade to Pro ($20/mo) if you add many counties or need more storage."
                },
                {
                  name: "Bright Data (~$15–50/mo)", color: "text-purple-300",
                  desc: "Required for Jefferson County AL tax delinquent. The JCCAL ArcGIS endpoint is behind Imperva WAF — Bright Data residential proxies are the only reliable bypass. Enter credentials in API Keys below. Without it, Jefferson County tax delinquent falls back to a limited public endpoint."
                },
                {
                  name: "ATTOM Data (~$150/mo)", color: "text-orange-300",
                  desc: "Unlocks tax delinquent for Morgan, Montgomery, Shelby, Limestone, Autauga, and Elmore AL — counties where gis.revenue.alabama.gov blocks all IPs. Without ATTOM, these counties still get pre-foreclosure, bankruptcy, probate, divorce, and sheriff sales but no tax delinquent data."
                },
                {
                  name: "ScraperAPI (~$29/mo)", color: "text-slate-300",
                  desc: "Optional fallback proxy for JS-rendered pages. Most sources work without it. Useful if certain county portals start blocking the Railway server IP. Add your key in API Keys below."
                },
                {
                  name: "Easy Button Skip Trace (varies)", color: "text-emerald-300",
                  desc: "Optional. Appends phone numbers and emails to leads automatically on import. Add your Easy Button Skip Trace API key in the API Keys section below. This is the only skip trace provider integrated into Atlas."
                },
              ].map(item => (
                <div key={item.name} className="flex gap-3 bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                  <span className={`font-semibold whitespace-nowrap ${item.color}`}>{item.name}</span>
                  <span className="text-slate-400">{item.desc}</span>
                </div>
              ))}
            </div>
          </SubSection>

        </div>
      </Section>

      {/* LEAD SOURCE MATRIX */}
      <Section title="Lead Source Matrix" icon={<Database className="w-5 h-5" />}>
        <div className="space-y-4">
          {/* Legend + controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-xs">
              {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof STATUS_CONFIG[LeadStatus]][])
                .filter(([k]) => k !== "na")
                .map(([key, cfg]) => (
                  <span key={key} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                ))}
            </div>
            <button
              onClick={() => setShowEndpoints(!showEndpoints)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              {showEndpoints ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showEndpoints ? "Hide" : "Show"} API endpoints
            </button>
          </div>

          {/* Action callouts */}
          <div className="space-y-2">
            {!settings.bright_data_configured && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg px-4 py-3 text-xs text-purple-300 flex items-start gap-2">
                <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span><strong>Bright Data not configured:</strong> Jefferson County AL tax delinquent is running on a limited fallback. Add Bright Data credentials in API Keys below to unlock full enrichment.</span>
              </div>
            )}
            {!settings.attom_configured && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-4 py-3 text-xs text-orange-300 flex items-start gap-2">
                <Key className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span><strong>ATTOM not configured:</strong> Morgan, Montgomery, Shelby, Limestone, Autauga, and Elmore AL tax delinquent are blocked by gis.revenue.alabama.gov. Add an ATTOM API key below to unlock these counties (~$150/mo).</span>
              </div>
            )}
            {staleCnt > 0 && (
              <div className="bg-slate-700/30 border border-slate-600/30 rounded-lg px-4 py-3 text-xs text-slate-300 flex items-start gap-2">
                <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span><strong>Note:</strong> Cincinnati Fire CAD dataset (vnsz-a3wp) has not been updated since September 2023. The scraper is correctly coded and will pull automatically if Cincinnati resumes updates to this dataset.</span>
              </div>
            )}
          </div>

          {/* State groups */}
          {stateGroups.map(group => (
            <div key={group.label}>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px flex-1 bg-slate-700/50" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">{group.label}</span>
                <div className="h-px flex-1 bg-slate-700/50" />
              </div>
              <div className="space-y-2">
                {group.counties.map(county => {
                  const ckey = `${county.county}-${county.state}`;
                  const isOpen = expandedCounty === ckey;
                  const liveCount = county.sources.filter(s => s.status === "live").length;
                  const needsCount = county.sources.filter(s => ["needs_attom", "needs_brightdata", "possible"].includes(s.status)).length;
                  const staleCount = county.sources.filter(s => s.status === "stale").length;

                  return (
                    <div key={ckey} className="border border-slate-700/50 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedCounty(isOpen ? null : ckey)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/40 hover:bg-slate-700/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-medium text-white">{county.county} County, {county.state}</span>
                          <span className="text-slate-500 text-xs">{county.region}</span>
                          <div className="flex gap-2 text-xs">
                            <span className="text-emerald-400">{liveCount} live</span>
                            {needsCount > 0 && <span className="text-orange-400">{needsCount} needs action</span>}
                            {staleCount > 0 && <span className="text-slate-400">{staleCount} stale</span>}
                          </div>
                        </div>
                        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                      </button>
                      {isOpen && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-700/50 bg-slate-900/20">
                                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400 whitespace-nowrap">Lead Type</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400 whitespace-nowrap">Status</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400 whitespace-nowrap">Source</th>
                                {showEndpoints && <th className="text-left px-4 py-2 text-xs font-medium text-slate-400 whitespace-nowrap">Endpoint</th>}
                                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {county.sources.map((src, i) => (
                                <tr key={i} className="border-b border-slate-700/30 last:border-0 hover:bg-slate-700/10">
                                  <td className="px-4 py-2.5 text-white font-medium whitespace-nowrap text-xs">{src.type}</td>
                                  <td className="px-4 py-2.5 whitespace-nowrap"><StatusBadge status={src.status} /></td>
                                  <td className="px-4 py-2.5 text-slate-300 text-xs whitespace-nowrap">{src.source}</td>
                                  {showEndpoints && <td className="px-4 py-2.5 text-slate-500 text-xs font-mono whitespace-nowrap">{src.endpoint || "—"}</td>}
                                  <td className="px-4 py-2.5 text-slate-500 text-xs">{src.notes}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* API KEYS */}
      <Section title="API Keys" icon={<Key className="w-5 h-5" />} accent="text-orange-400">
        <div className="space-y-6">

          {/* Bright Data */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-medium text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-400" /> Bright Data Proxy
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Required for Jefferson County AL tax delinquent — JCCAL ArcGIS is behind Imperva WAF</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.bright_data_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-purple-500/20 text-purple-300 border-purple-500/30"}`}>
                {settings.bright_data_configured ? "✓ Configured" : "Not configured"}
              </span>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <InputField
                label="Bright Data Username"
                value={form.bright_data_user || ""}
                onChange={set("bright_data_user")}
                placeholder="brd-customer-xxxxxx-zone-xxxxx"
                hint="From Bright Data dashboard → Proxies → Residential → Access parameters"
              />
              <InputField
                label="Bright Data Password"
                value={form.bright_data_pass || ""}
                onChange={set("bright_data_pass")}
                placeholder="Your zone password"
                masked
              />
            </div>
          </div>

          <hr className="border-slate-700/50" />

          {/* ATTOM */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-medium text-white">ATTOM Data API</h3>
                <p className="text-xs text-slate-500 mt-0.5">Unlocks tax delinquent for Morgan, Montgomery, Shelby, Limestone, Autauga, Elmore AL (~$150/mo)</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.attom_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-orange-500/20 text-orange-300 border-orange-500/30"}`}>
                {settings.attom_configured ? "✓ Configured" : "Not configured"}
              </span>
            </div>
            <InputField
              label="ATTOM API Key"
              value={form.attom_api_key || ""}
              onChange={set("attom_api_key")}
              placeholder="Your ATTOM API key"
              masked
              hint="From api.gateway.attomdata.com → Account → API Keys"
            />
          </div>

          <hr className="border-slate-700/50" />

          {/* ScraperAPI */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-medium text-white">ScraperAPI</h3>
                <p className="text-xs text-slate-500 mt-0.5">Optional proxy for JS-rendered county portals (~$29/mo)</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.scraper_api_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-600/20 text-slate-400 border-slate-600/30"}`}>
                {settings.scraper_api_configured ? "✓ Configured" : "Not configured"}
              </span>
            </div>
            <InputField
              label="ScraperAPI Key"
              value={form.scraper_api_key || ""}
              onChange={set("scraper_api_key")}
              placeholder="Your ScraperAPI key"
              masked
              hint="From scraperapi.com → Dashboard → API Key"
            />
          </div>

          <hr className="border-slate-700/50" />

          {/* Easy Button Skip Trace */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-medium text-white flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-emerald-400" /> Easy Button Skip Trace
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Appends phone numbers and emails to leads on import. Only skip trace provider supported.</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.skip_trace_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-600/20 text-slate-400 border-slate-600/30"}`}>
                {settings.skip_trace_configured ? "✓ Configured" : "Not configured"}
              </span>
            </div>
            <InputField
              label="Easy Button Skip Trace API Key"
              value={form.skip_trace_key || ""}
              onChange={set("skip_trace_key")}
              placeholder="Your Easy Button Skip Trace API key"
              masked
              hint="From Easy Button Skip Trace dashboard → API Access"
            />
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-300">Auto skip-trace on import</label>
              <button
                onClick={() => set("auto_skip_trace")(form.auto_skip_trace === "true" ? "false" : "true")}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.auto_skip_trace === "true" ? "bg-emerald-500" : "bg-slate-600"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${form.auto_skip_trace === "true" ? "translate-x-4.5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-xs text-slate-500">{form.auto_skip_trace === "true" ? "On — leads are skip-traced automatically" : "Off — skip trace manually from the leads dashboard"}</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Save API Keys"}
            </button>
          </div>
        </div>
      </Section>

      {/* EMAIL DELIVERY */}
      <Section title="Email Delivery" icon={<Mail className="w-5 h-5" />} accent="text-emerald-400">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/40 rounded-lg px-4 py-3 border border-slate-700/40">
            <Info className="w-4 h-4 flex-shrink-0 text-blue-400" />
            <span>A CSV of all new leads is emailed every day at <strong className="text-white">6:00 AM Eastern Time</strong>. Configure SMTP credentials below to enable delivery. Gmail works with an App Password — enable 2FA first, then create an App Password at <span className="text-blue-300">myaccount.google.com/apppasswords</span>.</span>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <InputField
              label="SMTP Host"
              value={form.smtp_host || ""}
              onChange={set("smtp_host")}
              placeholder="smtp.gmail.com"
              hint="Gmail: smtp.gmail.com | Outlook: smtp.office365.com"
            />
            <InputField
              label="SMTP Port"
              value={form.smtp_port || "587"}
              onChange={set("smtp_port")}
              placeholder="587"
              hint="587 for TLS (recommended) | 465 for SSL"
            />
            <InputField
              label="SMTP Username"
              value={form.smtp_user || ""}
              onChange={set("smtp_user")}
              placeholder="your@gmail.com"
            />
            <InputField
              label="SMTP Password"
              value={form.smtp_pass || ""}
              onChange={set("smtp_pass")}
              placeholder="App Password (not your login password)"
              masked
              hint="Gmail: use a 16-character App Password, not your account password"
            />
            <InputField
              label="From Address"
              value={form.smtp_from || ""}
              onChange={set("smtp_from")}
              placeholder="atlas@nationalhouses.com"
              hint="The 'From' name shown in email clients"
            />
            <InputField
              label="Recipients"
              value={form.email_recipients || ""}
              onChange={set("email_recipients")}
              placeholder="tina@nationalhouses.com, team@nationalhouses.com"
              hint="Comma-separated list of email addresses to receive the daily CSV"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Save Email Settings"}
            </button>
            <button
              onClick={handleTestEmail}
              disabled={testingEmail || !form.email_recipients}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {testingEmail ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {testingEmail ? "Sending..." : "Send Test Email"}
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}
