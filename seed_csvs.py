"""
seed_csvs.py — Import all historical CSV data into the Atlas SQLite database
Only imports leads from the last 90 days.
Safe to re-run: uses INSERT OR IGNORE so no duplicates.

Usage: python3 seed_csvs.py
"""

import sqlite3
import csv
import hashlib
import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

HOME = Path("/home/ubuntu")
DB_PATH = HOME / "tina-atlas" / "data" / "atlas.db"

# Ensure data dir exists
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

CUTOFF = datetime.now() - timedelta(days=90)
CUTOFF_STR = CUTOFF.strftime("%Y-%m-%d")
print(f"[seed] Only importing leads on or after {CUTOFF_STR}")
print(f"[seed] Database: {DB_PATH}")

# ── DB Setup ──────────────────────────────────────────────────────────────────

conn = sqlite3.connect(str(DB_PATH))
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.executescript("""
  CREATE TABLE IF NOT EXISTS leads (
    id            TEXT PRIMARY KEY,
    county        TEXT NOT NULL,
    state         TEXT NOT NULL,
    lead_type     TEXT NOT NULL,
    owner_name    TEXT,
    address       TEXT,
    city          TEXT,
    zip           TEXT,
    mailing_address TEXT,
    mailing_city  TEXT,
    mailing_state TEXT,
    mailing_zip   TEXT,
    case_number   TEXT,
    filing_date   TEXT,
    assessed_value TEXT,
    tax_year      TEXT,
    lender        TEXT,
    loan_amount   TEXT,
    sale_date     TEXT,
    sale_amount   TEXT,
    description   TEXT,
    source_url    TEXT,
    raw_data      TEXT,
    status        TEXT NOT NULL DEFAULT 'new',
    notes         TEXT,
    skip_traced   INTEGER NOT NULL DEFAULT 0,
    st_phone      TEXT,
    st_email      TEXT,
    st_mailing    TEXT,
    scraped_at    TEXT NOT NULL DEFAULT (datetime('now')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS scrape_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    county      TEXT NOT NULL,
    state       TEXT NOT NULL,
    lead_type   TEXT NOT NULL,
    started_at  TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    status      TEXT NOT NULL DEFAULT 'running',
    leads_found INTEGER DEFAULT 0,
    error       TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_leads_county ON leads(county);
  CREATE INDEX IF NOT EXISTS idx_leads_lead_type ON leads(lead_type);
  CREATE INDEX IF NOT EXISTS idx_leads_filing_date ON leads(filing_date);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
""")
conn.commit()

INSERT_SQL = """
  INSERT OR IGNORE INTO leads
    (id, county, state, lead_type, owner_name, address, city, zip,
     mailing_address, mailing_city, mailing_state, mailing_zip,
     case_number, filing_date, assessed_value, tax_year,
     lender, loan_amount, sale_date, sale_amount,
     description, source_url, raw_data, status, scraped_at)
  VALUES
    (:id, :county, :state, :lead_type, :owner_name, :address, :city, :zip,
     :mailing_address, :mailing_city, :mailing_state, :mailing_zip,
     :case_number, :filing_date, :assessed_value, :tax_year,
     :lender, :loan_amount, :sale_date, :sale_amount,
     :description, :source_url, :raw_data, :status, :scraped_at)
"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def stable_id(prefix, *parts):
    h = hashlib.md5("|".join(str(p) for p in parts).encode()).hexdigest()[:8]
    return f"{prefix}-{h}".upper()

def clean(v):
    if v is None:
        return None
    s = str(v).strip().strip('"')
    if s in ("", "NULL", "null", "N/A", "n/a"):
        return None
    return s

def parse_address(full_addr):
    if not full_addr:
        return None, None, None
    # "300 W 34th St, Kansas City, MO 64111"
    m = re.match(r'^(.*?),\s*([^,]+),\s*[A-Z]{2}\s*(\d{5}(?:-\d{4})?)\s*$', full_addr)
    if m:
        return clean(m.group(1)), clean(m.group(2)), clean(m.group(3))
    # "8818 E ANDERSON AVE INDEPENDENCE MO 64053"
    m2 = re.match(r'^(.*?)\s+([A-Z][A-Z\s]+)\s+[A-Z]{2}\s+(\d{5})\s*$', full_addr)
    if m2:
        return clean(m2.group(1)), clean(m2.group(2).strip()), clean(m2.group(3))
    return clean(full_addr), None, None

def is_recent(date_str):
    """Returns True if date is within last 90 days, or if date is missing/unparseable."""
    if not date_str or not date_str.strip():
        return True
    # Try multiple formats
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
        try:
            d = datetime.strptime(date_str.strip()[:19], fmt[:len(date_str.strip()[:19])])
            return d >= CUTOFF
        except ValueError:
            continue
    return True  # unparseable = include

def read_csv(path):
    rows = []
    try:
        with open(path, newline='', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(dict(row))
    except FileNotFoundError:
        print(f"  [skip] File not found: {path}")
    return rows

def insert_batch(records):
    inserted = 0
    skipped_old = 0
    skipped_empty = 0
    for r in records:
        # Skip records missing both address and owner
        addr = r.get("address") or ""
        owner = r.get("owner_name") or ""
        if len(addr) < 5 and len(owner) < 2:
            skipped_empty += 1
            continue
        # 90-day filter: check filing_date first, then scraped_at
        date_to_check = r.get("filing_date") or r.get("scraped_at") or ""
        if not is_recent(date_to_check):
            skipped_old += 1
            continue
        try:
            cur.execute(INSERT_SQL, r)
            if cur.rowcount > 0:
                inserted += 1
        except Exception as e:
            print(f"  [warn] Insert failed: {e} — id={r.get('id')}")
    conn.commit()
    if skipped_old:
        print(f"  (skipped {skipped_old} records older than 90 days)")
    if skipped_empty:
        print(f"  (skipped {skipped_empty} records missing address+owner)")
    return inserted

# ── Importers ─────────────────────────────────────────────────────────────────

def import_tina_leads(path):
    """tina_leads_week.csv — already in exact DB schema format"""
    rows = read_csv(path)
    records = []
    for r in rows:
        records.append({
            "id": clean(r.get("id")) or stable_id("TINA", r.get("county"), r.get("lead_type"), r.get("owner_name"), r.get("address")),
            "county": clean(r.get("county")) or "Unknown",
            "state": clean(r.get("state")) or "XX",
            "lead_type": clean(r.get("lead_type")) or "Unknown",
            "owner_name": clean(r.get("owner_name")),
            "address": clean(r.get("address")),
            "city": clean(r.get("city")),
            "zip": clean(r.get("zip")),
            "mailing_address": clean(r.get("mailing_address")),
            "mailing_city": clean(r.get("mailing_city")),
            "mailing_state": clean(r.get("mailing_state")),
            "mailing_zip": clean(r.get("mailing_zip")),
            "case_number": clean(r.get("case_number")),
            "filing_date": clean(r.get("filing_date")),
            "assessed_value": clean(r.get("assessed_value")),
            "tax_year": clean(r.get("tax_year")),
            "lender": clean(r.get("lender")),
            "loan_amount": clean(r.get("loan_amount")),
            "sale_date": clean(r.get("sale_date")),
            "sale_amount": clean(r.get("sale_amount")),
            "description": clean(r.get("description")),
            "source_url": clean(r.get("source_url")),
            "raw_data": None,
            "status": clean(r.get("status")) or "new",
            "scraped_at": datetime.now().isoformat(),
        })
    return insert_batch(records)

def import_jackson_code_violations(path):
    """jackson_code_violations*.csv"""
    rows = read_csv(path)
    records = []
    for r in rows:
        full_addr = clean(r.get("final_address")) or clean(r.get("source_address"))
        addr, city, zip_ = parse_address(full_addr)
        records.append({
            "id": stable_id("MO-JAC-CV", r.get("case_number") or r.get("pin") or full_addr),
            "county": "Jackson",
            "state": "MO",
            "lead_type": "Code Violation",
            "owner_name": clean(r.get("final_owner")),
            "address": addr or clean(r.get("source_address")),
            "city": city,
            "zip": clean(r.get("zip_code")) or zip_,
            "mailing_address": None,
            "mailing_city": None,
            "mailing_state": None,
            "mailing_zip": None,
            "case_number": clean(r.get("case_number")),
            "filing_date": clean(r.get("date_found")) or clean(r.get("scraped_date")),
            "assessed_value": None,
            "tax_year": None,
            "lender": None,
            "loan_amount": None,
            "sale_date": None,
            "sale_amount": None,
            "description": clean(r.get("violation_description")) or clean(r.get("ordinance")),
            "source_url": clean(r.get("source_url")),
            "raw_data": json.dumps({"vio_status": r.get("vio_status"), "chapter": r.get("chapter")}),
            "status": "new",
            "scraped_at": clean(r.get("scraped_date")) or datetime.now().isoformat(),
        })
    return insert_batch(records)

def import_jackson_foreclosures(path):
    """jackson_foreclosure_auctions.csv"""
    rows = read_csv(path)
    records = []
    for r in rows:
        full_addr = clean(r.get("final_address")) or clean(r.get("source_address"))
        addr, city, zip_ = parse_address(full_addr)
        records.append({
            "id": stable_id("MO-JAC-FC", r.get("suit_number") or r.get("parcel_number") or r.get("owner_name")),
            "county": "Jackson",
            "state": "MO",
            "lead_type": clean(r.get("lead_type")) or "Foreclosure Auction",
            "owner_name": clean(r.get("final_owner")) or clean(r.get("owner_name")),
            "address": addr or clean(r.get("source_address")),
            "city": city,
            "zip": zip_,
            "mailing_address": None,
            "mailing_city": None,
            "mailing_state": None,
            "mailing_zip": None,
            "case_number": clean(r.get("suit_number")),
            "filing_date": clean(r.get("hearing_date")) or clean(r.get("scraped_date")),
            "assessed_value": clean(r.get("market_value")),
            "tax_year": None,
            "lender": None,
            "loan_amount": clean(r.get("judgment_amount")),
            "sale_date": clean(r.get("date_sold")),
            "sale_amount": None,
            "description": f"Jackson County Foreclosure Auction — {r.get('suit_number', '')}",
            "source_url": clean(r.get("source_url")),
            "raw_data": json.dumps({"parcel": r.get("parcel_number"), "purchaser": r.get("purchaser")}),
            "status": "new",
            "scraped_at": clean(r.get("scraped_date")) or datetime.now().isoformat(),
        })
    return insert_batch(records)

def import_jackson_tax_delinquent(path):
    """jackson_tax_delinquent.csv"""
    rows = read_csv(path)
    records = []
    for r in rows:
        full_addr = clean(r.get("final_address")) or clean(r.get("verified_address")) or clean(r.get("source_address"))
        addr, city, zip_ = parse_address(full_addr)
        records.append({
            "id": stable_id("MO-JAC-DLT", r.get("suit_number") or r.get("parcel_number") or r.get("owner_name")),
            "county": "Jackson",
            "state": "MO",
            "lead_type": "Tax Delinquent",
            "owner_name": clean(r.get("final_owner")) or clean(r.get("verified_owner")) or clean(r.get("owner_name")),
            "address": addr or clean(r.get("source_address")),
            "city": city,
            "zip": zip_,
            "mailing_address": None,
            "mailing_city": None,
            "mailing_state": None,
            "mailing_zip": None,
            "case_number": clean(r.get("suit_number")),
            "filing_date": clean(r.get("scraped_date")),
            "assessed_value": clean(r.get("market_value")),
            "tax_year": None,
            "lender": None,
            "loan_amount": clean(r.get("judgment_amount")),
            "sale_date": clean(r.get("date_sold")),
            "sale_amount": clean(r.get("purchase_price")),
            "description": f"Jackson County Tax Delinquent — {r.get('suit_number', r.get('parcel_number', ''))}",
            "source_url": clean(r.get("source_url")),
            "raw_data": json.dumps({"parcel": r.get("parcel_number"), "legal": r.get("legal_description")}),
            "status": "new",
            "scraped_at": clean(r.get("scraped_date")) or datetime.now().isoformat(),
        })
    return insert_batch(records)

def import_jackson_dangerous_buildings(path):
    """jackson_dangerous_buildings*.csv / jackson_water_issues*.csv"""
    rows = read_csv(path)
    records = []
    for r in rows:
        full_addr = clean(r.get("final_address")) or clean(r.get("source_address"))
        addr, city, zip_ = parse_address(full_addr)
        records.append({
            "id": stable_id("MO-JAC-DB", r.get("case_number") or r.get("pin") or full_addr),
            "county": "Jackson",
            "state": "MO",
            "lead_type": clean(r.get("lead_type")) or "Dangerous Building",
            "owner_name": clean(r.get("final_owner")),
            "address": addr or clean(r.get("source_address")),
            "city": city,
            "zip": clean(r.get("zip_code")) or zip_,
            "mailing_address": None,
            "mailing_city": None,
            "mailing_state": None,
            "mailing_zip": None,
            "case_number": clean(r.get("case_number")),
            "filing_date": clean(r.get("date_found")) or clean(r.get("scraped_date")),
            "assessed_value": None,
            "tax_year": None,
            "lender": None,
            "loan_amount": None,
            "sale_date": None,
            "sale_amount": None,
            "description": clean(r.get("violation_description")) or clean(r.get("lead_type")),
            "source_url": clean(r.get("source_url")),
            "raw_data": None,
            "status": "new",
            "scraped_at": clean(r.get("scraped_date")) or datetime.now().isoformat(),
        })
    return insert_batch(records)

def import_hamilton_tax_delinquent(path):
    """hamilton_tax_delinquent.csv"""
    rows = read_csv(path)
    records = []
    for r in rows:
        records.append({
            "id": stable_id("OH-HAM-DLT", r.get("parcel_id") or (str(r.get("owner_name", "")) + str(r.get("property_address", "")))),
            "county": "Hamilton",
            "state": "OH",
            "lead_type": "Tax Delinquent",
            "owner_name": clean(r.get("owner_name")),
            "address": clean(r.get("property_address")),
            "city": clean(r.get("property_city")),
            "zip": clean(r.get("property_zip")),
            "mailing_address": None,
            "mailing_city": None,
            "mailing_state": None,
            "mailing_zip": None,
            "case_number": clean(r.get("parcel_id")),
            "filing_date": clean(r.get("scraped_date")),
            "assessed_value": None,
            "tax_year": None,
            "lender": None,
            "loan_amount": clean(r.get("unpaid_amount")),
            "sale_date": None,
            "sale_amount": None,
            "description": f"Hamilton County OH Tax Delinquent — Parcel {r.get('parcel_id', '')}",
            "source_url": None,
            "raw_data": json.dumps({"property_class": r.get("property_class")}),
            "status": "new",
            "scraped_at": clean(r.get("scraped_date")) or datetime.now().isoformat(),
        })
    return insert_batch(records)

def import_hamilton_foreclosures(path):
    """hamilton_foreclosure_auctions.csv — reuse jackson foreclosure logic"""
    rows = read_csv(path)
    records = []
    for r in rows:
        full_addr = clean(r.get("final_address")) or clean(r.get("source_address"))
        addr, city, zip_ = parse_address(full_addr)
        records.append({
            "id": stable_id("OH-HAM-FC", r.get("suit_number") or r.get("parcel_number") or r.get("owner_name")),
            "county": "Hamilton",
            "state": "OH",
            "lead_type": clean(r.get("lead_type")) or "Foreclosure Auction",
            "owner_name": clean(r.get("final_owner")) or clean(r.get("owner_name")),
            "address": addr or clean(r.get("source_address")),
            "city": city,
            "zip": zip_,
            "mailing_address": None,
            "mailing_city": None,
            "mailing_state": None,
            "mailing_zip": None,
            "case_number": clean(r.get("suit_number")),
            "filing_date": clean(r.get("hearing_date")) or clean(r.get("scraped_date")),
            "assessed_value": clean(r.get("market_value")),
            "tax_year": None,
            "lender": None,
            "loan_amount": clean(r.get("judgment_amount")),
            "sale_date": clean(r.get("date_sold")),
            "sale_amount": None,
            "description": f"Hamilton County OH Foreclosure Auction — {r.get('suit_number', '')}",
            "source_url": clean(r.get("source_url")),
            "raw_data": None,
            "status": "new",
            "scraped_at": clean(r.get("scraped_date")) or datetime.now().isoformat(),
        })
    return insert_batch(records)

def import_cass_tax_delinquent(path):
    """cass_tax_delinquent.csv"""
    rows = read_csv(path)
    records = []
    for r in rows:
        records.append({
            "id": stable_id("MO-CAS-DLT", r.get("parcel_id") or r.get("account_number") or (str(r.get("owner_name","")) + str(r.get("property_address","")))),
            "county": "Cass",
            "state": "MO",
            "lead_type": "Tax Delinquent",
            "owner_name": clean(r.get("owner_name")),
            "address": clean(r.get("property_address")),
            "city": clean(r.get("property_city")),
            "zip": clean(r.get("property_zip")),
            "mailing_address": None,
            "mailing_city": None,
            "mailing_state": None,
            "mailing_zip": None,
            "case_number": clean(r.get("account_number")),
            "filing_date": clean(r.get("scraped_date")),
            "assessed_value": None,
            "tax_year": None,
            "lender": None,
            "loan_amount": None,
            "sale_date": None,
            "sale_amount": None,
            "description": f"Cass County MO Tax Delinquent — {r.get('parcel_id', r.get('account_number', ''))}",
            "source_url": None,
            "raw_data": json.dumps({"parcel_id": r.get("parcel_id"), "legal": r.get("legal_description")}),
            "status": "new",
            "scraped_at": clean(r.get("scraped_date")) or datetime.now().isoformat(),
        })
    return insert_batch(records)

def import_clay_tax_delinquent(path):
    """clay_tax_delinquent.csv"""
    rows = read_csv(path)
    records = []
    for r in rows:
        records.append({
            "id": stable_id("MO-CLY-DLT", r.get("parcel_id") or r.get("account_number") or (str(r.get("owner_name","")) + str(r.get("property_address","")))),
            "county": "Clay",
            "state": "MO",
            "lead_type": "Tax Delinquent",
            "owner_name": clean(r.get("owner_name")),
            "address": clean(r.get("property_address")),
            "city": clean(r.get("property_city")),
            "zip": clean(r.get("property_zip")),
            "mailing_address": None,
            "mailing_city": None,
            "mailing_state": None,
            "mailing_zip": None,
            "case_number": clean(r.get("account_number")),
            "filing_date": clean(r.get("scraped_date")),
            "assessed_value": None,
            "tax_year": None,
            "lender": None,
            "loan_amount": None,
            "sale_date": None,
            "sale_amount": None,
            "description": f"Clay County MO Tax Delinquent — {r.get('parcel_id', r.get('account_number', ''))}",
            "source_url": None,
            "raw_data": json.dumps({"parcel_id": r.get("parcel_id"), "legal": r.get("legal_description")}),
            "status": "new",
            "scraped_at": clean(r.get("scraped_date")) or datetime.now().isoformat(),
        })
    return insert_batch(records)

def import_al_jefferson_tax_delinquent(path, sub_county):
    """alabama_jefferson_birmingham/bessemer_tax_delinquent.csv"""
    rows = read_csv(path)
    records = []
    city = "Birmingham" if sub_county == "birmingham" else "Bessemer"
    for r in rows:
        records.append({
            "id": stable_id(f"AL-JEF-DLT-{sub_county[:3].upper()}", r.get("parcel_id") or r.get("owner_name")),
            "county": "Jefferson",
            "state": "AL",
            "lead_type": "Tax Delinquent",
            "owner_name": clean(r.get("owner_name")),
            "address": None,  # Address lookup required via JCCAL ArcGIS
            "city": city,
            "zip": None,
            "mailing_address": None,
            "mailing_city": None,
            "mailing_state": None,
            "mailing_zip": None,
            "case_number": clean(r.get("parcel_id")),
            "filing_date": clean(r.get("scraped_date")),
            "assessed_value": None,
            "tax_year": clean(r.get("year")),
            "lender": None,
            "loan_amount": clean(r.get("delinquent_amount")),
            "sale_date": None,
            "sale_amount": None,
            "description": f"Jefferson County AL Tax Delinquent ({sub_county}) — {r.get('parcel_id', '')} — Address lookup required",
            "source_url": clean(r.get("address_lookup_url")),
            "raw_data": json.dumps({"parcel_id_raw": r.get("parcel_id_raw"), "legal": r.get("legal_description")}),
            "status": "new",
            "scraped_at": clean(r.get("scraped_date")) or datetime.now().isoformat(),
        })
    return insert_batch(records)

def import_al_county_generic(path, county):
    """Generic Alabama county CSV — handles varied column names"""
    rows = read_csv(path)
    if not rows:
        return 0
    records = []
    for r in rows:
        owner = clean(r.get("owner_name")) or clean(r.get("Owner")) or clean(r.get("NAME"))
        address = clean(r.get("property_address")) or clean(r.get("address")) or clean(r.get("Address")) or clean(r.get("SITUS"))
        city = clean(r.get("property_city")) or clean(r.get("city")) or clean(r.get("City"))
        zip_ = clean(r.get("property_zip")) or clean(r.get("zip")) or clean(r.get("ZIP"))
        parcel = clean(r.get("parcel_id")) or clean(r.get("parcel")) or clean(r.get("PARCEL"))
        amount = clean(r.get("delinquent_amount")) or clean(r.get("unpaid_amount")) or clean(r.get("amount"))
        records.append({
            "id": stable_id(f"AL-{county[:3].upper()}-DLT", parcel or (str(owner or "") + str(address or ""))),
            "county": county,
            "state": "AL",
            "lead_type": "Tax Delinquent",
            "owner_name": owner,
            "address": address,
            "city": city,
            "zip": zip_,
            "mailing_address": None,
            "mailing_city": None,
            "mailing_state": None,
            "mailing_zip": None,
            "case_number": parcel,
            "filing_date": clean(r.get("scraped_date")),
            "assessed_value": None,
            "tax_year": clean(r.get("year")) or clean(r.get("tax_year")),
            "lender": None,
            "loan_amount": amount,
            "sale_date": None,
            "sale_amount": None,
            "description": f"{county} County AL Tax Delinquent — {parcel or ''}",
            "source_url": None,
            "raw_data": json.dumps(dict(r)),
            "status": "new",
            "scraped_at": clean(r.get("scraped_date")) or datetime.now().isoformat(),
        })
    return insert_batch(records)

# ── Run all imports ────────────────────────────────────────────────────────────

jobs = [
    ("tina_leads_week",              lambda: import_tina_leads(HOME / "atlas_csvs/tina_leads_week.csv")),
    ("jackson_code_violations",      lambda: import_jackson_code_violations(HOME / "jackson_code_violations.csv")),
    ("jackson_code_violations_recent", lambda: import_jackson_code_violations(HOME / "jackson_code_violations_recent.csv")),
    ("jackson_foreclosure_auctions", lambda: import_jackson_foreclosures(HOME / "jackson_foreclosure_auctions.csv")),
    ("jackson_tax_delinquent",       lambda: import_jackson_tax_delinquent(HOME / "jackson_tax_delinquent.csv")),
    ("jackson_dangerous_buildings",  lambda: import_jackson_dangerous_buildings(HOME / "jackson_dangerous_buildings.csv")),
    ("jackson_water_issues",         lambda: import_jackson_dangerous_buildings(HOME / "jackson_water_issues.csv")),
    ("hamilton_tax_delinquent",      lambda: import_hamilton_tax_delinquent(HOME / "hamilton_tax_delinquent.csv")),
    ("hamilton_foreclosure_auctions",lambda: import_hamilton_foreclosures(HOME / "hamilton_foreclosure_auctions.csv")),
    ("cass_tax_delinquent",          lambda: import_cass_tax_delinquent(HOME / "cass_tax_delinquent.csv")),
    ("clay_tax_delinquent",          lambda: import_clay_tax_delinquent(HOME / "clay_tax_delinquent.csv")),
    ("al_jefferson_birmingham",      lambda: import_al_jefferson_tax_delinquent(HOME / "alabama_jefferson_birmingham_tax_delinquent.csv", "birmingham")),
    ("al_jefferson_bessemer",        lambda: import_al_jefferson_tax_delinquent(HOME / "alabama_jefferson_bessemer_tax_delinquent.csv", "bessemer")),
    ("al_madison",                   lambda: import_al_county_generic(HOME / "alabama_madison_tax_delinquent.csv", "Madison")),
    ("al_morgan",                    lambda: import_al_county_generic(HOME / "alabama_morgan_tax_delinquent.csv", "Morgan")),
    ("al_montgomery",                lambda: import_al_county_generic(HOME / "alabama_montgomery_tax_delinquent.csv", "Montgomery")),
    ("al_shelby",                    lambda: import_al_county_generic(HOME / "alabama_shelby_tax_delinquent.csv", "Shelby")),
    ("al_limestone",                 lambda: import_al_county_generic(HOME / "alabama_limestone_tax_delinquent.csv", "Limestone")),
]

total_inserted = 0
for name, fn in jobs:
    try:
        n = fn()
        print(f"[seed] {name}: +{n} inserted")
        total_inserted += n
    except Exception as e:
        print(f"[seed] {name}: ERROR — {e}")

# Final summary
total = cur.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
print(f"\n[seed] Done. Inserted {total_inserted} new records. Total leads in DB: {total}")

print("\n[seed] Breakdown by county + lead type:")
rows = cur.execute("SELECT county, state, lead_type, COUNT(*) as n FROM leads GROUP BY county, state, lead_type ORDER BY county, lead_type").fetchall()
for row in rows:
    print(f"  {row[0]}, {row[1]} | {row[2]}: {row[3]}")

conn.close()
